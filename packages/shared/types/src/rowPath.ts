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

const accessorCache = new Map<string, (row: unknown) => unknown>();
const setterCache = new Map<string, (row: unknown, value: unknown) => boolean>();

export function getPathAccessor(path: string): (row: unknown) => unknown {
  const cached = accessorCache.get(path);
  if (cached) return cached;

  let fn: (row: unknown) => unknown;
  if (!path.includes('.')) {
    fn = (row) => {
      if (row == null || typeof row !== 'object') return undefined;
      return (row as Record<string, unknown>)[path];
    };
  } else {
    const segments = path.split('.');
    fn = (row) => {
      if (row == null || typeof row !== 'object') return undefined;
      const obj = row as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
      let cursor: unknown = obj;
      for (let i = 0; i < segments.length; i++) {
        if (cursor == null || typeof cursor !== 'object') return undefined;
        cursor = (cursor as Record<string, unknown>)[segments[i] as string];
      }
      return cursor;
    };
  }
  accessorCache.set(path, fn);
  return fn;
}

export function getPathSetter(path: string): (row: unknown, value: unknown) => boolean {
  const cached = setterCache.get(path);
  if (cached) return cached;

  let fn: (row: unknown, value: unknown) => boolean;
  if (!path.includes('.')) {
    fn = (row, value) => {
      if (row == null || typeof row !== 'object') return false;
      const obj = row as Record<string, unknown>;
      if (Object.is(obj[path], value)) return false;
      obj[path] = value;
      return true;
    };
  } else {
    const segments = path.split('.');
    const lastIdx = segments.length - 1;
    fn = (row, value) => {
      if (row == null || typeof row !== 'object') return false;
      let cursor = row as Record<string, unknown>;
      for (let i = 0; i < lastIdx; i++) {
        const seg = segments[i] as string;
        const next = cursor[seg];
        if (next == null || typeof next !== 'object') {
          const made: Record<string, unknown> = {};
          cursor[seg] = made;
          cursor = made;
        } else {
          cursor = next as Record<string, unknown>;
        }
      }
      const finalSeg = segments[lastIdx] as string;
      if (Object.is(cursor[finalSeg], value)) return false;
      cursor[finalSeg] = value;
      return true;
    };
  }
  setterCache.set(path, fn);
  return fn;
}

/** Test-only: reset path accessor caches between suites. */
export function __resetPathAccessorCaches(): void {
  accessorCache.clear();
  setterCache.clear();
}
