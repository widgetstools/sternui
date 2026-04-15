import type {
  CellStyleOverrides,
  ValueFormatterTemplate,
} from '../column-customization/state';

/**
 * A reusable bundle of per-column overrides. Templates are referenced from
 * `ColumnAssignment.templateIds[]`; the resolver in `./resolveTemplates.ts`
 * folds the chain into a composite assignment that the column-customization
 * walker emits.
 *
 * Field semantics (see `resolveTemplates.ts` for the merge rules):
 *  - `cellStyleOverrides` / `headerStyleOverrides` merge per-field across the chain.
 *  - Every other field is last-writer-wins.
 *  - `cellEditorParams` is opaque — a later template's params object replaces
 *    the earlier one wholesale (no deep merge).
 *  - `cellEditorName` / `cellRendererName` are AG-Grid component-registry keys.
 *    Component registration is the consumer's responsibility (e.g. via
 *    `GridOptions.components`).
 */
export interface ColumnTemplate {
  readonly id: string;
  name: string;
  description?: string;
  // Styling
  cellStyleOverrides?: CellStyleOverrides;
  headerStyleOverrides?: CellStyleOverrides;
  // Formatting
  valueFormatterTemplate?: ValueFormatterTemplate;
  // Behavior flags
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;
  // Cell editor + renderer (resolved via AG-Grid's component registry by name)
  cellEditorName?: string;
  cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string;
  // Audit (kept for forward-UX needs in sub-project #4)
  createdAt: number;
  updatedAt: number;
}

/**
 * AG-Grid's `cellDataType` vocabulary that `typeDefaults` keys against. We
 * deliberately don't include AG-Grid's `'object'` / custom types — typeDefaults
 * is meant for the four broad bucket types users want to style consistently
 * (e.g., "every numeric column right-aligns").
 */
export type ColumnDataType = 'numeric' | 'date' | 'string' | 'boolean';

export interface ColumnTemplatesState {
  /** templateId → ColumnTemplate. */
  templates: Record<string, ColumnTemplate>;
  /** dataType → templateId. The resolver applies the matching template as the
   *  bottom-of-chain default when the column's assignment has NO explicit
   *  `templateIds` field. An empty `templateIds: []` opts the column out of
   *  this fallback. */
  typeDefaults: Partial<Record<ColumnDataType, string>>;
}

export const INITIAL_COLUMN_TEMPLATES: ColumnTemplatesState = {
  templates: {},
  typeDefaults: {},
};
