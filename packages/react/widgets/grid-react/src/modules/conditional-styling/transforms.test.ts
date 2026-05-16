import { describe, expect, it } from 'vitest';
import type { CellClassParams, ColDef } from 'ag-grid-community';
import { ExpressionEngine } from '@starui/core';
import type { CssHandle, ExpressionEngineLike } from '@starui/core';
import {
  applyCellRulesToDefs,
  buildRowClassPredicate,
  extractTriggerColumns,
  reinjectAllRules,
} from './transforms';
import type { ConditionalRule } from './state';

class CaptureCss implements CssHandle {
  readonly rules = new Map<string, string>();

  addRule(ruleId: string, cssText: string): void {
    this.rules.set(ruleId, cssText);
  }

  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  clear(): void {
    this.rules.clear();
  }

  text(ruleId: string): string {
    return this.rules.get(ruleId) ?? '';
  }
}

const ENGINE: ExpressionEngineLike = {
  parse: () => ({}),
  evaluate: () => true,
  parseAndEvaluate: (source, ctx) => {
    if (source === 'x > 100') return Number((ctx as { x: unknown }).x) > 100;
    if (source === 'x == "BUY"') return (ctx as { x: unknown }).x === 'BUY';
    if (source === 'x == "SELL"') return (ctx as { x: unknown }).x === 'SELL';
    if (source === 'data.status == "WARN"') {
      return (ctx as { data: { status?: string } }).data.status === 'WARN';
    }
    return source === 'true';
  },
  validate: () => ({ valid: true, errors: [] }),
};

const fullTextStyle = {
  color: '#ff00aa',
  fontWeight: '700',
  fontStyle: 'italic',
  fontSize: '13px',
  fontFamily: 'IBM Plex Mono',
  textAlign: 'right',
  textDecoration: 'underline',
  paddingTop: '1px',
  paddingRight: '2px',
  paddingBottom: '3px',
  paddingLeft: '4px',
};

function cellRule(overrides: Partial<ConditionalRule> = {}): ConditionalRule {
  return {
    id: 'rule-text',
    name: 'Text Style',
    enabled: true,
    priority: 0,
    scope: { type: 'cell', columns: ['price'] },
    expression: 'x > 100',
    style: {
      light: { ...fullTextStyle, backgroundColor: '#fff1f8' },
      dark: { ...fullTextStyle, backgroundColor: '#2b1020' },
    },
    ...overrides,
  };
}

describe('conditional-styling transforms', () => {
  it('emits every text attribute for matching cell rules and scopes the CSS to AG Grid cells only', () => {
    const css = new CaptureCss();

    reinjectAllRules(css, [cellRule()]);

    const ruleCss = css.text('conditional-rule-text');
    expect(ruleCss).toContain(':root:not(.dark):not([data-theme="dark"]) .ag-cell.ds-rule-rule-text');
    expect(ruleCss).toContain('.dark .ag-cell.ds-rule-rule-text');
    expect(ruleCss).toContain('[data-theme="dark"] .ag-cell.ds-rule-rule-text');
    expect(ruleCss).not.toContain('[data-theme="dark"] .ds-rule-rule-text {');
    expect(ruleCss).toContain('color: #ff00aa');
    expect(ruleCss).toContain('font-weight: 700');
    expect(ruleCss).toContain('font-style: italic');
    expect(ruleCss).toContain('font-size: 13px');
    expect(ruleCss).toContain('font-family: IBM Plex Mono');
    expect(ruleCss).toContain('text-align: right');
    expect(ruleCss).toContain('text-decoration: underline');
    expect(ruleCss).toContain('padding-top: 1px');
    expect(ruleCss).toContain('padding-right: 2px');
    expect(ruleCss).toContain('padding-bottom: 3px');
    expect(ruleCss).toContain('padding-left: 4px');
  });

  it('keeps indicator/header badge selectors separate from cell text styling to prevent whole-grid colour bleed after SAVE', () => {
    const css = new CaptureCss();

    reinjectAllRules(css, [
      cellRule({
        indicator: {
          icon: 'arrow-up',
          color: '#22c55e',
          target: 'cells+headers',
        },
      }),
    ]);

    const ruleCss = css.text('conditional-rule-text');
    expect(ruleCss).toContain('.ag-cell.ds-rule-rule-text {');
    expect(ruleCss).toContain('.ag-cell.ds-rule-rule-text::before');
    expect(ruleCss).toContain('.ag-header-cell.ds-rule-rule-text::before');
    expect(ruleCss).toContain('background-image: url("data:image/svg+xml');
    expect(ruleCss).not.toContain(':root:not(.dark):not([data-theme="dark"]) .ds-rule-rule-text { color: #ff00aa');
    expect(ruleCss).not.toContain('.dark .ds-rule-rule-text, [data-theme="dark"] .ds-rule-rule-text { color: #ff00aa');
  });

  it('attaches cell-class predicates only to the rule target columns', () => {
    const [price, quantity] = applyCellRulesToDefs(
      [{ colId: 'price' }, { colId: 'quantity' }],
      [cellRule()],
      ENGINE,
    ) as ColDef[];

    expect(price.cellClassRules).toHaveProperty('ds-rule-rule-text');
    expect(quantity.cellClassRules).toBeUndefined();

    const predicate = price.cellClassRules?.['ds-rule-rule-text'];
    expect(typeof predicate).toBe('function');
    expect((predicate as (params: CellClassParams) => boolean)({
      value: 120,
      data: { price: 120 },
      column: { getColId: () => 'price' },
    } as CellClassParams)).toBe(true);
    expect((predicate as (params: CellClassParams) => boolean)({
      value: 80,
      data: { price: 80 },
      column: { getColId: () => 'price' },
    } as CellClassParams)).toBe(false);
  });

  it('styles the side field green for BUY and red for SELL only when each condition matches', () => {
    const buyRule: ConditionalRule = {
      id: 'side-buy',
      name: 'BUY side',
      enabled: true,
      priority: 0,
      scope: { type: 'cell', columns: ['side'] },
      expression: 'x == "BUY"',
      style: {
        light: { color: 'green' },
        dark: { color: 'green' },
      },
    };
    const sellRule: ConditionalRule = {
      id: 'side-sell',
      name: 'SELL side',
      enabled: true,
      priority: 1,
      scope: { type: 'cell', columns: ['side'] },
      expression: 'x == "SELL"',
      style: {
        light: { color: 'red' },
        dark: { color: 'red' },
      },
    };
    const css = new CaptureCss();

    reinjectAllRules(css, [buyRule, sellRule]);
    const [side, price] = applyCellRulesToDefs(
      [{ colId: 'side' }, { colId: 'price' }],
      [buyRule, sellRule],
      ENGINE,
    ) as ColDef[];

    expect(css.text('conditional-side-buy')).toContain('.ag-cell.ds-rule-side-buy { color: green }');
    expect(css.text('conditional-side-sell')).toContain('.ag-cell.ds-rule-side-sell { color: red }');
    expect(side.cellClassRules).toHaveProperty('ds-rule-side-buy');
    expect(side.cellClassRules).toHaveProperty('ds-rule-side-sell');
    expect(price.cellClassRules).toBeUndefined();

    const buyPredicate = side.cellClassRules?.['ds-rule-side-buy'] as (params: CellClassParams) => boolean;
    const sellPredicate = side.cellClassRules?.['ds-rule-side-sell'] as (params: CellClassParams) => boolean;
    const buyParams = {
      value: 'BUY',
      data: { side: 'BUY' },
      column: { getColId: () => 'side' },
    } as CellClassParams;
    const sellParams = {
      value: 'SELL',
      data: { side: 'SELL' },
      column: { getColId: () => 'side' },
    } as CellClassParams;

    expect(buyPredicate(buyParams)).toBe(true);
    expect(sellPredicate(buyParams)).toBe(false);
    expect(buyPredicate(sellParams)).toBe(false);
    expect(sellPredicate(sellParams)).toBe(true);
  });

  it('keeps row-scope styles row-scoped while preserving indicator and flash CSS', () => {
    const css = new CaptureCss();
    const rowRule: ConditionalRule = {
      id: 'row-warn',
      name: 'Warn Row',
      enabled: true,
      priority: 0,
      scope: { type: 'row' },
      expression: 'data.status == "WARN"',
      style: {
        light: { color: '#7f1d1d', backgroundColor: '#fee2e2' },
        dark: { color: '#fecaca', backgroundColor: '#450a0a' },
      },
      indicator: { icon: 'arrow-down', color: '#ef4444', target: 'cells' },
      flash: { enabled: true, target: 'row', mode: 'pulse', color: 'rose', durationMs: 900 },
    };

    reinjectAllRules(css, [rowRule]);

    const ruleCss = css.text('conditional-row-warn');
    expect(ruleCss).toContain('.ag-row.ds-rule-row-warn .ag-cell');
    expect(ruleCss).toContain('.ag-row.ds-rule-row-warn .ag-cell::before');
    expect(ruleCss).toContain('background-image: url("data:image/svg+xml');
    expect(ruleCss).toContain('.ag-row.ds-rule-row-warn { border-color: transparent !important; }');
    expect(ruleCss).toContain('animation: ds-flash-row-warn 900ms ease-in-out infinite');
    expect(css.text('conditional-flash-kf-row-warn')).toContain('@keyframes ds-flash-row-warn');

    const predicate = buildRowClassPredicate(ENGINE, rowRule);
    expect(predicate({ data: { status: 'WARN' } } as never)).toBe(true);
    expect(predicate({ data: { status: 'OK' } } as never)).toBe(false);
  });
});

describe('extractTriggerColumns — runtime can fan out scope-column refreshes from any column the expression depends on', () => {
  const engine = new ExpressionEngine();
  const triggersOf = (expression: string): Set<string> =>
    extractTriggerColumns(engine.parse(expression));

  it('captures bare column refs and strips .old / .new diff suffixes so triggers map back to AG-Grid colIds', () => {
    expect(triggersOf('[price] > 100')).toEqual(new Set(['price']));
    expect(triggersOf('[price.old] < [price.new]')).toEqual(new Set(['price']));
    expect(triggersOf('[a.new] + [b] > [c.old]')).toEqual(new Set(['a', 'b', 'c']));
  });

  it('extracts the top-level field from `data.x` / `data.x.y` chains — AG-Grid emits cellValueChanged keyed by the top-level field', () => {
    expect(triggersOf('data.status == "WARN"')).toEqual(new Set(['status']));
    expect(triggersOf('data.position.id != null')).toEqual(new Set(['position']));
  });

  it('reads through `columns.x` accessors (the diff-aware columns context)', () => {
    expect(triggersOf('columns.price > 100')).toEqual(new Set(['price']));
  });

  it('returns an empty set for expressions that depend on no row state (bare literal or cell-only `x` reference)', () => {
    expect(triggersOf('true')).toEqual(new Set());
    expect(triggersOf('x > 100')).toEqual(new Set());
    expect(triggersOf('1 + 2 == 3')).toEqual(new Set());
  });

  it('descends into binary, unary, ternary, call, and array nodes so triggers from any branch are captured', () => {
    expect(triggersOf('[a] > 0 && [b] < 0')).toEqual(new Set(['a', 'b']));
    expect(triggersOf('!([flag] == true)')).toEqual(new Set(['flag']));
    expect(triggersOf('[a] > 0 ? [b] : [c]')).toEqual(new Set(['a', 'b', 'c']));
  });
});

describe('cross-column scope contract — expression independent of paint surface', () => {
  // End-to-end check for the bug-report scenario:
  //   rule expression: `[price.old] > [price.new]`
  //   scope.columns:   ['side']      (the `price` column is NOT in scope)
  // Contract: when the diff says price ticked down, the `side` cell
  // must receive the rule's class even though the `side` cell's own
  // value did not change.
  const engine = new ExpressionEngine();

  const diffRule = (overrides: Partial<ConditionalRule> = {}): ConditionalRule => ({
    id: 'price-down-paint-side',
    name: 'Price down → paint Side',
    enabled: true,
    priority: 0,
    scope: { type: 'cell', columns: ['side'] },
    expression: '[price.old] > [price.new]',
    style: {
      light: { color: '#b91c1c' },
      dark: { color: '#fecaca' },
    },
    ...overrides,
  });

  const evalSideCell = (rule: ConditionalRule, priceOld: number, priceNew: number) => {
    // Build the same diff-cache shape the runtime maintains, with a
    // single `price` diff entry — the rest of the row data is incidental.
    const node = {} as object;
    const api = {} as object;
    const rowDiffs = new Map<string, { oldValue: unknown; newValue: unknown }>();
    rowDiffs.set('price', { oldValue: priceOld, newValue: priceNew });
    const byRow = new WeakMap<object, typeof rowDiffs>();
    byRow.set(node, rowDiffs);
    const diffCacheByApi = new WeakMap<object, typeof byRow>();
    diffCacheByApi.set(api, byRow);

    const [side] = applyCellRulesToDefs(
      [{ colId: 'side' }, { colId: 'price' }],
      [rule],
      engine as unknown as ExpressionEngineLike,
      diffCacheByApi as never,
    ) as ColDef[];

    const predicate = side.cellClassRules?.['ds-rule-price-down-paint-side'] as
      | ((p: CellClassParams) => boolean)
      | undefined;
    if (typeof predicate !== 'function') {
      throw new Error('expected function-form predicate for diff expression');
    }
    return predicate({
      value: 'BUY',
      data: { side: 'BUY', price: priceNew },
      column: { getColId: () => 'side' },
      api,
      node,
    } as unknown as CellClassParams);
  };

  it('paints `side` when [price.old] > [price.new] even though `price` is not in scope.columns', () => {
    expect(evalSideCell(diffRule(), 110, 100)).toBe(true);
  });

  it('does not paint `side` when the price diff fails the predicate', () => {
    expect(evalSideCell(diffRule(), 100, 110)).toBe(false);
  });

  it('paints every scoped column uniformly when expression depends on a non-scoped trigger column', () => {
    // Same rule, but scope now covers three columns NONE of which appear
    // in the expression. The predicate must return true on each of them
    // for the same row state.
    const rule = diffRule({ scope: { type: 'cell', columns: ['side', 'quantity', 'tag'] } });

    const node = {} as object;
    const api = {} as object;
    const rowDiffs = new Map<string, { oldValue: unknown; newValue: unknown }>();
    rowDiffs.set('price', { oldValue: 110, newValue: 100 });
    const byRow = new WeakMap<object, typeof rowDiffs>();
    byRow.set(node, rowDiffs);
    const diffCacheByApi = new WeakMap<object, typeof byRow>();
    diffCacheByApi.set(api, byRow);

    const defs = applyCellRulesToDefs(
      [{ colId: 'side' }, { colId: 'quantity' }, { colId: 'tag' }, { colId: 'price' }],
      [rule],
      engine as unknown as ExpressionEngineLike,
      diffCacheByApi as never,
    ) as ColDef[];

    const data = { side: 'BUY', quantity: 5, tag: 'X', price: 100 };
    const verdictFor = (colId: string, value: unknown) => {
      const colDef = defs.find((d) => d.colId === colId);
      const predicate = colDef?.cellClassRules?.['ds-rule-price-down-paint-side'] as
        | ((p: CellClassParams) => boolean)
        | undefined;
      if (typeof predicate !== 'function') {
        throw new Error(`expected predicate on ${colId}`);
      }
      return predicate({
        value,
        data,
        column: { getColId: () => colId },
        api,
        node,
      } as unknown as CellClassParams);
    };

    expect(verdictFor('side', 'BUY')).toBe(true);
    expect(verdictFor('quantity', 5)).toBe(true);
    expect(verdictFor('tag', 'X')).toBe(true);
    // `price` was deliberately left out of scope.columns — its colDef
    // must NOT carry the rule's cellClassRules at all.
    const priceDef = defs.find((d) => d.colId === 'price');
    expect(priceDef?.cellClassRules?.['ds-rule-price-down-paint-side']).toBeUndefined();
  });

  it('exposes `price` as the trigger for the same expression so the runtime knows to refresh scoped columns when price ticks', () => {
    const triggers = extractTriggerColumns(engine.parse(diffRule().expression));
    expect(triggers).toEqual(new Set(['price']));
  });
});
