/**
 * Full-filtered-set export (P4b) — the sheet-building half of
 * `datasource.queryAll()`.
 *
 * ## Route choice (studied against AG Grid 36 serverSide behavior)
 *
 * AG's own `exportDataAsCsv` / `exportDataAsExcel` walk the GRID's row
 * model — under SSRM that is exactly the loaded blocks (plus loading
 * stubs), never the server-side remainder; there is no supported
 * "export the whole server set" hook. So a full-filtered-set export
 * must be fed from the data plane (`queryAll` — bounded windowed reads
 * over the SAME filtered+sorted Perspective view), then serialized by
 * one of two supported routes:
 *
 * • **CSV — direct sheet building (this module).** CSV is a plain-text
 *   format (RFC 4180 quoting is ~10 lines); building it directly
 *   streams chunk-by-chunk with bounded memory, needs no second grid
 *   instance/lifecycle, and is deterministic to unit-test. Chosen as
 *   the library route.
 *
 * • **Excel — AG's ExcelExportModule on a transient off-screen
 *   client-side grid** fed with the queryAll rows. A real `.xlsx` (zip
 *   + OOXML) is NOT worth hand-rolling, and AG's Excel writer is the
 *   supported way to produce one — but it requires mounting a second
 *   grid, so it stays a CONSUMER recipe (see the lab spike's
 *   `exportFilteredExcel`) rather than a library dependency.
 */

export interface CsvColumn {
  field: string;
  /** Header label; defaults to `field`. */
  headerName?: string;
}

export interface RowsToCsvOpts {
  /** Emit the header row. Default true. */
  includeHeader?: boolean;
  delimiter?: string;
}

/** RFC 4180 cell: quote when needed, double embedded quotes. */
export function csvEscapeCell(value: unknown, delimiter = ','): string {
  if (value === null || value === undefined) return '';
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return text.includes(delimiter) || text.includes('"') || text.includes('\n') || text.includes('\r')
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

/** One CSV line per row, columns in the given order. No trailing newline. */
export function rowsToCsv(
  rows: readonly Record<string, unknown>[],
  columns: readonly CsvColumn[],
  opts: RowsToCsvOpts = {},
): string {
  const delimiter = opts.delimiter ?? ',';
  const lines: string[] = [];
  if (opts.includeHeader ?? true) {
    lines.push(
      columns.map((col) => csvEscapeCell(col.headerName ?? col.field, delimiter)).join(delimiter),
    );
  }
  for (const row of rows) {
    lines.push(columns.map((col) => csvEscapeCell(row[col.field], delimiter)).join(delimiter));
  }
  return lines.join('\r\n');
}
