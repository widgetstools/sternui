/**
 * Pure helpers for the FormattingToolbar's "Save current as template…"
 * action.
 *
 * The v2 toolbar shipped one monolithic helper that:
 *   1. Read the column-customization state for the first selected colId.
 *   2. Read the column-templates state.
 *   3. Asked the grid API for the column's cellDataType.
 *   4. Called `resolveTemplates` to fold typeDefaults + referenced
 *      templates + overrides into an effective assignment.
 *   5. Decided whether there was anything worth saving.
 *   6. Minted a `tpl_<ts>_<rand>` id + assembled a `ColumnTemplate`.
 *   7. Dispatched a setModuleState into column-templates to persist it.
 *
 * Option A of the phase-5 plan splits the helper into two PURE pieces:
 *   - `snapshotTemplate()` owns steps 1–6 (decide what the template is).
 *   - `addTemplateReducer()` owns step 7 (add it to column-templates).
 *
 * The toolbar (or any other surface — future undo stack, shared-preset
 * service) reads the two module states once, calls `snapshotTemplate`,
 * then dispatches `addTemplateReducer(tpl)` into column-templates.
 *
 * Both functions are fully testable in isolation. `snapshotTemplate`
 * accepts an optional `deps` bag so tests can pin the generated id +
 * timestamps without touching `Date.now()` / `Math.random()`.
 */
import type {
  ColumnAssignment,
  ColumnCustomizationState,
} from '../column-customization/state';
import type {
  ColumnDataType,
  ColumnTemplate,
  ColumnTemplatesState,
} from './state';
import { resolveTemplates } from './resolveTemplates';

export interface SnapshotTemplateDeps {
  /** Override for `Date.now()`. Default uses real wall-clock. */
  readonly now?: () => number;
  /** Override for the id suffix generator (the 4-char random part).
   *  Default uses `Math.random().toString(36).slice(2, 6)`. */
  readonly idSuffix?: () => string;
}

/**
 * Compute the ColumnTemplate that `Save as template` would persist,
 * given the current column-customization + column-templates states and
 * the selected column's dataType. Returns `undefined` when:
 *
 *   - `colId` is empty / `name` is empty or whitespace,
 *   - the column has no assignment yet (nothing to capture),
 *   - the resolved assignment has NO cellStyle, NO headerStyle, and
 *     NO valueFormatterTemplate (nothing to save).
 *
 * On success returns a fully-formed ColumnTemplate (with a minted id)
 * ready to drop into `column-templates.templates[id]` via the sibling
 * `addTemplateReducer`.
 */
export function snapshotTemplate(
  cust: ColumnCustomizationState | undefined,
  tpls: ColumnTemplatesState | undefined,
  colId: string,
  name: string,
  dataType: ColumnDataType | undefined,
  deps?: SnapshotTemplateDeps,
): ColumnTemplate | undefined {
  if (!colId || !name.trim()) return undefined;

  const assignment: ColumnAssignment | undefined = cust?.assignments?.[colId];
  if (!assignment) return undefined;

  const templatesState: ColumnTemplatesState = tpls ?? {
    templates: {},
    typeDefaults: {},
  };

  // Resolve so the saved template captures the EFFECTIVE appearance
  // (templates + typeDefault + this column's own overrides) — matches
  // v1 / v2 behavior.
  const resolved = resolveTemplates(assignment, templatesState, dataType);

  const hasCell =
    !!resolved.cellStyleOverrides &&
    Object.keys(resolved.cellStyleOverrides).length > 0;
  const hasHeader =
    !!resolved.headerStyleOverrides &&
    Object.keys(resolved.headerStyleOverrides).length > 0;
  const vft = resolved.valueFormatterTemplate;

  if (!hasCell && !hasHeader && !vft) return undefined;

  const now = (deps?.now ?? Date.now)();
  const suffix =
    (deps?.idSuffix ?? (() => Math.random().toString(36).slice(2, 6)))();
  const id = `tpl_${now}_${suffix}`;

  const tpl: ColumnTemplate = {
    id,
    name: name.trim(),
    description: `Saved from ${colId}`,
    createdAt: now,
    updatedAt: now,
    ...(hasCell ? { cellStyleOverrides: resolved.cellStyleOverrides } : {}),
    ...(hasHeader ? { headerStyleOverrides: resolved.headerStyleOverrides } : {}),
    ...(vft ? { valueFormatterTemplate: vft } : {}),
  };
  return tpl;
}

/**
 * Reducer that adds a newly-snapshotted template to
 * `ColumnTemplatesState.templates`. If the id already exists it's
 * replaced (callers should check for collisions before dispatching —
 * `snapshotTemplate`'s id is timestamp + random so collisions are
 * vanishingly rare in practice).
 *
 * Returns a reducer shape matching `store.setModuleState(id, reducer)`.
 */
export function addTemplateReducer(
  tpl: ColumnTemplate,
): (prev: ColumnTemplatesState | undefined) => ColumnTemplatesState {
  return (prev) => {
    const base: ColumnTemplatesState = prev ?? {
      templates: {},
      typeDefaults: {},
    };
    return {
      ...base,
      templates: { ...base.templates, [tpl.id]: tpl },
    };
  };
}

/**
 * Delete a template from `state.templates`. Any `typeDefaults[...]`
 * entries pointing at the removed id are also cleared (otherwise the
 * resolver would leave a dangling type-default reference — functionally
 * equivalent to the id being missing thanks to resolveTemplates'
 * silent-skip of unknown ids, but a clean state read is easier to
 * reason about).
 *
 * Column `assignments[*].templateIds[]` are NOT rewritten here — that
 * lives in column-customization. Callers that want full cleanup should
 * dispatch `removeTemplateRefFromAssignmentsReducer(id)` to the
 * column-customization store in the same tick.
 */
export function removeTemplateReducer(
  templateId: string,
): (prev: ColumnTemplatesState | undefined) => ColumnTemplatesState {
  return (prev) => {
    const base: ColumnTemplatesState = prev ?? {
      templates: {},
      typeDefaults: {},
    };
    if (!base.templates[templateId]) return base;

    const { [templateId]: _removed, ...remaining } = base.templates;
    // Clear any type-default that pointed at the removed id.
    const typeDefaults = { ...base.typeDefaults };
    for (const [dataType, id] of Object.entries(typeDefaults)) {
      if (id === templateId) delete typeDefaults[dataType as keyof typeof typeDefaults];
    }
    return { ...base, templates: remaining, typeDefaults };
  };
}
