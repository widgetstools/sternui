import type {
  ColDef,
  ColGroupDef,
  CellClassParams,
  RowClassParams,
} from 'ag-grid-community';
import { ExpressionEngine } from '@grid-customizer/core';
import type { AnyColDef, Module } from '../../core/types';
import { CssInjector } from '../../core/CssInjector';
import {
  ConditionalStylingEditor,
  ConditionalStylingList,
  ConditionalStylingPanel,
} from './ConditionalStylingPanel';
import {
  INITIAL_CONDITIONAL_STYLING,
  type CellStyleProperties,
  type ConditionalRule,
  type ConditionalStylingState,
  type FlashTarget,
  type RuleIndicator,
} from './state';
import { findIndicatorIcon, iconAsDataUrl } from './indicatorIcons';

// ─── Per-grid singletons ────────────────────────────────────────────────────
//
// One ExpressionEngine + one CssInjector per gridId. Held in module-level
// Maps because the v2 transform pipeline gives us a `GridContext` (gridId)
// but no module-instance handle. Cleared in `onGridDestroy`.
//
// NOTE: this is the ONE place where v2 keeps a per-id Map — it's a deliberate
// concession because the styling output (a <style> element + cellClassRules
// references) lives outside the Zustand store. Unlike v1's `_ctxMap`, this
// holds only inert helpers, never module state, so the strict-mode hazard
// that motivated the rewrite doesn't apply here.

interface GridResources {
  engine: ExpressionEngine;
  cssInjector: CssInjector;
  /** Cleanup for the header-flash re-evaluation listener (scans the row
   *  model after every model update to toggle the pulse class on
   *  qualifying column headers). Only attached when at least one rule
   *  uses `target: 'headers' | 'cells+headers'`. */
  headerFlashDetach?: () => void;
  /** Invokes a fresh header-flash evaluation. Called from outside the
   *  data-event listener when the rule list changes (e.g. flash
   *  enabled/disabled via the panel) — data events alone don't catch
   *  a rule-state toggle that leaves data untouched. */
  headerFlashEvaluate?: () => void;
}

const _gridResources = new Map<string, GridResources>();

function getOrCreateResources(gridId: string): GridResources {
  let r = _gridResources.get(gridId);
  if (!r) {
    r = { engine: new ExpressionEngine(), cssInjector: new CssInjector(gridId, 'conditional-styling') };
    _gridResources.set(gridId, r);
  }
  return r;
}

// ─── Flash-pulse CSS (injected once per grid) ───────────────────────────────
//
// The user-facing semantic is "this rule is a warning — pulse the target
// continuously while the condition holds, stop when it clears". That maps
// cleanly onto CSS: attach a class via the same predicate that drives the
// style class, and let a keyframes animation loop forever.
//
// `inset box-shadow` is the pulse surface because:
//   - It overlays the cell without shifting layout.
//   - It doesn't fight the rule's own `background-color` (styling). The
//     pulse visibly alternates between the amber highlight and fully
//     transparent, so the rule's background shows through on the off-beat.
//   - AG-Grid's column separators and borders are untouched.
//
// Headers reuse the same keyframes via `.gc-flash-hdr-{id}-{colId}` classes
// toggled from a modelUpdated listener (AG-Grid doesn't have
// `headerClassRules`, so per-column state has to be pushed imperatively).

const FLASH_PULSE_RULE_ID = '__flash-pulse-keyframes__';
const FLASH_PULSE_CSS = `
@keyframes gc-flash-pulse {
  0%, 100% { box-shadow: inset 0 0 0 9999px var(--gc-flash-color, rgba(251, 191, 36, 0.42)); }
  50%      { box-shadow: inset 0 0 0 9999px transparent; }
}
.gc-flash-pulse {
  animation: gc-flash-pulse var(--gc-flash-period, 1s) infinite ease-in-out;
}
.ag-header-cell.gc-flash-hdr-pulse {
  animation: gc-flash-pulse var(--gc-flash-period, 1s) infinite ease-in-out;
}
`;

// ─── CSS generation ─────────────────────────────────────────────────────────

/**
 * Convert non-border style properties to a CSS declaration string.
 * Border properties are handled separately via `borderOverlayCSS` which
 * uses a `::after` pseudo-element with `inset box-shadow`.
 */
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
  // Border properties NOT included here — see borderOverlayCSS below.
  return parts.join('; ');
}

/**
 * Build CSS for a ::after pseudo-element that renders per-side borders
 * using real CSS borders on the pseudo-element. Ported from v1's
 * column-customization module; the previous `inset box-shadow` variant
 * could not render dashed/dotted styles (box-shadow has no style axis).
 *
 * WHY ::after (instead of the cell element) for the real borders:
 *   1. AG-Grid cells have overflow:hidden — real borders on the cell
 *      element get clipped at the cell boundary, especially bottom/right
 *      edges.
 *   2. AG-Grid uses its own border mechanism for column separators —
 *      real border-* properties on the cell would conflict with those
 *      separators and cause double-borders or missing separators.
 *   3. The ::after is position:absolute + inset:0 + box-sizing:border-box,
 *      so each side's border draws INSIDE the pseudo-element footprint
 *      without affecting the cell's box-model or column widths.
 *   4. pointer-events:none lets AG-Grid selection work through the
 *      overlay.
 *   5. Each side uses its own `border-{side}: <width> <style> <color>`
 *      declaration, so dashed / dotted render correctly per side.
 *
 * @param selector  CSS selector for the target element (e.g. `.gc-rule-abc`)
 * @param style     CellStyleProperties containing border* fields
 * @returns CSS text for the ::after rule, or empty string if no borders set
 */
function borderOverlayCSS(selector: string, style: CellStyleProperties): string {
  const parts: string[] = [];
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const width = style[`border${side}Width` as keyof CellStyleProperties] as string | undefined;
    const color = (style[`border${side}Color` as keyof CellStyleProperties] as string | undefined) ?? 'currentColor';
    const styleName =
      (style[`border${side}Style` as keyof CellStyleProperties] as string | undefined) ?? 'solid';
    if (width && width !== '0px' && width !== 'none') {
      parts.push(`border-${side.toLowerCase()}: ${width} ${styleName} ${color}`);
    }
  }
  if (parts.length === 0) return '';
  // Do NOT emit `position: relative` on the target element. AG-Grid already
  // makes cells `position: relative` and rows `position: absolute` (via
  // `.ag-row-position-absolute`, used for virtual-scroll transforms). Either
  // one is a positioned ancestor, so `::after` with `position: absolute;
  // inset: 0` anchors correctly inside the target.
  //
  // Forcing `position: relative` on a row drops it into the normal flow
  // (because of the higher specificity when combined with theme ancestor
  // selectors like `.dark` or `[data-theme="dark"]`), while AG-Grid still
  // applies its `translateY(index * rowHeight)` — the row then occupies
  // rowHeight of flow space AND gets transformed, producing a visible gap
  // between styled rows and the rest of the grid.
  //
  // `box-sizing: border-box` anchors each border INSIDE the pseudo-element's
  // inset:0 rect, matching the previous box-shadow overlay footprint while
  // honouring dashed / dotted styles (which CSS box-shadow cannot render).
  return `${selector}::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-sizing: border-box; z-index: 1; ${parts.join('; ')}; }`;
}

/**
 * Build the CSS text for one rule. Two selectors so the dark-mode swap is a
 * pure CSS event (no JS recompute) — this is why we inject CSS rather than
 * setting inline `cellStyle`.
 *
 * We match both theme-signalling conventions a host app might use:
 *   - `.dark` class on the root element (Tailwind-style)
 *   - `[data-theme="dark"]` attribute on the root (CSS-variables style, what
 *     the demo app happens to use)
 * Hitting only one of these was the v2-RC bug where user-defined rules got
 * their `.gc-rule-<id>` class applied to rows but the matching CSS never
 * took effect because the selector didn't match the demo's theme signal.
 */
/**
 * Build the CSS declaration(s) for the indicator badge.
 *
 * The badge is a `::before` pseudo-element on `.gc-rule-{id}`. It
 * rides on the same class the predicate attaches, so the badge
 * appears and disappears in lockstep with the match — no runtime
 * listener needed.
 *
 * Target scoping:
 *   - `cells`           → selector is narrowed to `.ag-cell.gc-rule-{id}`
 *                          so the header watcher painting the class on
 *                          a header cell doesn't produce a badge.
 *   - `headers`         → narrowed to `.ag-header-cell.gc-rule-{id}` so
 *                          the cellClassRules painting the class on
 *                          cells doesn't produce a badge.
 *   - `cells+headers`   → unscoped `.gc-rule-{id}` — both surfaces.
 *
 * Position: top-right is default. top-left flips the anchor.
 */
function indicatorOverlayCSS(ruleCls: string, indicator: RuleIndicator | undefined): string {
  if (!indicator) return '';
  const def = findIndicatorIcon(indicator.icon);
  if (!def) return '';
  const color = indicator.color || 'currentColor';
  const url = iconAsDataUrl(def, color);

  const target = indicator.target ?? 'cells+headers';
  const selector =
    target === 'cells'
      ? `.ag-cell${ruleCls}`
      : target === 'headers'
        ? `.ag-header-cell${ruleCls}`
        : ruleCls;

  const pos = indicator.position ?? 'top-right';
  const anchor = pos === 'top-left' ? 'left: 2px' : 'right: 2px';

  // The badge uses `::before` so the existing `::after` border overlay
  // stays untouched. 12×12 sits comfortably above short numeric cells
  // without crowding the value.
  return `${selector}::before {
    content: '';
    position: absolute;
    top: 2px;
    ${anchor};
    width: 12px;
    height: 12px;
    background-image: url("${url}");
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    pointer-events: none;
    z-index: 2;
  }`;
}

function buildCssText(
  ruleId: string,
  scopeType: 'cell' | 'row',
  light: CellStyleProperties,
  dark: CellStyleProperties,
  pulse: { enabled: boolean; scope: 'cell' | 'row'; target: FlashTarget } | null = null,
  indicator: RuleIndicator | undefined = undefined,
): string {
  const cls = `.gc-rule-${ruleId}`;
  const lightProps = styleToCSS(light);
  const darkProps = styleToCSS(dark);
  const lines: string[] = [];

  // ── Non-border properties (theme-aware selectors) ──
  if (lightProps) {
    lines.push(`:root:not(.dark):not([data-theme="dark"]) ${cls} { ${lightProps} }`);
  }
  if (darkProps) {
    lines.push(`.dark ${cls}, [data-theme="dark"] ${cls} { ${darkProps} }`);
  }
  if (lightProps && !darkProps) lines.push(`${cls} { ${lightProps} }`);

  // ── Flash pulse ──
  // Runs for the duration the predicate matches. AG-Grid attaches
  // `.gc-rule-{id}` via cellClassRules/rowClassRules when truthy and
  // removes it when falsy, so the animation starts and stops
  // automatically as values cross the condition boundary.
  //
  // `target: 'headers'` alone does NOT paint the row/cell — only the
  // header watcher toggles DOM classes. `cells` and `cells+headers`
  // both pulse the cell/row here.
  if (
    pulse?.enabled &&
    (pulse.target === 'cells' || pulse.target === 'cells+headers' || pulse.target === 'row')
  ) {
    lines.push(`${cls} { animation: gc-flash-pulse var(--gc-flash-period, 1s) infinite ease-in-out; }`);
  }

  // ── Indicator badge (top-right ::before) ──
  const indicatorCss = indicatorOverlayCSS(cls, indicator);
  if (indicatorCss) lines.push(indicatorCss);

  // ── Row-scope separator kill ──
  // When the class lands on `.ag-row`, AG-Grid's own `border-bottom`
  // (driven by the theme's `rowBorderColor`) still paints on top of the
  // highlight — adjacent styled rows end up separated by a stripe.
  // `!important` is required: the theme emits its rule via `.ag-theme-* .ag-row`
  // which matches at the same specificity level AND loads after our <style>
  // tag on re-mount, so plain 2-class specificity isn't enough in practice.
  // This matches the `!important` pattern shown in AG-Grid's own rowClassRules
  // docs for background overrides.
  if (scopeType === 'row') {
    lines.push(`.ag-row${cls} { border-color: transparent !important; }`);
  }

  // ── Border overlay via ::after pseudo-element + inset box-shadow ──
  // Borders are theme-aware too: light borders for light theme, dark for dark.
  const lightBorder = borderOverlayCSS(`:root:not(.dark):not([data-theme="dark"]) ${cls}`, light);
  const darkBorder = borderOverlayCSS(`.dark ${cls}`, dark)
    + (borderOverlayCSS(`[data-theme="dark"] ${cls}`, dark) ? '\n' + borderOverlayCSS(`[data-theme="dark"] ${cls}`, dark) : '');
  if (lightBorder) lines.push(lightBorder);
  if (darkBorder) lines.push(darkBorder);
  // Fallback (same as non-border)
  if (lightBorder && !darkBorder) {
    const fallback = borderOverlayCSS(cls, light);
    if (fallback) lines.push(fallback);
  }

  return lines.join('\n');
}

function reinjectAllRules(injector: CssInjector, rules: ConditionalRule[]): void {
  injector.clear();
  // Keep flash keyframes alive across every re-inject — they're
  // module-scoped, not per-rule.
  injector.addRule(FLASH_PULSE_RULE_ID, FLASH_PULSE_CSS);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const pulse = rule.flash?.enabled
      ? { enabled: true, scope: rule.scope.type, target: rule.flash.target }
      : null;
    injector.addRule(
      `conditional-${rule.id}`,
      buildCssText(
        rule.id,
        rule.scope.type,
        rule.style.light,
        rule.style.dark,
        pulse,
        rule.indicator,
      ),
    );
  }
}

// ─── Class-rule builders ────────────────────────────────────────────────────

/**
 * Compile to an AG-Grid string expression when possible (zero per-cell JS
 * cost), otherwise fall back to a function that re-evaluates the AST each
 * cell render. Errors during evaluation are swallowed — a broken rule must
 * not crash the grid.
 */
function buildCellClassPredicate(
  engine: ExpressionEngine,
  rule: ConditionalRule,
): ((params: CellClassParams) => boolean) | string {
  try {
    const ast = engine.parse(rule.expression);
    const agString = engine.tryCompileToAgString(ast);
    if (agString) return agString;
  } catch {
    // Parse error → fall through to function form, which will also fail but
    // does so per-cell silently rather than at transform time.
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

function buildRowClassPredicate(engine: ExpressionEngine, rule: ConditionalRule): (params: RowClassParams) => boolean {
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

// ─── Column-def transform ───────────────────────────────────────────────────

function applyCellRulesToDefs(
  defs: AnyColDef[],
  cellRules: ConditionalRule[],
  engine: ExpressionEngine,
): AnyColDef[] {
  return defs.map((def) => {
    if ('children' in def && Array.isArray(def.children)) {
      const next = applyCellRulesToDefs(def.children, cellRules, engine);
      // Only rebuild the group when at least one child reference changed.
      const childrenUnchanged =
        next.length === def.children.length && next.every((c, i) => c === def.children[i]);
      return childrenUnchanged ? def : ({ ...def, children: next } as ColGroupDef);
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

    return { ...colDef, cellClassRules };
  });
}

// ─── Flash runtime ──────────────────────────────────────────────────────────
//
// The "flash" is a continuous CSS pulse that runs WHILE the rule's
// condition is true — it's a warning indicator, not a transient
// highlight. The class that drives the pulse is attached by AG-Grid's
// own cellClassRules / rowClassRules (same predicate as the style
// class), so when the value transitions out of match range the class
// falls off and the pulse stops automatically.
//
// For HEADERS target we can't use cellClassRules (AG-Grid has no
// `headerClassRules`), so we watch `modelUpdated` and toggle a
// `.gc-flash-hdr-pulse` class on each qualifying column header whenever
// ANY cell in that column currently matches the rule.

type HeaderFlashApi = {
  addEventListener: (evt: string, fn: (e: unknown) => void) => void;
  removeEventListener: (evt: string, fn: (e: unknown) => void) => void;
  forEachNode?: (cb: (n: { data?: Record<string, unknown> }) => void) => void;
  forEachNodeAfterFilter?: (cb: (n: { data?: Record<string, unknown> }) => void) => void;
};

function togglePulseHeader(colId: string, on: boolean): void {
  const nodes = document.querySelectorAll(`.ag-header-cell[col-id="${CSS.escape(colId)}"]`);
  nodes.forEach((el) => {
    const node = el as HTMLElement;
    if (on) node.classList.add('gc-flash-hdr-pulse');
    else node.classList.remove('gc-flash-hdr-pulse');
  });
}

/**
 * Attach a modelUpdated listener that, for every rule with
 * `target: 'headers' | 'cells+headers'`, evaluates the rule against
 * every visible row to determine whether ANY row currently matches for
 * each target column. Qualifying column headers get the pulse class;
 * non-qualifying headers lose it.
 *
 * No-op at the data-layer level when no rules currently need header
 * pulses — iteration still runs but is bounded by rules × columns and
 * short-circuits when nothing is subscribed.
 */
function attachHeaderFlashWatcher(
  gridId: string,
  ctx: { gridApi: unknown; getModuleState: <T>(id: string) => T },
): void {
  const api = ctx.gridApi as HeaderFlashApi | undefined;
  if (!api || typeof api.addEventListener !== 'function') return;

  const resources = getOrCreateResources(gridId);

  // Guard against double-attach on hot-reload.
  resources.headerFlashDetach?.();

  const evaluate = () => {
    const state = ctx.getModuleState<ConditionalStylingState>('conditional-styling');
    const { engine } = resources;

    // A rule is eligible to paint a header when:
    //   - its scope is `cell` (row-scope rules have no column home);
    //   - its flash target includes `headers`, OR
    //   - its indicator is set (the indicator rides the same "any row
    //     in this column matches" semantics the pulse uses).
    const headerFlashRules = state.rules.filter(
      (r) =>
        r.enabled &&
        r.flash?.enabled &&
        r.scope.type === 'cell' &&
        (r.flash.target === 'headers' || r.flash.target === 'cells+headers'),
    );
    const headerIndicatorRules = state.rules.filter((r) => {
      if (!r.enabled || r.scope.type !== 'cell' || !r.indicator?.icon) return false;
      // Only rules whose indicator target explicitly covers headers
      // should paint the rule class on the header DOM. Default is
      // 'cells+headers' for backward-compat with the first indicator
      // release.
      const target = r.indicator.target ?? 'cells+headers';
      return target === 'headers' || target === 'cells+headers';
    });

    // STEP 1: wipe every currently-painted header state. Two class
    // families: pulse + per-rule indicator. Clearing both on every
    // evaluate is how disabling a rule (or changing its target) cleans
    // up stale paint that data events alone wouldn't touch.
    document.querySelectorAll('.ag-header-cell.gc-flash-hdr-pulse').forEach((el) => {
      el.classList.remove('gc-flash-hdr-pulse');
    });
    document
      .querySelectorAll('.ag-header-cell[class*=" gc-rule-"], .ag-header-cell[class^="gc-rule-"]')
      .forEach((el) => {
        [...el.classList].forEach((c) => {
          if (c.startsWith('gc-rule-')) el.classList.remove(c);
        });
      });

    // STEP 2: compute which columns should be painted now.
    const iter = api.forEachNodeAfterFilter ?? api.forEachNode;
    if (!iter) return;

    const pulseColumnsOn = new Set<string>();
    // Per-rule: columns where ANY row matches → indicator shows.
    const indicatorColumnsOn = new Map<string, Set<string>>(); // ruleId → Set<colId>

    const evalAnyRowMatches = (rule: ConditionalRule): boolean => {
      let anyMatch = false;
      iter.call(api, (node) => {
        if (anyMatch) return;
        const data = node.data ?? {};
        try {
          if (
            engine.parseAndEvaluate(rule.expression, {
              x: null,
              value: null,
              data,
              columns: data,
            })
          ) {
            anyMatch = true;
          }
        } catch {
          /* swallow per-row errors */
        }
      });
      return anyMatch;
    };

    for (const rule of headerFlashRules) {
      if (rule.scope.type !== 'cell') continue;
      if (evalAnyRowMatches(rule)) {
        for (const colId of rule.scope.columns) pulseColumnsOn.add(colId);
      }
    }
    for (const rule of headerIndicatorRules) {
      if (rule.scope.type !== 'cell') continue;
      if (evalAnyRowMatches(rule)) {
        indicatorColumnsOn.set(rule.id, new Set(rule.scope.columns));
      }
    }

    // STEP 3: paint the qualifying columns.
    for (const colId of pulseColumnsOn) {
      togglePulseHeader(colId, true);
    }
    for (const [ruleId, cols] of indicatorColumnsOn) {
      for (const colId of cols) {
        const nodes = document.querySelectorAll(
          `.ag-header-cell[col-id="${CSS.escape(colId)}"]`,
        );
        nodes.forEach((el) => el.classList.add(`gc-rule-${ruleId}`));
      }
    }
  };

  const listener = () => evaluate();
  api.addEventListener('modelUpdated', listener);
  api.addEventListener('filterChanged', listener);
  api.addEventListener('cellValueChanged', listener);

  // Run once immediately so rules whose match state is already true at
  // mount (common: a profile load) paint the header pulse without
  // waiting for a data event.
  evaluate();

  resources.headerFlashDetach = () => {
    try {
      api.removeEventListener('modelUpdated', listener);
      api.removeEventListener('filterChanged', listener);
      api.removeEventListener('cellValueChanged', listener);
    } catch {
      /* api may already be gone */
    }
    // Clear any leftover pulse classes so destroyed grids don't leave
    // stray animations on cached header DOM.
    document.querySelectorAll('.ag-header-cell.gc-flash-hdr-pulse').forEach((el) => {
      el.classList.remove('gc-flash-hdr-pulse');
    });
    resources.headerFlashEvaluate = undefined;
  };
  // Expose the evaluator so rule-state changes (not data changes) can
  // trigger a re-evaluation from outside the listener — specifically
  // from transformColumnDefs/Options, which re-run whenever the rule
  // list is edited but don't necessarily produce a data event.
  resources.headerFlashEvaluate = evaluate;
}

function detachHeaderFlashWatcher(gridId: string): void {
  const r = _gridResources.get(gridId);
  r?.headerFlashDetach?.();
  if (r) r.headerFlashDetach = undefined;
}

// ─── Module ─────────────────────────────────────────────────────────────────

export const conditionalStylingModule: Module<ConditionalStylingState> = {
  id: 'conditional-styling',
  name: 'Style Rules',
  code: '01',
  schemaVersion: 1,
  // Runs after column-customization (priority 10) so per-rule classes layer
  // on top of any structural changes. Stays in front of any host-specific
  // toolbars (1000+) so the toolbar can read finalized class rules.
  priority: 20,

  getInitialState: () => ({ ...INITIAL_CONDITIONAL_STYLING, rules: [] }),

  onRegister(ctx) {
    // Allocate the per-grid resources up front + inject CSS for any rules
    // that came in from a profile load. transformColumnDefs may run before
    // this on first mount (depends on host), so this `getOrCreateResources`
    // is intentionally idempotent. `reinjectAllRules` also restamps the
    // header-flash keyframes.
    const { cssInjector } = getOrCreateResources(ctx.gridId);
    const state = ctx.getModuleState<ConditionalStylingState>('conditional-styling');
    reinjectAllRules(cssInjector, state.rules);
  },

  onGridReady(ctx) {
    // Header-flash target can't ride cellClassRules (AG-Grid has no
    // headerClassRules), so we watch data updates and toggle a pulse
    // class on qualifying column headers imperatively.
    attachHeaderFlashWatcher(ctx.gridId, ctx);
  },

  onGridDestroy(ctx) {
    detachHeaderFlashWatcher(ctx.gridId);
    const r = _gridResources.get(ctx.gridId);
    if (!r) return;
    r.cssInjector.destroy();
    _gridResources.delete(ctx.gridId);
  },

  transformColumnDefs(defs, state, gridCtx) {
    const resources = getOrCreateResources(gridCtx.gridId);
    const { engine, cssInjector } = resources;
    // Keep the <style> tag in lockstep with the rule list. Cheap: we only
    // diff via Map size + iteration in `flush`, and the transform pipeline
    // re-runs on state changes anyway.
    reinjectAllRules(cssInjector, state.rules);

    // Re-run the header-flash evaluator whenever the rule list changes
    // so "disable flash" (or change target) in the panel clears any
    // stale `.gc-flash-hdr-pulse` classes that data events alone
    // wouldn't touch. No-op if the watcher hasn't attached yet
    // (onGridReady runs after the first transformColumnDefs on some
    // host layouts).
    resources.headerFlashEvaluate?.();

    const cellRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'cell')
      .sort((a, b) => a.priority - b.priority);
    if (cellRules.length === 0) return defs;
    return applyCellRulesToDefs(defs, cellRules, engine);
  },

  transformGridOptions(opts, state, gridCtx) {
    const rowRules = state.rules
      .filter((r) => r.enabled && r.scope.type === 'row')
      .sort((a, b) => a.priority - b.priority);

    const { engine } = getOrCreateResources(gridCtx.gridId);

    // Always emit `rowClassRules` — even when empty — so the host's
    // `setGridOption` sync loop clears stale predicates when a rule's scope
    // flips from `row` → `cell`. Returning `opts` unchanged leaves AG-Grid
    // with the previous `gc-rule-<id>` class still attached to every row,
    // which is exactly the "style always applies to the row even when a
    // column is selected" bug.
    const rowClassRules: NonNullable<typeof opts.rowClassRules> = {
      ...((opts.rowClassRules as Record<string, unknown>) ?? {}),
    } as NonNullable<typeof opts.rowClassRules>;

    for (const rule of rowRules) {
      (rowClassRules as Record<string, unknown>)[`gc-rule-${rule.id}`] = buildRowClassPredicate(engine, rule);
    }
    return { ...opts, rowClassRules };
  },

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') return { rules: [] };
    const d = raw as Partial<ConditionalStylingState>;
    const rules = Array.isArray(d.rules) ? d.rules : [];
    // Defensive shape-normalization: legacy profiles won't have `flash`;
    // newer profiles with a malformed flash block get coerced to a no-op
    // so the runtime never sees a partially-valid state.
    return {
      rules: rules.map((r) => {
        let next = r;
        if (r.flash) {
          const { enabled, target, flashDuration, fadeDuration } = r.flash;
          const scope = r.scope?.type ?? 'cell';
          const allowed: Record<string, true> =
            scope === 'row'
              ? { row: true }
              : { cells: true, headers: true, 'cells+headers': true };
          const normalizedTarget = allowed[target as string] ? target : scope === 'row' ? 'row' : 'cells';
          next = {
            ...next,
            flash: {
              enabled: Boolean(enabled),
              target: normalizedTarget,
              ...(typeof flashDuration === 'number' ? { flashDuration } : {}),
              ...(typeof fadeDuration === 'number' ? { fadeDuration } : {}),
            },
          };
        }
        // Indicator: accept only the two known keys so legacy / malformed
        // payloads don't pollute the state. Drop the block entirely when
        // the icon key is missing — the UI treats absence as "no badge".
        if (r.indicator && typeof r.indicator === 'object') {
          const { icon, color, target, position } = r.indicator;
          if (typeof icon === 'string' && icon.length > 0) {
            const normalizedTarget: 'cells' | 'headers' | 'cells+headers' =
              target === 'cells' || target === 'headers' || target === 'cells+headers'
                ? target
                : 'cells+headers';
            const normalizedPosition: 'top-left' | 'top-right' =
              position === 'top-left' ? 'top-left' : 'top-right';
            next = {
              ...next,
              indicator: {
                icon,
                target: normalizedTarget,
                position: normalizedPosition,
                ...(typeof color === 'string' && color.length > 0 ? { color } : {}),
              },
            };
          } else {
            const { indicator: _drop, ...rest } = next;
            next = rest;
          }
        }
        return next;
      }),
    };
  },

  SettingsPanel: ConditionalStylingPanel,
  ListPane: ConditionalStylingList,
  EditorPane: ConditionalStylingEditor,
};

// ─── Test-only escape hatch ────────────────────────────────────────────────
// Lets unit tests reset the per-grid singleton map between cases without
// having to spin up a full GridCore. Not part of the public API.
/** @internal */
export function _resetConditionalStylingResourcesForTests(): void {
  for (const r of _gridResources.values()) r.cssInjector.destroy();
  _gridResources.clear();
}

export type {
  CellStyleProperties,
  ConditionalRule,
  ConditionalStylingState,
  FlashConfig,
  FlashTarget,
  IndicatorPosition,
  IndicatorTarget,
  RuleIndicator,
  RuleScope,
  ThemeAwareStyle,
} from './state';
export { INDICATOR_ICONS, findIndicatorIcon } from './indicatorIcons';
export type { IndicatorIconDef } from './indicatorIcons';
export { INITIAL_CONDITIONAL_STYLING } from './state';
