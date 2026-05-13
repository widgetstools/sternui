import { describe, expect, it } from 'vitest';
import type { CellClassParams, ColDef } from 'ag-grid-community';
import type { CssHandle, ExpressionEngineLike } from '@starui/core';
import {
  applyCellRulesToDefs,
  buildRowClassPredicate,
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
