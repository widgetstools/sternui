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
import type { MarketsGridApi } from '@starui/engine';
import { translateGridOption } from './gridOptionsTranslator';
import { translateColumnDefs } from './colDefTranslator';
import { subscribeAgEvent } from './eventBridge';
import { makeColumn, makeRowNode, type ColumnLike, type RowNodeLike } from './facades';
import { agStateFromCgrid, cgridStateFromAg, type CgridGridState } from './stateTranslator';

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
    // Kernel M3 API: the worker mirrors its post-filter/post-sort row-id
    // order to main (mirrorDisplayedRowIds — the surface always enables
    // it). Iterate that order; fall back to the unfiltered cache scan if
    // the mirror hasn't primed yet (first frame after mount).
    const ids = this.grid.getDisplayedRowIds();
    if (ids.length === 0 && this.rowCache.size > 0) {
      this.forEachNode(fn);
      return;
    }
    for (const id of ids) {
      const node = this.getRowNode(id);
      if (node) fn(node);
    }
  }

  getDisplayedRowCount(): number {
    return this.grid.getDisplayedRowCount();
  }

  getDisplayedRowAtIndex(index: number): RowNodeLike<TData> | undefined {
    const id = this.grid.getDisplayedRowIds()[index];
    return id === undefined ? undefined : this.getRowNode(id);
  }

  getCellValue(params: { rowNode: { id?: string; data?: TData }; colKey: string }): unknown {
    // AG signature: value for a (row, column) pair. Resolve from the
    // row cache via the AG def's field (JS valueGetters don't run on
    // this surface — see colDefTranslator).
    const data = params.rowNode?.data
      ?? (params.rowNode?.id !== undefined ? this.rowCache.get(params.rowNode.id) : undefined);
    if (!data) return undefined;
    const def = this.agDefsByColId.get(params.colKey);
    const field = (def?.field as string | undefined) ?? params.colKey;
    return (data as Record<string, unknown>)[field];
  }

  // ── Columns ────────────────────────────────────────────────────────

  getColumns(): ColumnLike[] {
    // Cumulative left offsets over VISIBLE columns in state order — the
    // grid-state viewport anchor reads getLeft() to find the leftmost
    // visible column past the saved horizontal scroll.
    let left = 0;
    return this.grid.getColumnState().map((s) => {
      const colLeft = s.hide === true ? null : left;
      if (s.hide !== true) left += s.width ?? 0;
      return makeColumn(s, this.agDefsByColId.get(s.colId) ?? { colId: s.colId }, colLeft);
    });
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

  // ── Grid state (profiles) ──────────────────────────────────────────
  // Profiles keep the AG-shaped GridState on disk; the translator maps
  // at this boundary so snapshots stay portable between surfaces.

  getState(): unknown {
    return agStateFromCgrid(this.grid.getState() as unknown as CgridGridState);
  }

  setState(state: unknown): void {
    this.grid.setState(cgridStateFromAg((state ?? {}) as Record<string, unknown>) as never);
  }

  // ── Viewport (grid-state anchor) ───────────────────────────────────

  ensureIndexVisible(index: number, position?: 'auto' | 'top' | 'middle' | 'bottom'): void {
    this.grid.ensureIndexVisible(index, position);
  }

  ensureColumnVisible(colId: string, position?: 'auto' | 'start' | 'middle' | 'end'): void {
    this.grid.ensureColumnVisible(colId, position);
  }

  getFirstDisplayedRowIndex(): number {
    const scroll = (this.grid.getState() as unknown as CgridGridState).scroll;
    const rowH = (this.grid.getGridOption('rowHeight' as never) as number | undefined)
      ?? (this.grid as unknown as { theme?: { rowHeight?: number } }).theme?.rowHeight
      ?? 30;
    return scroll && rowH > 0 ? Math.floor(scroll.top / rowH) : 0;
  }

  getHorizontalPixelRange(): { left: number; right: number } {
    const scroll = (this.grid.getState() as unknown as CgridGridState).scroll;
    return { left: scroll?.left ?? 0, right: (scroll?.left ?? 0) + 1 };
  }

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

  getEditingCells(): unknown[] {
    // No editing-cells accessor on the kernel yet (M4 editing work);
    // callers only test `.length > 0` as an "is editing" guard.
    return [];
  }

  // ── Refresh / repaint ──────────────────────────────────────────────

  refreshCells(_params?: unknown): void {
    // cgrid repaints the canvas wholesale; a targeted-cells refresh is
    // equivalent to a frame repaint.
    this.grid.refresh();
  }

  refreshHeader(): void { this.grid.refresh(); }

  flashCells(params?: unknown): void { this.grid.flashCells((params ?? {}) as never); }

  exportDataAsExcel(_params?: unknown): void {
    warnOnce('exportDataAsExcel routes via @cgrid/export in M4+ — no-op on the cgrid surface until then');
  }

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

// Compile-time conformance: the adapter must satisfy the platform's
// structural seam. If a member is added to `MarketsGridApi` without a
// mirror here, this line is the build error that says so.
const _seamConformance: MarketsGridApi = undefined as unknown as CGridApiAdapter;
void _seamConformance;
