import type { ColDef } from 'ag-grid-community';
import type { LabRow } from '../../data/types';

export type AltFieldCol = {
  id: string;
  title: string;
  field: keyof LabRow | string;
  width: number;
};

/** Flatten AG Grid colDefs into simple field columns for alt grid spikes. */
export function toAltFieldColumns(
  columnDefs: ColDef<LabRow>[],
  maxCols?: number,
): AltFieldCol[] {
  const out: AltFieldCol[] = [];
  for (const c of columnDefs) {
    const field = (c.field ?? c.colId) as string | undefined;
    if (!field) continue;
    out.push({
      id: String(c.colId ?? field),
      title: String(c.headerName ?? field),
      field,
      width: typeof c.width === 'number' ? c.width : 100,
    });
    if (maxCols != null && out.length >= maxCols) break;
  }
  return out;
}

export function cellText(row: LabRow | undefined, field: string): string {
  if (!row) return '';
  const v = (row as Record<string, unknown>)[field];
  if (v == null) return '';
  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '';
  }
  return String(v);
}

/** Perspective / Arrow-safe row: only selected fields as primitives. */
export function toPerspectiveRows(
  rows: LabRow[],
  fields: AltFieldCol[],
): Record<string, string | number | boolean | null>[] {
  return rows.map((row) => {
    const out: Record<string, string | number | boolean | null> = {};
    for (const f of fields) {
      const v = (row as Record<string, unknown>)[f.field];
      if (v == null) {
        out[f.field] = null;
      } else if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
        out[f.field] = typeof v === 'number' && !Number.isFinite(v) ? null : v;
      } else if (v instanceof Date) {
        out[f.field] = v.getTime();
      } else {
        out[f.field] = String(v);
      }
    }
    return out;
  });
}
