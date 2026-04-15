import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type GridCore,
  type GridStore,
  type SavedFiltersState,
  useModuleState,
} from '@grid-customizer/core-v2';
import { Plus, Pencil, Trash2, FunnelX } from 'lucide-react';
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
}

export function FiltersToolbar({ core, store }: FiltersToolbarProps) {
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

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="gc-toolbar-content gc-filters-bar" data-testid="filters-toolbar">
      <div className="gc-filter-scroll">
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
                title={f.label}
              >
                <span className="truncate">{f.label}</span>
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
          title="Capture current filter"
        >
          <Plus size={16} strokeWidth={2.75} />
        </button>
      </div>
    </div>
  );
}
