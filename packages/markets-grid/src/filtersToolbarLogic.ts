/**
 * Pure helpers for FiltersToolbar. Extracted from the component during
 * the AUDIT M2 refactor so the heuristic logic lives in a separately
 * testable module instead of being buried inside a 622-LOC React
 * component.
 *
 * Every function in this file is:
 *   - synchronous
 *   - dependency-free (no AG-Grid imports, no React imports)
 *   - deterministic (identical inputs → identical outputs)
 *
 * These properties matter because the functions are called:
 *   - on every `filterChanged` event to decide whether the "+" button
 *     should enable (`filterModelsEqual`)
 *   - on every `modelUpdated` / `rowDataUpdated` to recompute per-pill
 *     row counts (`doesRowMatchFilterModel`)
 *   - on "+" click to synthesize a pill label (`generateLabel`)
 *   - when pushing the merged active-saved-filters model into AG-Grid
 *     (`mergeFilterModels`)
 */

// ─── ID generation ──────────────────────────────────────────────────────

export function makeId(): string {
  return `sf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Auto-naming ────────────────────────────────────────────────────────

/**
 * Synthesize a human-readable label from a filter model. Stable
 * heuristic so auto-named labels look the same after a profile
 * round-trip.
 */
export function generateLabel(
  filterModel: Record<string, unknown>,
  existingCount: number,
): string {
  const keys = Object.keys(filterModel);
  if (keys.length === 0) return `Filter ${existingCount + 1}`;
  if (keys.length === 1) {
    const col = keys[0];
    const entry = filterModel[col] as { filter?: unknown; value?: unknown; values?: unknown[] };
    const val = entry?.filter ?? entry?.value ?? entry?.values?.[0];
    return val != null ? `${col}: ${String(val)}` : col;
  }
  if (keys.length === 2) return `${keys[0]} + ${keys[1]}`;
  return `${keys[0]} + ${keys.length - 1} more`;
}

// ─── Row-match helpers ──────────────────────────────────────────────────
//
// Mirrors AG-Grid's filter semantics for set / text / number filters so
// per-pill row counts can be computed WITHOUT activating each filter in
// turn. Used by the count badge inside each pill.

export function doesValueMatchFilter(
  value: unknown,
  filter: Record<string, unknown>,
): boolean {
  if (!filter || typeof filter !== 'object' || !filter.filterType) return true;
  const filterType = filter.filterType as string;

  if (filterType === 'set') {
    const vals = (filter.values as unknown[] | undefined) ?? [];
    if (vals.length === 0) return true;
    const strVal = value == null ? null : String(value);
    return vals.some((v) => (v == null ? strVal == null : String(v) === strVal));
  }

  if (filterType === 'text') {
    const strVal = value == null ? '' : String(value).toLowerCase();
    const filterVal = filter.filter == null ? '' : String(filter.filter).toLowerCase();
    if (filter.operator && Array.isArray(filter.conditions)) {
      const results = (filter.conditions as Record<string, unknown>[]).map((c) =>
        doesValueMatchFilter(value, { ...c, filterType: 'text' }),
      );
      return filter.operator === 'AND' ? results.every(Boolean) : results.some(Boolean);
    }
    switch (filter.type) {
      case 'contains': return strVal.includes(filterVal);
      case 'notContains': return !strVal.includes(filterVal);
      case 'equals': return strVal === filterVal;
      case 'notEqual': return strVal !== filterVal;
      case 'startsWith': return strVal.startsWith(filterVal);
      case 'endsWith': return strVal.endsWith(filterVal);
      case 'blank': return value == null || String(value).trim() === '';
      case 'notBlank': return value != null && String(value).trim() !== '';
      default: return true;
    }
  }

  if (filterType === 'number') {
    const numVal = value == null ? NaN : Number(value);
    const filterNum = filter.filter == null ? NaN : Number(filter.filter);
    const filterTo = filter.filterTo == null ? NaN : Number(filter.filterTo);
    if (filter.operator && Array.isArray(filter.conditions)) {
      const results = (filter.conditions as Record<string, unknown>[]).map((c) =>
        doesValueMatchFilter(value, { ...c, filterType: 'number' }),
      );
      return filter.operator === 'AND' ? results.every(Boolean) : results.some(Boolean);
    }
    switch (filter.type) {
      case 'equals': return numVal === filterNum;
      case 'notEqual': return numVal !== filterNum;
      case 'greaterThan': return numVal > filterNum;
      case 'greaterThanOrEqual': return numVal >= filterNum;
      case 'lessThan': return numVal < filterNum;
      case 'lessThanOrEqual': return numVal <= filterNum;
      case 'inRange': return numVal >= filterNum && numVal <= filterTo;
      case 'blank': return value == null || Number.isNaN(numVal);
      case 'notBlank': return value != null && !Number.isNaN(numVal);
      default: return true;
    }
  }

  // Date / unknown filterType — fall through to match-all. Keeps the count
  // optimistic for unsupported shapes rather than reporting zero.
  return true;
}

export function doesRowMatchFilterModel(
  rowData: Record<string, unknown>,
  filterModel: Record<string, unknown>,
): boolean {
  for (const [col, filter] of Object.entries(filterModel)) {
    if (!doesValueMatchFilter(rowData[col], filter as Record<string, unknown>)) return false;
  }
  return true;
}

// ─── Filter-model equality ──────────────────────────────────────────────

/**
 * Deep-equal check for AG-Grid filter models. Order of keys doesn't matter
 * (filter models are unordered maps of colId → condition), but nested
 * arrays like `set` values DO depend on order for strict equality. We
 * ignore array ordering for `values` specifically since that's a set.
 *
 * Returns true only when every column filter matches exactly. Used to
 * decide whether the live filter model is "just what the saved pills
 * produced" (echo) or "the user has added something new" (enable +).
 */
export function filterModelsEqual(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  const aEmpty = !a || Object.keys(a).length === 0;
  const bEmpty = !b || Object.keys(b).length === 0;
  if (aEmpty && bEmpty) return true;
  if (aEmpty !== bEmpty) return false;
  const aKeys = Object.keys(a!).sort();
  const bKeys = Object.keys(b!).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!deepEqualFilter(a![aKeys[i]], b![aKeys[i]])) return false;
  }
  return true;
}

function deepEqualFilter(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  // `values` is a set — order-insensitive.
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    // Sort copies so equality ignores order (set semantics).
    const aSorted = [...a].map((v) => JSON.stringify(v)).sort();
    const bSorted = [...b].map((v) => JSON.stringify(v)).sort();
    for (let i = 0; i < aSorted.length; i++) if (aSorted[i] !== bSorted[i]) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao).sort();
  const bKeys = Object.keys(bo).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!deepEqualFilter(ao[aKeys[i]], bo[aKeys[i]])) return false;
  }
  return true;
}

// ─── Filter-model merge ─────────────────────────────────────────────────

/**
 * Combine N filter models with column-level OR and cross-column AND. The
 * E2E "saved filters per profile" suite depends on two active "set"
 * filters unioning their values rather than the second clobbering the
 * first, hence the explicit set-union path.
 */
export function mergeFilterModels(
  models: Record<string, unknown>[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const model of models) {
    for (const [col, raw] of Object.entries(model)) {
      const filter = raw as Record<string, unknown>;
      const existing = merged[col] as Record<string, unknown> | undefined;
      if (!existing) {
        merged[col] = filter;
        continue;
      }
      // Same column, both `set` filters → union the values.
      if (existing.filterType === 'set' && filter.filterType === 'set') {
        const union = Array.from(
          new Set([
            ...((existing.values as unknown[]) ?? []),
            ...((filter.values as unknown[]) ?? []),
          ]),
        );
        merged[col] = { ...existing, values: union };
        continue;
      }
      // Same column, both simple number/text — combine into an OR condition.
      if (
        existing.filterType === filter.filterType &&
        existing.filterType !== 'set' &&
        !existing.conditions &&
        !filter.conditions &&
        existing.type &&
        filter.type
      ) {
        merged[col] = {
          filterType: existing.filterType,
          operator: 'OR',
          conditions: [
            { type: existing.type, filter: existing.filter, filterTo: existing.filterTo },
            { type: filter.type, filter: filter.filter, filterTo: filter.filterTo },
          ],
        };
        continue;
      }
      // Existing is already an OR fan-out — just append.
      if (
        existing.operator === 'OR' &&
        Array.isArray(existing.conditions) &&
        existing.filterType === filter.filterType &&
        filter.type
      ) {
        merged[col] = {
          ...existing,
          conditions: [
            ...(existing.conditions as unknown[]),
            { type: filter.type, filter: filter.filter, filterTo: filter.filterTo },
          ],
        };
        continue;
      }
      // Last write wins.
      merged[col] = filter;
    }
  }
  return merged;
}

// ─── "Has new filter" predicate ─────────────────────────────────────────

/**
 * Record shape the `+`-button uniqueness check consumes. Kept narrow on
 * purpose — `isNewFilter` only needs the filter model + active flag.
 */
export interface SavedFilterShape {
  filterModel: Record<string, unknown>;
  active: boolean;
}

/**
 * Returns true when the live AG-Grid filter model represents a GENUINELY
 * new filter the user hasn't saved yet — i.e. the `+` button should
 * enable to let them capture it as a new pill.
 *
 * Uniqueness covers BOTH active and inactive pills: an earlier version
 * only compared `live` against the merged ACTIVE filters, which let
 * users accidentally duplicate an inactive pill by re-entering the
 * same filter into the grid after toggling its pill off.
 *
 * A live model is "new" when:
 *   1. It's non-empty (empty filter = no filter, nothing to save)
 *   2. It doesn't match any individual pill's model (active OR inactive)
 *   3. It doesn't match the merged-active echo (the toolbar's own push
 *      into AG-Grid after activating multiple pills)
 */
export function isNewFilter(
  live: Record<string, unknown> | null | undefined,
  pills: ReadonlyArray<SavedFilterShape>,
): boolean {
  if (!live || Object.keys(live).length === 0) return false;

  // Rule 2: reject if any pill's model equals the live model.
  for (const pill of pills) {
    if (filterModelsEqual(live, pill.filterModel)) return false;
  }

  // Rule 3: reject the merged-active echo. For 0/1 active pills the
  // merge equals null / that one pill — already caught above. Only the
  // N≥2 case produces a shape distinct from every individual pill.
  const active = pills.filter((p) => p.active);
  if (active.length >= 2) {
    const merged = mergeFilterModels(active.map((p) => p.filterModel));
    if (filterModelsEqual(live, merged)) return false;
  }

  return true;
}

// ─── New-filter extraction (live \ active) ──────────────────────────────

/**
 * Subtracts the `expected` filter model from `live`, returning ONLY the
 * columns the user genuinely added or changed. Used at + time so the
 * new pill captures just the net-new criterion — NOT the merged union
 * of every active pill plus the new column filter.
 *
 * The bug this fixes: user has pill A active with `{side: BUY}`. They
 * open the `price` column filter and type `> 100`. AG-Grid now reports
 * `{side: BUY, price > 100}`. Clicking + previously captured that full
 * merged model into a new pill, so both pills A and B contained the
 * `side = BUY` criterion. Toggling A off left B still enforcing BUY.
 *
 * The rule: a column belongs in the delta when EITHER
 *  - it's missing from `expected` (truly new column), OR
 *  - its per-column filter differs from the expected one (value change
 *    on a column an active pill already covers).
 *
 * We never emit a column whose live value equals the expected one —
 * that's the "active pills already own this" case.
 */
export function subtractFilterModel(
  live: Record<string, unknown> | null | undefined,
  expected: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!live) return {};
  if (!expected || Object.keys(expected).length === 0) {
    // Nothing active → every column in live is new.
    return { ...live };
  }
  const out: Record<string, unknown> = {};
  for (const [col, liveFilter] of Object.entries(live)) {
    const expectedFilter = expected[col];
    // `filterModelsEqual` works on full-model shapes, so wrap each
    // per-column filter in a single-key model for comparison.
    const same = filterModelsEqual(
      { [col]: liveFilter },
      expectedFilter === undefined ? undefined : { [col]: expectedFilter },
    );
    if (!same) out[col] = liveFilter;
  }
  return out;
}
