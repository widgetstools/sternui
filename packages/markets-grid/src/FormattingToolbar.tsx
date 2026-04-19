/**
 * FormattingToolbar — inline cell-style + value-formatter editor that
 * writes into the column-customization module's `cellStyleOverrides`
 * and `valueFormatterTemplate` for the currently-focused column.
 *
 * Scope for this v3 pass is deliberately lean — the rich edit surface
 * (borders, templates, header-vs-cell target switch) lives in the
 * ColumnSettingsPanel. The toolbar covers the high-frequency actions
 * users want one click away:
 *   - Text: Bold / Italic / Underline
 *   - Alignment: Left / Center / Right
 *   - Colors: Text + Background (CompactColorField)
 *   - Value formatter (FormatterPicker popover, dataType: number)
 *
 * Target column selection: we read the first selected column (via
 * `cellFocused` event) or fall back to the first column in the grid.
 * The toolbar is typically rendered inside a <DraggableFloat> so the
 * user can reposition it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Underline,
  X,
} from 'lucide-react';
import {
  Caps,
  CompactColorField,
  FormatterPicker,
  PillBtn,
  PillGroup,
  SharpBtn,
  useGridApi,
  useGridEvent,
  useModuleState,
  type CellStyleOverrides,
  type ColumnCustomizationAssignment as ColumnAssignment,
  type ColumnCustomizationState,
} from '@grid-customizer/core';

const MODULE_ID = 'column-customization';

export interface FormattingToolbarProps {
  /** Optional close handler — renders an X button when supplied. */
  onClose?: () => void;
}

export function FormattingToolbar({ onClose }: FormattingToolbarProps) {
  const api = useGridApi();
  const [state, setState] = useModuleState<ColumnCustomizationState>(MODULE_ID);

  // Track the focused cell's column so toolbar actions target it.
  const [colId, setColId] = useState<string | null>(null);
  useGridEvent('cellFocused', () => {
    if (!api) return;
    const focused = api.getFocusedCell();
    const id = focused?.column?.getColId() ?? null;
    if (id) setColId(id);
  });
  useEffect(() => {
    if (colId || !api) return;
    const first = api.getColumns()?.[0]?.getColId();
    if (first) setColId(first);
  }, [colId, api]);

  const assignment: ColumnAssignment | undefined = colId
    ? state.assignments[colId]
    : undefined;
  const overrides: CellStyleOverrides = assignment?.cellStyleOverrides ?? {};

  const patchOverrides = useCallback(
    (patch: (prev: CellStyleOverrides) => CellStyleOverrides) => {
      if (!colId) return;
      setState((prev) => {
        const current = prev.assignments[colId] ?? { colId };
        const nextCell = patch(current.cellStyleOverrides ?? {});
        const empty = !nextCell.typography && !nextCell.colors && !nextCell.alignment && !nextCell.borders;
        const nextAssignment: ColumnAssignment = {
          ...current,
          cellStyleOverrides: empty ? undefined : nextCell,
        };
        return { ...prev, assignments: { ...prev.assignments, [colId]: nextAssignment } };
      });
    },
    [colId, setState],
  );

  const patchFormatter = useCallback(
    (next: ColumnAssignment['valueFormatterTemplate']) => {
      if (!colId) return;
      setState((prev) => {
        const current = prev.assignments[colId] ?? { colId };
        const nextAssignment: ColumnAssignment = { ...current, valueFormatterTemplate: next };
        return { ...prev, assignments: { ...prev.assignments, [colId]: nextAssignment } };
      });
    },
    [colId, setState],
  );

  // Toggle helpers — typography fields.
  const toggleTypo = (k: 'bold' | 'italic' | 'underline') =>
    patchOverrides((prev) => {
      const typo = prev.typography ?? {};
      const nextVal = !typo[k];
      const nextTypo = { ...typo, [k]: nextVal || undefined };
      const hasAny = nextTypo.bold || nextTypo.italic || nextTypo.underline || nextTypo.fontSize != null;
      return { ...prev, typography: hasAny ? nextTypo : undefined };
    });

  const setAlign = (h: 'left' | 'center' | 'right') =>
    patchOverrides((prev) => {
      const current = prev.alignment?.horizontal;
      const next = current === h ? undefined : h;
      return { ...prev, alignment: next ? { ...prev.alignment, horizontal: next } : undefined };
    });

  const setColor = (which: 'text' | 'background', value: string | undefined) =>
    patchOverrides((prev) => {
      const colors = prev.colors ?? {};
      const nextColors = { ...colors, [which]: value };
      const hasAny = nextColors.text !== undefined || nextColors.background !== undefined;
      return { ...prev, colors: hasAny ? nextColors : undefined };
    });

  const typography = overrides.typography;
  const align = overrides.alignment?.horizontal;

  return (
    <div
      className="gc-sheet"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        background: 'var(--ck-surface)',
        border: '1px solid var(--ck-border)',
        borderRadius: 3,
        fontSize: 11,
      }}
    >
      <Caps size={9} color="var(--ck-t3)">
        {colId ?? 'no col'}
      </Caps>

      {/* Typography pills */}
      <PillGroup>
        <PillBtn active={!!typography?.bold} onClick={() => toggleTypo('bold')} title="Bold">
          <Bold size={12} strokeWidth={2.25} />
        </PillBtn>
        <PillBtn active={!!typography?.italic} onClick={() => toggleTypo('italic')} title="Italic">
          <Italic size={12} strokeWidth={2.25} />
        </PillBtn>
        <PillBtn active={!!typography?.underline} onClick={() => toggleTypo('underline')} title="Underline">
          <Underline size={12} strokeWidth={2.25} />
        </PillBtn>
      </PillGroup>

      {/* Alignment pills */}
      <PillGroup>
        <PillBtn active={align === 'left'} onClick={() => setAlign('left')} title="Left">
          <AlignLeft size={12} strokeWidth={2.25} />
        </PillBtn>
        <PillBtn active={align === 'center'} onClick={() => setAlign('center')} title="Center">
          <AlignCenter size={12} strokeWidth={2.25} />
        </PillBtn>
        <PillBtn active={align === 'right'} onClick={() => setAlign('right')} title="Right">
          <AlignRight size={12} strokeWidth={2.25} />
        </PillBtn>
      </PillGroup>

      {/* Colors */}
      <div style={{ width: 130 }}>
        <CompactColorField
          value={overrides.colors?.text}
          onChange={(next) => setColor('text', next)}
          onClear={() => setColor('text', undefined)}
        />
      </div>
      <div style={{ width: 130 }}>
        <CompactColorField
          value={overrides.colors?.background}
          onChange={(next) => setColor('background', next)}
          onClear={() => setColor('background', undefined)}
        />
      </div>

      {/* Formatter */}
      <div style={{ width: 260 }}>
        <FormatterPicker
          value={assignment?.valueFormatterTemplate}
          onChange={patchFormatter}
          dataType="number"
        />
      </div>

      {onClose && (
        <SharpBtn variant="ghost" onClick={onClose} title="Close" testId="ft-close">
          <X size={12} strokeWidth={2.25} />
        </SharpBtn>
      )}
    </div>
  );
}
