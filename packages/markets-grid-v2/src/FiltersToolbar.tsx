import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GridCore,
  type GridStore,
  type SavedFiltersState,
  useModuleState,
} from '@grid-customizer/core-v2';
import { Plus, Pencil, Trash2, FunnelX, ChevronLeft, ChevronRight, Brush } from 'lucide-react';
import type { SavedFilter } from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeId(): string {
  return `sf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Synthesize a human-readable label from a filter model. We keep the v1
 * heuristic verbatim so existing labels look the same after auto-naming.
 */
function generateLabel(filterModel: Record<string, unknown>, existingCount: number): string {
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

// ─── Row-match helpers for per-pill counts ─────────────────────────────────
//
// Ported verbatim from v1 — mirrors AG-Grid's filter semantics for set /
// text / number filters so we can compute per-pill row counts WITHOUT
// having to activate each filter in turn. Used by the count badge inside
// each pill, which v1 had and v2 had dropped.

function doesValueMatchFilter(value: unknown, filter: Record<string, unknown>): boolean {
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
      case 'blank': return value == null || isNaN(numVal);
      case 'notBlank': return value != null && !isNaN(numVal);
      default: return true;
    }
  }

  // Date / unknown filterType — fall through to match-all. Keeps the count
  // optimistic for unsupported shapes rather than reporting zero.
  return true;
}

function doesRowMatchFilterModel(
  rowData: Record<string, unknown>,
  filterModel: Record<string, unknown>,
): boolean {
  for (const [col, filter] of Object.entries(filterModel)) {
    if (!doesValueMatchFilter(rowData[col], filter as Record<string, unknown>)) return false;
  }
  return true;
}

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
function filterModelsEqual(
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

/**
 * Combine N filter models with column-level OR and cross-column AND. Same
 * algorithm as v1 — preserved verbatim because the E2E "saved filters per
 * profile" suite checks that two active "set" filters union their values
 * rather than the second clobbering the first.
 */
function mergeFilterModels(models: Record<string, unknown>[]): Record<string, unknown> {
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
        const union = Array.from(new Set([...(existing.values as unknown[] ?? []), ...(filter.values as unknown[] ?? [])]));
        merged[col] = { ...existing, values: union };
        continue;
      }
      // Same column, both simple number/text — combine into an OR condition.
      if (
        existing.filterType === filter.filterType &&
        existing.filterType !== 'set' &&
        !existing.conditions && !filter.conditions &&
        existing.type && filter.type
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

// ─── Component ──────────────────────────────────────────────────────────────

export interface FiltersToolbarProps {
  core: GridCore;
  store: GridStore;
  /**
   * Optional Style-toolbar toggle rendered inline on the right of the filter
   * pill row. When `onToggleStyleToolbar` is supplied, a `Brush` pill button
   * appears and reflects `styleToolbarOpen` in its active state. This is the
   * entry point for the floating FormattingToolbar.
   */
  styleToolbarOpen?: boolean;
  onToggleStyleToolbar?: () => void;
}

export function FiltersToolbar({
  core,
  store,
  styleToolbarOpen,
  onToggleStyleToolbar,
}: FiltersToolbarProps) {
  // Filters live in the per-profile saved-filters module. Reading and writing
  // through `useModuleState` is the ONLY channel — no refs, no events. The
  // auto-save engine picks up changes and persists them on a debounce.
  const [filtersState, setFiltersState] = useModuleState<SavedFiltersState>(store, 'saved-filters');
  const filters = useMemo(() => (filtersState?.filters ?? []) as SavedFilter[], [filtersState]);

  const setFilters = useCallback(
    (next: SavedFilter[] | ((prev: SavedFilter[]) => SavedFilter[])) => {
      setFiltersState((prev) => {
        const prevList = (prev?.filters ?? []) as SavedFilter[];
        const resolved = typeof next === 'function'
          ? (next as (p: SavedFilter[]) => SavedFilter[])(prevList)
          : next;
        return { ...prev, filters: resolved };
      });
    },
    [setFiltersState],
  );

  const [renameId, setRenameId] = useState<string | null>(null);

  // ─── Per-pill row counts ──────────────────────────────────────────────
  //
  // v1 parity — each pill renders a small count badge showing how many
  // rows this filter would match if applied. Computed against the live
  // rowData by walking `api.forEachNode(...)` and running the saved
  // filter model against each row (same `doesRowMatchFilterModel`
  // predicate as v1). Recomputes on:
  //  - the filters list changing (new pill, renamed pill — label stays;
  //    count stays too unless the filter model changed, which it does
  //    here because pills are immutable once captured)
  //  - AG-Grid's `rowDataUpdated` / `modelUpdated` events (data refresh)
  //  - `firstDataRendered` (cold-mount: data arrives after the
  //    toolbar renders once with empty counts)
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    const recompute = () => {
      if (filters.length === 0) {
        setFilterCounts({});
        return;
      }
      const rows: Record<string, unknown>[] = [];
      try {
        api.forEachNode((n) => {
          if (n.data) rows.push(n.data as Record<string, unknown>);
        });
      } catch {
        /* api mid-teardown */
      }
      const next: Record<string, number> = {};
      for (const f of filters) {
        let count = 0;
        for (const row of rows) {
          if (doesRowMatchFilterModel(row, f.filterModel)) count++;
        }
        next[f.id] = count;
      }
      setFilterCounts(next);
    };
    recompute();
    const events = ['rowDataUpdated', 'modelUpdated', 'firstDataRendered'] as const;
    for (const e of events) {
      try { api.addEventListener(e, recompute); } catch { /* */ }
    }
    return () => {
      for (const e of events) {
        try { api.removeEventListener(e, recompute); } catch { /* */ }
      }
    };
  }, [core, filters]);

  // `hasNewFilter` — tracks whether the live AG-Grid filter model contains
  // something the active saved-filter pills haven't already captured. The
  // "+" button is enabled ONLY when this is true. Without this guard, the
  // button stays enabled as long as any filter is applied (including
  // already-saved ones), and clicking it duplicates the active saved
  // filter(s) into a new pill.
  const [hasNewFilter, setHasNewFilter] = useState(false);

  // ─── Push the merged filter into AG-Grid whenever the active set changes ─
  //
  // v1 had a parallel `activeFiltersRef` mutated from this effect that other
  // code (MarketsGrid + FormattingToolbar) read out of band. v2 deletes that
  // ref entirely — anything that needs the active filter list reads it from
  // `useModuleState('saved-filters')` directly, same as we do here.
  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    const active = filters.filter((f) => f.active);
    if (active.length === 0) {
      api.setFilterModel(null);
    } else if (active.length === 1) {
      api.setFilterModel(active[0].filterModel);
    } else {
      api.setFilterModel(mergeFilterModels(active.map((f) => f.filterModel)));
    }
    // Whenever we push the active saved-filters' model INTO AG-Grid, by
    // definition the live model now matches — clear the "new filter" flag
    // so the + button drops back to disabled until the user touches a
    // column filter themselves.
    setHasNewFilter(false);
  }, [core, filters]);

  // ─── Watch AG-Grid for user-initiated filter edits ──────────────────────
  //
  // The `filterChanged` event fires any time the filter model mutates —
  // including when we push the saved-filters model in programmatically. We
  // filter those "echo" events out by comparing the live model against the
  // merged active-saved-filters model. They match → echo, ignore. They
  // differ → user has typed / selected something new → enable +.
  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    const check = () => {
      const active = filters.filter((f) => f.active);
      const expected = active.length === 0
        ? null
        : active.length === 1
          ? active[0].filterModel
          : mergeFilterModels(active.map((f) => f.filterModel));
      const live = api.getFilterModel();
      setHasNewFilter(!filterModelsEqual(live, expected));
    };
    try {
      api.addEventListener('filterChanged', check);
      // Run once up front so the flag reflects any model the grid already
      // carries at mount (e.g. after profile load restored it).
      check();
    } catch {
      /* api may be mid-teardown */
    }
    return () => {
      try { api.removeEventListener('filterChanged', check); } catch { /* */ }
    };
  }, [core, filters]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    const api = core.getGridApi();
    if (!api) return;
    const model = api.getFilterModel();
    if (!model || Object.keys(model).length === 0) return;
    const next: SavedFilter = {
      id: makeId(),
      label: generateLabel(model as Record<string, unknown>, filters.length),
      filterModel: model as Record<string, unknown>,
      active: true,
    };
    setFilters([...filters, next]);
  }, [core, filters, setFilters]);

  const handleToggle = useCallback(
    (id: string) => setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, active: !f.active } : f))),
    [setFilters],
  );

  const handleRemove = useCallback(
    (id: string) => setFilters((prev) => prev.filter((f) => f.id !== id)),
    [setFilters],
  );

  const handleConfirmRename = useCallback(
    (id: string, label: string) => {
      const trimmed = label.trim();
      if (trimmed) {
        setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, label: trimmed } : f)));
      }
      setRenameId(null);
    },
    [setFilters],
  );

  const handleDeactivateAll = useCallback(
    () => setFilters((prev) => prev.map((f) => ({ ...f, active: false }))),
    [setFilters],
  );

  const renameInputRef = useRef<HTMLInputElement>(null);

  // ─── Scroll overflow chrome ─────────────────────────────────────────────
  // v1 parity: show left/right chevrons when the pill row overflows its
  // container so the hidden pills are discoverable. Pure UI — no coupling
  // to rowData or grid state.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) { setCanScrollLeft(false); setCanScrollRight(false); return; }
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    updateScrollState();
  }, [filters, updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect(); };
  }, [updateScrollState]);

  const scrollBy = useCallback((dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 150, behavior: 'smooth' });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="gc-toolbar-content gc-filters-bar" data-testid="filters-toolbar">
      {canScrollLeft && (
        <button
          type="button"
          className="gc-filters-caret"
          onClick={() => scrollBy(-1)}
          title="Scroll left"
          data-testid="filters-caret-left"
        >
          <ChevronLeft size={12} strokeWidth={2.5} />
        </button>
      )}
      <div ref={scrollRef} className="gc-filter-scroll">
        {filters.map((f) => {
          if (renameId === f.id) {
            return (
              <input
                key={f.id}
                ref={renameInputRef}
                defaultValue={f.label}
                autoFocus
                className="gc-filter-rename-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmRename(f.id, (e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') setRenameId(null);
                }}
                onBlur={(e) => handleConfirmRename(f.id, e.target.value)}
              />
            );
          }
          return (
            <div
              key={f.id}
              className={`gc-filter-pill group ${f.active ? 'gc-filter-active' : 'gc-filter-inactive'}`}
              data-testid={`filter-pill-${f.id}`}
              data-active={f.active}
            >
              <button
                type="button"
                className="gc-filter-pill-btn"
                onClick={() => handleToggle(f.id)}
                title={
                  filterCounts[f.id] != null
                    ? `${f.label} — matches ${filterCounts[f.id]} row${filterCounts[f.id] === 1 ? '' : 's'}`
                    : f.label
                }
              >
                <span className="truncate">{f.label}</span>
                {filterCounts[f.id] != null && (
                  <span
                    className="gc-filter-pill-count"
                    data-testid={`filter-pill-count-${f.id}`}
                  >
                    {filterCounts[f.id]}
                  </span>
                )}
              </button>
              <span className="gc-filter-pill-actions">
                <button
                  type="button"
                  className="gc-filter-pill-action"
                  onClick={(e) => { e.stopPropagation(); setRenameId(f.id); }}
                  title="Rename"
                >
                  <Pencil size={9} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="gc-filter-pill-action gc-filter-pill-action-remove"
                  onClick={(e) => { e.stopPropagation(); handleRemove(f.id); }}
                  title="Remove"
                >
                  <Trash2 size={9} strokeWidth={1.75} />
                </button>
              </span>
            </div>
          );
        })}

        {filters.length > 0 && (
          <button
            type="button"
            className="gc-filters-clear-btn"
            onClick={handleDeactivateAll}
            title="Clear all filters"
          >
            <FunnelX size={16} strokeWidth={2.25} />
          </button>
        )}

        <button
          type="button"
          className="gc-filters-add-btn"
          onClick={handleAdd}
          disabled={!hasNewFilter}
          data-testid="filters-add-btn"
          data-enabled={hasNewFilter ? 'true' : 'false'}
          title={
            hasNewFilter
              ? 'Capture current filter as a new pill'
              : 'Add a column filter (that isn\u2019t already saved) to enable'
          }
          style={{
            opacity: hasNewFilter ? 1 : 0.35,
            cursor: hasNewFilter ? 'pointer' : 'not-allowed',
          }}
        >
          <Plus size={16} strokeWidth={2.75} />
        </button>

        {onToggleStyleToolbar && (
          <button
            type="button"
            onClick={onToggleStyleToolbar}
            title={styleToolbarOpen ? 'Hide formatting toolbar' : 'Show formatting toolbar'}
            data-testid="style-toolbar-toggle"
            data-active={styleToolbarOpen ? 'true' : 'false'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              marginLeft: 4,
              padding: 0,
              borderRadius: 12,
              border: '1px solid',
              borderColor: styleToolbarOpen
                ? 'var(--bn-green, #2dd4bf)'
                : 'var(--border, #313944)',
              background: styleToolbarOpen
                ? 'rgba(45, 212, 191, 0.12)'
                : 'transparent',
              color: styleToolbarOpen
                ? 'var(--bn-green, #2dd4bf)'
                : 'var(--muted-foreground, #a0a8b4)',
              cursor: 'pointer',
              transition: 'all 150ms',
              flexShrink: 0,
            }}
          >
            <Brush size={12} strokeWidth={2} />
          </button>
        )}
      </div>
      {canScrollRight && (
        <button
          type="button"
          className="gc-filters-caret"
          onClick={() => scrollBy(1)}
          title="Scroll right"
          data-testid="filters-caret-right"
        >
          <ChevronRight size={12} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
