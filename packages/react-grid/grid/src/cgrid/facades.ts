/**
 * MarketsCgrid — RowNode + Column facades.
 *
 * StarUI call sites consume a narrow slice of AG's RowNode/Column
 * objects (verified by audit): rows → `{id, data, rowIndex?, setData?,
 * setDataValue?}`; columns → `{getColId(), getColDef(), isVisible(),
 * getLeft?, getActualWidth?}`. cgrid has no node model (ID/index based),
 * so these facades are built from the adapter's main-thread row cache
 * and `getColumnState()` + the ORIGINAL AG defs the surface received
 * (keeping `getColDef()` faithful to what the pipeline authored,
 * e.g. `suppressSizeToFit`).
 */

export interface RowNodeLike<T = unknown> {
  readonly id: string;
  readonly data: T | undefined;
  setData(data: T): void;
  setDataValue(colId: string, value: unknown): void;
}

export interface ColumnLike {
  getColId(): string;
  getColDef(): Record<string, unknown>;
  isVisible(): boolean;
  getActualWidth(): number;
  /** Pixel offset of the column's left edge in the scrollable body
   *  (cumulative visible widths — the grid-state viewport anchor's
   *  only consumer). `null` for hidden columns, matching AG. */
  getLeft(): number | null;
}

export interface RowWriteSink<T> {
  updateRow(row: T): void;
  updateCell(rowId: string, colId: string, value: unknown): void;
}

export function makeRowNode<T extends Record<string, unknown>>(
  id: string,
  data: T | undefined,
  sink: RowWriteSink<T>,
): RowNodeLike<T> {
  return {
    id,
    data,
    setData(next: T) {
      sink.updateRow(next);
    },
    setDataValue(colId: string, value: unknown) {
      sink.updateCell(id, colId, value);
    },
  };
}

export interface ColumnStateLike {
  colId: string;
  hide?: boolean;
  width?: number;
}

export function makeColumn(
  state: ColumnStateLike,
  def: Record<string, unknown>,
  left: number | null = null,
): ColumnLike {
  return {
    getColId: () => state.colId,
    getColDef: () => def,
    isVisible: () => state.hide !== true,
    getActualWidth: () => state.width ?? 0,
    getLeft: () => (state.hide === true ? null : left),
  };
}
