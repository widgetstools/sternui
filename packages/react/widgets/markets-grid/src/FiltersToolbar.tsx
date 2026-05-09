import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useGridApi,
  useGridPlatform,
  useModuleState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Textarea,
  type SavedFiltersState,
} from '@starui/grid-react';
import {
  FunnelPlus,
  Pencil,
  Trash2,
  FunnelX,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from 'lucide-react';
import type { SavedFilter } from './types';

/**
 * ToolbarVisibilityState is the per-profile key/value used to persist
 * collapse/expand state for the filter pill row. Imported inline (the
 * module's TS interface isn't on the public core barrel) so we don't
 * take a hard dep on the module's shape — only the boolean slot we
 * actually use.
 */
interface ToolbarVisibilityLike {
  visible: Record<string, boolean>;
}
const FILTERS_EXPANDED_KEY = 'filters-toolbar-pills';
import {
  doesRowMatchFilterModel,
  generateLabel,
  isNewFilter,
  makeId,
  mergeFilterModels,
  subtractFilterModel,
} from './filtersToolbarLogic';

/**
 * FiltersToolbar — pill-row UI for saved filter models.
 *
 * AUDIT M2 refactor notes: pure helpers (row-match predicates, filter-model
 * equality, model merge, auto-naming) moved to `./filtersToolbarLogic.ts`.
 * AG-Grid event wiring now goes through the platform's `ApiHub` (typed,
 * auto-disposing) via `useGridPlatform().api.onReady(...)` + `.on(...)`
 * instead of raw `api.addEventListener`. Functional behaviour is identical.
 */

/**
 * Drop per-column entries whose shape would crash AG-Grid v35's filter
 * handlers. The known landmine: `agSetColumnFilter` handler's
 * `validateModel` iterates `entry.values` and throws `TypeError: model.values
 * is not iterable` when `values` isn't an array — taking down the whole
 * `<FiltersToolbar>` subtree mid-render and leaving the grid in a corrupt
 * filter state where floating-filter inputs no longer accept keystrokes.
 * Logs the dropped colId + entry so the user can identify the stale pill.
 */
/**
 * Walk a single column-entry and clean up shapes that would crash
 * AG-Grid's filter handlers. Returns either the (possibly repaired)
 * entry, or `null` if the entry is unsalvageable and must be dropped.
 *
 * Handled cases:
 *   - top-level set filter w/ non-array `values` → drop
 *   - bare object with `values` that isn't an array (no filterType
 *     declared, but quacks like a set filter) → drop
 *   - multi-filter envelope (`filterType:'multi'`, `filterModels:[...]`)
 *     → recurse into each child; if every child gets dropped, drop the
 *     envelope. Otherwise return the envelope with surviving children.
 */
function sanitizeFilterEntry(colId: string, entry: unknown): unknown | null {
  if (!entry || typeof entry !== 'object') return entry;
  const e = entry as { filterType?: string; values?: unknown; filterModels?: unknown[] };

  // Multi-filter envelope — recurse into nested handlers.
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
    // AG-Grid keeps slot positions for multi-filter children; missing
    // slots become `null` which AG-Grid tolerates. We rebuild with the
    // same length so indices line up with column-defs.
    if (dropped) {
      const rebuilt = e.filterModels.map((child) => sanitizeFilterEntry(colId, child));
      return { ...e, filterModels: rebuilt };
    }
    return { ...e, filterModels: cleaned };
  }

  // Set filter — explicit OR implied (object with `values` key).
  // Repair (don't drop) entries with malformed `values`: coerce to an
  // array so AG-Grid's `validateModel` can iterate without throwing.
  // If `values` is an object with numeric keys (a serialized array),
  // recover the array; otherwise default to []. Keeping the pill
  // effective is preferable to silently disabling it — the user
  // can rename/edit/remove via pill actions.
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

/**
 * FiltersToolbar accepts no props — formatter-toolbar visibility is
 * handled by its own button in the primary row (MarketsGrid), decoupled
 * from the filter pill carousel.
 */
export type FiltersToolbarProps = Record<string, never>;

export function FiltersToolbar() {
  const platform = useGridPlatform();
  const api = useGridApi();

  // Persisted collapse/expand state — piggy-backs on the
  // `toolbar-visibility` module that ships in every profile. Missing key
  // defaults to EXPANDED so existing profiles get the familiar layout.
  const [tbvState, setTbvState] = useModuleState<ToolbarVisibilityLike>('toolbar-visibility');
  const expanded = tbvState?.visible?.[FILTERS_EXPANDED_KEY] !== false;
  const toggleExpanded = useCallback(() => {
    setTbvState((prev) => ({
      ...prev,
      visible: {
        ...(prev?.visible ?? {}),
        [FILTERS_EXPANDED_KEY]: !(prev?.visible?.[FILTERS_EXPANDED_KEY] !== false),
      },
    }));
  }, [setTbvState]);
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

  const [renameId, setRenameId] = useState<string | null>(null);
  // Pill whose details/edit popover is currently open. Controlled so the
  // "Save" button can close the popover programmatically after a successful
  // commit.
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null);

  const handleEditFilterModel = useCallback(
    (id: string, nextModel: Record<string, unknown>) => {
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, filterModel: nextModel } : f)),
      );
    },
    [setFilters],
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

  useEffect(() => {
    const disposers: Array<() => void> = [];
    disposers.push(
      platform.api.onReady((liveApi) => {
        const recompute = () => {
          if (filters.length === 0) {
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
          setFilterCounts(next);
        };
        recompute();
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
  const pushActiveFilterModel = useCallback((liveApi: import('ag-grid-community').GridApi) => {
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
      liveApi.setFilterModel(sanitizeFilterModel(model));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[FiltersToolbar] setFilterModel threw — ignoring this push so the grid stays usable.', { model, err });
    }
    setHasNewFilter(false);
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
          setHasNewFilter(isNewFilter(live, filters));
        };
        disposers.push(platform.api.on('filterChanged', check));
        // Run once up front so the flag reflects any model the grid
        // already carries at mount (e.g. after profile load restored it).
        check();
      }),
    );
    return () => { for (const d of disposers) d(); };
  }, [platform, filters]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
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
  // Show left/right chevrons when the pill row overflows its container so
  // the hidden pills are discoverable. Pure UI — no coupling to rowData or
  // grid state.
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

  const activeCount = filters.filter((f) => f.active).length;

  return (
    <div
      className="gc-toolbar-content gc-filters-bar"
      data-testid="filters-toolbar"
      data-expanded={expanded ? 'true' : 'false'}
    >
      {/* Collapse / expand toggle — leads the row so it's the first thing
          the user sees. Flips between ChevronUp (expanded) and
          ChevronDown (collapsed); persists through the
          toolbar-visibility module. */}
      <button
        type="button"
        className="gc-filters-collapse"
        onClick={toggleExpanded}
        title={expanded ? 'Collapse filter pills' : 'Expand filter pills'}
        aria-expanded={expanded}
        data-testid="filters-collapse-toggle"
      >
        {expanded ? (
          <ChevronLeft size={16} strokeWidth={2.5} />
        ) : (
          <ChevronRight size={16} strokeWidth={2.5} />
        )}
      </button>

      {/* Collapsed view — compact summary chip replaces the pill row.
          Click it to re-expand (in addition to the chevron). */}
      {!expanded && (
        <button
          type="button"
          className="gc-filters-summary"
          onClick={toggleExpanded}
          data-testid="filters-summary-chip"
          title="Click to expand filter pills"
        >
          {filters.length === 0 ? (
            <span className="gc-filters-summary-empty">No filters</span>
          ) : (
            <>
              <span className="gc-filters-summary-count">
                {filters.length}
              </span>
              <span className="gc-filters-summary-label">
                filter{filters.length === 1 ? '' : 's'}
              </span>
              {activeCount > 0 && (
                <span className="gc-filters-summary-active">
                  · {activeCount} active
                </span>
              )}
            </>
          )}
        </button>
      )}

      {expanded && canScrollLeft && (
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
      {expanded && (
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
              <Popover
                open={openDetailsId === f.id}
                onOpenChange={(o) => setOpenDetailsId(o ? f.id : null)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="gc-filter-pill-menu"
                    onClick={(e) => e.stopPropagation()}
                    title="Edit saved filter"
                    data-testid={`filter-pill-menu-${f.id}`}
                  >
                    <MoreVertical size={11} strokeWidth={2} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="bottom"
                  sideOffset={6}
                  className="w-[360px] p-0 text-xs"
                  data-testid={`filter-pill-details-${f.id}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <FilterModelEditor
                    label={f.label}
                    filterModel={f.filterModel as Record<string, unknown>}
                    onSave={(model) => {
                      handleEditFilterModel(f.id, model);
                      setOpenDetailsId(null);
                    }}
                    onCancel={() => setOpenDetailsId(null)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          );
        })}
      </div>
      )}
      {expanded && canScrollRight && (
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

      {/* Sticky action cluster — always visible even when the pill row
          scrolls OR is collapsed. Clear + add remain reachable so the
          user can manage pills from the compact view too.
          `.gc-filters-actions` is a flex-shrink:0 group; the
          Brush / formatter-toolbar toggle no longer lives here — it
          sits in the primary row's right-side action cluster
          (MarketsGrid) where it's decoupled from filter semantics. */}
      <div className="gc-filters-actions">
        {filters.length > 0 && (
          <button
            type="button"
            className="gc-filters-clear-btn"
            onClick={handleDeactivateAll}
            title="Clear all filters"
          >
            <FunnelX size={16} strokeWidth={2.75} />
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
          <FunnelPlus size={16} strokeWidth={2.75} />
        </button>
      </div>
    </div>
  );
}

/**
 * Inline JSON editor for a saved filter's `filterModel`. Lives inside
 * the per-pill PopoverContent. PopoverContent unmounts on close, so the
 * draft state here resets each time the popover is reopened.
 *
 * Validates JSON.parse on every keystroke and only enables Save when the
 * draft both parses AND yields a non-array object. AG-Grid filter models
 * are always plain objects keyed by colId.
 */
interface FilterModelEditorProps {
  label: string;
  filterModel: Record<string, unknown>;
  onSave: (model: Record<string, unknown>) => void;
  onCancel: () => void;
}
function FilterModelEditor({ label, filterModel, onSave, onCancel }: FilterModelEditorProps) {
  const initial = useMemo(() => JSON.stringify(filterModel, null, 2), [filterModel]);
  const [draft, setDraft] = useState(initial);

  const parsed = useMemo(() => {
    try {
      const value = JSON.parse(draft);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false as const, error: 'Filter model must be a JSON object' };
      }
      return { ok: true as const, value: value as Record<string, unknown> };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : 'Invalid JSON' };
    }
  }, [draft]);

  const dirty = draft !== initial;
  const canSave = parsed.ok && dirty;

  return (
    <div className="flex flex-col">
      <div
        className="px-3 py-2 border-b text-[10px] font-bold uppercase tracking-wider opacity-60"
        style={{ borderColor: 'var(--ds-border-primary)' }}
      >
        {label}
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        rows={10}
        className="font-mono text-[11px] leading-snug rounded-none border-0 border-b resize-none focus-visible:ring-0 focus-visible:ring-offset-0 max-h-[280px]"
        style={{ borderColor: 'var(--ds-border-primary)' }}
        data-testid="filter-pill-details-textarea"
      />
      {!parsed.ok && (
        <div
          className="px-3 py-1.5 text-[10px] font-medium border-b"
          style={{ color: 'var(--ds-accent-negative)', borderColor: 'var(--ds-border-primary)' }}
          data-testid="filter-pill-details-error"
        >
          {parsed.error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={() => parsed.ok && onSave(parsed.value)}
          data-testid="filter-pill-details-save"
        >
          Save
        </Button>
      </div>
    </div>
  );
}
