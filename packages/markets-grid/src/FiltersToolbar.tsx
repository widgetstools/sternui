import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { GridCustomizerCore, GridStore, SavedFiltersState } from '@grid-customizer/core';
import { Button, Tooltip, cn, useModuleState } from '@grid-customizer/core';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, FunnelX } from 'lucide-react';
import type { SavedFilter } from './types';
import { readLegacyFilters } from './savedFiltersMigration';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface FiltersToolbarProps {
  core: GridCustomizerCore;
  store: GridStore;
  gridId: string;
  rowData: any[];
  activeFiltersRef: React.MutableRefObject<SavedFilter[]>;
}


// ─── Helpers ────────────────────────────────────────────────────────────────

function generateLabel(filterModel: Record<string, any>, existingCount: number): string {
  const keys = Object.keys(filterModel);
  if (keys.length === 0) return `Filter ${existingCount + 1}`;

  if (keys.length === 1) {
    const col = keys[0];
    const entry = filterModel[col];
    const val = entry?.filter ?? entry?.value ?? entry?.values?.[0];
    if (val != null) return `${col}: ${val}`;
    return col;
  }

  if (keys.length === 2) {
    return `${keys[0]} + ${keys[1]}`;
  }

  return `${keys[0]} + ${keys.length - 1} more`;
}

function makeId(): string {
  return `sf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Merge multiple filter models with AND — later entries override earlier for the same column. */
/**
 * Merge multiple filter models with smart column handling:
 * - Same column, both "set" filters → union the values (OR within column)
 * - Same column, both "number"/"text" with compatible types → combine with OR condition
 * - Different columns → AND across columns
 */
function mergeFilterModels(models: Record<string, any>[]): Record<string, any> {
  const merged: Record<string, any> = {};
  for (const model of models) {
    for (const [col, filter] of Object.entries(model)) {
      const existing = merged[col];
      if (!existing) {
        merged[col] = filter;
        continue;
      }
      // Both are set filters → union the values arrays
      if (existing.filterType === 'set' && filter.filterType === 'set') {
        const combinedValues = [...new Set([...(existing.values ?? []), ...(filter.values ?? [])])];
        merged[col] = { ...existing, values: combinedValues };
        continue;
      }
      // Both are simple number/text filters (no conditions array) → combine into OR condition
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
      // Existing is already a combined OR condition, same filterType → append
      if (
        existing.operator === 'OR' &&
        existing.conditions &&
        existing.filterType === filter.filterType &&
        filter.type
      ) {
        merged[col] = {
          ...existing,
          conditions: [
            ...existing.conditions,
            { type: filter.type, filter: filter.filter, filterTo: filter.filterTo },
          ],
        };
        continue;
      }
      // Fallback: last one wins
      merged[col] = filter;
    }
  }
  return merged;
}

// ─── Row matching for individual filter counts ────────────────────────────

/** Check if a single row value matches a single column filter entry. */
function doesValueMatchFilter(value: any, filter: any): boolean {
  if (!filter || !filter.filterType) return true;

  const { filterType } = filter;

  // Set filter
  if (filterType === 'set') {
    const vals: any[] = filter.values ?? [];
    if (vals.length === 0) return true;
    const strVal = value == null ? null : String(value);
    return vals.some(v => v == null ? strVal == null : String(v) === strVal);
  }

  // Text filter
  if (filterType === 'text') {
    const strVal = value == null ? '' : String(value).toLowerCase();
    const filterVal = filter.filter == null ? '' : String(filter.filter).toLowerCase();

    // Handle combined conditions (operator + conditions array)
    if (filter.operator && filter.conditions) {
      const results = filter.conditions.map((c: any) => doesValueMatchFilter(value, { ...c, filterType: 'text' }));
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

  // Number filter
  if (filterType === 'number') {
    const numVal = value == null ? NaN : Number(value);
    const filterNum = filter.filter == null ? NaN : Number(filter.filter);
    const filterTo = filter.filterTo == null ? NaN : Number(filter.filterTo);

    // Handle combined conditions
    if (filter.operator && filter.conditions) {
      const results = filter.conditions.map((c: any) => doesValueMatchFilter(value, { ...c, filterType: 'number' }));
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

  // Date filter — treat as string comparison for simplicity
  if (filterType === 'date') {
    if (filter.operator && filter.conditions) {
      const results = filter.conditions.map((c: any) => doesValueMatchFilter(value, { ...c, filterType: 'date' }));
      return filter.operator === 'AND' ? results.every(Boolean) : results.some(Boolean);
    }
    return true; // fallback — dates are complex
  }

  return true;
}

/** Check if a row matches all conditions in a filter model (AND across columns). */
function doesRowMatchFilterModel(rowData: any, filterModel: Record<string, any>): boolean {
  for (const [col, filter] of Object.entries(filterModel)) {
    if (!doesValueMatchFilter(rowData[col], filter)) return false;
  }
  return true;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FiltersToolbar({ core, store, gridId, rowData, activeFiltersRef }: FiltersToolbarProps) {
  // Saved filters live in the per-profile `saved-filters` module so the list
  // round-trips with the active profile (save / load / clone / export-import).
  const [filtersState, setFiltersState] = useModuleState<SavedFiltersState>(store, 'saved-filters');
  const filters = (filtersState?.filters ?? []) as SavedFilter[];

  const setFilters = useCallback(
    (next: SavedFilter[] | ((prev: SavedFilter[]) => SavedFilter[])) => {
      setFiltersState((prev) => {
        const prevFilters = (prev?.filters ?? []) as SavedFilter[];
        const resolved = typeof next === 'function' ? (next as (p: SavedFilter[]) => SavedFilter[])(prevFilters) : next;
        return { ...prev, filters: resolved };
      });
    },
    [setFiltersState],
  );

  // ── One-time legacy migration ─────────────────────────────────────────
  // Older builds wrote filters to localStorage[`gc-filters:<gridId>`]. We
  // migrate that into the active profile's `saved-filters` module state on
  // first mount. The tricky bit is *ordering*: useGridCustomizer's auto-load
  // effect deserializes the active profile (e.g. the built-in Default) into
  // module state asynchronously after mount. If we migrated synchronously on
  // mount, the subsequent profile load would clobber the migrated array with
  // whatever was stored in the profile (typically an empty list).
  //
  // To avoid that race, we wait for `activeProfileId` to flip from null to a
  // real id (i.e. the auto-load completed) before reading + clearing the
  // legacy key. The migration is still single-fire, gated by a ref.
  const activeProfileId = store((s) => s.activeProfileId);
  const didMigrateRef = useRef(false);
  useEffect(() => {
    if (didMigrateRef.current) return;
    if (!activeProfileId) return; // wait for auto-load
    didMigrateRef.current = true;
    if (filters.length > 0) return;
    const legacy = readLegacyFilters(gridId);
    if (legacy && legacy.length > 0) setFilters(legacy);
    // Intentionally limited deps — fire exactly once per (gridId, first
    // active profile) tuple. `filters` is read at fire time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridId, activeProfileId]);

  const [renameId, setRenameId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // ─── Scroll overflow detection ─────────────────────────────────────

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

  // Keep activeFiltersRef in sync
  useEffect(() => {
    activeFiltersRef.current = filters.filter(f => f.active);
  }, [filters, activeFiltersRef]);

  // ─── Compute per-filter row counts against full (unfiltered) rowData ───

  const filterCounts = useMemo(() => {
    if (filters.length === 0 || !rowData || rowData.length === 0) return {};
    const counts: Record<string, number> = {};
    for (const f of filters) {
      let count = 0;
      for (const row of rowData) {
        if (doesRowMatchFilterModel(row, f.filterModel)) count++;
      }
      counts[f.id] = count;
    }
    return counts;
  }, [filters, rowData]);

  // ─── Apply active filters to grid (AND logic) ─────────────────────────

  const applyActiveFilters = useCallback((updated: SavedFilter[]) => {
    const api = core.getGridApi();
    if (!api) return;
    const active = updated.filter(f => f.active);

    if (active.length === 0) {
      api.setFilterModel(null);
    } else if (active.length === 1) {
      api.setFilterModel(active[0].filterModel);
    } else {
      const merged = mergeFilterModels(active.map(f => f.filterModel));
      api.setFilterModel(merged);
    }
  }, [core]);

  // ─── Add filter ────────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    const api = core.getGridApi();
    if (!api) return;
    const model = api.getFilterModel();
    if (!model || Object.keys(model).length === 0) return;

    const newFilter: SavedFilter = {
      id: makeId(),
      label: generateLabel(model, filters.length),
      filterModel: model,
      active: true,
    };
    setFilters([...filters, newFilter]);
    // applyActiveFilters runs from the effect on `filters` change.
  }, [core, filters, setFilters]);

  // ─── Toggle filter ─────────────────────────────────────────────────────

  const handleToggle = useCallback((id: string) => {
    setFilters(filters.map(f => f.id === id ? { ...f, active: !f.active } : f));
  }, [filters, setFilters]);

  // ─── Remove filter ─────────────────────────────────────────────────────

  const handleRemove = useCallback((id: string) => {
    setFilters(filters.filter(f => f.id !== id));
  }, [filters, setFilters]);

  // ─── Rename ────────────────────────────────────────────────────────────

  const handleStartRename = useCallback((id: string) => {
    setRenameId(id);
  }, []);

  const handleConfirmRename = useCallback((id: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (trimmed) {
      setFilters(prev => prev.map(f => f.id === id ? { ...f, label: trimmed } : f));
    }
    setRenameId(null);
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenameId(null);
  }, []);

  // ─── Clear all ─────────────────────────────────────────────────────────

  const handleDeactivateAll = useCallback(() => {
    // Mark every saved filter inactive — the effect on `filters` below will
    // push the resulting empty model into AG-Grid via `applyActiveFilters`.
    setFilters(filters.map(f => ({ ...f, active: false })));
  }, [filters, setFilters]);

  // ─── Re-apply filters to AG-Grid whenever the array changes ────────────
  // Persistence is now handled by the `saved-filters` module (auto-saved
  // into the active profile). This effect keeps the live grid filter model
  // in sync with the array — in particular, when the user switches profiles
  // the saved-filters module state mutates and we push the new merged model
  // into AG-Grid here so the visible filters match.
  useEffect(() => {
    applyActiveFilters(filters);
  }, [filters, applyActiveFilters]);

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="gc-toolbar-content gc-filters-bar">
      {/* Left scroll caret */}
      {canScrollLeft && (
        <button type="button" className="gc-filters-caret" onClick={() => scrollBy(-1)}>
          <ChevronLeft size={12} strokeWidth={2.5} />
        </button>
      )}

      {/* Filter pills scroll area */}
      <div ref={scrollRef} className="gc-filter-scroll">
        {filters.map(f => {
          if (renameId === f.id) {
            return (
              <input
                key={f.id}
                ref={renameInputRef}
                defaultValue={f.label}
                autoFocus
                className="gc-filter-rename-input"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirmRename(f.id, (e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') handleCancelRename();
                }}
                onBlur={e => handleConfirmRename(f.id, e.target.value)}
              />
            );
          }

          return (
            <Tooltip key={f.id} content={f.label}>
              <div
                className={cn(
                  'gc-filter-pill group',
                  f.active ? 'gc-filter-active' : 'gc-filter-inactive',
                )}
              >
                <button
                  type="button"
                  className="gc-filter-pill-btn"
                  onClick={() => handleToggle(f.id)}
                >
                  <span className="truncate">{f.label}</span>
                  {filterCounts[f.id] != null && (
                    <span className="gc-filter-pill-count">{filterCounts[f.id]}</span>
                  )}
                </button>

                <span className="gc-filter-pill-actions">
                  <button
                    type="button"
                    className="gc-filter-pill-action"
                    onClick={e => { e.stopPropagation(); handleStartRename(f.id); }}
                    title="Rename"
                  >
                    <Pencil size={9} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="gc-filter-pill-action gc-filter-pill-action-remove"
                    onClick={e => { e.stopPropagation(); handleRemove(f.id); }}
                    title="Remove"
                  >
                    <Trash2 size={9} strokeWidth={1.75} />
                  </button>
                </span>
              </div>
            </Tooltip>
          );
        })}

        {/* Clear all — red FunnelX, before + button */}
        {filters.length > 0 && (
          <Tooltip content="Clear all filters">
            <button type="button" className="gc-filters-clear-btn" onClick={handleDeactivateAll}>
              <FunnelX size={16} strokeWidth={2.25} />
            </button>
          </Tooltip>
        )}

        {/* + button — inline after last pill */}
        <Tooltip content="Capture current filter">
          <button type="button" className="gc-filters-add-btn" onClick={handleAdd}>
            <Plus size={16} strokeWidth={2.75} />
          </button>
        </Tooltip>
      </div>

      {/* Right scroll caret */}
      {canScrollRight && (
        <button type="button" className="gc-filters-caret" onClick={() => scrollBy(1)}>
          <ChevronRight size={12} strokeWidth={2.5} />
        </button>
      )}

    </div>
  );
}
