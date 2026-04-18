import type {
  CellStyleOverrides,
  ColumnAssignment,
} from '../column-customization/state';
import type {
  ColumnDataType,
  ColumnTemplate,
  ColumnTemplatesState,
} from './state';

/**
 * Compose a `ColumnAssignment` from its referenced templates + any
 * type-default + the assignment's own fields, in this precedence (low → high):
 *
 *   1. typeDefault for `colDataType`, IF the assignment has no explicit
 *      `templateIds` field. An explicit `templateIds: []` blocks this fallback,
 *      so users can opt out of typeDefaults per-column.
 *   2. Each id in `assignment.templateIds[]`, in array order — later wins.
 *   3. Assignment's own fields — always win last.
 *
 * Per-field merge for `cellStyleOverrides` and `headerStyleOverrides` (so two
 * templates can layer typography vs colors without clobbering each other).
 * Last-writer-wins for everything else. `cellEditorParams` is opaque and
 * replaced wholesale on merge — no deep merge.
 *
 * Pure: same input always produces equal output. Reference equality is only
 * promised on the identity short-circuit (no templates apply).
 *
 * Aliasing contract: callers must treat `ColumnTemplate` instances in
 * `state.templates` as immutable. The returned `ColumnAssignment`'s nested
 * leaf objects (BorderSpec entries under `cellStyleOverrides.borders` /
 * `headerStyleOverrides.borders`, `cellEditorParams`, and
 * `valueFormatterTemplate.options`) may alias template state — do not
 * mutate them in place.
 */
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
    // Unknown ids silently skipped — template was deleted but assignment
    // still references it. Don't crash the grid; just no-op the missing layer.
  }

  if (chain.length === 0) return assignment;

  // 2. Fold the chain left-to-right, then assignment last.
  const composed: ColumnAssignment = { colId: assignment.colId };
  for (const t of chain) applyTemplateLikeOver(composed, t);
  applyTemplateLikeOver(composed, assignment);
  return composed;
}

/**
 * Layer a template-shaped or assignment-shaped object onto an accumulator.
 * Per-field merge for the two style fields; last-writer-wins for the rest;
 * `cellEditorParams` is treated as opaque (wholesale replace).
 *
 * Mutates `target` and returns it. Used by both the chain fold and the
 * assignment-wins-last step so the two paths can't drift.
 */
function applyTemplateLikeOver(
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
  if (source.valueFormatterTemplate !== undefined) {
    target.valueFormatterTemplate = source.valueFormatterTemplate;
  }
  if (source.sortable !== undefined) target.sortable = source.sortable;
  if (source.filterable !== undefined) target.filterable = source.filterable;
  if (source.resizable !== undefined) target.resizable = source.resizable;
  if (source.cellEditorName !== undefined) target.cellEditorName = source.cellEditorName;
  if (source.cellEditorParams !== undefined) target.cellEditorParams = source.cellEditorParams;
  if (source.cellRendererName !== undefined) target.cellRendererName = source.cellRendererName;
  // Rich filter config — treated as opaque (wholesale replace), same as
  // `cellEditorParams`. Templates rarely define filter config but the slot
  // exists for consistency.
  if ('filter' in source && (source as { filter?: unknown }).filter !== undefined) {
    (target as unknown as { filter?: unknown }).filter = (source as { filter: unknown }).filter;
  }
  // Assignment-only fields — only present when source is the assignment itself.
  if ('headerName' in source && source.headerName !== undefined) target.headerName = source.headerName;
  if ('headerTooltip' in source && source.headerTooltip !== undefined) target.headerTooltip = source.headerTooltip;
  if ('initialWidth' in source && source.initialWidth !== undefined) target.initialWidth = source.initialWidth;
  if ('initialHide' in source && source.initialHide !== undefined) target.initialHide = source.initialHide;
  if ('initialPinned' in source && source.initialPinned !== undefined) target.initialPinned = source.initialPinned;
  if ('templateIds' in source && source.templateIds !== undefined) target.templateIds = source.templateIds;
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
    // Borders merge per-side, not per-property within a side. A complete
    // BorderSpec is a unit; you don't typically want "t1's color + t2's width".
    borders: base.borders || top.borders
      ? { ...base.borders, ...top.borders }
      : undefined,
  };
}
