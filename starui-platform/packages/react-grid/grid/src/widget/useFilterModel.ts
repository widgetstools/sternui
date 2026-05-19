/**
 * useFilterModel — owns the saved-filter model state for FiltersToolbar.
 *
 * Subscribes to the platform's `filterChanged` event (via the typed
 * ApiHub, which auto-disposes its handlers) and exposes the live saved-
 * filter list + per-pill row counts + a `hasNewFilter` flag plus all
 * imperative handlers the toolbar's JSX wires to.
 *
 * Why a hook: extracts ~400 LOC of state, effects, and event wiring out
 * of `FiltersToolbar.tsx` so the toolbar reduces to pure JSX. The hook
 * is the single source of `filterChanged` subscription truth — old code
 * registered the watcher inside the component body, so an in-flight
 * filter event arriving past unmount would dispatch into a stale React
 * setter. The disposers returned from `platform.api.on(...)` close that
 * window.
 *
 * Internal-only — not exported from the package barrel.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GridApi } from 'ag-grid-community';
import {
  useGridApi,
  useGridPlatform,
  useModuleState,
  type SavedFiltersState,
} from '@starui/grid/customizer';
import {
  doesRowMatchFilterModel,
  generateLabel,
  isNewFilter,
  makeId,
  mergeFilterModels,
  subtractFilterModel,
} from './filtersToolbarLogic';
import type { SavedFilter } from './types';

// ─── AG-Grid v35 shape repair ──────────────────────────────────────────
//
// Drop / repair per-column entries whose shape would crash AG-Grid v35's
// filter handlers. The known landmine: `agSetColumnFilter`'s
// `validateModel` iterates `entry.values` and throws
// `TypeError: model.values is not iterable` when `values` isn't an
// array — taking down the whole `<FiltersToolbar>` subtree mid-render
// and leaving the grid in a corrupt filter state where floating-filter
// inputs no longer accept keystrokes.

/**
 * Walk a single column-entry and clean up shapes that would crash
 * AG-Grid's filter handlers. Returns either the (possibly repaired)
 * entry, or `null` if the entry is unsalvageable and must be dropped.
 *
 * Handled cases:
 *   - top-level set filter w/ non-array `values` → repair (coerce
 *     `{0:..,1:..}` back to an array; default to `[]`)
 *   - bare object with `values` that isn't an array (quacks like a
 *     set filter even though no `filterType` is set) → same repair
 *   - multi-filter envelope (`filterType:'multi'`, `filterModels:[...]`)
 *     → recurse into each child; surviving slot positions are
 *     preserved (AG-Grid tolerates `null` slots)
 */
function sanitizeFilterEntry(colId: string, entry: unknown): unknown | null {
  if (!entry || typeof entry !== 'object') return entry;
  const e = entry as { filterType?: string; values?: unknown; filterModels?: unknown[] };

  if (e.filterType === 'multi' && Array.isArray(e.filterModels)) {
    const cleaned: unknown[] = [];
    let dropped = false;
    for (const child of e.filterModels) {
      const sane = sanitizeFilterEntry(colId, child);
      if (sane == null && child != null) {
        dropped = true;
        continue;
      }
      cleaned.push(sane);
    }
    if (dropped) {
      const rebuilt = e.filterModels.map((child) => sanitizeFilterEntry(colId, child));
      return { ...e, filterModels: rebuilt };
    }
    return { ...e, filterModels: cleaned };
  }

  const looksLikeSet = e.filterType === 'set' || (e.values !== undefined && e.filterType == null);
  if (looksLikeSet && !Array.isArray(e.values)) {
    let recovered: unknown[] = [];
    if (e.values && typeof e.values === 'object') {
      const vs = e.values as Record<string, unknown>;
      const numericKeys = Object.keys(vs).every((k) => /^\d+$/.test(k));
      if (numericKeys) recovered = Object.values(vs);
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[FiltersToolbar] repairing malformed set-filter entry for col "${colId}" — coerced \`values\` to array (${recovered.length} item${recovered.length === 1 ? '' : 's'}).`,
      { original: entry, recovered },
    );
    return { ...e, values: recovered };
  }

  return entry;
}

function sanitizeFilterModel(
  model: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (model == null) return null;
  const out: Record<string, unknown> = {};
  for (const [colId, entry] of Object.entries(model)) {
    const sane = sanitizeFilterEntry(colId, entry);
    if (sane == null) continue;
    out[colId] = sane;
  }
  return out;
}

function filterCountsEqual(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export interface UseFilterModelResult {
  /** Saved filter pills as normalized records. Stable identity per filters list. */
  readonly filters: readonly SavedFilter[];
  /** Per-pill row-count badges, keyed by filter id. */
  readonly filterCounts: Readonly<Record<string, number>>;
  /** True when the live grid filter is genuinely new (enables the "+" button). */
  readonly hasNewFilter: boolean;
  /** Capture the live grid's net-new filter as a new pill. No-op when nothing new. */
  addFromLive(): void;
  /** Toggle a pill active/inactive. */
  toggle(id: string): void;
  /** Remove a pill. */
  remove(id: string): void;
  /** Rename a pill. Empty / whitespace trims to no-op. */
  rename(id: string, label: string): void;
  /** Deactivate every pill (UI's "Clear all filters" button). */
  deactivateAll(): void;
  /** Replace a pill's underlying filterModel (the JSON editor's Save). */
  editFilterModel(id: string, nextModel: Record<string, unknown>): void;
}

/**
 * Owns saved-filter state + the wiring between AG-Grid's live filter
 * and the per-profile `saved-filters` module. Returns a stable
 * imperative surface for FiltersToolbar.
 */
export function useFilterModel(): UseFilterModelResult {
  const platform = useGridPlatform();
  const api = useGridApi();

  // Filters live in the per-profile saved-filters module. Reading and writing
  // through `useModuleState` is the ONLY channel — no refs, no events. The
  // auto-save engine picks up changes and persists them on a debounce.
  const [filtersState, setFiltersState] = useModuleState<SavedFiltersState>('saved-filters');

  // Normalize a raw record off the store: coerce `active`, default
  // missing `filterModel`, and run AG-Grid-shape repair so a stale
  // pill from an older profile (set-filter `values` serialized as
  // `{0:..,1:..}` or undefined, multi-filter children with malformed
  // children, etc.) doesn't crash AG-Grid mid-render. Idempotent —
  // safe to run on every render and on every write back.
  const normalizeFilter = useCallback((raw: unknown): SavedFilter | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<SavedFilter> & Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.length === 0) return null;
    if (typeof r.label !== 'string' || r.label.length === 0) return null;
    const rawModel = (r.filterModel ?? {}) as Record<string, unknown> | null;
    const cleanModel = sanitizeFilterModel(rawModel) ?? {};
    return {
      id: r.id,
      label: r.label,
      active: Boolean(r.active),
      filterModel: cleanModel,
    };
  }, []);

  const filters = useMemo<SavedFilter[]>(() => {
    const raw = (filtersState?.filters ?? []) as unknown[];
    const out: SavedFilter[] = [];
    for (const item of raw) {
      const f = normalizeFilter(item);
      if (f) out.push(f);
    }
    return out;
  }, [filtersState, normalizeFilter]);

  const setFilters = useCallback(
    (next: SavedFilter[] | ((prev: SavedFilter[]) => SavedFilter[])) => {
      setFiltersState((prev) => {
        // Normalize prev before handing it to functional updaters so
        // toggle/remove/rename always operate on clean records, even
        // when the store still holds legacy entries from before the
        // module's v1→v2 migration ran.
        const prevList: SavedFilter[] = [];
        for (const item of (prev?.filters ?? []) as unknown[]) {
          const f = normalizeFilter(item);
          if (f) prevList.push(f);
        }
        const resolved = typeof next === 'function'
          ? (next as (p: SavedFilter[]) => SavedFilter[])(prevList)
          : next;
        return { ...prev, filters: resolved };
      });
    },
    [setFiltersState, normalizeFilter],
  );

  // ─── Per-pill row counts ──────────────────────────────────────────────
  //
  // Each pill renders a small count badge showing how many rows this
  // filter would match if applied. Computed against the live rowData by
  // walking `api.forEachNode(...)` and running the saved filter model
  // against each row. Recomputes on:
  //  - the filters list changing (new pill, renamed pill — label stays;
  //    count stays too unless the filter model changed, which it does
  //    here because pills are immutable once captured)
  //  - AG-Grid's `rowDataUpdated` / `modelUpdated` events (data refresh)
  //  - `firstDataRendered` (cold-mount: data arrives after the
  //    toolbar renders once with empty counts)
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  const filterCountsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const disposers: Array<() => void> = [];
    disposers.push(
      platform.api.onReady((liveApi) => {
        let rafId = 0;
        const recomputeNow = () => {
          if (filters.length === 0) {
            if (Object.keys(filterCountsRef.current).length === 0) return;
            filterCountsRef.current = {};
            setFilterCounts({});
            return;
          }
          const rows: Record<string, unknown>[] = [];
          try {
            liveApi.forEachNode((n) => {
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
          if (filterCountsEqual(filterCountsRef.current, next)) return;
          filterCountsRef.current = next;
          setFilterCounts(next);
        };
        const recompute = () => {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            recomputeNow();
          });
        };
        recomputeNow();
        disposers.push(platform.api.on('rowDataUpdated', recompute));
        disposers.push(platform.api.on('modelUpdated', recompute));
        disposers.push(platform.api.on('firstDataRendered', recompute));
      }),
    );
    return () => { for (const d of disposers) d(); };
  }, [platform, filters]);

  // `hasNewFilter` — tracks whether the live AG-Grid filter model contains
  // something the active saved-filter pills haven't already captured. The
  // "+" button is enabled ONLY when this is true. Without this guard, the
  // button stays enabled as long as any filter is applied (including
  // already-saved ones), and clicking it duplicates the active saved
  // filter(s) into a new pill.
  const [hasNewFilter, setHasNewFilter] = useState(false);

  // Latest filters captured in a ref so platform-level listeners
  // (profile:loaded, firstDataRendered) can reach the freshest list
  // without re-registering on every change.
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  // Compute and push the merged active filter model into a live api.
  // Centralised so the React effect, profile:loaded listener, and
  // firstDataRendered listener all use the exact same code path.
  const pushActiveFilterModel = useCallback((liveApi: GridApi) => {
    const list = filtersRef.current;
    const active = list.filter((f) => f.active);
    let model: Record<string, unknown> | null;
    if (active.length === 0) model = null;
    else if (active.length === 1) model = active[0].filterModel;
    else model = mergeFilterModels(active.map((f) => f.filterModel));
    try {
      // Guard: AG-Grid v35's SetFilterHandler.validateModel iterates
      // `model.values` and crashes uncaught if it isn't an array. A
      // malformed pill (set-filter entry whose `values` got serialized
      // as undefined / object / string) would take down the whole grid
      // mount. Sanitize first; on throw, log and skip so the grid stays
      // usable.
      const nextModel = sanitizeFilterModel(model);
      const currentModel = sanitizeFilterModel(
        liveApi.getFilterModel() as Record<string, unknown> | null,
      );
      if (JSON.stringify(nextModel) === JSON.stringify(currentModel)) {
        setHasNewFilter((prev) => (prev ? false : prev));
        return;
      }
      liveApi.setFilterModel(nextModel);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[FiltersToolbar] setFilterModel threw — ignoring this push so the grid stays usable.', { model, err });
    }
    setHasNewFilter((prev) => (prev ? false : prev));
  }, []);

  // ─── Push the merged filter into AG-Grid whenever the active set changes ─
  // Handles in-session edits (toggle, add, remove, rename, edit-model).
  useEffect(() => {
    if (!api) return;
    pushActiveFilterModel(api);
  }, [api, filters, pushActiveFilterModel]);

  // ─── Re-push on profile:loaded ──────────────────────────────────────────
  // The `grid-state` module restores AG-Grid's *native* filter model via
  // `api.setState(savedGridState)` on `profile:loaded`. When the loaded
  // profile has no captured grid-state (state.saved === null), grid-state
  // calls `api.setState({})` which CLEARS the filter — so the saved-filter
  // pills' active set must be re-pushed AFTER that runs. Listener
  // registration here happens after `grid-state.activate()` (modules
  // activate before child components mount), and the event bus fires
  // listeners in registration order — so this listener runs after
  // grid-state's, guaranteeing the saved-filter model wins.
  useEffect(() => {
    return platform.events.on('profile:loaded', () => {
      const liveApi = platform.api.api;
      if (liveApi) pushActiveFilterModel(liveApi);
    });
  }, [platform, pushActiveFilterModel]);

  // ─── Re-push once on firstDataRendered ──────────────────────────────────
  // Cold-mount safety net: at first profile-load, setFilterModel may run
  // before AG-Grid has fully registered its columns (column transforms
  // can race with profile deserialize). Re-applying once after AG-Grid
  // signals firstDataRendered ensures the active pill's filter is live
  // by the time the user sees rows.
  useEffect(() => {
    let fired = false;
    const dispose = platform.api.on('firstDataRendered', () => {
      if (fired) return;
      fired = true;
      const liveApi = platform.api.api;
      if (liveApi) pushActiveFilterModel(liveApi);
    });
    return dispose;
  }, [platform, pushActiveFilterModel]);

  // ─── Watch AG-Grid for user-initiated filter edits ──────────────────────
  //
  // `filterChanged` fires any time the filter model mutates — including
  // when we push the saved-filters model in programmatically. We filter
  // out echoes AND duplicates-of-inactive-pills via `isNewFilter`, which
  // compares the live model against EVERY saved pill (active + inactive)
  // plus the merged-active echo. Only a genuinely-unseen filter enables
  // the + button; re-entering a previously-saved (even deactivated)
  // filter keeps + disabled so it can't be duplicated.
  useEffect(() => {
    const disposers: Array<() => void> = [];
    disposers.push(
      platform.api.onReady((liveApi) => {
        const check = () => {
          const live = liveApi.getFilterModel();
          const next = isNewFilter(live, filtersRef.current);
          setHasNewFilter((prev) => (prev === next ? prev : next));
        };
        disposers.push(platform.api.on('filterChanged', check));
        // Run once up front so the flag reflects any model the grid
        // already carries at mount (e.g. after profile load restored it).
        check();
      }),
    );
    return () => { for (const d of disposers) d(); };
  }, [platform, filters]);

  // ─── Imperative handlers ───────────────────────────────────────────────

  const addFromLive = useCallback(() => {
    if (!api) return;
    const liveModel = api.getFilterModel() as Record<string, unknown> | null;
    if (!liveModel || Object.keys(liveModel).length === 0) return;
    // Belt-and-braces: even if a race let the + button render enabled,
    // drop the click when the live model would duplicate any existing
    // pill (active OR inactive).
    if (!isNewFilter(liveModel, filters)) return;

    // Capture ONLY the net-new criterion — subtract the merged model of
    // currently-active pills from `liveModel`. Otherwise the new pill
    // would carry every active pill's filter in addition to the new
    // one, which duplicates that criterion and breaks toggle semantics.
    const active = filters.filter((f) => f.active);
    const activeMerged = active.length === 0
      ? {}
      : active.length === 1
        ? active[0].filterModel
        : mergeFilterModels(active.map((f) => f.filterModel));
    const delta = subtractFilterModel(liveModel, activeMerged);

    // If the delta comes back empty, the live model is already fully
    // represented by the active pills — nothing to capture. isNewFilter
    // should have returned false in that case, but guard anyway.
    if (Object.keys(delta).length === 0) return;

    const next: SavedFilter = {
      id: makeId(),
      label: generateLabel(delta, filters.length),
      filterModel: delta,
      active: true,
    };
    setFilters([...filters, next]);
  }, [api, filters, setFilters]);

  const toggle = useCallback(
    (id: string) =>
      setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, active: !f.active } : f))),
    [setFilters],
  );

  const remove = useCallback(
    (id: string) => setFilters((prev) => prev.filter((f) => f.id !== id)),
    [setFilters],
  );

  const rename = useCallback(
    (id: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, label: trimmed } : f)));
    },
    [setFilters],
  );

  const deactivateAll = useCallback(
    () => setFilters((prev) => prev.map((f) => ({ ...f, active: false }))),
    [setFilters],
  );

  const editFilterModel = useCallback(
    (id: string, nextModel: Record<string, unknown>) => {
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, filterModel: nextModel } : f)),
      );
    },
    [setFilters],
  );

  return useMemo(
    () => ({
      filters,
      filterCounts,
      hasNewFilter,
      addFromLive,
      toggle,
      remove,
      rename,
      deactivateAll,
      editFilterModel,
    }),
    [
      filters,
      filterCounts,
      hasNewFilter,
      addFromLive,
      toggle,
      remove,
      rename,
      deactivateAll,
      editFilterModel,
    ],
  );
}
