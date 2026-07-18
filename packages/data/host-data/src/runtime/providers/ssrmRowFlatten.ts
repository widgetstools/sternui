/**
 * ssrmRowFlatten — lift dotted `columnDefinitions` / `keyColumn` paths
 * onto literal top-level scalar keys for Perspective / SSRM ingest.
 *
 * Unlike {@link createFieldProjector} (which preserves nested subtrees),
 * this writes `rating.moody` as a flat key so Perspective schema columns
 * match authored AG Grid `field` strings.
 */

import type { ColumnDefinition } from '@wellsfargo-starui/types';
import { getValueByPath } from '@wellsfargo-starui/types';

export type SsrmRowFlattener = (row: unknown) => Record<string, unknown>;

function isPerspectiveScalar(value: unknown): boolean {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (value instanceof Date) return true;
  return false;
}

/** Union of column field paths + keyColumn parts (no prefix dropping). */
export function collectSsrmFlattenPaths(
  columnDefinitions: readonly ColumnDefinition[] | undefined,
  keyColumn: string | readonly string[] | undefined,
): string[] {
  const raw = new Set<string>();
  for (const col of columnDefinitions ?? []) {
    if (col.field) raw.add(col.field);
  }
  if (typeof keyColumn === 'string') raw.add(keyColumn);
  else if (Array.isArray(keyColumn)) {
    for (const k of keyColumn) if (typeof k === 'string') raw.add(k);
  }
  return [...raw];
}

/**
 * Compile a per-row flattener from the provider's column definitions.
 * Returns `null` when there are no paths — callers should pass rows
 * through untouched rather than emitting empty objects.
 */
export function createSsrmRowFlattener(
  columnDefinitions: readonly ColumnDefinition[] | undefined,
  keyColumn: string | readonly string[] | undefined,
): SsrmRowFlattener | null {
  const paths = collectSsrmFlattenPaths(columnDefinitions, keyColumn);
  if (paths.length === 0) return null;

  return (row: unknown): Record<string, unknown> => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
    const out: Record<string, unknown> = {};
    for (const path of paths) {
      const v = getValueByPath(row, path);
      if (v === undefined) continue;
      if (!isPerspectiveScalar(v)) continue;
      out[path] = v;
    }
    return out;
  };
}
