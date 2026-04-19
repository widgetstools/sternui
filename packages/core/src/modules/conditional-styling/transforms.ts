/**
 * Conditional-styling transforms — CSS generation + class-rule predicate
 * builders. Pure-data helpers split out of the module entry so the runtime
 * wiring in `index.ts` stays compact.
 */
import type {
  CellClassParams,
  ColDef,
  ColGroupDef,
  RowClassParams,
  ValueFormatterParams,
} from 'ag-grid-community';
import type { AnyColDef, CssHandle, ExpressionEngineLike } from '../../platform/types';
import { valueFormatterFromTemplate } from '../../colDef';
import type {
  CellStyleProperties,
  ConditionalRule,
  FlashTarget,
  RuleIndicator,
} from './state';
import { findIndicatorIcon, iconAsDataUrl } from './indicatorIcons';

// ─── Pulse keyframes (module-scoped, shipped once per grid) ────────────────

export const FLASH_PULSE_RULE_ID = '__flash-pulse-keyframes__';
export const FLASH_PULSE_CSS = `
@keyframes gc-flash-pulse {
  0%, 100% { box-shadow: inset 0 0 0 9999px var(--gc-flash-color, rgba(251, 191, 36, 0.42)); }
  50%      { box-shadow: inset 0 0 0 9999px transparent; }
}
.gc-flash-pulse { animation: gc-flash-pulse var(--gc-flash-period, 1s) infinite ease-in-out; }
.ag-header-cell.gc-flash-hdr-pulse { animation: gc-flash-pulse var(--gc-flash-period, 1s) infinite ease-in-out; }
`;

// ─── CSS generation ────────────────────────────────────────────────────────

function styleToCSS(style: CellStyleProperties): string {
  const parts: string[] = [];
  if (style.backgroundColor) parts.push(`background-color: ${style.backgroundColor}`);
  if (style.color) parts.push(`color: ${style.color}`);
  if (style.fontWeight) parts.push(`font-weight: ${style.fontWeight}`);
  if (style.fontStyle) parts.push(`font-style: ${style.fontStyle}`);
  if (style.fontSize) parts.push(`font-size: ${style.fontSize}`);
  if (style.fontFamily) parts.push(`font-family: ${style.fontFamily}`);
  if (style.textAlign) parts.push(`text-align: ${style.textAlign}`);
  if (style.textDecoration) parts.push(`text-decoration: ${style.textDecoration}`);
  if (style.paddingTop) parts.push(`padding-top: ${style.paddingTop}`);
  if (style.paddingRight) parts.push(`padding-right: ${style.paddingRight}`);
  if (style.paddingBottom) parts.push(`padding-bottom: ${style.paddingBottom}`);
  if (style.paddingLeft) parts.push(`padding-left: ${style.paddingLeft}`);
  return parts.join('; ');
}

/**
 * Per-side borders rendered on a `::after` pseudo-element using real CSS
 * border properties — v1 used `inset box-shadow` which silently drops
 * `style` (dashed / dotted never render). DO NOT emit `position: relative`
 * on the target (see v2 comment history for the header-layout regression).
 */
function borderOverlayCSS(selector: string, style: CellStyleProperties): string {
  const parts: string[] = [];
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const width = style[`border${side}Width` as keyof CellStyleProperties] as string | undefined;
    const color = (style[`border${side}Color` as keyof CellStyleProperties] as string | undefined) ?? 'currentColor';
    const styleName = (style[`border${side}Style` as keyof CellStyleProperties] as string | undefined) ?? 'solid';
    if (width && width !== '0px' && width !== 'none') {
      parts.push(`border-${side.toLowerCase()}: ${width} ${styleName} ${color}`);
    }
  }
  if (parts.length === 0) return '';
  return `${selector}::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-sizing: border-box; z-index: 1; ${parts.join('; ')}; }`;
}

function indicatorOverlayCSS(ruleCls: string, indicator: RuleIndicator | undefined): string {
  if (!indicator) return '';
  const def = findIndicatorIcon(indicator.icon);
  if (!def) return '';
  const color = indicator.color || 'currentColor';
  const url = iconAsDataUrl(def, color);

  const target = indicator.target ?? 'cells+headers';
  const selector =
    target === 'cells' ? `.ag-cell${ruleCls}`
    : target === 'headers' ? `.ag-header-cell${ruleCls}`
    : ruleCls;

  const pos = indicator.position ?? 'top-right';
  const anchor = pos === 'top-left' ? 'left: 2px' : 'right: 2px';

  return `${selector}::before {
    content: ''; position: absolute; top: 2px; ${anchor};
    width: 12px; height: 12px;
    background-image: url("${url}");
    background-size: contain; background-repeat: no-repeat; background-position: center;
    pointer-events: none; z-index: 2;
  }`;
}

export function buildCssText(
  ruleId: string,
  scopeType: 'cell' | 'row',
  light: CellStyleProperties,
  dark: CellStyleProperties,
  pulse: { enabled: boolean; scope: 'cell' | 'row'; target: FlashTarget } | null,
  indicator: RuleIndicator | undefined,
): string {
  const cls = `.gc-rule-${ruleId}`;
  const lightProps = styleToCSS(light);
  const darkProps = styleToCSS(dark);
  const lines: string[] = [];

  if (lightProps) lines.push(`:root:not(.dark):not([data-theme="dark"]) ${cls} { ${lightProps} }`);
  if (darkProps) lines.push(`.dark ${cls}, [data-theme="dark"] ${cls} { ${darkProps} }`);
  if (lightProps && !darkProps) lines.push(`${cls} { ${lightProps} }`);

  if (pulse?.enabled && (pulse.target === 'cells' || pulse.target === 'cells+headers' || pulse.target === 'row')) {
    lines.push(`${cls} { animation: gc-flash-pulse var(--gc-flash-period, 1s) infinite ease-in-out; }`);
  }

  const indicatorCss = indicatorOverlayCSS(cls, indicator);
  if (indicatorCss) lines.push(indicatorCss);

  // Row-scope separator kill — the theme's `.ag-row` border-bottom visibly
  // stripes adjacent highlighted rows without the `!important`.
  if (scopeType === 'row') {
    lines.push(`.ag-row${cls} { border-color: transparent !important; }`);
  }

  const lightBorder = borderOverlayCSS(`:root:not(.dark):not([data-theme="dark"]) ${cls}`, light);
  const darkBorder1 = borderOverlayCSS(`.dark ${cls}`, dark);
  const darkBorder2 = borderOverlayCSS(`[data-theme="dark"] ${cls}`, dark);
  if (lightBorder) lines.push(lightBorder);
  if (darkBorder1) lines.push(darkBorder1);
  if (darkBorder2) lines.push(darkBorder2);
  if (lightBorder && !darkBorder1 && !darkBorder2) {
    const fallback = borderOverlayCSS(cls, light);
    if (fallback) lines.push(fallback);
  }

  return lines.join('\n');
}

export function reinjectAllRules(css: CssHandle, rules: ConditionalRule[]): void {
  css.clear();
  css.addRule(FLASH_PULSE_RULE_ID, FLASH_PULSE_CSS);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const pulse = rule.flash?.enabled
      ? { enabled: true, scope: rule.scope.type, target: rule.flash.target }
      : null;
    css.addRule(
      `conditional-${rule.id}`,
      buildCssText(rule.id, rule.scope.type, rule.style.light, rule.style.dark, pulse, rule.indicator),
    );
  }
}

// ─── Predicate builders ────────────────────────────────────────────────────

/**
 * Compile to an AG-Grid string expression when possible (zero per-cell JS
 * cost), otherwise fall back to a function that evaluates the AST per cell.
 * Evaluation errors are swallowed — a broken rule must NOT crash the grid.
 */
export function buildCellClassPredicate(
  engine: ExpressionEngineLike,
  rule: ConditionalRule,
): ((params: CellClassParams) => boolean) | string {
  // Try the AG-string optimisation path — v3 engine exposes `tryCompileToAgString`
  // on the concrete class; ExpressionEngineLike is intentionally narrow, so we
  // fall through to the function form when the helper isn't there.
  const tryCompile = (engine as { tryCompileToAgString?: (ast: unknown) => string | null }).tryCompileToAgString;
  if (typeof tryCompile === 'function') {
    try {
      const ast = engine.parse(rule.expression);
      const agString = tryCompile(ast);
      if (agString) return agString;
    } catch {
      /* fall through to function form */
    }
  }
  return (params: CellClassParams) => {
    try {
      return Boolean(
        engine.parseAndEvaluate(rule.expression, {
          x: params.value,
          value: params.value,
          data: params.data ?? {},
          columns: params.data ?? {},
        }),
      );
    } catch {
      return false;
    }
  };
}

export function buildRowClassPredicate(
  engine: ExpressionEngineLike,
  rule: ConditionalRule,
): (params: RowClassParams) => boolean {
  return (params: RowClassParams) => {
    try {
      return Boolean(
        engine.parseAndEvaluate(rule.expression, {
          x: null,
          value: null,
          data: params.data ?? {},
          columns: params.data ?? {},
        }),
      );
    } catch {
      return false;
    }
  };
}

// ─── ColDef walker (cell rules) ────────────────────────────────────────────

export function applyCellRulesToDefs(
  defs: AnyColDef[],
  cellRules: ConditionalRule[],
  engine: ExpressionEngineLike,
): AnyColDef[] {
  return defs.map((def) => {
    if ('children' in def && Array.isArray(def.children)) {
      const next = applyCellRulesToDefs(def.children, cellRules, engine);
      const unchanged = next.length === def.children.length && next.every((c, i) => c === def.children[i]);
      return unchanged ? def : ({ ...def, children: next } as ColGroupDef);
    }

    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;

    const applicable = cellRules.filter(
      (r) => r.scope.type === 'cell' && (r.scope as { type: 'cell'; columns: string[] }).columns.includes(colId),
    );
    if (applicable.length === 0) return def;

    const cellClassRules: NonNullable<ColDef['cellClassRules']> = {
      ...((colDef.cellClassRules as Record<string, unknown>) ?? {}),
    } as NonNullable<ColDef['cellClassRules']>;

    for (const rule of applicable) {
      (cellClassRules as Record<string, unknown>)[`gc-rule-${rule.id}`] = buildCellClassPredicate(engine, rule);
    }

    // Per-rule value formatters — highest priority wins.
    const formatterRules = applicable.filter((r) => !!r.valueFormatter);
    if (formatterRules.length > 0) {
      const compiled = formatterRules.map((rule) => ({
        predicate: buildCellClassPredicate(engine, rule),
        formatter: valueFormatterFromTemplate(rule.valueFormatter!),
        expression: rule.expression,
      }));
      const existing = colDef.valueFormatter;
      const existingFormatter = typeof existing === 'function' ? existing : undefined;
      (colDef as ColDef).valueFormatter = (params: ValueFormatterParams) => {
        for (let i = compiled.length - 1; i >= 0; i--) {
          const c = compiled[i];
          let matched = false;
          try {
            if (typeof c.predicate === 'string') {
              matched = Boolean(engine.parseAndEvaluate(c.expression, {
                x: params.value, value: params.value, data: params.data ?? {}, columns: params.data ?? {},
              }));
            } else {
              matched = Boolean(c.predicate(params as CellClassParams));
            }
          } catch { matched = false; }
          if (matched) {
            try { return c.formatter({ value: params.value, data: params.data }); }
            catch { /* fall through */ }
          }
        }
        if (existingFormatter) return existingFormatter(params as never);
        return params.value == null ? '' : String(params.value);
      };
    }

    return { ...colDef, cellClassRules };
  });
}
