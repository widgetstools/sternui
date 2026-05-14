import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useModuleState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Textarea,
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
import { useFilterModel } from './useFilterModel';

/**
 * FiltersToolbar — pill-row UI for saved filter models.
 *
 * State, AG-Grid event wiring, and the saved-filters → AG-Grid push
 * pipeline live in `useFilterModel`. This component renders the chrome:
 * collapse/expand toggle, scrollable pill row, per-pill rename input,
 * per-pill details popover, and the sticky add/clear action cluster.
 */

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

/**
 * FiltersToolbar accepts no props — formatter-toolbar visibility is
 * handled by its own button in the primary row (MarketsGrid), decoupled
 * from the filter pill carousel.
 */
export type FiltersToolbarProps = Record<string, never>;

export function FiltersToolbar() {
  const model = useFilterModel();
  const { filters, filterCounts, hasNewFilter } = model;

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

  const [renameId, setRenameId] = useState<string | null>(null);
  // Pill whose details/edit popover is currently open. Controlled so the
  // "Save" button can close the popover programmatically after a successful
  // commit.
  const [openDetailsId, setOpenDetailsId] = useState<string | null>(null);

  const handleConfirmRename = useCallback(
    (id: string, label: string) => {
      model.rename(id, label);
      setRenameId(null);
    },
    [model],
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
      className="ds-toolbar-content ds-filters-bar"
      data-testid="filters-toolbar"
      data-expanded={expanded ? 'true' : 'false'}
    >
      {/* Collapse / expand toggle — leads the row so it's the first thing
          the user sees. Flips between ChevronUp (expanded) and
          ChevronDown (collapsed); persists through the
          toolbar-visibility module. */}
      <button
        type="button"
        className="ds-filters-collapse"
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
          className="ds-filters-summary"
          onClick={toggleExpanded}
          data-testid="filters-summary-chip"
          title="Click to expand filter pills"
        >
          {filters.length === 0 ? (
            <span className="ds-filters-summary-empty">No filters</span>
          ) : (
            <>
              <span className="ds-filters-summary-count">
                {filters.length}
              </span>
              <span className="ds-filters-summary-label">
                filter{filters.length === 1 ? '' : 's'}
              </span>
              {activeCount > 0 && (
                <span className="ds-filters-summary-active">
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
          className="ds-filters-caret"
          onClick={() => scrollBy(-1)}
          title="Scroll left"
          data-testid="filters-caret-left"
        >
          <ChevronLeft size={12} strokeWidth={2.5} />
        </button>
      )}
      {expanded && (
      <div ref={scrollRef} className="ds-filter-scroll">
        {filters.map((f) => {
          if (renameId === f.id) {
            return (
              <input
                key={f.id}
                ref={renameInputRef}
                defaultValue={f.label}
                autoFocus
                className="ds-filter-rename-input"
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
              className={`ds-filter-pill group ${f.active ? 'ds-filter-active' : 'ds-filter-inactive'}`}
              data-testid={`filter-pill-${f.id}`}
              data-active={f.active}
            >
              <button
                type="button"
                className="ds-filter-pill-btn"
                onClick={() => model.toggle(f.id)}
                title={
                  filterCounts[f.id] != null
                    ? `${f.label} — matches ${filterCounts[f.id]} row${filterCounts[f.id] === 1 ? '' : 's'}`
                    : f.label
                }
              >
                <span className="truncate">{f.label}</span>
                {filterCounts[f.id] != null && (
                  <span
                    className="ds-filter-pill-count"
                    data-testid={`filter-pill-count-${f.id}`}
                  >
                    {filterCounts[f.id]}
                  </span>
                )}
              </button>
              <span className="ds-filter-pill-actions">
                <button
                  type="button"
                  className="ds-filter-pill-action"
                  onClick={(e) => { e.stopPropagation(); setRenameId(f.id); }}
                  title="Rename"
                >
                  <Pencil size={9} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="ds-filter-pill-action ds-filter-pill-action-remove"
                  onClick={(e) => { e.stopPropagation(); model.remove(f.id); }}
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
                    className="ds-filter-pill-menu"
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
                    onSave={(next) => {
                      model.editFilterModel(f.id, next);
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
          className="ds-filters-caret"
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
          `.ds-filters-actions` is a flex-shrink:0 group; the
          Brush / formatter-toolbar toggle no longer lives here — it
          sits in the primary row's right-side action cluster
          (MarketsGrid) where it's decoupled from filter semantics. */}
      <div className="ds-filters-actions">
        {filters.length > 0 && (
          <button
            type="button"
            className="ds-filters-clear-btn"
            onClick={model.deactivateAll}
            title="Clear all filters"
          >
            <FunnelX size={18} strokeWidth={3} />
          </button>
        )}

        <button
          type="button"
          className="ds-filters-add-btn"
          onClick={model.addFromLive}
          disabled={!hasNewFilter}
          data-testid="filters-add-btn"
          data-enabled={hasNewFilter ? 'true' : 'false'}
          title={
            hasNewFilter
              ? 'Capture current filter as a new pill'
              : 'Add a column filter (that isn’t already saved) to enable'
          }
          style={{
            opacity: hasNewFilter ? 1 : 0.35,
            cursor: hasNewFilter ? 'pointer' : 'not-allowed',
          }}
        >
          <FunnelPlus size={18} strokeWidth={3} />
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
