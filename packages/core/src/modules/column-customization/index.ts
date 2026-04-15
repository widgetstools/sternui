import type { ColDef, ColGroupDef } from 'ag-grid-community';
import type { GridCustomizerModule } from '../../types/module';
import type { GridContext, ModuleContext, CellStyleProperties, ColumnTemplate, ColumnAssignment } from '../../types/common';
import { ExpressionEngine } from '../../expression';
import { INITIAL_COLUMN_CUSTOMIZATION, migrateFromLegacy, type ColumnCustomizationState } from './state';
import type { ColumnTemplatesState } from '../column-templates/state';
import { ColumnCustomizationPanel } from './ColumnCustomizationPanel';

// ─── CSS Generation ──────────────────────────────────────────────────────────

/**
 * Build CSS for a ::after pseudo-element that renders per-side borders.
 * Uses ::after overlay so it never conflicts with AG-Grid's box-shadow selection.
 */
function borderOverlayCSS(selector: string, style: CellStyleProperties): string {
  const shadows: string[] = [];
  const sideMap = {
    Top:    (w: string, c: string) => `inset 0 ${w} 0 0 ${c}`,
    Right:  (w: string, c: string) => `inset -${w} 0 0 0 ${c}`,
    Bottom: (w: string, c: string) => `inset 0 -${w} 0 0 ${c}`,
    Left:   (w: string, c: string) => `inset ${w} 0 0 0 ${c}`,
  };
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const width = style[`border${side}Width` as keyof CellStyleProperties] as string | undefined;
    const color = (style[`border${side}Color` as keyof CellStyleProperties] as string) ?? 'currentColor';
    if (width && width !== '0px' && width !== 'none') {
      shadows.push(sideMap[side](width, color));
    }
  }
  if (shadows.length === 0) return '';
  // ::after overlay renders borders inside the cell via inset box-shadow.
  // Uses inset: 0 (not -1px) because AG-Grid cells have overflow: hidden
  // which would clip a negatively-inset pseudo-element.
  // pointer-events: none so AG-Grid selection works through it.
  return `${selector}::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: ${shadows.join(', ')}; z-index: 1; }`;
}

function stylePropsToCSS(style: CellStyleProperties): string {
  const parts: string[] = [];
  if (style.backgroundColor) parts.push(`background-color: ${style.backgroundColor}`);
  if (style.color) parts.push(`color: ${style.color}`);
  if (style.fontWeight) parts.push(`font-weight: ${style.fontWeight}`);
  if (style.fontStyle) parts.push(`font-style: ${style.fontStyle}`);
  if (style.fontSize) parts.push(`font-size: ${style.fontSize}`);
  if (style.fontFamily) parts.push(`font-family: ${style.fontFamily}`);
  if (style.textAlign) parts.push(`text-align: ${style.textAlign}`);
  if (style.textDecoration) parts.push(`text-decoration: ${style.textDecoration}`);
  // Note: border/box-shadow handled separately — NOT included here
  if (style.paddingTop) parts.push(`padding-top: ${style.paddingTop}`);
  if (style.paddingRight) parts.push(`padding-right: ${style.paddingRight}`);
  if (style.paddingBottom) parts.push(`padding-bottom: ${style.paddingBottom}`);
  if (style.paddingLeft) parts.push(`padding-left: ${style.paddingLeft}`);
  return parts.join('; ');
}

function stylePropsToInline(style: CellStyleProperties): Record<string, string> {
  const out: Record<string, string> = {};
  if (style.backgroundColor) out.backgroundColor = style.backgroundColor;
  if (style.color) out.color = style.color;
  if (style.fontWeight) out.fontWeight = style.fontWeight;
  if (style.fontStyle) out.fontStyle = style.fontStyle;
  if (style.fontSize) out.fontSize = style.fontSize;
  if (style.fontFamily) out.fontFamily = style.fontFamily;
  if (style.textAlign) out.textAlign = style.textAlign;
  if (style.textDecoration) out.textDecoration = style.textDecoration;
  // Use box-shadow for borders on headers too
  const shadows: string[] = [];
  const sideMap = {
    Top:    (w: string, c: string) => `inset 0 ${w} 0 0 ${c}`,
    Right:  (w: string, c: string) => `inset -${w} 0 0 0 ${c}`,
    Bottom: (w: string, c: string) => `inset 0 -${w} 0 0 ${c}`,
    Left:   (w: string, c: string) => `inset ${w} 0 0 0 ${c}`,
  };
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const width = style[`border${side}Width` as keyof CellStyleProperties] as string | undefined;
    const color = (style[`border${side}Color` as keyof CellStyleProperties] as string) ?? 'currentColor';
    if (width && width !== '0px' && width !== 'none') {
      shadows.push(sideMap[side](width, color));
    }
  }
  if (shadows.length > 0) out.boxShadow = shadows.join(', ');
  if (style.paddingTop) out.paddingTop = style.paddingTop;
  if (style.paddingRight) out.paddingRight = style.paddingRight;
  if (style.paddingBottom) out.paddingBottom = style.paddingBottom;
  if (style.paddingLeft) out.paddingLeft = style.paddingLeft;
  return out;
}

function hasAnyProp(obj: CellStyleProperties | undefined): boolean {
  if (!obj) return false;
  return Object.values(obj as Record<string, unknown>).some((v) => v !== undefined && v !== '');
}

function mergeStyles(base?: CellStyleProperties, overrides?: CellStyleProperties): CellStyleProperties | undefined {
  if (!base && !overrides) return undefined;
  if (!base) return overrides;
  if (!overrides) return base;
  const merged: CellStyleProperties = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined && v !== '') (merged as any)[k] = v;
  }
  return merged;
}

// ─── Template Resolution ─────────────────────────────────────────────────────

interface ResolvedColumn {
  headerName?: string; headerTooltip?: string;
  initialWidth?: number; initialHide?: boolean; initialPinned?: 'left' | 'right' | boolean;
  headerStyle?: CellStyleProperties; cellStyle?: CellStyleProperties;
  cellEditorName?: string; cellEditorParams?: Record<string, unknown>;
  cellRendererName?: string; valueFormatterTemplate?: string;
  sortable?: boolean; filterable?: boolean; resizable?: boolean;
}

/**
 * Multi-template composition resolver.
 *
 * Resolution order (lowest → highest precedence):
 * 1. Type default template (if provided via typeDefaultTplId)
 * 2. Explicit templates from assignment.templateIds[], sorted by updatedAt ascending
 *    (most recently updated template wins per-key)
 * 3. Legacy assignment.templateId (backward compat, treated as first explicit template)
 * 4. Inline assignment overrides (highest precedence)
 */
function resolveColumn(
  assignment: ColumnAssignment,
  templates: Record<string, ColumnTemplate>,
  typeDefaultTplId?: string,
): ResolvedColumn {
  // Collect all template IDs in priority order (lowest first)
  const tplIds: string[] = [];

  // 1. Type default (lowest)
  if (typeDefaultTplId && templates[typeDefaultTplId]) {
    tplIds.push(typeDefaultTplId);
  }

  // 2. Legacy single templateId
  if (assignment.templateId && !assignment.templateIds?.length && templates[assignment.templateId]) {
    tplIds.push(assignment.templateId);
  }

  // 3. Explicit templateIds array
  if (assignment.templateIds?.length) {
    for (const id of assignment.templateIds) {
      if (templates[id] && !tplIds.includes(id)) tplIds.push(id);
    }
  }

  // Sort by updatedAt ascending (oldest first → newest last → newest wins per-key)
  const sortedTpls = tplIds
    .map((id) => templates[id])
    .filter(Boolean)
    .sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));

  // Layer templates: each newer template overwrites older for same key
  let mergedHeaderStyle: CellStyleProperties = {};
  let mergedCellStyle: CellStyleProperties = {};
  let cellEditorName: string | undefined;
  let cellEditorParams: Record<string, unknown> | undefined;
  let cellRendererName: string | undefined;
  let valueFormatterTemplate: string | undefined;
  let sortable: boolean | undefined;
  let filterable: boolean | undefined;
  let resizable: boolean | undefined;

  for (const tpl of sortedTpls) {
    if (tpl.headerStyle) mergedHeaderStyle = { ...mergedHeaderStyle, ...stripUndefined(tpl.headerStyle) };
    if (tpl.cellStyle) mergedCellStyle = { ...mergedCellStyle, ...stripUndefined(tpl.cellStyle) };
    if (tpl.cellEditorName !== undefined) cellEditorName = tpl.cellEditorName;
    if (tpl.cellEditorParams !== undefined) cellEditorParams = tpl.cellEditorParams;
    if (tpl.cellRendererName !== undefined) cellRendererName = tpl.cellRendererName;
    if (tpl.valueFormatterTemplate !== undefined) valueFormatterTemplate = tpl.valueFormatterTemplate;
    if (tpl.sortable !== undefined) sortable = tpl.sortable;
    if (tpl.filterable !== undefined) filterable = tpl.filterable;
    if (tpl.resizable !== undefined) resizable = tpl.resizable;
  }

  // Apply inline assignment overrides (highest precedence)
  return {
    headerName: assignment.headerName,
    headerTooltip: assignment.headerTooltip,
    initialWidth: assignment.initialWidth,
    initialHide: assignment.initialHide,
    initialPinned: assignment.initialPinned,
    headerStyle: mergeStyles(mergedHeaderStyle, assignment.headerStyleOverrides),
    cellStyle: mergeStyles(mergedCellStyle, assignment.cellStyleOverrides),
    cellEditorName: assignment.cellEditorName ?? cellEditorName,
    cellEditorParams: assignment.cellEditorParams ?? cellEditorParams,
    cellRendererName: assignment.cellRendererName ?? cellRendererName,
    valueFormatterTemplate: assignment.valueFormatterTemplate ?? valueFormatterTemplate,
    sortable: assignment.sortable ?? sortable,
    filterable: assignment.filterable ?? filterable,
    resizable: assignment.resizable ?? resizable,
  };
}

/** Remove undefined values from a style object so spread doesn't overwrite with undefined */
function stripUndefined(obj: CellStyleProperties): CellStyleProperties {
  const result: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') result[k] = v;
  }
  return result;
}

// ─── CSS Injection ───────────────────────────────────────────────────────────

// ─── Data Type Detection ─────────────────────────────────────────────────────

type DataType = 'numeric' | 'date' | 'string' | 'boolean' | 'unknown';

function detectColumnType(colId: string, rowData: any[]): DataType {
  if (!rowData?.length) return 'unknown';
  const value = rowData[0]?.[colId];
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'number') return 'numeric';
  if (typeof value === 'boolean') return 'boolean';
  if (value instanceof Date) return 'date';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
    if (!isNaN(Number(value)) && value.trim() !== '') return 'numeric';
  }
  return 'string';
}

// ─── Apply to ColDefs ────────────────────────────────────────────────────────

interface TypeDefaults {
  numeric?: string;
  date?: string;
  string?: string;
  boolean?: string;
}

function applyToColumnDefs(
  defs: (ColDef | ColGroupDef)[],
  state: ColumnCustomizationState,
  templates: Record<string, ColumnTemplate>,
  cssInjector: ModuleContext['cssInjector'],
  expressionEngine: ExpressionEngine,
  typeDefaults?: TypeDefaults,
  rowData?: any[],
): (ColDef | ColGroupDef)[] {
  return defs.map((def) => {
    if ('children' in def && def.children) {
      return { ...def, children: applyToColumnDefs(def.children, state, templates, cssInjector, expressionEngine, typeDefaults, rowData) };
    }
    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return colDef;

    // Detect type default template for this column
    let typeDefaultTplId: string | undefined;
    if (typeDefaults && rowData?.length && colId) {
      const dataType = detectColumnType(colId, rowData);
      if (dataType !== 'unknown') {
        typeDefaultTplId = typeDefaults[dataType];
      }
    }

    const assignment = state.assignments[colId];
    // If no assignment AND no type default, skip
    if (!assignment && !typeDefaultTplId) return colDef;

    const effectiveAssignment = assignment ?? { colId };
    const resolved = resolveColumn(effectiveAssignment, templates, typeDefaultTplId);
    const merged: ColDef = { ...colDef };

    if (resolved.headerName !== undefined) merged.headerName = resolved.headerName;
    if (resolved.headerTooltip !== undefined) merged.headerTooltip = resolved.headerTooltip;
    if (resolved.initialWidth !== undefined) merged.initialWidth = resolved.initialWidth;
    if (resolved.initialHide !== undefined) merged.initialHide = resolved.initialHide;
    if (resolved.initialPinned !== undefined) merged.initialPinned = resolved.initialPinned;
    if (resolved.sortable !== undefined) merged.sortable = resolved.sortable;
    if (resolved.filterable !== undefined) merged.filter = resolved.filterable;
    if (resolved.resizable !== undefined) merged.resizable = resolved.resizable;
    if (resolved.cellEditorName !== undefined) merged.cellEditor = resolved.cellEditorName;
    if (resolved.cellEditorParams !== undefined) merged.cellEditorParams = resolved.cellEditorParams;
    if (resolved.cellRendererName !== undefined) merged.cellRenderer = resolved.cellRendererName;

    // Value formatter from template/assignment
    // Uses new Function for Intl.NumberFormat expressions (toolbar presets).
    // These are developer-authored format strings, not arbitrary user code.
    if (resolved.valueFormatterTemplate) {
      const fmtExpr = resolved.valueFormatterTemplate;
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('x', `'use strict'; if(x==null) return ''; try { return ${fmtExpr}; } catch { return String(x); }`) as (x: unknown) => string;
        fn(12345.678); // Test compilation
        merged.valueFormatter = (params) => {
          if (params.value == null) return '';
          return fn(params.value);
        };
        // Clear cellRenderer so AG-Grid uses valueFormatter instead
        merged.cellRenderer = undefined;
      } catch {
        // Invalid expression — skip formatter
      }
    }

    // Header styling — ALL via CSS injection (same pattern as cells).
    // This avoids AG-Grid's headerStyle caching which breaks undo/redo.
    if (hasAnyProp(resolved.headerStyle)) {
      const style = { ...resolved.headerStyle! };
      const cls = `gc-hdr-c-${colId}`;
      const rules: string[] = [];

      // Non-inheritable (apply to header cell only)
      if (style.backgroundColor) rules.push(`background-color: ${style.backgroundColor} !important`);

      // AG-Grid headers use flexbox — textAlign → justify-content on label child
      if (style.textAlign) {
        const justifyMap: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
        const justify = justifyMap[style.textAlign] ?? 'flex-start';
        cssInjector.addRule(`hdr-align-${colId}`, `.${cls} .ag-header-cell-label { justify-content: ${justify} !important; }`);
      } else {
        cssInjector.removeRule(`hdr-align-${colId}`);
      }

      // Border overlay via ::after on header
      const borderOverlay = borderOverlayCSS(`.${cls}`, style);
      if (borderOverlay) cssInjector.addRule(`hdr-bo-${colId}`, borderOverlay);
      else cssInjector.removeRule(`hdr-bo-${colId}`);

      // Inheritable (apply to header AND descendants)
      const inheritRules: string[] = [];
      if (style.color) inheritRules.push(`color: ${style.color} !important`);
      if (style.fontWeight) inheritRules.push(`font-weight: ${style.fontWeight} !important`);
      if (style.fontStyle) inheritRules.push(`font-style: ${style.fontStyle} !important`);
      if (style.fontSize) inheritRules.push(`font-size: ${style.fontSize} !important`);
      if (style.fontFamily) inheritRules.push(`font-family: ${style.fontFamily} !important`);
      if (style.textDecoration) inheritRules.push(`text-decoration: ${style.textDecoration} !important`);

      // Build CSS: header-level rules + inherited rules on header and descendants
      const allRules = [...rules, ...inheritRules];
      if (allRules.length > 0) {
        // Target non-floating-filter header cells only
        let cssText = `.ag-header-cell.${cls}:not(.ag-floating-filter) { ${allRules.join('; ')}; }`;
        if (inheritRules.length > 0) {
          cssText += `\n.ag-header-cell.${cls}:not(.ag-floating-filter) * { ${inheritRules.join('; ')}; }`;
        }
        cssInjector.addRule(`hdr-c-${colId}`, cssText);
      }

      // Add class for CSS targeting
      const existing = typeof merged.headerClass === 'string' ? merged.headerClass : '';
      merged.headerClass = [existing, cls].filter(Boolean).join(' ');
    } else {
      cssInjector.removeRule(`hdr-align-${colId}`);
      cssInjector.removeRule(`hdr-bo-${colId}`);
      cssInjector.removeRule(`hdr-c-${colId}`);
      merged.headerClass = undefined;
    }

    // Cell styling — single approach: cellClass + CSS injection
    // All properties (inheritable + non-inheritable) go through ONE CSS class
    // with !important to override both theme defaults and renderer inline styles
    if (hasAnyProp(resolved.cellStyle)) {
      const style = resolved.cellStyle!;
      const cls = `gc-col-c-${colId}`;
      const rules: string[] = [];

      // Non-inheritable (apply to cell only)
      if (style.backgroundColor) rules.push(`background-color: ${style.backgroundColor} !important`);
      if (style.paddingTop) rules.push(`padding-top: ${style.paddingTop} !important`);
      if (style.paddingRight) rules.push(`padding-right: ${style.paddingRight} !important`);
      if (style.paddingBottom) rules.push(`padding-bottom: ${style.paddingBottom} !important`);
      if (style.paddingLeft) rules.push(`padding-left: ${style.paddingLeft} !important`);

      // Borders — rendered via ::after overlay so they don't interfere with
      // AG-Grid's box-shadow cell selection or column separators.
      const borderOverlayVal = borderOverlayCSS(`.${cls}`, style);
      if (borderOverlayVal) cssInjector.addRule(`col-bo-${colId}`, borderOverlayVal);
      else cssInjector.removeRule(`col-bo-${colId}`);

      // Inheritable (apply to cell AND all descendants to override renderer inline styles)
      const inheritRules: string[] = [];
      if (style.color) inheritRules.push(`color: ${style.color} !important`);
      if (style.fontWeight) inheritRules.push(`font-weight: ${style.fontWeight} !important`);
      if (style.fontStyle) inheritRules.push(`font-style: ${style.fontStyle} !important`);
      if (style.fontSize) inheritRules.push(`font-size: ${style.fontSize} !important`);
      if (style.fontFamily) inheritRules.push(`font-family: ${style.fontFamily} !important`);
      if (style.textAlign) inheritRules.push(`text-align: ${style.textAlign} !important`);
      if (style.textDecoration) inheritRules.push(`text-decoration: ${style.textDecoration} !important`);

      // Build CSS: cell-level rules + inherited rules on cell and descendants
      const allRules = [...rules, ...inheritRules];
      if (allRules.length > 0) {
        let cssText = `.${cls} { ${[...rules, ...inheritRules].join('; ')}; }`;
        if (inheritRules.length > 0) {
          cssText += `\n.${cls} * { ${inheritRules.join('; ')}; }`;
        }
        cssInjector.addRule(`col-c-${colId}`, cssText);
      }

      // Always add cellClass when any style prop exists (including border-only)
      // so the ::after overlay selector matches the cell.
      const existing = typeof merged.cellClass === 'string' ? merged.cellClass : '';
      merged.cellClass = [existing, cls].filter(Boolean).join(' ');
    } else {
      // No styles — remove any previously injected CSS rules and clear stale class
      cssInjector.removeRule(`col-c-${colId}`);
      cssInjector.removeRule(`col-bo-${colId}`);
      merged.cellClass = undefined;
    }

    return merged;
  });
}

// ─── Module Definition ───────────────────────────────────────────────────────

/** Per-grid module context — supports multi-grid without singletons */
interface ColumnModuleCtx {
  cssInjector: ModuleContext['cssInjector'];
  getModuleState: ModuleContext['getModuleState'];
  expressionEngine: ExpressionEngine;
}
const _ctxMap = new Map<string, ColumnModuleCtx>();
/** Last registered gridId — used as fallback when GridContext is null (before gridApi ready) */
let _lastRegisteredGridId: string | null = null;

export const columnCustomizationModule: GridCustomizerModule<ColumnCustomizationState> = {
  id: 'column-customization',
  name: 'Columns',
  icon: 'Columns3',
  priority: 10,
  dependencies: ['column-templates'],

  getInitialState: () => ({ ...INITIAL_COLUMN_CUSTOMIZATION }),

  onRegister(ctx: ModuleContext): void {
    _ctxMap.set(ctx.gridId, {
      cssInjector: ctx.cssInjector,
      getModuleState: ctx.getModuleState,
      expressionEngine: new ExpressionEngine(),
    });
    _lastRegisteredGridId = ctx.gridId;
  },

  // Note: we intentionally do NOT delete from _ctxMap in onGridDestroy.
  // In React strict mode, onGridDestroy fires on the first cleanup but the
  // core instance (and its cssInjector) is reused on the second mount.
  // Deleting here would leave transformColumnDefs without a context.

  transformColumnDefs(
    defs: (ColDef | ColGroupDef)[],
    state: ColumnCustomizationState,
    _ctx: GridContext,
  ): (ColDef | ColGroupDef)[] {
    // Resolve module context: use GridContext.gridId if available, fall back to last registered
    const gridId = _ctx?.gridId ?? _lastRegisteredGridId;
    if (!gridId) return defs;
    const mctx = _ctxMap.get(gridId);
    if (!mctx) return defs;
    const { cssInjector, getModuleState, expressionEngine } = mctx;

    // Read templates + type defaults from the column-templates module
    const tplState = getModuleState<ColumnTemplatesState>('column-templates');
    const templates = tplState?.templates ?? {};
    const typeDefaults = tplState?.typeDefaults;

    // Get row data from grid API for type detection
    let rowData: any[] | undefined;
    if (typeDefaults && _ctx?.gridApi) {
      try {
        const firstRow = (_ctx.gridApi as any).getDisplayedRowAtIndex?.(0);
        if (firstRow?.data) rowData = [firstRow.data];
      } catch { /* */ }
    }

    const hasAssignments = Object.keys(state.assignments).length > 0;
    const hasTypeDefaults = typeDefaults && Object.values(typeDefaults).some(Boolean);

    if (!hasAssignments && !hasTypeDefaults) return defs;
    return applyToColumnDefs(defs, state, templates, cssInjector, expressionEngine, typeDefaults, rowData);
  },

  serialize: (state) => state,
  deserialize: (data) => {
    const raw = data as Record<string, unknown>;
    if (raw && 'overrides' in raw && !('templates' in raw)) return migrateFromLegacy(raw as any);
    // Strip legacy 'templates' field if present (moved to column-templates module)
    const { templates: _, ...rest } = (data ?? {}) as any;
    return { ...INITIAL_COLUMN_CUSTOMIZATION, ...rest };
  },

  SettingsPanel: ColumnCustomizationPanel,
};

export type { ColumnCustomizationState } from './state';
