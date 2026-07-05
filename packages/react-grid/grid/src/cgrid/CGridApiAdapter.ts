/**
 * MarketsCgrid — the AG-`GridApi`-shaped adapter over a live cgrid.
 *
 * StarUI's platform (`ApiHub`, controller, container data pipeline)
 * consumes a structural subset of AG's `GridApi`. cgrid mirrors most
 * of it by name; this adapter fills the gaps:
 *
 *  - a main-thread ROW CACHE (`Map<rowId, row>`) fed by every data
 *    write passing through the adapter, so AG's synchronous node
 *    accessors (`getRowNode`, `forEachNode`) work even though cgrid's
 *    data lives worker-side;
 *  - RowNode/Column FACADES (facades.ts);
 *  - AG event names via eventBridge; option/colDef translation via the
 *    translators;
 *  - warn-once no-ops for AG surface cgrid doesn't have (fail loud in
 *    dev, never crash).
 *
 * M1 scope: construction, data pipeline, ready-path, theming hooks,
 * sorting/column basics. M2 adds getState/setState via stateTranslator;
 * M3 extends per the module matrix.
 */

import type { CGrid } from '@cgrid/kernel';
import { translateGridOption } from './gridOptionsTranslator';
import { translateColumnDefs } from './colDefTranslator';
import { subscribeAgEvent } from './eventBridge';
import { makeColumn, makeRowNode, type ColumnLike, type RowNodeLike } from './facades';

type AnyRow = Record<string, unknown>;

const warned = new Set<string>();
function warnOnce(msg: string): void {
  if (warned.has(msg)) return;
  warned.add(msg);
  // eslint-disable-next-line no-console
  console.warn(`[MarketsCgrid] ${msg}`);
}

export class CGridApiAdapter<TData extends AnyRow = AnyRow> {
  private readonly grid: CGrid<TData>;
  private readonly getRowIdFn: (row: TData) => string;
  /** Main-thread mirror of the row set (worker owns the real model). */
  private readonly rowCache = new Map<string, TData>();
  /** The ORIGINAL AG defs (pre-translation), keyed by colId — the
   *  Column facade's getColDef() source. */
  private agDefsByColId = new Map<string, Record<string, unknown>>();
  private destroyed = false;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(grid: CGrid<TData>, getRowIdFn: (row: TData) => string) {
    this.grid = grid;
    this.getRowIdFn = getRowIdFn;
    this.unsubscribers.push(
      grid.on('gridPreDestroyed', () => { this.destroyed = true; }),
    );
  }

  /** Record the AG-shaped defs currently applied (surface calls this on
   *  every columnDefs change so getColDef() stays faithful). */
  setAgColumnDefs(defs: readonly unknown[]): void {
    const map = new Map<string, Record<string, unknown>>();
    const walk = (list: readonly unknown[]): void => {
      for (const d of list) {
        const def = d as Record<string, unknown>;
        if (Array.isArray(def.children)) { walk(def.children as unknown[]); continue; }
        const colId = (def.colId ?? def.field) as string | undefined;
        if (colId) map.set(colId, def);
      }
    };
    walk(defs);
    this.agDefsByColId = map;
  }

  // ── Data pipeline ──────────────────────────────────────────────────

  applyTransactionAsync(tx: { add?: TData[]; update?: TData[]; remove?: TData[] }, callback?: () => void): void {
    for (const row of tx.add ?? []) this.rowCache.set(this.getRowIdFn(row), row);
    for (const row of tx.update ?? []) this.rowCache.set(this.getRowIdFn(row), row);
    for (const row of tx.remove ?? []) this.rowCache.delete(this.getRowIdFn(row));
    this.grid.applyTransactionAsync(tx);
    if (callback) {
      // AG invokes the callback post-flush; cgrid flush is frame-batched.
      const off = this.grid.on('asyncTransactionsFlushed', () => { off(); callback(); });
    }
  }

  applyTransaction(tx: { add?: TData[]; update?: TData[]; remove?: TData[] }): unknown {
    for (const row of tx.add ?? []) this.rowCache.set(this.getRowIdFn(row), row);
    for (const row of tx.update ?? []) this.rowCache.set(this.getRowIdFn(row), row);
    for (const row of tx.remove ?? []) this.rowCache.delete(this.getRowIdFn(row));
    return this.grid.applyTransaction(tx);
  }

  flushAsyncTransactions(): void {
    this.grid.flushAsyncTransactions();
  }

  private setRowDataInternal(rows: TData[]): void {
    this.rowCache.clear();
    for (const row of rows) this.rowCache.set(this.getRowIdFn(row), row);
    this.grid.setRowData(rows);
  }

  // ── Options ────────────────────────────────────────────────────────

  setGridOption(key: string, value: unknown): void {
    if (this.destroyed) return;
    if (key === 'rowData') {
      this.setRowDataInternal((value ?? []) as TData[]);
      return;
    }
    if (key === 'columnDefs') {
      this.setAgColumnDefs((value ?? []) as unknown[]);
      this.grid.updateGridOptions({ columnDefs: translateColumnDefs((value ?? []) as unknown[]) as never });
      return;
    }
    const t = translateGridOption(key, value);
    if (t.kind === 'set' && t.key) {
      this.grid.setGridOption(t.key as never, t.value as never);
    }
  }

  getGridOption(key: string): unknown {
    return this.grid.getGridOption(key as never);
  }

  updateGridOptions(partial: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(partial)) this.setGridOption(key, value);
  }

  // ── Rows (node facade over the cache) ──────────────────────────────

  getRowNode(id: string): RowNodeLike<TData> | undefined {
    const data = this.rowCache.get(id);
    if (data === undefined) return undefined;
    return makeRowNode(id, data, {
      updateRow: (row) => this.applyTransactionAsync({ update: [row] }),
      updateCell: (rowId, colId, value) => {
        const current = this.rowCache.get(rowId);
        if (!current) return;
        this.applyTransactionAsync({ update: [{ ...current, [colId]: value } as TData] });
      },
    });
  }

  forEachNode(fn: (node: RowNodeLike<TData>) => void): void {
    for (const [id] of this.rowCache) {
      const node = this.getRowNode(id);
      if (node) fn(node);
    }
  }

  forEachNodeAfterFilter(fn: (node: RowNodeLike<TData>) => void): void {
    // M3 (kernel: sync displayed-row order) upgrades this to the real
    // filtered set; until then the unfiltered scan is the documented
    // degradation.
    warnOnce('forEachNodeAfterFilter iterates ALL rows on the cgrid surface until the displayed-order kernel API lands');
    this.forEachNode(fn);
  }

  getDisplayedRowCount(): number {
    return this.grid.getDisplayedRowCount();
  }

  // ── Columns ────────────────────────────────────────────────────────

  getColumns(): ColumnLike[] {
    return this.grid.getColumnState().map((s) =>
      makeColumn(s, this.agDefsByColId.get(s.colId) ?? { colId: s.colId }),
    );
  }

  getAllDisplayedColumns(): ColumnLike[] {
    return this.getColumns().filter((c) => c.isVisible());
  }

  getColumn(colId: string): ColumnLike | undefined {
    const state = this.grid.getColumnState().find((s) => s.colId === colId);
    if (!state) return undefined;
    return makeColumn(state, this.agDefsByColId.get(colId) ?? { colId });
  }

  getColumnState(): unknown[] { return this.grid.getColumnState(); }
  applyColumnState(params: never): void { this.grid.applyColumnState(params); }
  setColumnsVisible(keys: string[], visible: boolean): void { this.grid.setColumnsVisible(keys, visible); }
  sizeColumnsToFit(): void { this.grid.sizeColumnsToFit(); }
  autoSizeColumns(keys: string[]): void { this.grid.autoSizeColumns(keys); }
  autoSizeAllColumns(): void { this.grid.autoSizeAllColumns(); }

  // ── Filters / search ───────────────────────────────────────────────

  getFilterModel(): unknown { return this.grid.getFilterModel(); }
  setFilterModel(model: never): void { this.grid.setFilterModel(model ?? {}); }
  getColumnFilterModel(colId: string): unknown { return this.grid.getColumnFilterModel(colId); }
  setColumnFilterModel(colId: string, model: never): Promise<void> {
    this.grid.setColumnFilterModel(colId, model);
    return Promise.resolve();
  }
  onFilterChanged(): void { this.grid.onFilterChanged(); }

  // ── Selection / focus / ranges ─────────────────────────────────────

  getCellRanges(): unknown[] { return this.grid.getCellRanges(); }
  getFocusedCell(): unknown {
    const focused = this.grid.getFocusedCell();
    if (!focused) return null;
    // AG shape: { rowIndex, column } — provide the column facade.
    return { rowId: focused.rowId, column: this.getColumn(focused.colId) ?? null, colId: focused.colId };
  }

  // ── Editing ────────────────────────────────────────────────────────

  stopEditing(cancel?: boolean): void { this.grid.stopEditing(cancel); }

  // ── Refresh / repaint ──────────────────────────────────────────────

  refreshCells(_params?: unknown): void {
    // cgrid repaints the canvas wholesale; a targeted-cells refresh is
    // equivalent to a frame repaint.
    this.grid.refresh();
  }

  refreshHeader(): void { this.grid.refresh(); }

  // ── Lifecycle / events ─────────────────────────────────────────────

  isDestroyed(): boolean { return this.destroyed; }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const off of this.unsubscribers) off();
    this.grid.destroy();
  }

  addEventListener(eventType: string, listener: (event: unknown) => void): void {
    const off = subscribeAgEvent(
      { on: (type, handler) => this.grid.on(type as never, handler as never) },
      eventType,
      listener,
    );
    this.unsubscribers.push(off);
    this.listenerOffs.set(listener, off);
  }

  removeEventListener(_eventType: string, listener: (event: unknown) => void): void {
    const off = this.listenerOffs.get(listener);
    if (off) { off(); this.listenerOffs.delete(listener); }
  }

  private readonly listenerOffs = new Map<(event: unknown) => void, () => void>();

  // ── Escape hatch ───────────────────────────────────────────────────

  /** The underlying cgrid instance for cgrid-aware call sites. */
  get cgrid(): CGrid<TData> { return this.grid; }
}
