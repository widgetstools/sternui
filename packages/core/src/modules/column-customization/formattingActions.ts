/**
 * Pure reducers for column-customization state mutations.
 *
 * The `FormattingToolbar` in markets-grid originally shipped its writer
 * helpers as closures that closed over a `GridStore` reference. That
 * pattern blocked two things we care about:
 *   - Unit-testing the writers in isolation (no store boilerplate).
 *   - Re-using them from other surfaces (shared-preset services, future
 *     undo/redo stacks, cross-grid workspace stores).
 *
 * This module hosts the same behaviors as PURE functions with the shape:
 *   (…args) => (prev: ColumnCustomizationState | undefined) => next
 *
 * That makes them drop-in reducers for `store.setModuleState(MODULE_ID, …)`
 * AND independently testable. Every reducer is reference-safe — it
 * returns a new `assignments` map when anything actually changes, and
 * the same reference when nothing did.
 *
 * Scope: only writers that live inside column-customization's state
 * shape (`assignments` + `valueFormatterTemplate` + `templateIds`). The
 * `saveCurrentAsTemplate` helper that additionally reads
 * column-customization and writes column-templates lives in a sibling
 * file.
 */
import type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment,
  ColumnCustomizationState,
  ValueFormatterTemplate,
} from './state';

export const COLUMN_CUSTOMIZATION_MODULE_ID = 'column-customization';

/** Where a cell-vs-header override lives inside a ColumnAssignment. */
export type TargetKind = 'cell' | 'header';

export function overrideKey(
  target: TargetKind,
): 'cellStyleOverrides' | 'headerStyleOverrides' {
  return target === 'header' ? 'headerStyleOverrides' : 'cellStyleOverrides';
}

/**
 * Drop keys whose value is `undefined`. Used after a `stripUndefined`
 * merge so "clear" patches actually remove the key rather than leaving
 * a present-but-undefined slot that downstream flatteners treat as a
 * real value.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

/**
 * Merge a partial CellStyleOverrides patch into an existing one, leaf by
 * leaf. `undefined` values in the patch clear the corresponding leaf.
 * Returns `undefined` when the merge leaves an empty object — lets
 * callers drop the whole cell/header section from an assignment.
 */
export function mergeOverrides(
  base: CellStyleOverrides | undefined,
  patch: Partial<CellStyleOverrides>,
): CellStyleOverrides | undefined {
  const next: CellStyleOverrides = { ...(base ?? {}) };

  if (patch.typography !== undefined) {
    const merged = stripUndefined({ ...(next.typography ?? {}), ...patch.typography });
    next.typography = Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (patch.colors !== undefined) {
    const merged = stripUndefined({ ...(next.colors ?? {}), ...patch.colors });
    next.colors = Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (patch.alignment !== undefined) {
    const merged = stripUndefined({ ...(next.alignment ?? {}), ...patch.alignment });
    next.alignment = Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (patch.borders !== undefined) {
    const merged = stripUndefined({ ...(next.borders ?? {}), ...patch.borders });
    next.borders = Object.keys(merged).length > 0 ? merged : undefined;
  }

  const clean = stripUndefined(
    next as unknown as Record<string, unknown>,
  ) as CellStyleOverrides;
  return Object.keys(clean).length > 0 ? clean : undefined;
}

// ─── Writers: style overrides ──────────────────────────────────────────

/**
 * Build a reducer that merges `patch` into the cell-or-header overrides
 * of every listed column. Empty `colIds` is a no-op: the reducer
 * returns the same state reference so React / Zustand subscribers
 * don't tick.
 */
export function writeOverridesReducer(
  colIds: readonly string[],
  target: TargetKind,
  patch: Partial<CellStyleOverrides>,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    // Seed a fresh state when prev is undefined so reducers work on
    // first-write paths. Callers that care about identity still get a
    // new object when there's real work to do.
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const key = overrideKey(target);
    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const merged = mergeOverrides(a[key], patch);
      const next: ColumnAssignment = { ...a };
      if (merged === undefined) delete next[key];
      else next[key] = merged;
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}

/** Typography-only convenience — merges `{ typography: patch }`. */
export function applyTypographyReducer(
  colIds: readonly string[],
  target: TargetKind,
  patch: {
    bold?: boolean | undefined;
    italic?: boolean | undefined;
    underline?: boolean | undefined;
    fontSize?: number | undefined;
  },
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return writeOverridesReducer(colIds, target, { typography: patch });
}

/** Colors-only convenience — merges `{ colors: patch }`. */
export function applyColorsReducer(
  colIds: readonly string[],
  target: TargetKind,
  patch: { text?: string | undefined; background?: string | undefined },
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return writeOverridesReducer(colIds, target, { colors: patch });
}

/** Horizontal-alignment convenience — merges `{ alignment: patch }`. */
export function applyAlignmentReducer(
  colIds: readonly string[],
  target: TargetKind,
  patch: { horizontal?: 'left' | 'center' | 'right' | undefined },
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return writeOverridesReducer(colIds, target, { alignment: patch });
}

/**
 * Write (or clear with `spec: undefined`) a border on one or more sides.
 * `sides` is free-form so callers can do one-side or all-sides in a
 * single reducer.
 */
export function applyBordersReducer(
  colIds: readonly string[],
  target: TargetKind,
  sides: ReadonlyArray<'top' | 'right' | 'bottom' | 'left'>,
  spec: BorderSpec | undefined,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  const borders: NonNullable<CellStyleOverrides['borders']> = {};
  for (const side of sides) borders[side] = spec;
  return writeOverridesReducer(colIds, target, { borders });
}

/** Clear every border side (top/right/bottom/left) in one shot. */
export function clearAllBordersReducer(
  colIds: readonly string[],
  target: TargetKind,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return applyBordersReducer(
    colIds,
    target,
    ['top', 'right', 'bottom', 'left'],
    undefined,
  );
}

// ─── Writers: formatter + templates + reset ───────────────────────────

/**
 * Set (or clear with `template: undefined`) the `valueFormatterTemplate`
 * on each listed column. Lives on the assignment root, not inside a
 * cell/header section.
 */
export function applyFormatterReducer(
  colIds: readonly string[],
  template: ValueFormatterTemplate | undefined,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const next: ColumnAssignment = { ...a };
      if (template === undefined) delete next.valueFormatterTemplate;
      else next.valueFormatterTemplate = template;
      assignments[colId] = next;
    }
    return { ...base, assignments };
  };
}

/**
 * Swap the templateIds chain on each column to exactly `[templateId]`.
 * Matches the toolbar UX where picking a template replaces (not layers
 * on top of) whatever was there before — the settings panel is the
 * surface for composing multiple templates.
 */
export function applyTemplateToColumnsReducer(
  colIds: readonly string[],
  templateId: string,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0 || !templateId) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      assignments[colId] = { ...a, templateIds: [templateId] };
    }
    return { ...base, assignments };
  };
}

/**
 * Strip a template id from every column's `templateIds` chain. Used
 * after a template is deleted from column-templates so no assignment
 * carries a dangling reference. Harmless if the id isn't referenced
 * anywhere — returns the same state reference.
 *
 * If removing the id leaves an empty chain, `templateIds` is deleted
 * entirely so the assignment falls back to typeDefaults on resolve
 * (matching the "no explicit templateIds" branch in resolveTemplates).
 */
export function removeTemplateRefFromAssignmentsReducer(
  templateId: string,
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (!templateId) return base;

    let mutated = false;
    const assignments = { ...base.assignments };
    for (const [colId, a] of Object.entries(base.assignments)) {
      if (!a.templateIds || !a.templateIds.includes(templateId)) continue;
      mutated = true;
      const next: ColumnAssignment = { ...a };
      const filtered = a.templateIds.filter((id) => id !== templateId);
      if (filtered.length === 0) delete next.templateIds;
      else next.templateIds = filtered;
      assignments[colId] = next;
    }
    return mutated ? { ...base, assignments } : base;
  };
}

/**
 * Reset each listed column to a bare `{ colId }` assignment, dropping
 * overrides, formatter, filter, grouping, and template references.
 */
export function clearAllStylesReducer(
  colIds: readonly string[],
): (prev: ColumnCustomizationState | undefined) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (colIds.length === 0) return base;

    const assignments = { ...base.assignments };
    for (const colId of colIds) {
      assignments[colId] = { colId };
    }
    return { ...base, assignments };
  };
}

/**
 * Nuke every column-customization assignment in the active profile.
 * Used by the "Clear all styles" button on the formatter toolbar +
 * popped panel, which now wipes the whole profile's style state rather
 * than just the selected columns.
 *
 * What it does clear:
 *   - All `assignments[*]` — every column's cellStyleOverrides,
 *     headerStyleOverrides, valueFormatterTemplate, templateIds,
 *     filter, rowGrouping, and any structural overrides.
 *
 * What it preserves:
 *   - The column-templates module (saved templates survive — users
 *     expect explicit Save/Delete to govern template lifecycle).
 *   - typeDefaults on the column-templates side (cross-module, not
 *     touched here).
 *   - Other module states (conditional-styling, calculated-columns,
 *     column-groups, etc.). If the user wants a full profile reset,
 *     that's a separate "reset profile" action.
 *
 * Returns a fresh `{ assignments: {} }`. Profile-level auto-save picks
 * it up through the normal module-state change pipeline.
 */
export function clearAllStylesInProfileReducer(): (
  prev: ColumnCustomizationState | undefined,
) => ColumnCustomizationState {
  return (prev) => {
    const base: ColumnCustomizationState = prev ?? { assignments: {} };
    if (Object.keys(base.assignments).length === 0) return base;
    return { ...base, assignments: {} };
  };
}
