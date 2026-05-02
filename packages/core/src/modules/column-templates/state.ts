/**
 * A reusable bundle of per-column overrides. Templates are referenced from
 * `ColumnAssignment.templateIds[]`; `resolveTemplates` folds the chain into
 * a composite assignment the column-customization walker emits.
 *
 * Field semantics:
 *  - `cellStyleOverrides` / `headerStyleOverrides` merge per-field across the chain.
 *  - Every other field is last-writer-wins.
 *  - `cellEditorParams` is opaque — a later template's params object replaces
 *    the earlier one wholesale (no deep merge).
 *  - `cellEditorName` / `cellRendererName` are AG-Grid component-registry keys.
 */
import type {
  CellStyleOverrides,
  ColumnDataType,
  ValueFormatterTemplate,
} from '../../colDef';

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
  editable?: boolean;
  // Cell editor + renderer (component registry keys)
  cellEditorName?: string;
  cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string;
  // Audit
  createdAt: number;
  updatedAt: number;
}

export interface ColumnTemplatesState {
  /** templateId → ColumnTemplate. */
  templates: Record<string, ColumnTemplate>;
  /** dataType → templateId. Applied as the bottom-of-chain fallback when the
   *  assignment has NO explicit `templateIds` field. An empty `templateIds: []`
   *  opts the column out of this fallback. */
  typeDefaults: Partial<Record<ColumnDataType, string>>;
}

// Deep-frozen so accidental mutation of the shared reference throws in strict
// mode instead of silently corrupting subsequent reads. Callers that need a
// mutable copy must replace nested objects, not just spread the outer.
export const INITIAL_COLUMN_TEMPLATES: ColumnTemplatesState = Object.freeze({
  templates: Object.freeze({}) as Record<string, ColumnTemplate>,
  typeDefaults: Object.freeze({}) as Partial<Record<ColumnDataType, string>>,
}) as ColumnTemplatesState;

export type { ColumnDataType } from '../../colDef';
