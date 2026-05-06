/**
 * 05 · EDITOR & FILTER — quick-pick cell editor + primary filter kind
 * + floating-filter toggle.
 *
 * Compact surface so the user doesn't have to open the column-settings
 * panel for the common case. Granular config (params, debounce, set-
 * filter options, multi-filter sub-list) stays in the settings panel —
 * a "Custom" badge on the filter dropdown signals when the column
 * carries a non-quick-pickable shape and the dropdown would overwrite
 * it.
 *
 * Filter convention: the dropdown only exposes the platform's
 * streamSafe wrappers (text + number). Both wrappers already bundle
 * `agMultiColumnFilter` with a typed primary + `agSetColumnFilter`,
 * AND wire in a typeable floating-filter input that survives live
 * data updates. Date / boolean / raw AG-Grid kinds aren't quick-
 * pickable here — they belong in the column-settings panel.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Filter, FilterX, MoreVertical, Pencil, X } from 'lucide-react';
import {
  Input,
  PopoverCompat as Popover,
  Select,
  parseValuesSource,
  useAppDataKeys,
  useAppDataLookup,
  useAppDataProviders,
  type CellEditorKind,
  type FilterKind,
} from '@marketsui/core';
import { Hair, Menu, MenuItem, MenuSep, Module, Pill, SplitPill } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

const SELECT_KINDS: ReadonlySet<CellEditorKind> = new Set([
  'agSelectCellEditor',
  'agRichSelectCellEditor',
]);

const EDITOR_OPTIONS: ReadonlyArray<{ kind: CellEditorKind; label: string }> = [
  { kind: 'agTextCellEditor',       label: 'Text'        },
  { kind: 'agNumberCellEditor',     label: 'Number'      },
  { kind: 'agSelectCellEditor',     label: 'Select'      },
  { kind: 'agRichSelectCellEditor', label: 'Rich Select' },
  { kind: 'agLargeTextCellEditor',  label: 'Large Text'  },
  { kind: 'agDateCellEditor',       label: 'Date'        },
  { kind: 'agCheckboxCellEditor',   label: 'Checkbox'    },
];

const FILTER_OPTIONS: ReadonlyArray<{ kind: FilterKind; label: string }> = [
  { kind: 'streamSafeMultiColumnFilter',       label: 'Text'   },
  { kind: 'streamSafeMultiNumberColumnFilter', label: 'Number' },
];

function editorLabel(kind: CellEditorKind | undefined): string {
  if (!kind) return 'None';
  return EDITOR_OPTIONS.find((o) => o.kind === kind)?.label ?? 'Custom';
}

function filterLabel(kind: FilterKind | undefined, isCustom: boolean): string {
  if (isCustom) return 'Custom';
  if (!kind) return 'None';
  return FILTER_OPTIONS.find((o) => o.kind === kind)?.label ?? 'Custom';
}

export function ModuleEditorFilter({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const {
    disabled,
    isHeader,
    cellEditorKind,
    cellEditorValues,
    cellEditorValuesSource,
    filterPrimaryKind,
    filterIsCustom,
    floatingFilterOn,
  } = state;
  // Editor + filter only make sense on cell target — disable when
  // the formatter is in header mode (and when nothing is selected).
  const moduleDisabled = disabled || isHeader;
  const showValuesSource = !moduleDisabled && cellEditorKind != null && SELECT_KINDS.has(cellEditorKind);

  const [editorOpen, setEditorOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [valuesOpen, setValuesOpen] = useState(false);

  return (
    <Module index="05" label="Editor & Filter" testId="fmt-module-editor-filter">
      {/* Editor split — icon primary + chevron menu. The primary button
          is purely decorative (opens the menu via the chevron); we
          could also have it toggle on/off but having a single trigger
          point reduces accidental clears. */}
      <SplitPill>
        <Pill
          disabled={moduleDisabled}
          active={!moduleDisabled && cellEditorKind != null}
          tooltip={cellEditorKind ? `Editor: ${editorLabel(cellEditorKind)}` : 'Cell editor'}
          onClick={() => setEditorOpen(true)}
          data-testid="fmt-editor-pill"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <Pencil size={12} strokeWidth={1.75} />
            <span style={{ fontSize: 10, fontWeight: 500 }}>{editorLabel(cellEditorKind)}</span>
          </span>
        </Pill>
        <Popover
          open={editorOpen}
          onOpenChange={setEditorOpen}
          trigger={
            <button
              type="button"
              disabled={moduleDisabled}
              aria-label="Cell editor menu"
              className="fx-pill fx-pill--narrow"
              data-testid="fmt-editor-menu-trigger"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <ChevronDown size={9} strokeWidth={2} />
            </button>
          }
        >
          <Menu className="min-w-[160px]">
            <MenuItem
              glyph={cellEditorKind == null ? '✓' : ''}
              name="None"
              active={cellEditorKind == null}
              onClick={() => { actions.setCellEditorKind(undefined); setEditorOpen(false); }}
              testId="fmt-editor-menu-none"
            />
            <MenuSep />
            {EDITOR_OPTIONS.map((o) => {
              const active = cellEditorKind === o.kind;
              return (
                <MenuItem
                  key={o.kind}
                  glyph={active ? '✓' : ''}
                  name={o.label}
                  active={active}
                  onClick={() => { actions.setCellEditorKind(o.kind); setEditorOpen(false); }}
                  testId={`fmt-editor-menu-${o.kind}`}
                />
              );
            })}
          </Menu>
        </Popover>
        {/* Values-source trigger — only meaningful for select-style
            editors. Sits inside the SplitPill so it visually attaches
            to the editor cluster instead of floating loose. */}
        {showValuesSource && (
          <Popover
            open={valuesOpen}
            onOpenChange={setValuesOpen}
            trigger={
              <button
                type="button"
                aria-label="Configure editor values"
                className="fx-pill fx-pill--narrow"
                data-testid="fmt-editor-values-trigger"
                title="Configure values source"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
                <MoreVertical size={11} strokeWidth={2} />
              </button>
            }
          >
            <ValuesSourcePopover
              key={valuesOpen ? 'open' : 'closed'}
              values={cellEditorValues}
              valuesSource={cellEditorValuesSource}
              onClose={() => setValuesOpen(false)}
              onCommit={(patch) => {
                actions.setCellEditorValues(patch);
                setValuesOpen(false);
              }}
            />
          </Popover>
        )}
      </SplitPill>

      <Hair />

      {/* Filter split — primary kind picker. Picking Text/Number/Date
          writes a multi-filter envelope w/ agSet as sub-2. */}
      <SplitPill>
        <Pill
          disabled={moduleDisabled}
          active={!moduleDisabled && (filterPrimaryKind != null || filterIsCustom)}
          tooltip={
            filterIsCustom
              ? 'Filter is custom-configured (open column settings to tune)'
              : filterPrimaryKind
                ? `Filter: ${filterLabel(filterPrimaryKind, false)}`
                : 'Column filter'
          }
          onClick={() => setFilterOpen(true)}
          data-testid="fmt-filter-pill"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <Filter size={12} strokeWidth={1.75} />
            <span style={{ fontSize: 10, fontWeight: 500 }}>
              {filterLabel(filterPrimaryKind, filterIsCustom)}
            </span>
          </span>
        </Pill>
        <Popover
          open={filterOpen}
          onOpenChange={setFilterOpen}
          trigger={
            <button
              type="button"
              disabled={moduleDisabled}
              aria-label="Filter kind menu"
              className="fx-pill fx-pill--narrow"
              data-testid="fmt-filter-menu-trigger"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <ChevronDown size={9} strokeWidth={2} />
            </button>
          }
        >
          <Menu className="min-w-[180px]">
            <MenuItem
              glyph={filterPrimaryKind == null && !filterIsCustom ? '✓' : ''}
              name="None"
              active={filterPrimaryKind == null && !filterIsCustom}
              onClick={() => { actions.setFilterPrimaryKind(undefined); setFilterOpen(false); }}
              testId="fmt-filter-menu-none"
            />
            <MenuSep />
            {FILTER_OPTIONS.map((o) => {
              const active = !filterIsCustom && filterPrimaryKind === o.kind;
              return (
                <MenuItem
                  key={o.kind}
                  glyph={active ? '✓' : ''}
                  name={o.label}
                  sample="+ Set"
                  active={active}
                  onClick={() => { actions.setFilterPrimaryKind(o.kind); setFilterOpen(false); }}
                  testId={`fmt-filter-menu-${o.kind}`}
                />
              );
            })}
          </Menu>
        </Popover>
      </SplitPill>

      {/* Floating filter row toggle. */}
      <Pill
        disabled={moduleDisabled}
        active={!moduleDisabled && floatingFilterOn}
        tooltip={floatingFilterOn ? 'Hide floating filter row' : 'Show floating filter row'}
        onClick={actions.toggleFloatingFilter}
        data-testid="fmt-floating-filter-toggle"
      >
        <FilterX size={13} strokeWidth={1.75} />
      </Pill>
    </Module>
  );
}

// ─── Values-source popover (select / rich-select editors) ──────────
//
// Two modes:
//   - Static list — comma-separated literals → cellEditor.values
//   - AppData     — provider+key pickers → cellEditor.valuesSource =
//                   `{{providerName.key}}` (resolved at edit time)
//
// Holds a local draft so the user can experiment without committing.
// Confirm (✓) commits the draft + closes; Cancel (✕) discards +
// closes. The parent re-mounts on each open via `key={open ? 'open' :
// 'closed'}` so the draft is always seeded from the latest props.

function ValuesSourcePopover({
  values,
  valuesSource,
  onClose,
  onCommit,
}: {
  values: ReadonlyArray<string | number> | undefined;
  valuesSource: string | undefined;
  onClose: () => void;
  onCommit: (patch: { values?: Array<string | number> | undefined; valuesSource?: string | undefined }) => void;
}) {
  const lookup = useAppDataLookup();
  const providers = useAppDataProviders(lookup);

  const [draftMode, setDraftMode] = useState<'static' | 'appdata'>(valuesSource ? 'appdata' : 'static');
  const [draftCsv, setDraftCsv] = useState<string>(() => (values ?? []).map(String).join(', '));
  const [draftSource, setDraftSource] = useState<string>(valuesSource ?? '');

  const draftParsed = useMemo(() => parseValuesSource(draftSource), [draftSource]);
  const keys = useAppDataKeys(lookup, draftParsed.providerName);

  // When switching mode, prepopulate the destination field with a
  // sensible default but don't lose the other side's draft (the user
  // can still flip back). The other side's commit just won't fire.
  useEffect(() => {
    if (draftMode === 'appdata' && !draftSource) setDraftSource('{{.}}');
  }, [draftMode, draftSource]);

  const handleConfirm = () => {
    if (draftMode === 'static') {
      const tokens = draftCsv.split(',').map((t) => t.trim()).filter((t) => t !== '');
      onCommit({ values: tokens.length === 0 ? undefined : tokens, valuesSource: undefined });
    } else {
      const trimmed = draftSource.trim();
      // Empty / placeholder binding → treat as cleared.
      const next = trimmed && trimmed !== '{{.}}' ? trimmed : undefined;
      onCommit({ valuesSource: next, values: undefined });
    }
  };

  return (
    <div
      className="fx-menu"
      style={{ width: 320, padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}
      data-testid="fmt-editor-values-popover"
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); }
        else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      }}
    >
      {/* Mode toggle row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="fx-pill fx-pill--text"
          data-on={draftMode === 'static' ? 'true' : undefined}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraftMode('static'); }}
          style={{ flex: 1, justifyContent: 'center' }}
          data-testid="fmt-editor-values-mode-static"
        >
          Static list
        </button>
        <button
          type="button"
          className="fx-pill fx-pill--text"
          data-on={draftMode === 'appdata' ? 'true' : undefined}
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraftMode('appdata'); }}
          style={{ flex: 1, justifyContent: 'center' }}
          data-testid="fmt-editor-values-mode-appdata"
        >
          App data
        </button>
      </div>

      {draftMode === 'static' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, opacity: 0.7 }}>
            VALUES (comma-separated)
          </span>
          <Input
            value={draftCsv}
            onChange={(e) => setDraftCsv(e.target.value)}
            placeholder='e.g. BUY, SELL, HOLD'
            data-testid="fmt-editor-values-static-input"
            autoFocus
          />
        </label>
      )}

      {draftMode === 'appdata' && (
        <>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, opacity: 0.7 }}>
              PROVIDER
            </span>
            {lookup ? (
              <Select
                value={draftParsed.providerName ?? ''}
                onChange={(e) => {
                  const name = e.target.value;
                  // New provider → reset key so we don't carry a
                  // dangling key into the new namespace.
                  setDraftSource(name ? `{{${name}.}}` : '{{.}}');
                }}
                data-testid="fmt-editor-values-provider"
              >
                <option value="">— pick a provider —</option>
                {providers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            ) : (
              <Input
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value)}
                placeholder="{{providerName.key}}"
                data-testid="fmt-editor-values-source-text"
              />
            )}
          </label>

          {lookup && draftParsed.providerName && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.4, opacity: 0.7 }}>
                KEY
              </span>
              <Select
                value={draftParsed.key ?? ''}
                onChange={(e) => {
                  const k = e.target.value;
                  setDraftSource(k ? `{{${draftParsed.providerName}.${k}}}` : `{{${draftParsed.providerName}.}}`);
                }}
                data-testid="fmt-editor-values-key"
              >
                <option value="">— pick a key —</option>
                {keys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </Select>
            </label>
          )}
        </>
      )}

      {/* Confirm / Cancel footer — explicit commit so accidental dropdown
          changes don't write to the column until the user confirms. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 2 }}>
        <button
          type="button"
          className="fx-pill"
          aria-label="Cancel"
          title="Cancel (Esc)"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
          data-testid="fmt-editor-values-cancel"
          style={{ color: 'var(--bn-red, #ff4d6d)' }}
        >
          <X size={13} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className="fx-pill"
          aria-label="Confirm"
          title="Confirm (Enter)"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleConfirm(); }}
          data-testid="fmt-editor-values-confirm"
          style={{ color: 'var(--bn-green, #14d9a0)' }}
        >
          <Check size={13} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
