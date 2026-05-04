/**
 * Column-customization transforms — isolated from the module entry so the
 * same helpers can be consumed by conditional-styling, calculated-columns,
 * and column-groups when they need to layer the same filter / rowGrouping
 * config onto virtual ColDefs.
 */
import type { ColDef, IAggFuncParams } from 'ag-grid-community';
import type {
  BorderSpec,
  CellStyleOverrides,
} from '../../colDef';
import type { AnyColDef } from '../../platform/types';
import type {
  ColumnAssignment,
  ColumnFilterConfig,
  RowGroupingConfig,
} from './state';
import { resolveTemplates } from '../column-templates/resolveTemplates';
import type { ColumnDataType, ColumnTemplatesState } from '../column-templates';
import {
  valueFormatterFromTemplate,
  excelFormatColorResolver,
} from '../../colDef';
import type { CssHandle, ExpressionEngineLike } from '../../platform/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

export function cellDataTypeToDomain(value: unknown): ColumnDataType | undefined {
  if (value === 'numeric' || value === 'date' || value === 'string' || value === 'boolean') {
    return value;
  }
  return undefined;
}

/**
 * Encode a colId so it's safe to use as a CSS class name AND inside a
 * CSS selector without further escaping.
 *
 * The walker derives column identity from `colDef.colId ?? colDef.field`
 * — for nested fields the field is `'a.b.c'` style and AG-Grid uses
 * that as the colId. Without encoding, the cellClass `gc-col-c-a.b.c`
 * becomes the selector `.gc-col-c-a.b.c` which CSS parses as three
 * chained class matches (`.gc-col-c-a` AND `.b` AND `.c`) — so the
 * rule never matches and the formatter has no visible effect.
 *
 * Rule: replace every char outside `[A-Za-z0-9_-]` with `_xx` where
 * `xx` is the two-digit lowercase hex of the char code. Idempotent on
 * already-safe ids; collision-free vs raw ids because raw ids never
 * contain `_<hex>` for the chars we encode.
 *
 * Examples:
 *   'price'              → 'price'              (no change)
 *   'ratings.sp'         → 'ratings_2esp'
 *   'position[0].qty'    → 'position_5b0_5d_2eqty'
 *   'field with spaces'  → 'field_20with_20spaces'
 */
export function cssEscapeColId(colId: string): string {
  return colId.replace(/[^A-Za-z0-9_-]/g, (c) =>
    `_${c.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
}

// ─── CSS generation ────────────────────────────────────────────────────────

/** Structured CellStyleOverrides → CSS declaration text (no borders). */
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
  return parts.join('; ');
}

/**
 * Build CSS for a `::after` pseudo-element that draws per-side borders
 * using real CSS border properties (honours dashed / dotted — box-shadow
 * silently drops `style`, CSS borders do not).
 *
 * DO NOT emit `position: relative` on the target. AG-Grid cells are
 * already relative and header cells are absolute; emitting relative
 * clobbers the header layout.
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
  return `${selector}::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-sizing: border-box; z-index: 1; ${parts.join('; ')}; }`;
}

/**
 * Header alignment maps to `justify-content` on the label container —
 * AG-Grid header cells use flexbox, so `text-align` doesn't work.
 */
function headerAlignCSS(selector: string, horizontal: string): string {
  const map: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };
  const jc = map[horizontal] ?? horizontal;
  return `${selector} .ag-header-cell-label { justify-content: ${jc}; }`;
}

/**
 * Re-inject all CSS rules for every assigned column. Called on every
 * transform pass — the handle is keyed by colId, so re-applying just
 * replaces the old text.
 */
export function reinjectCSS(
  cells: CssHandle,
  headers: CssHandle,
  assignments: Record<string, ColumnAssignment>,
  templatesState: ColumnTemplatesState,
  defs: AnyColDef[],
): void {
  cells.clear();
  headers.clear();

  // colId → cellDataType so `resolveTemplates` can pick the right
  // typeDefault. Virtual columns (appended later in the pipeline) are
  // missing from `defs` and get `undefined` — resolveTemplates handles
  // that by skipping the type-default fallback.
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

  // Iterate assignments keyed by colId — not `defs` — so virtual columns
  // still get their cellStyleOverrides injected.
  for (const colId of Object.keys(assignments)) {
    if (!colId) continue; // empty key is meaningless; skip defensively
    const a = assignments[colId];
    if (!a) continue;
    const resolved = resolveTemplates(
      a,
      templatesState,
      cellDataTypeToDomain(dataTypeByColId.get(colId)),
    );
    // Both the class on the DOM and the selector go through the same
    // encoder — they always match regardless of the source colId's
    // shape (dots, brackets, spaces, …).
    const safeId = cssEscapeColId(colId);
    const cellCls = `gc-col-c-${safeId}`;
    const hdrCls = `gc-hdr-c-${safeId}`;

    if (resolved?.cellStyleOverrides) {
      const css = styleOverridesToCSS(resolved.cellStyleOverrides);
      if (css) cells.addRule(`cell-${colId}`, `.${cellCls} { ${css} }`);
      const border = borderOverlayFromOverrides(`.${cellCls}`, resolved.cellStyleOverrides);
      if (border) cells.addRule(`cell-bo-${colId}`, border);
    }

    if (resolved?.headerStyleOverrides) {
      const css = styleOverridesToCSS(resolved.headerStyleOverrides);
      if (css) headers.addRule(`hdr-${colId}`, `.${hdrCls} { ${css} }`);
      const border = borderOverlayFromOverrides(`.${hdrCls}`, resolved.headerStyleOverrides);
      if (border) headers.addRule(`hdr-bo-${colId}`, border);
    }

    // Header alignment inherits the cell's unless overridden. Without
    // this the header-align class has nothing to target when the user
    // only aligned the cell.
    const effectiveHeaderAlign =
      resolved?.headerStyleOverrides?.alignment?.horizontal ??
      resolved?.cellStyleOverrides?.alignment?.horizontal;
    if (effectiveHeaderAlign) {
      headers.addRule(`hdr-align-${colId}`, headerAlignCSS(`.${hdrCls}`, effectiveHeaderAlign));
    }
  }
}

// ─── Filter config → AG-Grid filter/filterParams/floatingFilter ────────────

/**
 * Compose AG-Grid's `filter`, `filterParams`, `floatingFilter` on `merged`
 * from our `ColumnFilterConfig`. Mutates `merged` in place.
 *
 * Exported — consumed by calculated-columns / column-groups when they
 * need to layer filter config onto their own ColDefs.
 */
export function applyFilterConfigToColDef(merged: ColDef, cfg: ColumnFilterConfig): void {
  if (cfg.enabled === false) {
    merged.filter = false;
    merged.filterParams = undefined;
    if (cfg.floatingFilter !== undefined) merged.floatingFilter = cfg.floatingFilter;
    return;
  }

  // The synthetic 'streamSafeMultiColumnFilter' kind isn't a real
  // AG-Grid filter — it's our opt-in marker to use `agMultiColumnFilter`
  // with the `streamSafeText` column-level floating filter (typeable
  // input, clear button, comma-token routing). Flatten to the real
  // AG-Grid kind here; the floating-filter wiring happens in the
  // multi-filter branch below.
  const isStreamSafeMulti = cfg.kind === 'streamSafeMultiColumnFilter';
  if (cfg.kind) merged.filter = isStreamSafeMulti ? 'agMultiColumnFilter' : cfg.kind;
  if (cfg.floatingFilter !== undefined) merged.floatingFilter = cfg.floatingFilter;

  // AG-Grid Enterprise resolves `filter: true` to `agSetColumnFilter`, whose
  // floating filter is read-only by design (it just mirrors the active
  // selection from the popup). When the user opted into a floating filter
  // without picking an explicit kind, that's a usability trap — they
  // expect a typeable input. Coerce the boolean default to a text filter
  // ONLY when floating is on; popup-only set-filter usage is unaffected.
  if (merged.floatingFilter === true && merged.filter === true) {
    merged.filter = 'agTextColumnFilter';
  }

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

  const isMultiKind = cfg.kind === 'agMultiColumnFilter' || cfg.kind === 'streamSafeMultiColumnFilter';
  if (isMultiKind && cfg.multiFilters && cfg.multiFilters.length > 0) {
    params.filters = cfg.multiFilters.map((mf) => {
      const entry: Record<string, unknown> = { filter: mf.filter };
      if (mf.display) entry.display = mf.display;
      if (mf.title) entry.title = mf.title;
      // Lift the compound-text condition cap so the streamSafeText
      // fallback path (multi-filter without a set sub-filter) can emit
      // arbitrary token counts. Default is 2 → drops 3rd+ with warn #78.
      if (mf.filter === 'agTextColumnFilter' || mf.filter === 'agNumberColumnFilter') {
        entry.filterParams = {
          ...((entry.filterParams as Record<string, unknown> | undefined) ?? {}),
          maxNumConditions: 100,
        };
      }
      return entry;
    });
  }

  // Register streamSafeText at the COLUMN level only when the user
  // explicitly picked the synthetic 'streamSafeMultiColumnFilter' kind
  // in the column-settings dropdown. Column-level floatingFilterComponent
  // overrides the multi-filter's auto-rotation behaviour: by default
  // the multi-filter shows the floating filter of whichever sub-filter
  // has the active model — so when our code applies a set-filter values
  // list, the multi rotates to the set sub-filter's read-only floating
  // display ((N) val1,val2,...) and replaces our component. With
  // column-level wiring our floating filter stays put and we drive the
  // model through api.setColumnFilterModel regardless of which
  // sub-filter is "active". Plain agMultiColumnFilter keeps AG-Grid's
  // default behaviour — no opinion imposed.
  if (isStreamSafeMulti && cfg.floatingFilter !== false) {
    merged.floatingFilterComponent = 'streamSafeText' as never;
  }

  if (Object.keys(params).length > 0) {
    merged.filterParams = {
      ...(merged.filterParams as Record<string, unknown> | undefined),
      ...params,
    };
  }
}

// ─── Row-grouping / aggregation / pivot ────────────────────────────────────

/**
 * Compose AG-Grid's row-grouping / aggregation / pivot ColDef fields from
 * our `RowGroupingConfig`. Mutates `merged` in place.
 *
 * Exported — consumed by calculated-columns so virtual columns carry the
 * same rowGrouping semantics.
 */
export function applyRowGroupingConfigToColDef(
  merged: ColDef,
  cfg: RowGroupingConfig,
  engine?: ExpressionEngineLike,
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
    if (cfg.customAggExpression && cfg.customAggExpression.trim() && engine) {
      const fn = buildCustomAggFn(engine, cfg.customAggExpression);
      if (fn) merged.aggFunc = fn;
    }
    // Empty expression or no engine: leave aggFunc untouched so the grid
    // doesn't silently drop aggregation while the user is still typing.
  } else if (cfg.aggFunc !== undefined) {
    merged.aggFunc = cfg.aggFunc;
  }
}

/**
 * Compile a custom aggregation formula to an AG-Grid aggFn. Returns `null`
 * on parse failure — the column falls back to no aggregation (safer than
 * crashing the grid).
 */
function buildCustomAggFn(
  engine: ExpressionEngineLike,
  expression: string,
): ((params: IAggFuncParams) => unknown) | null {
  let compiled: unknown;
  try {
    compiled = engine.parse(expression);
  } catch (err) {
    console.warn('[column-customization] custom aggregation parse error:', expression, err);
    return null;
  }
  return (params: IAggFuncParams) => {
    const values = params.values ?? [];
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
      console.warn('[column-customization] custom aggregation runtime error:', expression, err);
      return null;
    }
  };
}

// ─── Walker: merge assignments into ColDefs ────────────────────────────────

export function applyAssignments(
  defs: AnyColDef[],
  assignments: Record<string, ColumnAssignment>,
  templatesState: ColumnTemplatesState,
  engine: ExpressionEngineLike,
): AnyColDef[] {
  return defs.map((def) => {
    if ('children' in def && Array.isArray(def.children)) {
      const next = applyAssignments(def.children, assignments, templatesState, engine);
      const unchanged =
        next.length === def.children.length && next.every((c, i) => c === def.children[i]);
      return unchanged ? def : { ...def, children: next };
    }

    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;
    const a = assignments[colId];
    if (!a) return def;

    const resolved = resolveTemplates(
      a,
      templatesState,
      cellDataTypeToDomain(colDef.cellDataType),
    );

    const merged: ColDef = { ...colDef };

    // Structural overrides (non-styling — kept on the ColDef).
    if (resolved.headerName !== undefined) merged.headerName = resolved.headerName;
    if (resolved.headerTooltip !== undefined) merged.headerTooltip = resolved.headerTooltip;
    if (resolved.initialWidth !== undefined) merged.initialWidth = resolved.initialWidth;
    if (resolved.initialHide !== undefined) merged.initialHide = resolved.initialHide;
    if (resolved.initialPinned !== undefined) merged.initialPinned = resolved.initialPinned;
    if (resolved.sortable !== undefined) merged.sortable = resolved.sortable;
    if (resolved.filterable !== undefined) merged.filter = resolved.filterable;
    if (resolved.resizable !== undefined) merged.resizable = resolved.resizable;
    if (resolved.editable !== undefined) merged.editable = resolved.editable;

    // Rich filter config — takes precedence over `filterable`.
    if (resolved.filter !== undefined) {
      applyFilterConfigToColDef(merged, resolved.filter as ColumnFilterConfig);
    }

    // Row-grouping / aggregation / pivot.
    if (resolved.rowGrouping !== undefined) {
      applyRowGroupingConfigToColDef(merged, resolved.rowGrouping as RowGroupingConfig, engine);
    }

    // Value formatter.
    if (resolved.valueFormatterTemplate !== undefined) {
      merged.valueFormatter = valueFormatterFromTemplate(resolved.valueFormatterTemplate);

      // Excel color tags — `[Red]`, `[Green]` etc. in the format string —
      // only affect text semantics in SSF. Emit a `cellStyle` fn that
      // paints the computed color for the matched section.
      //
      // IMPORTANT: we always assign `merged.cellStyle` whenever a
      // formatter is active, even when the new format has no color
      // tags. Returning `null` from a cellStyle fn tells AG-Grid "don't
      // override" — it does NOT clear the inline `color` property that
      // a previous formatter's cellStyle put on the cell. So when the
      // user switches from a `[Red]`-colored format to a plain one, the
      // red color would stick until a full reload. Emitting
      // `{ color: '' }` explicitly resets `cell.style.color` so AG-Grid
      // clears the inline color. Does NOT interfere with class-based
      // colors from `colors.text` overrides — those come from the
      // injected `.gc-col-c-{colId}` rule, which an empty inline color
      // cascades through.
      const colorResolver =
        resolved.valueFormatterTemplate.kind === 'excelFormat'
          ? excelFormatColorResolver(resolved.valueFormatterTemplate.format)
          : undefined;
      if (colorResolver) {
        merged.cellStyle = (params) => {
          const color = colorResolver(params.value);
          return color ? { color } : { color: '' };
        };
      } else if (colDef.cellStyle === undefined) {
        // No color resolver AND the user's source colDef has no
        // cellStyle of its own — safe to plant our "clear" fn. If the
        // user DID set a cellStyle, we leave it alone (their handler
        // should own color lifecycle).
        merged.cellStyle = () => ({ color: '' });
      }
    }

    if (resolved.cellEditorName !== undefined) merged.cellEditor = resolved.cellEditorName;
    if (resolved.cellEditorParams !== undefined) merged.cellEditorParams = resolved.cellEditorParams;
    if (resolved.cellRendererName !== undefined) merged.cellRenderer = resolved.cellRendererName;

    // Styling via CSS class injection (NOT cellStyle/headerStyle — we save
    // those for color-resolver above, which is a per-row compute). The
    // class string written to the DOM is encoded with the SAME helper
    // `reinjectCSS` uses to build its selectors, so dotted/bracketed
    // colIds work correctly.
    const safeId = cssEscapeColId(colId);
    if (resolved?.cellStyleOverrides !== undefined) {
      const cls = `gc-col-c-${safeId}`;
      const existing = colDef.cellClass;
      merged.cellClass = Array.isArray(existing)
        ? [...existing, cls]
        : typeof existing === 'string'
          ? [existing, cls]
          : cls;
    }

    // Header class: emit whenever we'll inject a header rule — either the
    // header has overrides, OR the cell has alignment (which the header
    // inherits by default). Without this the header-align rule has no
    // target on the DOM.
    const needsHeaderClass =
      resolved?.headerStyleOverrides !== undefined ||
      resolved?.cellStyleOverrides?.alignment?.horizontal !== undefined;
    if (needsHeaderClass) {
      const cls = `gc-hdr-c-${safeId}`;
      const existing = colDef.headerClass;
      merged.headerClass = Array.isArray(existing)
        ? [...existing, cls]
        : typeof existing === 'string'
          ? [existing, cls]
          : cls;
    }

    return merged;
  });
}
