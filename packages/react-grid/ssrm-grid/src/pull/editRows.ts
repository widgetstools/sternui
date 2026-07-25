/**
 * Cell-edit write-back helpers (P4b).
 *
 * An edit in ANY window must land in the worker-hosted Perspective
 * table (the only copy of the book) so every window converges — the
 * grid's local row data is just the optimistic preview until the next
 * tick-refresh cycle patches it from the table (schema-coerced: a
 * string typed into a float column comes back a number).
 *
 * Two shapes:
 *
 * • **Single-cell** ({@link createSsrmCellEditHandler}) — wire it to
 *   AG's `onCellValueChanged`. Builds ONE keyed partial row from the
 *   event and posts it with the generation the edit was computed
 *   against; a worker refusal (stale generation, missing table) is a
 *   console.warn, never a throw into AG's event loop.
 *
 * • **Bulk** ({@link updateLoadedRowsOrRefuse}) — every multi-row edit
 *   path MUST go through the fetch-or-refuse guard
 *   ({@link fetchLoadedRowsOrRefuse}): when ANY target row is not
 *   loaded in the grid, the whole batch is refused (a single
 *   console.warn + no-op) — never a silent edit of the subset that
 *   happened to be paged in.
 *
 * Edits to the key column itself are always refused: on an indexed
 * table a re-keyed write INSERTS a new row instead of updating the old
 * one — identity is not editable.
 */

import type { DatasetStateSnapshot } from '@starui/host-data/runtime/ssrm';

/** The connection slice the edit path needs (test seam). */
export interface SsrmEditConnection {
  readonly state: DatasetStateSnapshot | null;
  updateRows(
    rows: Array<Record<string, unknown>>,
    generation?: number,
  ): Promise<DatasetStateSnapshot>;
}

/** The grid slice the loaded-row guard reads (test seam over GridApi). */
export interface LoadedRowReader {
  getRowNode(id: string): { data?: unknown } | undefined | null;
}

/** One cell's worth of a bulk edit. */
export interface SsrmCellEdit {
  /** Row identity — the provider config's `keyColumn` value. */
  key: unknown;
  field: string;
  value: unknown;
}

/** The slice of AG's CellValueChangedEvent the handler consumes. */
export interface SsrmCellValueChange {
  data?: unknown;
  colDef: { field?: string };
  newValue?: unknown;
}

export interface SsrmCellEditHandlerOpts {
  connection: SsrmEditConnection;
  /** Row identity — the provider config's `keyColumn`. */
  keyColumn: string;
  warn?: (message: string) => void;
}

/**
 * `onCellValueChanged` → one keyed partial-row write into the hosted
 * table, stamped with the generation the edit was computed against.
 */
export function createSsrmCellEditHandler(
  opts: SsrmCellEditHandlerOpts,
): (event: SsrmCellValueChange) => void {
  const { connection, keyColumn } = opts;
  const warn = opts.warn ?? ((message: string) => console.warn(message));
  return (event) => {
    const field = event.colDef.field;
    if (!field) {
      warn('[ssrm-edit] edit dropped: column has no field');
      return;
    }
    if (field === keyColumn) {
      warn(`[ssrm-edit] edit refused: key column '${keyColumn}' is row identity, not editable`);
      return;
    }
    const key = (event.data as Record<string, unknown> | undefined)?.[keyColumn];
    if (key === undefined || key === null) {
      warn(`[ssrm-edit] edit dropped: row has no '${keyColumn}' (group row?)`);
      return;
    }
    const generation = connection.state?.generation;
    void connection
      .updateRows([{ [keyColumn]: key, [field]: event.newValue ?? null }], generation)
      .catch((err) => {
        warn(
          `[ssrm-edit] write-back refused: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  };
}

/**
 * Fetch-or-refuse guard: the loaded row data for EVERY `key`, or —
 * when any target row is not loaded in the grid — ONE console.warn and
 * `null`. A bulk edit must never silently touch just the subset of its
 * targets that happened to be paged in; TODO(P4b+): fetch unloaded
 * targets through the table instead of refusing.
 */
export function fetchLoadedRowsOrRefuse(
  reader: LoadedRowReader,
  keys: readonly unknown[],
  warn: (message: string) => void = (message) => console.warn(message),
): Map<unknown, Record<string, unknown>> | null {
  const loaded = new Map<unknown, Record<string, unknown>>();
  const missing: unknown[] = [];
  for (const key of keys) {
    const node = reader.getRowNode(String(key));
    const data = node?.data as Record<string, unknown> | undefined;
    if (data) loaded.set(key, data);
    else missing.push(key);
  }
  if (missing.length > 0) {
    warn(
      `[ssrm-edit] bulk edit refused: ${missing.length} of ${keys.length} target row(s) not loaded ` +
        `(first missing: ${String(missing[0])}) — refusing the whole batch rather than editing a subset`,
    );
    return null;
  }
  return loaded;
}

export interface UpdateLoadedRowsOpts {
  connection: SsrmEditConnection;
  reader: LoadedRowReader;
  /** Row identity — the provider config's `keyColumn`. */
  keyColumn: string;
  edits: readonly SsrmCellEdit[];
  warn?: (message: string) => void;
}

/**
 * Bulk edit path: guard that every target row is loaded
 * (fetch-or-refuse), then post ONE keyed partial-row batch. Returns
 * `true` when the batch was sent, `false` on refusal (already warned).
 */
export async function updateLoadedRowsOrRefuse(opts: UpdateLoadedRowsOpts): Promise<boolean> {
  const { connection, reader, keyColumn, edits } = opts;
  const warn = opts.warn ?? ((message: string) => console.warn(message));
  if (edits.length === 0) return false;
  if (edits.some((edit) => edit.field === keyColumn)) {
    warn(`[ssrm-edit] bulk edit refused: key column '${keyColumn}' is row identity, not editable`);
    return false;
  }
  const keys = [...new Set(edits.map((edit) => edit.key))];
  if (fetchLoadedRowsOrRefuse(reader, keys, warn) === null) return false;

  const rowByKey = new Map<unknown, Record<string, unknown>>();
  for (const edit of edits) {
    const row = rowByKey.get(edit.key) ?? { [keyColumn]: edit.key };
    row[edit.field] = edit.value;
    rowByKey.set(edit.key, row);
  }
  try {
    await connection.updateRows([...rowByKey.values()], connection.state?.generation);
    return true;
  } catch (err) {
    warn(`[ssrm-edit] write-back refused: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
