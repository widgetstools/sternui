/**
 * Fold a template chain + typeDefault + the assignment's own fields into
 * one composite `ColumnAssignment`.
 *
 * Precedence (low → high):
 *   1. `typeDefaults[colDataType]` — ONLY when the assignment has no
 *      explicit `templateIds`. An explicit `templateIds: []` opts the
 *      column out.
 *   2. Each id in `assignment.templateIds[]`, in order — later wins.
 *   3. The assignment itself — always wins last.
 *
 * Per-field merge for `cellStyleOverrides` / `headerStyleOverrides`.
 * Last-writer-wins everywhere else. `cellEditorParams`, `filter`, and
 * `rowGrouping` are opaque — the later value replaces the earlier one
 * wholesale (no deep merge).
 *
 * Aliasing contract: the returned assignment's nested leaf objects
 * (BorderSpec entries, `cellEditorParams`, `valueFormatterTemplate.options`)
 * may alias template state — do NOT mutate them in place.
 */
import type {
  CellStyleOverrides,
  ColumnAssignment,
  ColumnDataType,
} from '../../colDef';
import type { ColumnTemplate, ColumnTemplatesState } from './state';

export function resolveTemplates(
  assignment: ColumnAssignment,
  templatesState: ColumnTemplatesState,
  colDataType: ColumnDataType | undefined,
): ColumnAssignment {
  // 1. Build the ordered chain of templates to apply (low → high precedence).
  const chain: ColumnTemplate[] = [];

  if (assignment.templateIds === undefined && colDataType !== undefined) {
    const fallbackId = templatesState.typeDefaults[colDataType];
    const fallback = fallbackId ? templatesState.templates[fallbackId] : undefined;
    if (fallback) chain.push(fallback);
  }

  for (const id of assignment.templateIds ?? []) {
    const t = templatesState.templates[id];
    if (t) chain.push(t);
    // Unknown ids silently skipped — template was deleted but the
    // assignment still references it. Don't crash the grid.
  }

  if (chain.length === 0) return assignment;

  // 2. Fold chain left-to-right, then the assignment itself last.
  const out: ColumnAssignment = { colId: assignment.colId };
  for (const t of chain) applyOver(out, t);
  applyOver(out, assignment);
  return out;
}

/**
 * Layer a template-shaped or assignment-shaped object onto `target`. Per-
 * field merge for styling; last-writer-wins for everything else; opaque
 * wholesale-replace for `cellEditorParams` / `filter` / `rowGrouping`.
 */
function applyOver(
  target: ColumnAssignment,
  source: Partial<ColumnTemplate> & Partial<ColumnAssignment>,
): ColumnAssignment {
  // Per-field merge for styling.
  if (source.cellStyleOverrides !== undefined) {
    target.cellStyleOverrides = mergeStyle(target.cellStyleOverrides, source.cellStyleOverrides);
  }
  if (source.headerStyleOverrides !== undefined) {
    target.headerStyleOverrides = mergeStyle(target.headerStyleOverrides, source.headerStyleOverrides);
  }
  // Last-writer-wins for everything else.
  const keys: (keyof ColumnAssignment)[] = [
    'valueFormatterTemplate',
    'sortable',
    'filterable',
    'resizable',
    'cellEditorName',
    'cellEditorParams',
    'cellRendererName',
    'filter',
    'rowGrouping',
    'headerName',
    'headerTooltip',
    'initialWidth',
    'initialHide',
    'initialPinned',
    'templateIds',
  ];
  for (const k of keys) {
    const v = (source as Partial<ColumnAssignment>)[k];
    if (v !== undefined) (target as unknown as Record<string, unknown>)[k as string] = v;
  }
  return target;
}

function mergeStyle(
  base: CellStyleOverrides | undefined,
  top: CellStyleOverrides,
): CellStyleOverrides {
  if (!base) return top;
  return {
    typography: base.typography || top.typography
      ? { ...base.typography, ...top.typography }
      : undefined,
    colors: base.colors || top.colors
      ? { ...base.colors, ...top.colors }
      : undefined,
    alignment: base.alignment || top.alignment
      ? { ...base.alignment, ...top.alignment }
      : undefined,
    // Borders merge per-side, not per-property within a side. A full
    // BorderSpec is a unit; you rarely want "t1's color + t2's width".
    borders: base.borders || top.borders
      ? { ...base.borders, ...top.borders }
      : undefined,
  };
}
