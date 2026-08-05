import { ColumnStore } from './columnStore.js';
import {
  createColumnResolver,
  orderKeyOfValue,
  type SsrmColumnAccess,
  type SsrmColumnResolver,
} from './columnAccess.js';
import { compileFilter, compileQuickFilter, type RowPredicate } from './filter.js';
import { compareOrderKeys, sortIndex } from './sort.js';
import { activeAggregations, aggregateMembers, type SsrmAggregation } from './aggregate.js';
import { compileCalcColumns, type SsrmCalcColumn, type SsrmCalcDiagnostic } from './calc.js';
import type { SsrmCalcColumnDef } from './calcAst.js';
import {
  SSRM_CHILD_COUNT,
  SSRM_GROUP_FLAG,
  SSRM_GROUP_PATH,
  SSRM_TREE_GROUP,
  SSRM_TREE_KEY,
  type SsrmColumnVO,
  type SsrmGetRowsRequest,
  type SsrmGetRowsResult,
  type SsrmRow,
  type SsrmSchema,
  type SsrmSortModelItem,
} from './types.js';

/**
 * A columnar row engine that answers AG Grid's server-side row model exactly.
 *
 * One store, N queries. A "query" is a request shape — sort, filter, grouping,
 * aggregation, group keys — and it owns a materialised index of row offsets.
 * That is the same idea as a Perspective View, with three differences that are
 * the whole reason this exists:
 *
 *   1. **An index is mutable.** A re-sort permutes an `Int32Array`; a view
 *      config is immutable, so on the Perspective path every sort is a fresh
 *      View and the first block after one costs 0.4-1.1 s (MEASURED, 20k x 120).
 *   2. **Writes do not block reads.** An upsert writes cells; nothing is
 *      recomputed until something asks. The same measured read is 8 ms with the
 *      Perspective feed paused and a 119-145 ms median while it ticks, because
 *      `table.update()` blocks reads while it applies.
 *   3. **The engine knows which rows changed**, so a live tick can be PUSHED to
 *      the grid as a transaction instead of invalidating blocks and making AG
 *      re-pull them.
 *
 * ## The four rules of this contract
 *
 * Learned the hard way on the Perspective path and encoded here:
 *
 *   1. every `getRows` settles exactly once — AG's `outboundRequests` is
 *      grid-global with a default limit of 2, and two leaked calls wedge the
 *      grid permanently;
 *   2. a row count of 0 with `isLastRowKnown` caps the store forever. This
 *      engine holds the book, so it always knows the exact count and always
 *      supplies it — the failure mode does not arise;
 *   3. a group row's id must be its PATH, not a leaf key, or ids collide across
 *      groups and AG discards the block (warn 205). `SSRM_GROUP_PATH` carries
 *      it;
 *   4. `setRowCount` is illegal while grouping (AG error #28, silent without
 *      ValidationModule) — a host reads `rowCount` off the result instead.
 */

export interface SsrmEngineOptions {
  schema: SsrmSchema;
  /** Columns the quick filter spans. Defaults to every string column. */
  quickFilterFields?: readonly string[];
  /** Cap on a set filter's value list; above it `distinctValues` answers null
   *  rather than a partial list, which reads as the whole domain. */
  maxSetFilterValues?: number;
  /**
   * Columns forming a TREE hierarchy, outermost first — AG's SSRM tree mode
   * rather than its row-group mode.
   *
   * The pull shape is identical (AG asks for the children of a path), so this
   * stands in for `rowGroupCols`, which AG does not send in tree mode. What
   * differs is the OUTPUT: parent rows carry {@link SSRM_TREE_KEY} and
   * {@link SSRM_TREE_GROUP}, because AG reads the hierarchy off the data.
   *
   * A request that DOES carry `rowGroupCols` wins: the user has dragged a
   * column into the group panel, and that intent beats a configured hierarchy
   * rather than silently merging with it.
   */
  treeFields?: readonly string[];
  /**
   * Separator between the pivot values and the value column in a generated
   * pivot field name. Must match the grid's
   * `serverSidePivotResultFieldSeparator`, whose default is `_`.
   */
  pivotResultFieldSeparator?: string;
  /**
   * Calculated columns, as StarUI expression ASTs. Equivalent to calling
   * {@link SsrmEngine.setCalcColumns} straight after construction.
   */
  calcColumns?: readonly SsrmCalcColumnDef[];
  /**
   * Where a calculated column's refusal or runtime failure is reported.
   *
   * Defaults to `console.warn`, which in a SharedWorker reaches no console
   * anywhere — a host that wants to see one should route this to its fault
   * channel. Whether or not it does, every diagnostic is retained and readable
   * through {@link SsrmEngine.calcDiagnostics}.
   */
  onCalcWarning?(message: string, detail?: unknown): void;
}

/** What changed in the last apply, so a host can push rather than invalidate. */
export interface SsrmDelta {
  /** Keys whose values changed or which were added. */
  changed: unknown[];
  /** Keys removed from the book. */
  removed: unknown[];
}

export type SsrmDeltaListener = (delta: SsrmDelta) => void;

/** Identity of a materialised index — everything that changes its contents. */
function queryKey(request: SsrmGetRowsRequest, quick: string): string {
  return JSON.stringify({
    filter: request.filterModel ?? null,
    sort: request.sortModel ?? null,
    groups: request.rowGroupCols?.map((c) => c.id) ?? null,
    values: request.valueCols?.map((c) => [c.id, c.aggFunc]) ?? null,
    keys: request.groupKeys ?? null,
    quick,
  });
}

export class SsrmEngine {
  readonly store: ColumnStore;
  private readonly quickFields: readonly string[];
  private readonly maxSetFilterValues: number;
  private quickFilterText = '';
  private readonly treeFields: readonly string[];
  private readonly pivotSeparator: string;
  private readonly listeners = new Set<SsrmDeltaListener>();
  /**
   * Cached index per query shape.
   *
   * Invalidated wholesale on any write. That is deliberate for now: rebuilding
   * a filtered+sorted index over 20,000 rows is single-digit milliseconds, and
   * an incrementally-maintained index is the other place (with aggregation)
   * where these engines go silently wrong. `lowerBound` in `sort.ts` is the
   * primitive for doing it incrementally when a measurement says it is needed.
   */
  private readonly indexCache = new Map<string, Int32Array>();
  /**
   * Bumped by every write. The invalidation stamp for a calculated column's
   * per-generation value cache — see `columnAccess.ts`.
   *
   * It lives beside the index cache and is invalidated in the same statement,
   * deliberately: a write is the only thing that can move either, and two
   * invalidation rules that have to agree is one more than can be relied on.
   */
  private writeVersion = 0;
  /**
   * Calculated columns, compiled against this store.
   *
   * State on the ENGINE rather than on the request, and that is forced rather
   * than chosen: AG's SSRM request carries no calculated columns at all — the
   * whole of it is `startRow`, `endRow`, `rowGroupCols`, `valueCols`,
   * `pivotCols`, `pivotMode`, `groupKeys`, `filterModel`, `sortModel`. The same
   * is true of the quick filter and of the column window on the Perspective
   * path, and all three live in the same place for the same reason.
   */
  private calcColumnDefs: readonly SsrmCalcColumnDef[] = [];
  private calc: SsrmCalcColumn[] = [];
  private calcRuntimeDiagnostics: SsrmCalcDiagnostic[] = [];
  /**
   * How every path in here reads a column — store field or calculated column,
   * through one interface that cannot tell them apart.
   *
   * Rebuilt only by {@link setCalcColumns}. A store accessor captures the
   * column OBJECT, which `grow()` mutates in place, so it survives the book
   * outgrowing its capacity; a calc accessor captures the compiled evaluator,
   * which nothing but `setCalcColumns` replaces.
   */
  private columns: SsrmColumnResolver;

  constructor(options: SsrmEngineOptions) {
    this.store = new ColumnStore(options.schema);
    this.columns = createColumnResolver(this.store, this.calc, () => this.writeVersion);
    this.quickFields =
      options.quickFilterFields ??
      options.schema.fields.filter((f) => f.type === 'string').map((f) => f.field);
    this.maxSetFilterValues = options.maxSetFilterValues ?? 50_000;
    this.treeFields = options.treeFields ?? [];
    this.pivotSeparator = options.pivotResultFieldSeparator ?? '_';
    this.calcWarn = options.onCalcWarning;
    if (options.calcColumns !== undefined) this.setCalcColumns(options.calcColumns);
  }

  private readonly calcWarn: SsrmEngineOptions['onCalcWarning'];

  /**
   * Install the calculated columns, compiling each once.
   *
   * Returns whether anything changed, so a caller only purges when there is
   * something to purge for — the same contract as {@link setQuickFilter}.
   *
   * **The index cache must be cleared, and since session 5 that is load-bearing
   * rather than precautionary.** A calculated column can be sorted, filtered,
   * grouped and aggregated on, so an index materialised under the previous set
   * of expressions is a permutation of the book by values that no longer exist.
   * The cache is keyed on the REQUEST shape, which carries no calculated
   * columns at all — AG's request has no field for them — so nothing in the key
   * would ever change to invalidate it.
   */
  setCalcColumns(defs: readonly SsrmCalcColumnDef[]): boolean {
    const next = JSON.stringify(defs);
    if (next === JSON.stringify(this.calcColumnDefs)) return false;
    this.calcColumnDefs = defs.map((def) => ({ ...def }));
    const result = compileCalcColumns(
      this.store,
      this.calcColumnDefs,
      this.calcWarn ?? ((message, detail) => console.warn(message, detail)),
    );
    this.calc = result.columns;
    this.calcRuntimeDiagnostics = result.diagnostics;
    this.columns = createColumnResolver(this.store, this.calc, () => this.writeVersion);
    this.indexCache.clear();
    return true;
  }

  /**
   * What the calculated columns did — refusals, runtime failures, and fields an
   * expression named that the book does not have, each with a hit count.
   *
   * Public because `console.warn` in a SharedWorker reaches NO console
   * anywhere: a warn-once that only warns is invisible in the topology this
   * engine runs in. This is what makes "the column compiled" an assertion a
   * test or a probe can fail on rather than something read off a screen.
   */
  calcDiagnostics(): readonly SsrmCalcDiagnostic[] {
    return this.calcRuntimeDiagnostics;
  }

  /**
   * One calculated column's compiled reader, or undefined when it was refused.
   *
   * The seam the whole of session 5 is built on: sorting, filtering, grouping
   * and aggregating a calculated column all mean "evaluate it for these
   * offsets", which is this closure called over an index. `columnAccess.ts`
   * wraps it into the same five reads a store column answers, and nothing in
   * `sort.ts`, `filter.ts` or `aggregate.ts` can tell the two apart.
   */
  calcEvaluator(colId: string): ((offset: number) => unknown) | undefined {
    return this.calc.find((column) => column.colId === colId)?.evaluate;
  }

  /**
   * Re-stamp the calculated cells a SPARSE PATCH has just made stale.
   *
   * `host.publish` broadcasts the writer's patch verbatim — the two cells that
   * moved, not the row — because re-reading 200 rows out of the store to
   * broadcast 400 changed cells would be 24,200 values five times a second per
   * window. That is the right trade and it is exactly why a calculated column
   * did not tick: a frame naming `dailyPnL` reaches the window without the
   * `calc_pnlTotal` that depends on it, and the cell keeps its old value until
   * AG re-reads the block.
   *
   * A calculated cell is re-stamped exactly when the patch names one of the
   * fields its expression READS. Not "always": AG flashes a cell it is told
   * changed, so re-stamping every calculated column on every frame would paint
   * a P&L total flashing on a tick that did not move it.
   *
   * Returns the SAME array when there is nothing to add, so a book with no
   * calculated columns pays a length check and no allocation. A patch row is
   * copied rather than mutated: it belongs to the caller, and `publish` hands
   * the same array to every attached port.
   */
  calcPatch(rows: readonly SsrmRow[]): readonly SsrmRow[] {
    const active = this.calc.filter((column) => column.evaluate !== undefined && column.reads.length > 0);
    if (active.length === 0 || rows.length === 0) return rows;

    const keyField = this.store.keyField;
    let stamped = false;
    const out = rows.map((row) => {
      // A row the book no longer holds — removed between the write and the
      // broadcast — has no offset to evaluate at. Left exactly as it came.
      const offset = this.store.offsetOf(row[keyField]);
      if (offset === undefined) return row;
      let next = row;
      for (const column of active) {
        let dirty = false;
        for (const field of column.reads) {
          if (Object.prototype.hasOwnProperty.call(row, field)) {
            dirty = true;
            break;
          }
        }
        if (!dirty) continue;
        if (next === row) {
          next = { ...row };
          stamped = true;
        }
        next[column.colId] = column.evaluate!(offset);
      }
      return next;
    });
    return stamped ? out : rows;
  }

  /**
   * Stamp every installed calculated column onto a materialised row.
   *
   * Through the RESOLVER rather than the raw evaluator, so a block read served
   * after a sort or a filter on the same column answers from the values that
   * pass already computed instead of computing them a second time.
   */
  private stampCalc(row: SsrmRow, offset: number): SsrmRow {
    for (const column of this.calc) {
      // A refused column is not stamped AT ALL, which is precisely the "falls
      // back to the field binding" rule: whatever `rowAt` already put under
      // that name stays, and for a colId naming no field there is nothing.
      if (column.evaluate === undefined) continue;
      row[column.colId] = this.columns.get(column.colId)!.valueAt(offset);
    }
    return row;
  }

  /**
   * The columns this request groups by.
   *
   * Tree mode stands the configured hierarchy in for `rowGroupCols`, which AG
   * does not send when `treeData` is on. An explicit `rowGroupCols` wins.
   */
  private groupColumnsFor(request: SsrmGetRowsRequest): SsrmColumnVO[] {
    const explicit = request.rowGroupCols ?? [];
    if (explicit.length > 0) return explicit;
    return this.treeFields.map((id) => ({ id }));
  }

  private isTreeRequest(request: SsrmGetRowsRequest): boolean {
    return this.treeFields.length > 0 && (request.rowGroupCols?.length ?? 0) === 0;
  }

  /** Rows in the book, ignoring every filter. */
  get size(): number {
    return this.store.size;
  }

  subscribe(listener: SsrmDeltaListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(delta: SsrmDelta): void {
    if (delta.changed.length === 0 && delta.removed.length === 0) return;
    // ONE statement, two caches. A write is the only thing that can invalidate
    // either a materialised index or a calculated value, and separating them
    // would be two rules that have to stay in step.
    this.indexCache.clear();
    this.writeVersion += 1;
    for (const listener of this.listeners) listener(delta);
  }

  /** Upsert rows by key. Sparse: a row naming three fields writes three cells. */
  applyUpdate(rows: readonly SsrmRow[]): SsrmDelta {
    const offsets = this.store.upsert(rows);
    const changed: unknown[] = [];
    for (const offset of offsets) changed.push(this.store.valueAt(this.store.keyField, offset));
    const delta: SsrmDelta = { changed, removed: [] };
    this.emit(delta);
    return delta;
  }

  /** Replace the whole book — what a provider snapshot means. */
  applySnapshot(rows: readonly SsrmRow[]): SsrmDelta {
    const previous = new Set<unknown>();
    for (const offset of this.store.liveOffsets()) {
      previous.add(this.store.valueAt(this.store.keyField, offset));
    }
    const offsets = this.store.upsert(rows);
    const changed: unknown[] = [];
    for (const offset of offsets) {
      const key = this.store.valueAt(this.store.keyField, offset);
      changed.push(key);
      previous.delete(key);
    }
    const removed = [...previous];
    if (removed.length > 0) this.store.remove(removed);
    const delta: SsrmDelta = { changed, removed };
    this.emit(delta);
    return delta;
  }

  applyRemove(keys: readonly unknown[]): SsrmDelta {
    this.store.remove(keys);
    const delta: SsrmDelta = { changed: [], removed: [...keys] };
    this.emit(delta);
    return delta;
  }

  /**
   * Quick search text. Returns true when it changed, so a caller only purges
   * when there is something to purge for.
   */
  setQuickFilter(text: string): boolean {
    const next = (text ?? '').trim();
    if (next === this.quickFilterText) return false;
    this.quickFilterText = next;
    this.indexCache.clear();
    return true;
  }

  /** Offsets matching the request's filter, quick search and ancestor keys. */
  private materialise(request: SsrmGetRowsRequest): Int32Array {
    const key = queryKey(request, this.quickFilterText);
    const cached = this.indexCache.get(key);
    if (cached !== undefined) return cached;

    const filter = compileFilter(this.columns, request.filterModel);
    const quick = compileQuickFilter(this.columns, this.quickFilterText, this.quickFields);
    const ancestors = this.ancestorPredicate(request);

    const live = this.store.liveOffsets();
    const kept: number[] = [];
    for (let i = 0; i < live.length; i++) {
      const offset = live[i];
      if (!filter(offset)) continue;
      if (!quick(offset)) continue;
      if (!ancestors(offset)) continue;
      kept.push(offset);
    }

    const index = sortIndex(this.columns, Int32Array.from(kept), request.sortModel);
    this.indexCache.set(key, index);
    return index;
  }

  /**
   * Rows under the expanded path. `groupKeys` are the ancestor VALUES, and
   * their length is the depth AG is asking for.
   *
   * Compared as strings because that is how AG round-trips a group key through
   * the DOM and back — a numeric group key arrives as the number on the way out
   * and can arrive as either on the way back.
   */
  private ancestorPredicate(request: SsrmGetRowsRequest): RowPredicate {
    const groupCols = this.groupColumnsFor(request);
    const groupKeys = request.groupKeys ?? [];
    if (groupKeys.length === 0) return () => true;

    const clauses: { access: SsrmColumnAccess; key: unknown }[] = [];
    for (let depth = 0; depth < groupKeys.length && depth < groupCols.length; depth++) {
      const field = groupCols[depth].field ?? groupCols[depth].id;
      const access = this.columns.get(field);
      if (access === undefined) continue;
      clauses.push({ access, key: groupKeys[depth] });
    }
    if (clauses.length === 0) return () => true;

    return (offset) =>
      clauses.every(({ access, key }) => {
        const isNull = access.isNull(offset);
        if (key === null || key === undefined || key === '') return isNull;
        if (isNull) return false;
        return String(access.valueAt(offset)) === String(key);
      });
  }

  /**
   * Answer one AG request.
   *
   * Synchronous by construction — the book is here. A host wraps it in whatever
   * async boundary it needs (a worker port), and the settle-exactly-once rule
   * lives at that boundary rather than in here, where there is nothing to leak.
   */
  getRows(request: SsrmGetRowsRequest): SsrmGetRowsResult {
    const index = this.materialise(request);
    const groupCols = this.groupColumnsFor(request);
    const depth = (request.groupKeys ?? []).length;
    const aggregations = activeAggregations(this.columns, request.valueCols);

    const start = Math.max(0, request.startRow ?? 0);
    const end = request.endRow ?? index.length;

    // ── leaf level ────────────────────────────────────────────────────────
    if (depth >= groupCols.length) {
      const slice: SsrmRow[] = [];
      for (let i = start; i < Math.min(end, index.length); i++) {
        slice.push(this.stampCalc(this.store.rowAt(index[i]), index[i]));
      }
      return {
        rowData: slice,
        rowCount: index.length,
        groupLevelInfo: aggregateMembers(index, aggregations),
      };
    }

    // ── group level ───────────────────────────────────────────────────────
    // Resolved through the accessor, so GROUPING BY a calculated column works
    // for the same reason sorting and filtering by one does. A column the
    // engine cannot resolve buckets everything under one null group rather
    // than throwing, which is what a stale group model has always done here.
    const field = groupCols[depth].field ?? groupCols[depth].id;
    const groupBy = this.columns.get(field);
    const buckets = new Map<string, { key: unknown; members: number[] }>();
    for (let i = 0; i < index.length; i++) {
      const offset = index[i];
      const isNull = groupBy === undefined || groupBy.isNull(offset);
      const value = isNull ? null : groupBy.valueAt(offset);
      const bucketKey = isNull ? ' null' : String(value);
      let bucket = buckets.get(bucketKey);
      if (bucket === undefined) {
        bucket = { key: value, members: [] };
        buckets.set(bucketKey, bucket);
      }
      bucket.members.push(offset);
    }

    const ancestors = request.groupKeys ?? [];
    const tree = this.isTreeRequest(request);
    const pivot = this.buildPivot(request, index);

    const groups: SsrmRow[] = [];
    for (const bucket of buckets.values()) {
      const row: SsrmRow = {
        [field]: bucket.key,
        [SSRM_GROUP_FLAG]: true,
        // RULE 3: a group row is identified by its PATH. A leaf key would
        // collide across groups at the same level and AG discards the block.
        [SSRM_GROUP_PATH]: [...ancestors, bucket.key],
        [SSRM_CHILD_COUNT]: bucket.members.length,
        ...(pivot === null
          ? aggregateMembers(bucket.members, aggregations)
          : this.pivotCells(pivot, bucket.members, aggregations)),
      };
      if (tree) {
        // AG reads a tree hierarchy off the DATA — there are no group columns
        // to read it from — so the markers are stamped on here. Every row of a
        // grouped level is a parent by construction: the leaf level is served
        // by the branch above and never reaches this code.
        row[SSRM_TREE_GROUP] = true;
        row[SSRM_TREE_KEY] = bucket.key === null || bucket.key === undefined ? '' : String(bucket.key);
      }
      groups.push(row);
    }

    sortGroupRows(groups, field, request.sortModel);

    return {
      rowData: groups.slice(start, end === undefined ? undefined : end),
      rowCount: groups.length,
      groupLevelInfo:
        pivot === null
          ? aggregateMembers(index, aggregations)
          : this.pivotCells(pivot, Array.from(index), aggregations),
      ...(pivot === null ? {} : { pivotResultFields: pivot.fields }),
    };
  }

  /**
   * The pivot columns this level will produce, or null when not pivoting.
   *
   * The combinations are taken from THIS LEVEL's members rather than the whole
   * book. AG unions the `pivotResultFields` it is given as blocks arrive, so a
   * combination that only exists deeper in the tree appears when that level is
   * expanded — which is the behaviour a user expects and is far cheaper than
   * scanning the book for every request.
   */
  private buildPivot(
    request: SsrmGetRowsRequest,
    index: Int32Array,
  ): { combos: { key: string; values: unknown[] }[]; fields: string[]; cols: SsrmColumnAccess[] } | null {
    // Resolved through the accessor, so a calculated column can be a PIVOT
    // column too. This is the fourth call site, and it was one line — which is
    // the property the single resolver was chosen for.
    const pivotCols = (request.pivotCols ?? [])
      .map((c) => this.columns.get(c.field ?? c.id))
      .filter((access): access is SsrmColumnAccess => access !== undefined);
    if (request.pivotMode !== true || pivotCols.length === 0) return null;

    const aggregations = activeAggregations(this.columns, request.valueCols);
    const seen = new Map<string, unknown[]>();
    for (let i = 0; i < index.length; i++) {
      const offset = index[i];
      const values = pivotCols.map((access) =>
        access.isNull(offset) ? null : access.valueAt(offset),
      );
      const key = values.map((v) => (v === null || v === undefined ? '' : String(v))).join(
        this.pivotSeparator,
      );
      if (!seen.has(key)) seen.set(key, values);
    }

    const combos = [...seen.entries()]
      .map(([key, values]) => ({ key, values }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    const fields: string[] = [];
    for (const combo of combos) {
      for (const { field } of aggregations) {
        fields.push(`${combo.key}${this.pivotSeparator}${field}`);
      }
    }
    return { combos, fields, cols: pivotCols };
  }

  /** One group row's pivoted cells: every combination x every value column. */
  private pivotCells(
    pivot: { combos: { key: string; values: unknown[] }[]; cols: SsrmColumnAccess[] },
    members: readonly number[],
    aggregations: readonly SsrmAggregation[],
  ): Record<string, unknown> {
    if (aggregations.length === 0) return {};

    // Partition the members ONCE per group rather than re-scanning per
    // combination, which would be O(combos x members).
    const byCombo = new Map<string, number[]>();
    for (const offset of members) {
      const key = pivot.cols
        .map((access) => (access.isNull(offset) ? '' : String(access.valueAt(offset))))
        .join(this.pivotSeparator);
      const bucket = byCombo.get(key);
      if (bucket === undefined) byCombo.set(key, [offset]);
      else bucket.push(offset);
    }

    const out: Record<string, unknown> = {};
    for (const combo of pivot.combos) {
      const bucket = byCombo.get(combo.key) ?? [];
      const aggregated = aggregateMembers(bucket, aggregations);
      for (const { field } of aggregations) {
        out[`${combo.key}${this.pivotSeparator}${field}`] = aggregated[field] ?? null;
      }
    }
    return out;
  }

  /**
   * The grand total over the CURRENT filter — the pinned totals row.
   *
   * Deliberately reads the filtered set rather than the whole book: a totals row
   * beneath a filtered grid that reported the unfiltered total would be a
   * confidently wrong number sitting under the rows that contradict it.
   */
  grandTotal(request: SsrmGetRowsRequest): Record<string, unknown> {
    const flat: SsrmGetRowsRequest = { ...request, rowGroupCols: [], groupKeys: [], pivotMode: false };
    const index = this.materialise(flat);
    return aggregateMembers(index, activeAggregations(this.columns, request.valueCols));
  }

  /**
   * Rows of the filtered book ignoring grouping — what a status bar means by
   * "rows".
   *
   * Not the same as a grouped level's `rowCount`, which is the number of
   * top-level GROUPS. Reading that one produced "9 of 50,000" over a book
   * grouped into nine asset classes.
   */
  countFiltered(request: SsrmGetRowsRequest): number {
    return this.materialise({ ...request, rowGroupCols: [], groupKeys: [] }).length;
  }

  /**
   * Distinct values for a set filter.
   *
   * Null above the ceiling rather than a partial list: a set filter has no
   * affordance for "there are more", so a truncated list renders as the whole
   * domain and its Select All silently excludes everything omitted.
   */
  distinctValues(field: string): unknown[] | null {
    const access = this.columns.get(field);
    if (access === undefined) return null;
    // A store column answers from the DICTIONARY where it can — a walk of the
    // domain rather than of the book. A calculated column has no dictionary, so
    // its values are scanned; that is the honest cost of a set filter over an
    // expression and it is bounded by the same ceiling.
    const values = access.calculated
      ? distinctCalcValues(access, this.store.liveOffsets(), this.maxSetFilterValues)
      : this.store.distinct(field);
    if (values === null || values.length > this.maxSetFilterValues) return null;
    return values;
  }

  /**
   * Keys a subscriber can SEE, so a pushed tick can be narrowed to them.
   *
   * `[start, end)` are display positions under this request's own filter, quick
   * search and sort — which is why the request shape has to come with them. The
   * result is keys and nothing else: the caller already holds the values it
   * wants to push, and materialising 100 rows x 121 columns to answer "which
   * rows are on screen" would cost more than the push it is trying to shrink.
   *
   * **Answers `null` for a GROUP level, and that is not a shortcut.** Under
   * grouping the displayed rows span several levels, each with its own offsets,
   * so a position in one level's index is not a displayed row index — narrowing
   * by it would push updates at the wrong rows. The same rule the Perspective
   * path's tick path is bound by, reached here for the same reason. A caller
   * that gets `null` must fall back to sending the whole patch.
   */
  visibleKeys(request: SsrmGetRowsRequest, start: number, end: number): unknown[] | null {
    const groupCols = this.groupColumnsFor(request);
    const depth = (request.groupKeys ?? []).length;
    if (depth < groupCols.length) return null;
    const index = this.materialise(request);
    const from = Math.max(0, start);
    const to = Math.min(end, index.length);
    const keys: unknown[] = [];
    for (let i = from; i < to; i++) keys.push(this.store.valueAt(this.store.keyField, index[i]));
    return keys;
  }
}

/**
 * Every distinct value of a calculated column, or null once past the ceiling.
 *
 * Bails as soon as the ceiling is passed rather than collecting the whole
 * domain and discarding it: a calculated column over a high-cardinality field
 * can be 20,000 distinct values, and the caller is going to answer null for it
 * anyway.
 */
function distinctCalcValues(
  access: SsrmColumnAccess,
  offsets: Int32Array,
  ceiling: number,
): unknown[] | null {
  const seen = new Set<unknown>();
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i];
    seen.add(access.isNull(offset) ? null : access.valueAt(offset));
    if (seen.size > ceiling) return null;
  }
  return [...seen];
}

/**
 * Group rows are ordered by the sort entry naming the GROUP column, or by the
 * group key when the user has not sorted on it.
 *
 * A sort on a leaf column cannot order groups — the group has no single value
 * for it — so those entries are ignored here rather than silently applied to
 * whatever the aggregate happened to be.
 *
 * **Through the same comparator the leaf sort uses.** This function used to
 * carry its own: nulls last, everything else `(x < y ? -1 : 1) * dir`. That is
 * the direction multiplier applied to an unorderable verdict, which is exactly
 * the defect the leaf sort was fixed for twice — and it was reachable, because
 * a NaN group key is neither `===`, nor `<`, nor `>`, so it fell through to
 * `1 * dir` and sorted FIRST on a descending group. Grouping by a calculated
 * column makes a NaN key ordinary rather than exotic. One comparator now.
 */
function sortGroupRows(
  rows: SsrmRow[],
  field: string,
  sortModel: readonly SsrmSortModelItem[] | undefined,
): void {
  const entry = sortModel?.find((s) => s.colId === field);
  const dir = entry?.sort === 'desc' ? -1 : 1;
  rows.sort((a, b) => compareOrderKeys(orderKeyOfValue(a[field]), orderKeyOfValue(b[field]), dir));
}

export function createSsrmEngine(options: SsrmEngineOptions): SsrmEngine {
  return new SsrmEngine(options);
}
