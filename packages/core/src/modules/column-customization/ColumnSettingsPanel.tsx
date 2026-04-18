/**
 * Column Settings panel — master-detail editor for per-column overrides.
 *
 * This v3 iteration ships the data-layer wiring + a minimal list+editor
 * surface. The full 8-band styling editor (text / color / border / format)
 * lands in a later pass alongside the shared `StyleEditor` primitive; for
 * now the panel lets the user edit the structural fields + flags.
 */
import { useCallback, useMemo, useState } from 'react';
import { useModuleState } from '../../hooks/useModuleState';
import { useGridApi } from '../../hooks/useGridApi';
import {
  Band,
  Caps,
  IconInput,
  ItemCard,
  Row,
} from '../../ui/settings';
import { Switch } from '../../ui/shadcn/switch';

const COLUMN_CUSTOMIZATION_MODULE_ID = 'column-customization';
import type {
  ColumnAssignment,
  ColumnCustomizationState,
} from './state';
import type { SettingsPanelProps } from '../../platform/types';

// ─── Column catalog discovery ──────────────────────────────────────────────

interface ColumnEntry {
  colId: string;
  headerName: string;
}

/** Pull the current grid's columns from the live api; fallback to state keys. */
function useColumnCatalog(
  state: ColumnCustomizationState,
): ColumnEntry[] {
  const api = useGridApi();
  return useMemo(() => {
    const entries: ColumnEntry[] = [];
    const seen = new Set<string>();
    if (api) {
      for (const col of api.getColumns() ?? []) {
        const colId = col.getColId();
        if (seen.has(colId)) continue;
        seen.add(colId);
        entries.push({
          colId,
          headerName: col.getColDef().headerName ?? colId,
        });
      }
    }
    // Merge in assigned columns that the grid doesn't currently know about —
    // e.g. a saved assignment for a column that was removed from the data set
    // but the user might want to clean up.
    for (const colId of Object.keys(state.assignments)) {
      if (seen.has(colId)) continue;
      seen.add(colId);
      entries.push({ colId, headerName: `${colId} (detached)` });
    }
    return entries.sort((a, b) => a.headerName.localeCompare(b.headerName));
  }, [api, state.assignments]);
}

// ─── Panel ─────────────────────────────────────────────────────────────────

export function ColumnSettingsPanel(_props: SettingsPanelProps) {
  const [state, setState] = useModuleState<ColumnCustomizationState>(
    COLUMN_CUSTOMIZATION_MODULE_ID,
  );
  const columns = useColumnCatalog(state);
  const [selectedColId, setSelectedColId] = useState<string | null>(
    () => columns[0]?.colId ?? null,
  );

  const selection = selectedColId
    ? state.assignments[selectedColId] ?? { colId: selectedColId }
    : null;

  const updateAssignment = useCallback(
    (colId: string, patch: Partial<ColumnAssignment>) => {
      setState((prev) => {
        const existing = prev.assignments[colId] ?? { colId };
        const next: ColumnAssignment = { ...existing, ...patch, colId };
        return { ...prev, assignments: { ...prev.assignments, [colId]: next } };
      });
    },
    [setState],
  );

  const clearAssignment = useCallback(
    (colId: string) => {
      setState((prev) => {
        if (!prev.assignments[colId]) return prev;
        const { [colId]: _drop, ...rest } = prev.assignments;
        void _drop;
        return { ...prev, assignments: rest };
      });
    },
    [setState],
  );

  return (
    <div className="gc-sheet gc-panel-column-customization" style={{ display: 'flex', height: '100%' }}>
      <aside style={{
        width: 240,
        borderRight: '1px solid var(--ck-border)',
        overflowY: 'auto',
        padding: '8px 0',
      }}>
        <div style={{ padding: '4px 12px 8px' }}>
          <Caps size={11}>Columns ({columns.length})</Caps>
        </div>
        {columns.map((c) => {
          const hasAssignment = !!state.assignments[c.colId];
          const active = selectedColId === c.colId;
          return (
            <button
              key={c.colId}
              type="button"
              onClick={() => setSelectedColId(c.colId)}
              data-testid={`cc-list-${c.colId}`}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 12px',
                background: active ? 'var(--ck-card)' : 'transparent',
                color: active ? 'var(--ck-t0)' : 'var(--ck-t1)',
                border: 'none',
                borderLeft: active ? '2px solid var(--ck-green)' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'var(--ck-font-sans)',
              }}
            >
              <span>{c.headerName}</span>
              {hasAssignment && (
                <span style={{
                  float: 'right',
                  width: 6,
                  height: 6,
                  background: 'var(--ck-green)',
                  borderRadius: 3,
                  marginTop: 4,
                }} />
              )}
            </button>
          );
        })}
      </aside>

      <section style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
        {selection ? (
          <EditorForSelection
            assignment={selection}
            headerName={columns.find((c) => c.colId === selection.colId)?.headerName ?? selection.colId}
            onChange={(patch) => updateAssignment(selection.colId, patch)}
            onClear={() => clearAssignment(selection.colId)}
          />
        ) : (
          <div style={{ padding: 24, color: 'var(--ck-t3)' }}>Select a column on the left.</div>
        )}
      </section>
    </div>
  );
}

// ─── Editor ────────────────────────────────────────────────────────────────

function EditorForSelection({
  assignment,
  headerName,
  onChange,
  onClear,
}: {
  assignment: ColumnAssignment;
  headerName: string;
  onChange: (patch: Partial<ColumnAssignment>) => void;
  onClear: () => void;
}) {
  return (
    <ItemCard
      title={<span>{headerName} <span style={{ color: 'var(--ck-t3)', fontSize: 10, fontWeight: 400 }}>· {assignment.colId}</span></span>}
      onDelete={onClear}
      testId={`cc-card-${assignment.colId}`}
    >
      <Band index="01" title="Header">
        <Row
          label="Header name"
          testId="cc-header-name"
          control={
            <IconInput
              value={assignment.headerName ?? ''}
              onCommit={(raw) => onChange({ headerName: raw || undefined })}
              placeholder={headerName}
            />
          }
        />
        <Row
          label="Header tooltip"
          testId="cc-header-tooltip"
          control={
            <IconInput
              value={assignment.headerTooltip ?? ''}
              onCommit={(raw) => onChange({ headerTooltip: raw || undefined })}
            />
          }
        />
      </Band>

      <Band index="02" title="Layout">
        <Row
          label="Initial width"
          testId="cc-initial-width"
          control={
            <IconInput
              value={assignment.initialWidth === undefined ? '' : String(assignment.initialWidth)}
              numeric
              suffix="px"
              onCommit={(raw) => {
                if (raw.trim() === '') { onChange({ initialWidth: undefined }); return; }
                const n = Number(raw);
                if (Number.isFinite(n) && n > 0) onChange({ initialWidth: n });
              }}
            />
          }
        />
        <Row
          label="Initial pinned"
          testId="cc-initial-pinned"
          control={
            <select
              value={
                assignment.initialPinned === true
                  ? 'true'
                  : assignment.initialPinned === false || assignment.initialPinned === undefined
                    ? ''
                    : assignment.initialPinned
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') onChange({ initialPinned: undefined });
                else if (v === 'true') onChange({ initialPinned: true });
                else onChange({ initialPinned: v as 'left' | 'right' });
              }}
              style={{
                background: 'var(--ck-bg)',
                border: '1px solid var(--ck-border-hi)',
                color: 'var(--ck-t0)',
                fontSize: 11,
                height: 26,
                padding: '0 8px',
              }}
            >
              <option value="">—</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="true">True (auto)</option>
            </select>
          }
        />
        <Row
          label="Initial hide"
          testId="cc-initial-hide"
          control={
            <Switch
              checked={!!assignment.initialHide}
              onChange={(e) => onChange({ initialHide: (e.target as HTMLInputElement).checked || undefined })}
            />
          }
        />
      </Band>

      <Band index="03" title="Behaviour">
        <Row
          label="Sortable"
          testId="cc-sortable"
          control={
            <Switch
              checked={assignment.sortable ?? true}
              onChange={(e) => onChange({ sortable: (e.target as HTMLInputElement).checked })}
            />
          }
        />
        <Row
          label="Filterable"
          testId="cc-filterable"
          control={
            <Switch
              checked={assignment.filterable ?? true}
              onChange={(e) => onChange({ filterable: (e.target as HTMLInputElement).checked })}
            />
          }
        />
        <Row
          label="Resizable"
          testId="cc-resizable"
          control={
            <Switch
              checked={assignment.resizable ?? true}
              onChange={(e) => onChange({ resizable: (e.target as HTMLInputElement).checked })}
            />
          }
        />
      </Band>

      {/* Styling + formatting bands defer to StyleEditor (M7) —
          placeholder hint so hosts know the panel is intentionally light. */}
      <Band index="04" title="Style & Format">
        <div style={{ padding: '8px 0', fontSize: 11, color: 'var(--ck-t3)' }}>
          Rich styling (cell/header/border/format) lands with the StyleEditor
          primitive — see the `conditional-styling` module for the editor
          surface; column-specific overrides will reuse the same component
          once it's available.
        </div>
      </Band>
    </ItemCard>
  );
}
