/** Separator used when composing row ids from multiple key columns. */
export const COMPOSITE_KEY_SEPARATOR = '-';

export function normalizeKeyColumns(
  keyColumn: string | readonly string[] | null | undefined,
): readonly string[] | null {
  if (keyColumn == null) return null;
  const arr = Array.isArray(keyColumn) ? keyColumn : [keyColumn];
  const cleaned = arr
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

export function getValueByPath(row: unknown, path: string): unknown {
  if (row == null || typeof row !== 'object') return undefined;
  const obj = row as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
  if (!path.includes('.')) return undefined;
  let cursor: unknown = obj;
  for (const seg of path.split('.')) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

export function composeRowId(
  row: unknown,
  keyColumn: string | readonly string[] | null | undefined,
): string | null {
  const cols = normalizeKeyColumns(keyColumn);
  if (!cols || !row || typeof row !== 'object') return null;
  if (cols.length === 1) {
    const v = getValueByPath(row, cols[0]);
    if (v === null || v === undefined) return null;
    return String(v);
  }
  const parts: string[] = [];
  for (const col of cols) {
    const v = getValueByPath(row, col);
    if (v === null || v === undefined) return null;
    parts.push(String(v));
  }
  return parts.join(COMPOSITE_KEY_SEPARATOR);
}
