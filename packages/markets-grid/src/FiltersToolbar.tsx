import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useGridApi,
  useGridPlatform,
  useModuleState,
  type SavedFiltersState,
} from '@grid-customizer/core';
import { Plus, Pencil, Trash2, FunnelX, ChevronLeft, ChevronRight, Brush } from 'lucide-react';
import type { SavedFilter } from './types';
import {
  doesRowMatchFilterModel,
  generateLabel,
  isNewFilter,
  makeId,
  mergeFilterModels,
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

export interface FiltersToolbarProps {
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
  styleToolbarOpen,
  onToggleStyleToolbar,
}: FiltersToolbarProps) {
  const platform = useGridPlatform();
  const api = useGridApi();
  // Filters live in the per-profile saved-filters module. Reading and writing
  // through `useModuleState` is the ONLY channel — no refs, no events. The
  // auto-save engine picks up changes and persists them on a debounce.
  const [filtersState, setFiltersState] = useModuleState<SavedFiltersState>('saved-filters');
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

  // ─── Push the merged filter into AG-Grid whenever the active set changes ─
  useEffect(() => {
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
  }, [api, filters]);

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
    const model = api.getFilterModel();
    if (!model || Object.keys(model).length === 0) return;
    // Belt-and-braces: even if a race let the + button render enabled,
    // drop the click when the live model would duplicate any existing
    // pill (active OR inactive).
    if (!isNewFilter(model as Record<string, unknown>, filters)) return;
    const next: SavedFilter = {
      id: makeId(),
      label: generateLabel(model as Record<string, unknown>, filters.length),
      filterModel: model as Record<string, unknown>,
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

      {/* Sticky action cluster — always visible even when the pill row
          scrolls. Sits AFTER the right caret so the carets still hug
          the pill carousel they control. `.gc-filters-actions` is a
          flex-shrink:0 group so nothing in this cluster ever overflows. */}
      <div className="gc-filters-actions">
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
    </div>
  );
}
