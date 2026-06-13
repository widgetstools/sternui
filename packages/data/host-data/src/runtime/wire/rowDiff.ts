/**
 * rowDiff — top-level field diff between two versions of the same row,
 * powering thin field-level deltas (`delta-patch`).
 *
 * The hub caches full rows and receives full replacement rows from
 * upstream; for touch updates (a few fields changed out of hundreds)
 * shipping only the changed fields shrinks the hub→window wire by the
 * touch ratio. The whole-row-replacement invariant is preserved at the
 * consumer boundary: the CLIENT merges a patch into its previous full
 * row producing a NEW row object, so subscribers still see immutable
 * full-row values — the merge contract lives in exactly one place.
 *
 * Diff granularity is TOP-LEVEL fields. A changed nested object ships
 * whole (its top-level field is the patch unit) — fine-grained nested
 * diffs would need a deep-merge contract on the client, which is the
 * complexity this design deliberately avoids.
 */

export interface TopLevelDiff {
  /** Changed or added top-level fields (new values). */
  s?: Record<string, unknown>;
  /** Top-level fields present on prev but absent on next. */
  d?: string[];
}

/**
 * Value equality for diffing. `Object.is` covers primitives (the
 * dominant market-data shape); object values — born from `JSON.parse`,
 * so never reference-equal across frames — fall back to a JSON
 * stringify compare.
 */
function valueEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    a !== null && b !== null
    && typeof a === 'object' && typeof b === 'object'
  ) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Diff two versions of a row by top-level field.
 *
 * Returns:
 *   - `'identical'` — no observable change; callers can skip the row.
 *   - `'opaque'`    — prev or next is not a plain object; callers must
 *                     fall back to shipping the full row.
 *   - `TopLevelDiff` — changed/added fields in `s`, removed field
 *                     names in `d` (each present only when non-empty).
 */
export function diffTopLevel(
  prev: unknown,
  next: unknown,
): TopLevelDiff | 'identical' | 'opaque' {
  if (
    !prev || typeof prev !== 'object' || Array.isArray(prev)
    || !next || typeof next !== 'object' || Array.isArray(next)
  ) {
    return 'opaque';
  }
  const p = prev as Record<string, unknown>;
  const n = next as Record<string, unknown>;

  let s: Record<string, unknown> | undefined;
  for (const key of Object.keys(n)) {
    const nv = n[key];
    if (nv === undefined) continue;
    if (!valueEquals(p[key], nv)) {
      (s ??= {})[key] = nv;
    }
  }

  let d: string[] | undefined;
  for (const key of Object.keys(p)) {
    if (p[key] === undefined) continue;
    // Explicit `undefined` on next counts as removed too — JSON
    // serialization drops it, so consumers could never observe it.
    if (n[key] === undefined) {
      (d ??= []).push(key);
    }
  }

  if (!s && !d) return 'identical';
  const out: TopLevelDiff = {};
  if (s) out.s = s;
  if (d) out.d = d;
  return out;
}
