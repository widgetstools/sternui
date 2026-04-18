import type { ColDef, IAggFuncParams } from 'ag-grid-community';
import type { AnyColDef, GridContext, Module } from '../../core/types';
import { CssInjector } from '../../core/CssInjector';
import { ExpressionEngine } from '@grid-customizer/core';
import {
  INITIAL_COLUMN_CUSTOMIZATION,
  migrateFromLegacy,
  type BorderSpec,
  type CellStyleOverrides,
  type ColumnAssignment,
  type ColumnCustomizationState,
  type LegacyColumnCustomizationState,
  type RowGroupingConfig,
} from './state';
import { valueFormatterFromTemplate } from './adapters/valueFormatterFromTemplate';
import { excelFormatColorResolver } from './adapters/excelFormatter';
import { resolveTemplates } from '../column-templates/resolveTemplates';
import type { ColumnTemplatesState, ColumnDataType } from '../column-templates/state';
import {
  ColumnSettingsEditor,
  ColumnSettingsList,
  ColumnSettingsPanel,
} from './ColumnSettingsPanel';

/**
 * Narrow AG-Grid's `cellDataType` (boolean | string) to our `ColumnDataType`
 * union. AG-Grid supports `true` for auto-infer plus custom string types like
 * `'object'`; the typeDefaults registry only keys on the four known domain
 * types, so anything else is reported as `undefined` (no typeDefault applies).
 */
function cellDataTypeToDomain(value: unknown): ColumnDataType | undefined {
  if (value === 'numeric' || value === 'date' || value === 'string' || value === 'boolean') {
    return value;
  }
  return undefined;
}

// ─── CSS generation helpers ─────────────────────────────────────────────────

/**
 * Convert structured CellStyleOverrides to CSS declaration text (non-border
 * properties only). Used to build the injected `.gc-col-c-{colId}` rules.
 */
function styleOverridesToCSS(o: CellStyleOverrides): string {
  const parts: string[] = [];
  const t = o.typography;
  if (t) {
    if (t.bold) parts.push('font-weight: bold');
    if (t.italic) parts.push('font-style: italic');
    if (t.underline) parts.push('text-decoration: underline');
    if (t.fontSize != null) parts.push(`font-size: ${t.fontSize}px`);
  }
  const c = o.colors;
  if (c) {
    if (c.text !== undefined) parts.push(`color: ${c.text}`);
    if (c.background !== undefined) parts.push(`background-color: ${c.background}`);
  }
  const a = o.alignment;
  if (a) {
    if (a.horizontal !== undefined) parts.push(`text-align: ${a.horizontal}`);
    if (a.vertical !== undefined) parts.push(`vertical-align: ${a.vertical}`);
  }
  // Borders NOT included — handled via ::after overlay in borderOverlayFromOverrides().
  return parts.join('; ');
}

/**
 * Build CSS for a ::after pseudo-element that renders per-side borders
 * using **real CSS borders** on the pseudo-element (one per side).
 *
 * Returns empty string if no borders are set.
 *
 * Previous implementation used `inset box-shadow` — correct for solid
 * edges but CSS box-shadow silently drops the `style` value (dashed /
 * dotted never render). Moving to real borders on the `::after` with
 * `box-sizing: border-box` draws the lines at the cell edges exactly
 * like the inset shadow did, while honouring every CSS border-style.
 *
 * IMPORTANT: do NOT emit `position: relative` on the target. AG-Grid cells
 * are already `position: relative` by default and rows are `position:
 * absolute` via `.ag-row-position-absolute` (virtual-scroll transform).
 * Either makes a valid positioned ancestor for the `::after`.
 *
 * Emitting `position: relative` here — especially against a column-header
 * cell via `.gc-hdr-c-{colId}` — overrode AG-Grid's own `position: absolute`
 * on header cells (which is how AG-Grid pins columns at their computed
 * left/width inside the virtual header row). Result: the column's header
 * lost its layout, the column disappeared from the displayed set, and group
 * headers spanning that column rendered with a gap.
 */
function borderOverlayFromOverrides(selector: string, o: CellStyleOverrides): string {
  const b = o.borders;
  if (!b) return '';
  const parts: string[] = [];
  const sideMap: Record<'top' | 'right' | 'bottom' | 'left', (spec: BorderSpec) => string> = {
    top:    (s) => `border-top: ${s.width}px ${s.style} ${s.color}`,
    right:  (s) => `border-right: ${s.width}px ${s.style} ${s.color}`,
    bottom: (s) => `border-bottom: ${s.width}px ${s.style} ${s.color}`,
    left:   (s) => `border-left: ${s.width}px ${s.style} ${s.color}`,
  };
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const spec = b[side];
    if (spec && spec.width > 0) parts.push(sideMap[side](spec));
  }
  if (parts.length === 0) return '';
  // box-sizing: border-box anchors each border INSIDE the pseudo-element's
  // inset:0 rect, matching the previous box-shadow overlay footprint.
  return `${selector}::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-sizing: border-box; z-index: 1; ${parts.join('; ')}; }`;
}

/**
 * Header alignment needs special treatment — AG-Grid header cells use flexbox,
 * so `text-align` doesn't work. Map to `justify-content` on the label container.
 */
function headerAlignCSS(selector: string, horizontal: string): string {
  const map: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  };
  const jc = map[horizontal] ?? horizontal;
  return `${selector} .ag-header-cell-label { justify-content: ${jc}; }`;
}

// ─── Per-grid resources ─────────────────────────────────────────────────────

interface GridResources {
  cellInjector: CssInjector;
  headerInjector: CssInjector;
}

const _gridResources = new Map<string, GridResources>();

function getOrCreate(gridId: string): GridResources {
  let r = _gridResources.get(gridId);
  if (!r) {
    r = {
      cellInjector: new CssInjector(gridId, 'column-customization-cells'),
      headerInjector: new CssInjector(gridId, 'column-customization-headers'),
    };
    _gridResources.set(gridId, r);
  }
  return r;
}

/**
 * Re-inject all CSS rules for every assigned column. Called on every
 * transformColumnDefs pass (which runs whenever state changes). The
 * CssInjector is keyed by colId, so re-applying just replaces the old text.
 */
function reinjectCSS(
  res: GridResources,
  assignments: Record<string, ColumnAssignment>,
  templatesState: ColumnTemplatesState,
  defs: AnyColDef[],
): void {
  res.cellInjector.clear();
  res.headerInjector.clear();

  // Build a colId → cellDataType map from the base defs so we can pass
  // the right dataType to `resolveTemplates` for type-default merging.
  // Columns not found in defs (virtual columns live in a separate
  // module's transform pass and haven't been appended yet when this
  // runs) get `undefined` — resolveTemplates gracefully handles that
  // by skipping type-default fallback.
  const dataTypeByColId = new Map<string, unknown>();
  const collectDataTypes = (list: AnyColDef[]) => {
    for (const def of list) {
      if ('children' in def && Array.isArray(def.children)) {
        collectDataTypes(def.children);
        continue;
      }
      const colDef = def as ColDef;
      const colId = colDef.colId ?? colDef.field;
      if (colId) dataTypeByColId.set(colId, colDef.cellDataType);
    }
  };
  collectDataTypes(defs);

  // Walk every assignment directly — the old walker iterated `defs`
  // which means virtual / calculated columns (appended by a separate
  // module at a later pipeline step) never got their cellStyleOverrides
  // injected. Iterating assignments keyed by colId gives every row in
  // the customization state a CSS pass, regardless of whether its
  // colId belongs to a base column or a virtual one.
  for (const colId of Object.keys(assignments)) {
    const a = assignments[colId];
    if (!a) continue;
    const resolved = resolveTemplates(
      a,
      templatesState,
      cellDataTypeToDomain(dataTypeByColId.get(colId)),
    );
    const cellCls = `gc-col-c-${colId}`;
    const hdrCls = `gc-hdr-c-${colId}`;

    // Cell styles
    if (resolved.cellStyleOverrides) {
      const css = styleOverridesToCSS(resolved.cellStyleOverrides);
      if (css) res.cellInjector.addRule(`cell-${colId}`, `.${cellCls} { ${css} }`);
      // Border overlay
      const border = borderOverlayFromOverrides(`.${cellCls}`, resolved.cellStyleOverrides);
      if (border) res.cellInjector.addRule(`cell-bo-${colId}`, border);
    }

    // Header styles
    if (resolved.headerStyleOverrides) {
      const css = styleOverridesToCSS(resolved.headerStyleOverrides);
      if (css) res.headerInjector.addRule(`hdr-${colId}`, `.${hdrCls} { ${css} }`);
      // Border overlay for headers
      const border = borderOverlayFromOverrides(`.${hdrCls}`, resolved.headerStyleOverrides);
      if (border) res.headerInjector.addRule(`hdr-bo-${colId}`, border);
    }

    // Header alignment — follows the cell's alignment by default so the
    // user gets the expected "I centered the cell, the header centered
    // too" UX. Explicit header override always wins (user can still
    // pick Header target in the toolbar and left-align just the
    // header). Handled separately from the rest of headerStyleOverrides
    // so it fires even when the header has no other overrides (e.g.
    // only the cell was styled).
    const effectiveHeaderAlign =
      resolved.headerStyleOverrides?.alignment?.horizontal ??
      resolved.cellStyleOverrides?.alignment?.horizontal;
    if (effectiveHeaderAlign) {
      res.headerInjector.addRule(
        `hdr-align-${colId}`,
        headerAlignCSS(`.${hdrCls}`, effectiveHeaderAlign),
      );
    }
  }
}

// ─── Filter config → AG-Grid filter/filterParams/floatingFilter ────────────

/**
 * Compose AG-Grid's `filter`, `filterParams`, and `floatingFilter` fields on
 * `merged` from our `ColumnFilterConfig`. Mutates `merged` in place.
 *
 * Precedence rules:
 *   - `enabled === false` → filter disabled (false)
 *   - otherwise, `kind` wins; if not set, inherit the existing `filter`
 *   - `floatingFilter` is applied unconditionally when defined
 *   - Filter-specific params (setFilterOptions, multiFilters, buttons,
 *     debounceMs, closeOnApply) are composed into a plain `filterParams`.
 */
function applyFilterConfigToColDef(
  merged: ColDef,
  cfg: NonNullable<ColumnAssignment['filter']>,
): void {
  if (cfg.enabled === false) {
    merged.filter = false;
    merged.filterParams = undefined;
    if (cfg.floatingFilter !== undefined) {
      merged.floatingFilter = cfg.floatingFilter;
    }
    return;
  }

  if (cfg.kind) {
    merged.filter = cfg.kind;
  }

  if (cfg.floatingFilter !== undefined) {
    merged.floatingFilter = cfg.floatingFilter;
  }

  // Build filterParams only if the user specified any — leaving it undefined
  // lets AG-Grid apply its per-filter defaults.
  const params: Record<string, unknown> = {};

  if (cfg.buttons && cfg.buttons.length > 0) params.buttons = cfg.buttons;
  if (cfg.closeOnApply !== undefined) params.closeOnApply = cfg.closeOnApply;
  if (cfg.debounceMs !== undefined) params.debounceMs = cfg.debounceMs;

  if (cfg.kind === 'agSetColumnFilter' && cfg.setFilterOptions) {
    const s = cfg.setFilterOptions;
    if (s.suppressMiniFilter !== undefined) params.suppressMiniFilter = s.suppressMiniFilter;
    if (s.suppressSelectAll !== undefined) params.suppressSelectAll = s.suppressSelectAll;
    if (s.suppressSorting !== undefined) params.suppressSorting = s.suppressSorting;
    if (s.excelMode !== undefined) params.excelMode = s.excelMode;
    if (s.defaultToNothingSelected !== undefined) params.defaultToNothingSelected = s.defaultToNothingSelected;
  }

  if (cfg.kind === 'agMultiColumnFilter' && cfg.multiFilters && cfg.multiFilters.length > 0) {
    params.filters = cfg.multiFilters.map((mf) => {
      const entry: Record<string, unknown> = { filter: mf.filter };
      if (mf.display) entry.display = mf.display;
      if (mf.title) entry.title = mf.title;
      return entry;
    });
  }

  if (Object.keys(params).length > 0) {
    merged.filterParams = { ...(merged.filterParams as Record<string, unknown> | undefined), ...params };
  }
}

// ─── Row-grouping / aggregation / pivot ─────────────────────────────────────

/**
 * Shared ExpressionEngine for compiling custom aggregation formulas.
 *
 * A single engine instance is fine even across grids — it only holds the
 * function registry, not any per-grid state. Created lazily so tests that
 * don't touch custom agg functions don't pay the construction cost.
 */
let _sharedAggEngine: ExpressionEngine | null = null;
function getAggEngine(): ExpressionEngine {
  if (_sharedAggEngine == null) _sharedAggEngine = new ExpressionEngine();
  return _sharedAggEngine;
}

/**
 * Build a custom aggregation function from a formula string. The aggregate
 * values array is exposed as the column reference `[value]`; formulas like
 * `SUM([value])`, `AVG([value])`, `SUM([value]) * 1.1`, `MAX([value]) -
 * MIN([value])`, etc. work out of the box because the underlying functions
 * mark themselves as column-aggregating and pull the array from `ctx.allRows`.
 *
 * Returns `null` when the expression fails to parse — the column falls back
 * to no aggregation in that case (safer than crashing the entire grid).
 */
function buildCustomAggFn(expression: string): ((params: IAggFuncParams) => unknown) | null {
  const engine = getAggEngine();
  let compiled;
  try {
    compiled = engine.parse(expression);
  } catch (err) {
    console.warn(
      '[core-v2] column-customization',
      `custom aggregation expression failed to parse: ${expression}`,
      err,
    );
    return null;
  }
  return (params: IAggFuncParams) => {
    const values = params.values ?? [];
    // Expose each aggregate value as { value } so `[value]` reads back the
    // full column array via the engine's aggregateColumnRefs path.
    const allRows = values.map((v: unknown) => ({ value: v }));
    try {
      return engine.evaluate(compiled, {
        x: undefined,
        value: undefined,
        data: {},
        columns: {},
        allRows,
      });
    } catch (err) {
      console.warn(
        '[core-v2] column-customization',
        `custom aggregation runtime error: ${expression}`,
        err,
      );
      return null;
    }
  };
}

/**
 * Compose AG-Grid's row-grouping / aggregation / pivot ColDef fields from
 * our `RowGroupingConfig`. Mutates `merged` in place.
 *
 * Only defined fields overwrite — the config is strictly additive on top of
 * the base ColDef's own settings. The `'custom'` aggFunc compiles the paired
 * `customAggExpression` through the expression engine and hands AG-Grid the
 * resulting function.
 */
function applyRowGroupingConfigToColDef(
  merged: ColDef,
  cfg: RowGroupingConfig,
): void {
  if (cfg.enableRowGroup !== undefined) merged.enableRowGroup = cfg.enableRowGroup;
  if (cfg.enableValue !== undefined) merged.enableValue = cfg.enableValue;
  if (cfg.enablePivot !== undefined) merged.enablePivot = cfg.enablePivot;
  if (cfg.rowGroup !== undefined) merged.rowGroup = cfg.rowGroup;
  if (cfg.rowGroupIndex !== undefined) merged.rowGroupIndex = cfg.rowGroupIndex;
  if (cfg.pivot !== undefined) merged.pivot = cfg.pivot;
  if (cfg.pivotIndex !== undefined) merged.pivotIndex = cfg.pivotIndex;
  if (cfg.allowedAggFuncs !== undefined) merged.allowedAggFuncs = cfg.allowedAggFuncs;

  if (cfg.aggFunc === 'custom') {
    if (cfg.customAggExpression && cfg.customAggExpression.trim()) {
      const fn = buildCustomAggFn(cfg.customAggExpression);
      if (fn) merged.aggFunc = fn;
    }
    // If the expression is empty or fails, leave aggFunc as-is so the grid
    // doesn't silently drop aggregation when the user is still typing.
  } else if (cfg.aggFunc !== undefined) {
    merged.aggFunc = cfg.aggFunc;
  }
}

// ─── Walker: emit cellClass/headerClass instead of cellStyle/headerStyle ────

function applyAssignments(
  defs: AnyColDef[],
  assignments: Record<string, ColumnAssignment>,
  templatesState: ColumnTemplatesState,
): AnyColDef[] {
  return defs.map((def) => {
    if ('children' in def && Array.isArray(def.children)) {
      const next = applyAssignments(def.children, assignments, templatesState);
      const childrenUnchanged =
        next.length === def.children.length &&
        next.every((c, i) => c === def.children[i]);
      return childrenUnchanged ? def : { ...def, children: next };
    }

    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;
    const a = assignments[colId];
    if (!a) return def;

    const resolved = resolveTemplates(a, templatesState, cellDataTypeToDomain(colDef.cellDataType));

    const merged: ColDef = { ...colDef };

    // Structural overrides (non-styling — these still go on the ColDef)
    if (resolved.headerName !== undefined) merged.headerName = resolved.headerName;
    if (resolved.headerTooltip !== undefined) merged.headerTooltip = resolved.headerTooltip;
    if (resolved.initialWidth !== undefined) merged.initialWidth = resolved.initialWidth;
    if (resolved.initialHide !== undefined) merged.initialHide = resolved.initialHide;
    if (resolved.initialPinned !== undefined) merged.initialPinned = resolved.initialPinned;
    if (resolved.sortable !== undefined) merged.sortable = resolved.sortable;
    if (resolved.filterable !== undefined) merged.filter = resolved.filterable;
    if (resolved.resizable !== undefined) merged.resizable = resolved.resizable;

    // Rich filter config — takes precedence over the simple `filterable`
    // boolean whenever `filter.kind` or `filter.enabled === false` is set.
    if (resolved.filter !== undefined) {
      applyFilterConfigToColDef(merged, resolved.filter);
    }

    // Row-grouping / aggregation / pivot overrides.
    if (resolved.rowGrouping !== undefined) {
      applyRowGroupingConfigToColDef(merged, resolved.rowGrouping);
    }
    if (resolved.valueFormatterTemplate !== undefined) {
      merged.valueFormatter = valueFormatterFromTemplate(resolved.valueFormatterTemplate);

      // Excel color tags — `[Red]`, `[Green]`, etc. in the format string —
      // are parsed by SSF but only affect the returned text's semantics,
      // not its color (SSF returns plain strings; AG-Grid renders cells as
      // plain text). Emit a `cellStyle` function that applies the color
      // based on the value's sign / section, so conditional colors like
      // `[Green]$#,##0.00;[Red]-$#,##0.00` actually paint.
      //
      // Only engages when the template is `kind: 'excelFormat'` and the
      // format contains at least one color tag — otherwise we don't touch
      // cellStyle at all (leaves the existing CSS-class path untouched).
      if (resolved.valueFormatterTemplate.kind === 'excelFormat') {
        const colorResolver = excelFormatColorResolver(resolved.valueFormatterTemplate.format);
        if (colorResolver) {
          merged.cellStyle = (params) => {
            const color = colorResolver(params.value);
            return color ? { color } : null;
          };
        }
      }
    }
    if (resolved.cellEditorName !== undefined) merged.cellEditor = resolved.cellEditorName;
    if (resolved.cellEditorParams !== undefined) merged.cellEditorParams = resolved.cellEditorParams;
    if (resolved.cellRendererName !== undefined) merged.cellRenderer = resolved.cellRendererName;

    // Styling via CSS class injection (NOT cellStyle/headerStyle).
    // The actual CSS is injected by reinjectCSS() into a <style> tag.
    // AG-Grid applies the class to every cell in this column.
    if (resolved.cellStyleOverrides !== undefined) {
      const cls = `gc-col-c-${colId}`;
      const existing = colDef.cellClass;
      if (Array.isArray(existing)) {
        merged.cellClass = [...existing, cls];
      } else if (typeof existing === 'string') {
        merged.cellClass = [existing, cls];
      } else {
        merged.cellClass = cls;
      }
    }
    // Attach the header class whenever we'll be emitting a header rule —
    // either the header has its own overrides OR the cell has alignment
    // that the header should inherit by default (see reinjectCSS's
    // `effectiveHeaderAlign` fallback). Without this, aligning just the
    // cell would inject a header-align rule against a class that's
    // never attached to the header DOM, so the align wouldn't paint.
    const needsHeaderClass =
      resolved.headerStyleOverrides !== undefined ||
      resolved.cellStyleOverrides?.alignment?.horizontal !== undefined;
    if (needsHeaderClass) {
      const cls = `gc-hdr-c-${colId}`;
      const existing = colDef.headerClass;
      if (Array.isArray(existing)) {
        merged.headerClass = [...existing, cls];
      } else if (typeof existing === 'string') {
        merged.headerClass = [existing, cls];
      } else {
        merged.headerClass = cls;
      }
    }

    return merged;
  });
}

// ─── Module definition ──────────────────────────────────────────────────────

export const columnCustomizationModule: Module<ColumnCustomizationState> = {
  id: 'column-customization',
  // Display label shown in the settings-sheet header dropdown — the
  // panel itself is a per-column master-detail editor (see
  // `ColumnSettingsPanel.tsx`). Internal id stays `column-customization`
  // for back-compat with persisted profiles.
  name: 'Column Settings',
  code: '04',
  schemaVersion: 5,
  dependencies: ['column-templates'],
  priority: 10,

  getInitialState: () => ({ ...INITIAL_COLUMN_CUSTOMIZATION }),

  migrate(raw, fromVersion) {
    // v4 introduces optional `filter` per-assignment.
    // v5 introduces optional `rowGrouping` per-assignment.
    // Both are additive, so v1/v2/v3/v4 snapshots roundtrip unchanged.
    if (fromVersion === 1 || fromVersion === 2 || fromVersion === 3 || fromVersion === 4) {
      if (!raw || typeof raw !== 'object') {
        console.warn(
          `[core-v2] column-customization`,
          `malformed v${fromVersion} snapshot (not an object); falling back to initial state.`,
        );
        return { ...INITIAL_COLUMN_CUSTOMIZATION };
      }
      return raw as ColumnCustomizationState;
    }
    console.warn(
      `[core-v2] column-customization`,
      `cannot migrate from schemaVersion ${fromVersion}; falling back to initial state.`,
    );
    return { ...INITIAL_COLUMN_CUSTOMIZATION };
  },

  onRegister(ctx) {
    // Eagerly create the CssInjector so the first transformColumnDefs has it.
    getOrCreate(ctx.gridId);
  },

  onGridDestroy(ctx) {
    const r = _gridResources.get(ctx.gridId);
    if (r) {
      r.cellInjector.destroy();
      r.headerInjector.destroy();
      _gridResources.delete(ctx.gridId);
    }
  },

  transformColumnDefs(defs, state, ctx) {
    if (Object.keys(state.assignments).length === 0) return defs;
    const templatesState = ctx.getModuleState<ColumnTemplatesState>('column-templates');

    // Inject CSS rules into <style> tags for every assigned column.
    const res = getOrCreate(ctx.gridId);
    reinjectCSS(res, state.assignments, templatesState, defs);

    // Walk defs and emit cellClass/headerClass (NOT cellStyle/headerStyle).
    return applyAssignments(defs, state.assignments, templatesState);
  },

  serialize: (state) => state,

  deserialize: (data) => {
    if (!data || typeof data !== 'object') {
      return { ...INITIAL_COLUMN_CUSTOMIZATION };
    }
    const raw = data as Record<string, unknown>;
    if ('overrides' in raw && !('assignments' in raw)) {
      return migrateFromLegacy(raw as unknown as LegacyColumnCustomizationState);
    }
    const { templates: _drop, ...rest } = raw as { templates?: unknown };
    void _drop;
    return {
      ...INITIAL_COLUMN_CUSTOMIZATION,
      ...(rest as Partial<ColumnCustomizationState>),
    };
  },

  // Master-detail Cockpit panel — ListPane on the left lists every grid
  // column (including virtual / calculated cols), EditorPane on the right
  // edits the selected column's assignment with bands for HEADER / LAYOUT
  // / TEMPLATES / CELL STYLE / HEADER STYLE / VALUE FORMAT. The legacy
  // flat `SettingsPanel` is kept as a fallback for hosts that only
  // support the flat shape.
  ListPane: ColumnSettingsList,
  EditorPane: ColumnSettingsEditor,
  SettingsPanel: ColumnSettingsPanel,
};

export type { ColumnAssignment, ColumnCustomizationState };
export { INITIAL_COLUMN_CUSTOMIZATION };
