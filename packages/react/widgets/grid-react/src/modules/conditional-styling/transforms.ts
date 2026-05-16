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
import type {
  AnyColDef,
  CssHandle,
  ExpressionEngineLike,
  ExpressionNode,
} from '@starui/core';
import { valueFormatterFromTemplate } from '@starui/core';
import { cssEscapeColId } from '../column-customization/transforms';
import type {
  CellStyleProperties,
  ConditionalRule,
  FlashColor,
  FlashMode,
  FlashTarget,
  RuleIndicator,
} from './state';
import { findIndicatorIcon, iconAsDataUrl } from './indicatorIcons';

export interface CellDiffEntry {
  oldValue: unknown;
  newValue: unknown;
}

export type RowDiffMap = Map<string, CellDiffEntry>;
export type RowDiffCache = WeakMap<object, RowDiffMap>;
export type DiffCacheByApi = WeakMap<object, RowDiffCache>;
export type TimedRuleStateByRule = Map<string, { rowUntil?: number; cellsUntil: Map<string, number> }>;
export type TimedRuleStateByRowId = Map<string, TimedRuleStateByRule>;
export type TimedRuleStateByApi = WeakMap<object, TimedRuleStateByRowId>;

export const CONDITIONAL_DIFF_CACHE_KEY = 'conditional-styling:cell-diff-cache';
export const CONDITIONAL_TIMED_RULE_CACHE_KEY = 'conditional-styling:timed-rule-cache';
export const CONDITIONAL_TIMED_RULE_BUCKET_KEY = {} as const;
const TRACE_PREFIX = '[conditional-styling:timed]';
const timedRuleStateByRowId: TimedRuleStateByRowId = new Map();

// Cached earliest pending expiry across the whole map. `null` means "no
// entries pending"; `undefined` means "stale — recompute on next read".
// Updated incrementally on insert (cheap O(1) min-check) and invalidated
// wholesale on any prune (recomputed lazily via a single map walk when
// `getNextTimedExpiry` is next called). Keeps `armNextExpiry` O(1) in
// the hot insert path and bounds the walk to once per prune burst.
let cachedNextExpiry: number | null | undefined = null;

export function clearTimedRuleState(): void {
  timedRuleStateByRowId.clear();
  cachedNextExpiry = null;
}

function noteExpiryInserted(at: number): void {
  if (cachedNextExpiry === undefined) return; // already stale
  if (cachedNextExpiry === null || at < cachedNextExpiry) {
    cachedNextExpiry = at;
  }
}

function invalidateExpiryCache(): void {
  cachedNextExpiry = undefined;
}

export function upsertTimedRowActivation(
  rowId: string,
  ruleId: string,
  until: number,
): void {
  let byRule = timedRuleStateByRowId.get(rowId);
  if (!byRule) {
    byRule = new Map<string, { rowUntil?: number; cellsUntil: Map<string, number> }>();
    timedRuleStateByRowId.set(rowId, byRule);
  }
  const prev = byRule.get(ruleId);
  if (!prev) {
    byRule.set(ruleId, { rowUntil: until, cellsUntil: new Map() });
    noteExpiryInserted(until);
    traceTimed('upsertTimedRowRule:new', { rowId, ruleId, until });
    return;
  }
  prev.rowUntil = Math.max(prev.rowUntil ?? 0, until);
  noteExpiryInserted(prev.rowUntil);
  traceTimed('upsertTimedRowRule:update', { rowId, ruleId, until: prev.rowUntil });
}

export function upsertTimedCellActivation(
  rowId: string,
  ruleId: string,
  colId: string,
  until: number,
): void {
  let byRule = timedRuleStateByRowId.get(rowId);
  if (!byRule) {
    byRule = new Map<string, { rowUntil?: number; cellsUntil: Map<string, number> }>();
    timedRuleStateByRowId.set(rowId, byRule);
  }
  const prev = byRule.get(ruleId);
  if (!prev) {
    byRule.set(ruleId, { cellsUntil: new Map([[colId, until]]) });
    noteExpiryInserted(until);
    traceTimed('upsertTimedCellRule:new', { rowId, ruleId, colId, until });
    return;
  }
  prev.cellsUntil.set(colId, Math.max(prev.cellsUntil.get(colId) ?? 0, until));
  noteExpiryInserted(prev.cellsUntil.get(colId) ?? until);
  traceTimed('upsertTimedCellRule:update', {
    rowId,
    ruleId,
    colId,
    until: prev.cellsUntil.get(colId),
  });
}

/**
 * Returns the earliest pending expiry timestamp (ms since epoch) across
 * all timed activations, or `null` if nothing is currently active.
 *
 * Used by the coalesced expiry scheduler in `index.ts` to arm a single
 * timer for the nearest activation instead of one timer per activation
 * — keeps timer churn O(1) regardless of tick rate.
 */
export function getNextTimedExpiry(): number | null {
  // Fast path — cache valid → O(1).
  if (cachedNextExpiry !== undefined) return cachedNextExpiry;
  // Cold path — recompute by walking the map once.
  let next: number | null = null;
  for (const byRule of timedRuleStateByRowId.values()) {
    for (const entry of byRule.values()) {
      if (entry.rowUntil != null && (next == null || entry.rowUntil < next)) {
        next = entry.rowUntil;
      }
      for (const expiry of entry.cellsUntil.values()) {
        if (next == null || expiry < next) next = expiry;
      }
    }
  }
  cachedNextExpiry = next;
  return next;
}

export function pruneTimedRuleState(activeRowIds: Set<string>): void {
  const now = Date.now();
  let mutated = false;
  for (const [rowId, byRule] of timedRuleStateByRowId) {
    if (!activeRowIds.has(rowId)) {
      timedRuleStateByRowId.delete(rowId);
      mutated = true;
      continue;
    }
    for (const [ruleId, entry] of byRule) {
      if (entry.rowUntil != null && entry.rowUntil <= now) {
        entry.rowUntil = undefined;
        mutated = true;
      }
      for (const [colId, expiry] of entry.cellsUntil) {
        if (expiry <= now) {
          entry.cellsUntil.delete(colId);
          mutated = true;
        }
      }
      if (!entry.rowUntil && entry.cellsUntil.size === 0) {
        byRule.delete(ruleId);
        mutated = true;
      }
    }
    if (byRule.size === 0) {
      timedRuleStateByRowId.delete(rowId);
      mutated = true;
    }
  }
  if (mutated) invalidateExpiryCache();
}

/**
 * Drop timed-state entries whose rule no longer exists in the active set
 * (e.g. after a profile load that removes / replaces the prior profile's
 * rules). Without this, stale entries from the previous profile keep
 * `getNextTimedExpiry()` returning a non-null timestamp, the coalesced
 * expiry timer arms with delay 0/8 ms, fires, re-evaluates against an
 * empty rule set, and re-arms forever — visible in the console as a
 * tight `armNextExpiry` / `expiry refresh fired` loop.
 *
 * Pass the current set of timed rule ids (rules with `activeDurationMs`).
 * Any entry keyed by a rule outside that set is dropped wholesale.
 */
export function pruneTimedRuleStateByRuleSet(activeTimedRuleIds: Set<string>): void {
  let mutated = false;
  for (const [rowId, byRule] of timedRuleStateByRowId) {
    for (const ruleId of byRule.keys()) {
      if (!activeTimedRuleIds.has(ruleId)) {
        byRule.delete(ruleId);
        mutated = true;
      }
    }
    if (byRule.size === 0) {
      timedRuleStateByRowId.delete(rowId);
      mutated = true;
    }
  }
  if (mutated) invalidateExpiryCache();
}

/**
 * Collect the (rowId, colIds) pairs whose entries are expired (until ≤
 * now), then drop those entries. Used by the expiry timer to compute
 * the targeted refresh surface AND clear the state in one pass —
 * cheaper than a follow-up `pruneTimedRuleState(activeRowIds)` walk.
 *
 * `rowScope` carries entries that had `rowUntil` set (row-scope rules);
 * the caller refreshes the entire row's currently visible cells.
 * `cellScope` carries entries that had `cellsUntil` set (cell-scope
 * rules); the caller refreshes the precise (rowId, colId) pairs.
 */
export function collectAndPruneExpiredTimedEntries(): {
  rowScope: Array<{ rowId: string }>;
  cellScope: Array<{ rowId: string; colIds: string[] }>;
} {
  const now = Date.now();
  const rowScope: Array<{ rowId: string }> = [];
  const cellScope: Array<{ rowId: string; colIds: string[] }> = [];
  let mutated = false;

  for (const [rowId, byRule] of timedRuleStateByRowId) {
    let rowExpiredForThisRow = false;
    const cellColsExpiredForThisRow = new Set<string>();

    for (const [ruleId, entry] of byRule) {
      if (entry.rowUntil != null && entry.rowUntil <= now) {
        rowExpiredForThisRow = true;
        entry.rowUntil = undefined;
        mutated = true;
      }
      for (const [colId, expiry] of entry.cellsUntil) {
        if (expiry <= now) {
          cellColsExpiredForThisRow.add(colId);
          entry.cellsUntil.delete(colId);
          mutated = true;
        }
      }
      if (!entry.rowUntil && entry.cellsUntil.size === 0) {
        byRule.delete(ruleId);
        mutated = true;
      }
    }

    if (rowExpiredForThisRow) rowScope.push({ rowId });
    if (cellColsExpiredForThisRow.size > 0) {
      cellScope.push({ rowId, colIds: [...cellColsExpiredForThisRow] });
    }
    if (byRule.size === 0) {
      timedRuleStateByRowId.delete(rowId);
      mutated = true;
    }
  }
  if (mutated) invalidateExpiryCache();
  return { rowScope, cellScope };
}

// ─── Flash palette + base keyframes (module-scoped, shipped once per grid) ─

/**
 * Flash colour palette. Each entry ships a tuned alpha for both themes
 * so the same named colour stays readable under light AND dark without
 * per-rule colour math. Alphas were picked to leave cell text legible.
 *
 * Adding a new colour: append it to the {@link FlashColor} union, add the
 * tuple here, and the editor's colour swatches pick it up automatically.
 */
export const FLASH_PALETTE: Record<FlashColor, { light: string; dark: string; swatch: string }> = {
  amber:   { light: 'rgba(251, 191, 36, 0.42)',  dark: 'rgba(251, 191, 36, 0.32)',  swatch: '#fbbf24' },
  emerald: { light: 'rgba(16, 185, 129, 0.38)',  dark: 'rgba(16, 185, 129, 0.32)',  swatch: '#10b981' },
  rose:    { light: 'rgba(244, 63, 94, 0.38)',   dark: 'rgba(244, 63, 94, 0.34)',   swatch: '#f43f5e' },
  sky:     { light: 'rgba(14, 165, 233, 0.38)',  dark: 'rgba(56, 189, 248, 0.32)',  swatch: '#0ea5e9' },
  violet:  { light: 'rgba(139, 92, 246, 0.36)',  dark: 'rgba(167, 139, 250, 0.32)', swatch: '#8b5cf6' },
  teal:    { light: 'rgba(20, 184, 166, 0.38)',  dark: 'rgba(45, 212, 191, 0.30)',  swatch: '#14b8a6' },
  orange:  { light: 'rgba(249, 115, 22, 0.40)',  dark: 'rgba(251, 146, 60, 0.32)',  swatch: '#f97316' },
  slate:   { light: 'rgba(100, 116, 139, 0.38)', dark: 'rgba(148, 163, 184, 0.30)', swatch: '#64748b' },
};

const DEFAULT_FLASH_COLOR: FlashColor = 'amber';
const DEFAULT_FLASH_MODE: FlashMode = 'oneShot';
const DEFAULT_FLASH_DURATION_MS = 700;

/**
 * Palette CSS rule — emits one `--ds-flash-<color>` variable per palette
 * entry, branched on theme. Per-rule classes resolve their colour by
 * referencing the variable instead of baking the RGBA in, so a global
 * palette tweak takes effect without re-emitting per-rule classes.
 */
const FLASH_PALETTE_RULE_ID = '__flash-palette__';
function buildFlashPaletteCss(): string {
  const lightVars = Object.entries(FLASH_PALETTE)
    .map(([name, c]) => `--ds-flash-${name}: ${c.light};`)
    .join(' ');
  const darkVars = Object.entries(FLASH_PALETTE)
    .map(([name, c]) => `--ds-flash-${name}: ${c.dark};`)
    .join(' ');
  return `
:root:not(.dark):not([data-theme="dark"]) { ${lightVars} }
.dark, [data-theme="dark"] { ${darkVars} }
`;
}
const FLASH_PALETTE_CSS = buildFlashPaletteCss();

/**
 * Per-rule animation keyframes. We mint a unique animation NAME per rule
 * (`ds-flash-<safeRuleId>`) so two flashing rules on the same cell don't
 * collide on the `animation` shorthand property — each gets its own
 * `--ds-flash-color` reference baked into a private keyframes block.
 *
 * Both modes share the same keyframes shape (in → hold → out); pulse
 * mode just repeats it. This keeps the generated CSS small and means a
 * mode flip is a one-property change.
 */
function buildFlashKeyframesCss(safeRuleId: string): string {
  const kf = `ds-flash-${safeRuleId}`;
  return `
@keyframes ${kf} {
  0%   { box-shadow: inset 0 0 0 9999px transparent; }
  25%  { box-shadow: inset 0 0 0 9999px var(--ds-flash-color); }
  75%  { box-shadow: inset 0 0 0 9999px var(--ds-flash-color); }
  100% { box-shadow: inset 0 0 0 9999px transparent; }
}
`;
}

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
 * Per-side borders rendered on a `::after` pseudo-element using real
 * CSS border properties (NOT `inset box-shadow`, which silently drops
 * the `style` so dashed / dotted never render). DO NOT emit
 * `position: relative` on the target — caused a header-layout
 * regression historically.
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

function indicatorOverlayCSS(
  ruleCls: string,
  indicator: RuleIndicator | undefined,
  scopeType: 'cell' | 'row',
): string {
  if (!indicator) return '';
  const def = findIndicatorIcon(indicator.icon);
  if (!def) return '';
  const color = indicator.color || 'currentColor';
  const url = iconAsDataUrl(def, color);

  const target = indicator.target ?? 'cells+headers';
  const selectors = scopeType === 'row'
    ? [`.ag-row${ruleCls} .ag-cell`]
    : target === 'cells' ? [`.ag-cell${ruleCls}`]
    : target === 'headers' ? [`.ag-header-cell${ruleCls}`]
    : [`.ag-cell${ruleCls}`, `.ag-header-cell${ruleCls}`];

  const pos = indicator.position ?? 'top-right';
  let anchor = 'top: 2px; right: 2px;';
  if (pos === 'top-left') anchor = 'top: 2px; left: 2px;';
  else if (pos === 'bottom-left') anchor = 'bottom: 2px; left: 2px;';
  else if (pos === 'bottom-right') anchor = 'bottom: 2px; right: 2px;';
  else if (pos === 'left-middle') anchor = 'top: 50%; left: 2px; transform: translateY(-50%);';
  else if (pos === 'right-middle') anchor = 'top: 50%; right: 2px; transform: translateY(-50%);';

  return `${selectors.map((selector) => `${selector}::before`).join(', ')} {
    content: ''; position: absolute; ${anchor}
    width: 12px; height: 12px;
    background-image: url("${url}");
    background-size: contain; background-repeat: no-repeat; background-position: center;
    pointer-events: none; z-index: 2;
  }`;
}

function buildCssText(
  ruleId: string,
  scopeType: 'cell' | 'row',
  light: CellStyleProperties,
  dark: CellStyleProperties,
  flash: {
    enabled: boolean;
    target: FlashTarget;
    mode: FlashMode;
    color: FlashColor;
    durationMs: number;
  } | null,
  indicator: RuleIndicator | undefined,
): string {
  // Encode rule id with the same helper column-customization uses so a
  // future rule.id with chars outside [A-Za-z0-9_-] still produces a
  // matching class + selector pair. base36 generateId() is currently
  // safe but defense-in-depth for legacy snapshots / future id schemes.
  const safeRuleId = cssEscapeColId(ruleId);
  const cls = `.ds-rule-${safeRuleId}`;
  const surfaceSelector = scopeType === 'row' ? `.ag-row${cls} .ag-cell` : `.ag-cell${cls}`;
  const lightProps = styleToCSS(light);
  const darkProps = styleToCSS(dark);
  const lines: string[] = [];

  if (lightProps) lines.push(`:root:not(.dark):not([data-theme="dark"]) ${surfaceSelector} { ${lightProps} }`);
  if (darkProps) lines.push(`.dark ${surfaceSelector}, [data-theme="dark"] ${surfaceSelector} { ${darkProps} }`);
  if (lightProps && !darkProps) lines.push(`${surfaceSelector} { ${lightProps} }`);

  if (flash?.enabled) {
    // Scoped colour var: keeps two flashing rules on the same cell from
    // overwriting each other's colour. The cascade still picks one
    // `animation` winner (last-declared by priority), but each rule
    // keeps its own colour identity in isolation.
    const colorVar = `var(--ds-flash-${flash.color})`;
    const animName = `ds-flash-${safeRuleId}`;
    const iter = flash.mode === 'pulse' ? 'infinite' : '1';
    const fill = flash.mode === 'pulse' ? 'none' : 'forwards';
    const animDecl = `animation: ${animName} ${flash.durationMs}ms ease-in-out ${iter}; animation-fill-mode: ${fill};`;
    const colorDecl = `--ds-flash-color: ${colorVar};`;

    // Cell / row flash uses the rule's own class — the animation joins
    // the existing per-rule cell styling naturally.
    if (flash.target === 'cells' || flash.target === 'cells+headers' || flash.target === 'row') {
      lines.push(`${surfaceSelector} { ${colorDecl} ${animDecl} }`);
    }
    // Header flash uses a DEDICATED class so the rule's cell styling
    // (background-color, borders, etc.) doesn't leak onto the header —
    // only the colour-aware pulse is shared. Painted by index.ts's
    // header DOM watcher (AG-Grid has no headerClassRules).
    if (flash.target === 'headers' || flash.target === 'cells+headers') {
      const hdrCls = `.ag-header-cell.ds-flash-hdr-${safeRuleId}`;
      lines.push(`${hdrCls} { ${colorDecl} ${animDecl} }`);
    }
  }

  const indicatorCss = indicatorOverlayCSS(cls, indicator, scopeType);
  if (indicatorCss) lines.push(indicatorCss);

  // Row-scope separator kill — the theme's `.ag-row` border-bottom visibly
  // stripes adjacent highlighted rows without the `!important`.
  if (scopeType === 'row') {
    lines.push(`.ag-row${cls} { border-color: transparent !important; }`);
  }

  const lightBorder = borderOverlayCSS(`:root:not(.dark):not([data-theme="dark"]) ${surfaceSelector}`, light);
  const darkBorder1 = borderOverlayCSS(`.dark ${surfaceSelector}`, dark);
  const darkBorder2 = borderOverlayCSS(`[data-theme="dark"] ${surfaceSelector}`, dark);
  if (lightBorder) lines.push(lightBorder);
  if (darkBorder1) lines.push(darkBorder1);
  if (darkBorder2) lines.push(darkBorder2);
  if (lightBorder && !darkBorder1 && !darkBorder2) {
    const fallback = borderOverlayCSS(surfaceSelector, light);
    if (fallback) lines.push(fallback);
  }

  return lines.join('\n');
}

export function reinjectAllRules(css: CssHandle, rules: ConditionalRule[]): void {
  css.clear();
  // Palette ships once — per-rule classes reference --ds-flash-<color>.
  css.addRule(FLASH_PALETTE_RULE_ID, FLASH_PALETTE_CSS);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const safeRuleId = cssEscapeColId(rule.id);
    const flash = rule.flash?.enabled
      ? {
          enabled: true,
          target: rule.flash.target,
          mode: rule.flash.mode ?? DEFAULT_FLASH_MODE,
          color: rule.flash.color ?? DEFAULT_FLASH_COLOR,
          durationMs:
            typeof rule.flash.durationMs === 'number' && rule.flash.durationMs > 0
              ? Math.round(rule.flash.durationMs)
              : DEFAULT_FLASH_DURATION_MS,
        }
      : null;
    if (flash) {
      // Per-rule keyframes — unique name so rules with different
      // durationMs / mode don't fight over the shared `animation` slot.
      css.addRule(`conditional-flash-kf-${rule.id}`, buildFlashKeyframesCss(safeRuleId));
    }
    css.addRule(
      `conditional-${rule.id}`,
      buildCssText(rule.id, rule.scope.type, rule.style.light, rule.style.dark, flash, rule.indicator),
    );
  }
}

// ─── Trigger-column extraction ─────────────────────────────────────────────

/**
 * Walk a parsed expression AST and collect every column the predicate
 * depends on. Used by the runtime to know which value changes should
 * provoke a refresh / re-evaluation of a rule's `scope.columns` — without
 * this, AG-Grid only re-evaluates `cellClassRules` on the cell whose own
 * value changed, so a rule like `[price.old] < [price.new]` with scope
 * `['side','quantity']` would never repaint `side`/`quantity` when
 * `price` ticks.
 *
 * Triggers are stored as the **full dot-path** that AG-Grid uses as the
 * column id when `field` walks into a nested object (e.g. `field:
 * 'position.price'` → colId `'position.price'`). This keeps trigger keys
 * directly comparable against:
 *   - AG-Grid's `cellValueChanged` event `column.getColId()`
 *   - the path-keyed diff snapshot maintained by `processTimedActivations`
 *
 * Sources of column dependencies (covers the surfaces the editor docs
 * and the engine's evaluator actually wire up):
 *   - `[col]` / `[col.old]` / `[col.new]` — `ColumnRefNode` (diff suffix
 *     stripped; full nested path preserved)
 *   - `data.x.y.z` — `MemberNode` chain rooted on the `data` variable,
 *     collapsed into trigger `'x.y.z'`
 *   - `columns.x.y.z` — same, rooted on the `columns` (diff-aware) variable
 */
export function extractTriggerColumns(node: ExpressionNode): Set<string> {
  const out = new Set<string>();
  walkForTriggers(node, out);
  return out;
}

function walkForTriggers(node: ExpressionNode, out: Set<string>): void {
  switch (node.type) {
    case 'columnRef': {
      const id = stripDiffSuffix(node.columnId);
      if (id) out.add(id);
      return;
    }
    case 'member': {
      // Collapse `data.x.y.z` / `columns.x.y.z` into a single dot-path
      // trigger — this is the same shape AG-Grid emits as the column id
      // when a colDef's `field` walks into a nested object.
      const path = pathFromMemberChain(node);
      if (path !== null) {
        const cleaned = stripDiffSuffix(path);
        if (cleaned) out.add(cleaned);
        return;
      }
      walkForTriggers(node.object, out);
      return;
    }
    case 'binary':
      walkForTriggers(node.left, out);
      walkForTriggers(node.right, out);
      return;
    case 'unary':
      walkForTriggers(node.operand, out);
      return;
    case 'ternary':
      walkForTriggers(node.condition, out);
      walkForTriggers(node.consequent, out);
      walkForTriggers(node.alternate, out);
      return;
    case 'call':
      for (const a of node.args) walkForTriggers(a, out);
      return;
    case 'array':
      for (const el of node.elements) walkForTriggers(el, out);
      return;
    case 'literal':
    case 'variable':
      return;
  }
}

/**
 * Walk a member-access chain down to its root. If the root is the
 * `data` or `columns` variable, return the dot-path of property names
 * (in source order). Returns `null` for any other root — the caller
 * keeps recursing through the member's `object` in that case, in case
 * a sub-expression is itself a column-bearing tree.
 */
function pathFromMemberChain(node: ExpressionNode): string | null {
  const parts: string[] = [];
  let cursor: ExpressionNode = node;
  while (cursor.type === 'member') {
    parts.unshift(cursor.property);
    cursor = cursor.object;
  }
  if (cursor.type !== 'variable') return null;
  if (cursor.name !== 'data' && cursor.name !== 'columns') return null;
  return parts.join('.');
}

function stripDiffSuffix(id: string): string {
  return id.replace(/\.(old|new)$/i, '');
}

// ─── Predicate builders ────────────────────────────────────────────────────

/**
 * Compile to an AG-Grid string expression when possible (zero per-cell JS
 * cost), otherwise fall back to a function that evaluates the AST per cell.
 * Evaluation errors are swallowed — a broken rule must NOT crash the grid.
 */
function buildCellClassPredicate(
  engine: ExpressionEngineLike,
  rule: ConditionalRule,
  diffCacheByApi?: DiffCacheByApi,
  timedRuleStateByApi?: TimedRuleStateByApi,
): ((params: CellClassParams) => boolean) | string {
  const activeDurationMs = normalizeActiveDuration(rule.activeDurationMs);
  if (activeDurationMs != null) {
    return (params: CellClassParams) => {
      const colId =
        params.column && typeof params.column.getColId === 'function'
          ? params.column.getColId()
          : undefined;
      if (!colId) return false;
      return isTimedCellRuleActive(
        timedRuleStateByApi,
        params.api,
        params.node,
        rule.id,
        colId,
      );
    };
  }

  const hasDiffRefs = /\.[ \t]*(old|new)\]/i.test(rule.expression);
  // Try the AG-string optimisation path — v3 engine exposes `tryCompileToAgString`
  // on the concrete class; ExpressionEngineLike is intentionally narrow, so we
  // fall through to the function form when the helper isn't there.
  const tryCompile = (engine as { tryCompileToAgString?: (ast: unknown) => string | null }).tryCompileToAgString;
  if (!hasDiffRefs && typeof tryCompile === 'function') {
    try {
      const ast = engine.parse(rule.expression);
      const agString = tryCompile(ast);
      if (agString) return agString;
    } catch {
      /* fall through to function form */
    }
  }
  return (params: CellClassParams) => {
    const data = params.data ?? {};
    const rowDiffs = getOrCreateRowDiffs(params.api, params.node, diffCacheByApi);
    const colId =
      params.column && typeof params.column.getColId === 'function'
        ? params.column.getColId()
        : undefined;
    if (rowDiffs && colId) {
      syncRowDiffEntry(rowDiffs, colId, params.value);
    }
    const columns = buildColumnsContext(
      data,
      rowDiffs,
    );
    try {
      return Boolean(
        engine.parseAndEvaluate(rule.expression, {
          x: params.value,
          value: params.value,
          data,
          columns,
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
  diffCacheByApi?: DiffCacheByApi,
  timedRuleStateByApi?: TimedRuleStateByApi,
): (params: RowClassParams) => boolean {
  const activeDurationMs = normalizeActiveDuration(rule.activeDurationMs);
  if (activeDurationMs != null) {
    return (params: RowClassParams) =>
      isTimedRowRuleActive(
        timedRuleStateByApi,
        (params as RowClassParams & { api?: unknown }).api,
        params.node,
        rule.id,
      );
  }

  return (params: RowClassParams) => {
    const data = params.data ?? {};
    const rowDiffs = getOrCreateRowDiffs(
      (params as RowClassParams & { api?: unknown }).api,
      params.node,
      diffCacheByApi,
    );
    if (rowDiffs) {
      for (const [key, value] of Object.entries(data)) {
        syncRowDiffEntry(rowDiffs, key, value);
      }
    }
    const columns = buildColumnsContext(
      data,
      rowDiffs,
    );
    try {
      return Boolean(
        engine.parseAndEvaluate(rule.expression, {
          x: null,
          value: null,
          data,
          columns,
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
  diffCacheByApi?: DiffCacheByApi,
  timedRuleStateByApi?: TimedRuleStateByApi,
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
      // The KEY of cellClassRules is what AG-Grid stamps on the cell
      // DOM — must match the encoded selector emitted by buildCssText.
      (cellClassRules as Record<string, unknown>)[`ds-rule-${cssEscapeColId(rule.id)}`] =
        buildCellClassPredicate(engine, rule, diffCacheByApi, timedRuleStateByApi);
    }

    // Per-rule value formatters — highest priority wins.
    const formatterRules = applicable.filter((r) => !!r.valueFormatter);
    if (formatterRules.length > 0) {
      const compiled = formatterRules.map((rule) => ({
        predicate: buildCellClassPredicate(engine, rule, diffCacheByApi, timedRuleStateByApi),
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
              const data = params.data ?? {};
              const columns = buildColumnsContext(
                data,
                resolveRowDiffs(params.api, params.node, diffCacheByApi),
              );
              matched = Boolean(engine.parseAndEvaluate(c.expression, {
                x: params.value, value: params.value, data, columns,
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

function resolveRowDiffs(
  api: unknown,
  node: unknown,
  diffCacheByApi?: DiffCacheByApi,
): RowDiffMap | undefined {
  if (!diffCacheByApi) return undefined;
  if (!api || typeof api !== 'object') return undefined;
  if (!node || typeof node !== 'object') return undefined;
  return diffCacheByApi.get(api as object)?.get(node as object);
}

function getOrCreateRowDiffs(
  api: unknown,
  node: unknown,
  diffCacheByApi?: DiffCacheByApi,
): RowDiffMap | undefined {
  if (!diffCacheByApi) return undefined;
  if (!api || typeof api !== 'object') return undefined;
  if (!node || typeof node !== 'object') return undefined;
  let byRow = diffCacheByApi.get(api as object);
  if (!byRow) {
    byRow = new WeakMap<object, RowDiffMap>();
    diffCacheByApi.set(api as object, byRow);
  }
  let rowDiffs = byRow.get(node as object);
  if (!rowDiffs) {
    rowDiffs = new Map<string, CellDiffEntry>();
    byRow.set(node as object, rowDiffs);
  }
  return rowDiffs;
}

function syncRowDiffEntry(
  rowDiffs: RowDiffMap,
  colId: string,
  value: unknown,
): boolean {
  const prev = rowDiffs.get(colId);
  if (!prev) {
    rowDiffs.set(colId, { oldValue: value, newValue: value });
    return false;
  }
  if (Object.is(prev.newValue, value)) return false;
  rowDiffs.set(colId, { oldValue: prev.newValue, newValue: value });
  return true;
}

function buildColumnsContext(
  data: Record<string, unknown>,
  rowDiffs: RowDiffMap | undefined,
): Record<string, unknown> {
  const out = Object.create(data) as Record<string, unknown>;
  if (!rowDiffs || rowDiffs.size === 0) return out;
  for (const [colId, diff] of rowDiffs) {
    out[`${colId}.old`] = diff.oldValue;
    out[`${colId}.new`] = diff.newValue;
  }
  return out;
}

function normalizeActiveDuration(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value as number);
  return rounded > 0 ? rounded : null;
}

function getTimedRuleState(
  timedRuleStateByApi: TimedRuleStateByApi | undefined,
  _api: unknown,
  node: unknown,
): TimedRuleStateByRule | undefined {
  if (!timedRuleStateByApi) {
    // ignore cache identity issues; module-level state is the source of truth
  }
  const rowId = resolveRowId(node);
  if (!rowId) return undefined;
  return timedRuleStateByRowId.get(rowId);
}

function isTimedCellRuleActive(
  timedRuleStateByApi: TimedRuleStateByApi | undefined,
  api: unknown,
  node: unknown,
  ruleId: string,
  colId: string,
): boolean {
  const rowId = resolveRowId(node);
  const stateByRule = getTimedRuleState(timedRuleStateByApi, api, node);
  if (!stateByRule) {
    traceTimed('predicate:cell no state', { rowId, ruleId, colId });
    return false;
  }
  const entry = stateByRule.get(ruleId);
  if (!entry) {
    traceTimed('predicate:cell no rule entry', { rowId, ruleId, colId });
    return false;
  }
  const expiry = entry.cellsUntil.get(colId);
  if (!expiry) {
    traceTimed('predicate:cell no column expiry', { rowId, ruleId, colId });
    return false;
  }
  if (expiry > Date.now()) {
    traceTimed('predicate:cell ACTIVE', { rowId, ruleId, colId, expiry });
    return true;
  }
  entry.cellsUntil.delete(colId);
  if (!entry.rowUntil && entry.cellsUntil.size === 0) stateByRule.delete(ruleId);
  traceTimed('predicate:cell EXPIRED', { rowId, ruleId, colId, expiry });
  return false;
}

function isTimedRowRuleActive(
  timedRuleStateByApi: TimedRuleStateByApi | undefined,
  api: unknown,
  node: unknown,
  ruleId: string,
): boolean {
  const rowId = resolveRowId(node);
  const stateByRule = getTimedRuleState(timedRuleStateByApi, api, node);
  if (!stateByRule) {
    traceTimed('predicate:row no state', { rowId, ruleId });
    return false;
  }
  const entry = stateByRule.get(ruleId);
  if (!entry?.rowUntil) {
    traceTimed('predicate:row no expiry', { rowId, ruleId });
    return false;
  }
  if (entry.rowUntil > Date.now()) {
    traceTimed('predicate:row ACTIVE', { rowId, ruleId, expiry: entry.rowUntil });
    return true;
  }
  entry.rowUntil = undefined;
  if (entry.cellsUntil.size === 0) stateByRule.delete(ruleId);
  traceTimed('predicate:row EXPIRED', { rowId, ruleId });
  return false;
}

function resolveRowId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const candidate = (node as { id?: unknown }).id;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

/**
 * Trace helper for the timed-rule subsystem.
 *
 * Off by default — `setTimeout` + `cellValueChanged` paths fire dozens
 * to hundreds of trace points per second under live ticks, and the
 * resulting `console.log` storm is one of the bigger CPU costs in
 * production. Opt in explicitly per session by setting
 * `window.__CS_TIMED_TRACE__ = true` in the DevTools console.
 */
function traceTimed(message: string, payload?: unknown): void {
  try {
    const flag = (globalThis as { __CS_TIMED_TRACE__?: boolean }).__CS_TIMED_TRACE__;
    if (flag !== true) return;
    if (payload === undefined) {
      console.log(TRACE_PREFIX, message);
      return;
    }
    console.log(TRACE_PREFIX, message, payload);
  } catch {
    // no-op
  }
}
