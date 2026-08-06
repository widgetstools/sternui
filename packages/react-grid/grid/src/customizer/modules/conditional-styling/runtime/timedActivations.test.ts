import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTimedRuleState, getNextTimedExpiry } from '@starui/engine';
import { createTimedActivations } from './timedActivations.js';

/**
 * The `cellValueChanged` path, against a column that behaves like AG's.
 *
 * ## Why this file exists
 *
 * `event.column.getColId` was read into a local and called unbound. AG's
 * `getColId()` is `return this.colId`, so an unbound call throws
 * **"Cannot read properties of undefined (reading 'colId')"** — from inside
 * AG's own minified code, out of its async event queue, with no frame naming
 * this module. It fired on EVERY committed cell edit on any grid with this
 * module mounted, and nothing that reads it was affected loudly enough to
 * notice. It was found by a browser probe that treats a page error as a
 * failure.
 *
 * The stub below therefore has to be a column that CARES about `this` — a
 * plain object literal `{ getColId: () => 'x' }` passes whether the call is
 * bound or not, which is the test double that lies about the thing it doubles.
 */

/** A column whose `getColId` reads `this`, exactly as AG Grid's does. */
class ColumnLikeAg {
  readonly colId: string;
  constructor(colId: string) {
    this.colId = colId;
  }
  getColId(): string {
    // Deliberately `this.colId` and not the captured argument.
    return this.colId;
  }
}

function harness() {
  const listeners: Record<string, (e: unknown) => void> = {};
  const api = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn;
    },
    removeEventListener: () => {},
    forEachNode: () => {},
    getColumns: () => [],
    refreshCells: () => {},
  };
  const platform = {
    api: { api },
    getState: () => ({
      rules: [
        {
          id: 'r1',
          enabled: true,
          // A timed rule, so the handler does not bail before reading the
          // column: `activeDurationMs` is what puts a rule on this path.
          activeDurationMs: 5_000,
          expression: '[esgScore] > 0',
          scope: { kind: 'cell', columns: ['esgScore'] },
        },
      ],
    }),
    setState: vi.fn(),
    resources: { expression: () => ({ parse: () => null, evaluate: () => false }) },
  };
  const deps = {
    triggers: { get: () => ['esgScore'], clear: () => {} },
    diffCacheByApi: new WeakMap(),
    scheduleRefresh: vi.fn(),
    scheduleTargetedRefresh: vi.fn(),
    armNextExpiry: vi.fn(),
    evaluate: vi.fn(),
  };
  const timed = createTimedActivations(platform as never, deps as never);
  const dispose = timed.attachCellValueChangedListener();
  return { listeners, timed, deps, dispose };
}

describe('the cellValueChanged path', () => {
  it('calls getColId ON the column, not as a detached reference', () => {
    const { listeners } = harness();
    expect(typeof listeners.cellValueChanged).toBe('function');

    expect(() =>
      listeners.cellValueChanged({
        node: { id: 'POS-0', data: { esgScore: 12 } },
        column: new ColumnLikeAg('esgScore'),
        oldValue: 1,
        newValue: 12,
      }),
    ).not.toThrow();
  });

  it('still ignores an event with no column at all', () => {
    // The `typeof` guard was always right; only the call was wrong.
    const { listeners } = harness();
    expect(() =>
      listeners.cellValueChanged({ node: { id: 'POS-0', data: {} }, newValue: 1 }),
    ).not.toThrow();
  });

  it('ignores an event with no node', () => {
    const { listeners } = harness();
    expect(() =>
      listeners.cellValueChanged({ column: new ColumnLikeAg('esgScore'), newValue: 1 }),
    ).not.toThrow();
  });
});

/**
 * ══ `value` / `x` ARE THE CELL'S VALUE, EVEN ON A TIMED RULE ══
 *
 * The bulk pass used to evaluate a cell-scope rule ONCE per row with
 * `value: null` and `x: null`, on the reasoning that a row-level predicate has
 * no single "current cell". But `value` is the documented way to write a cell
 * rule — `value < 0`, `value > 8`, `value != null` — and it is what
 * `cellClassRules` binds when AG paints. Against `null` every one of those is
 * false, so a timed rule written that way never activated at all: no flash and
 * no timed style, on ANY surface.
 *
 * MEASURED on the lab's 50,000-row book before the fix: a rule reading `value`
 * flashed **0** cells over 10 s while 35 rows on screen were changing, and the
 * identical rule written as `[esgScore] != null` flashed **11**. The lab's own
 * seeded `price-changed` rule is `value != null`, so it had never fired either.
 *
 * The observable here is the shared timed-activation store — `getNextTimedExpiry()`
 * is non-null exactly when something activated — plus whether the pass asked
 * for a refresh. Both are public, and the pair of cases below is what makes
 * this a test of the BINDING rather than of activation in general: the same
 * expression over the same row activates for the column whose value satisfies
 * it and not for the one whose value does not.
 */
describe('timed activations — the cell value is bound', () => {
  function bulkHarness(expression: string, columns: string[], data: Record<string, unknown>) {
    const node = { id: 'r1', data: { ...data } };
    const refreshes: number[] = [];
    const api = {
      addEventListener: () => {},
      removeEventListener: () => {},
      forEachNode: (cb: (n: unknown) => void) => cb(node),
      getColumns: () => Object.keys(data).map((c) => ({ getColId: () => c })),
      refreshCells: () => {},
    };
    const platform = {
      api: { api },
      getState: () => ({
        rules: [
          {
            id: 'timed',
            enabled: true,
            activeDurationMs: 5_000,
            expression,
            scope: { type: 'cell', columns },
          },
        ],
      }),
      resources: {
        expression: () => ({
          // Only the shapes these cases use. The real parser has its own
          // coverage; what is under test is WHAT GETS BOUND.
          parseAndEvaluate: (
            source: string,
            ctx: { value: unknown; x: unknown; data: Record<string, unknown> },
          ) => {
            if (source === 'value != null') return ctx.value != null;
            if (source === 'x > 100') return typeof ctx.x === 'number' && ctx.x > 100;
            if (source === '[esgScore] != null') return ctx.data.esgScore != null;
            throw new Error(`unexpected expression ${source}`);
          },
        }),
      },
    };
    const timed = createTimedActivations(platform as never, {
      triggers: { get: () => undefined, rebuild: () => {} } as never,
      diffCacheByApi: { get: () => undefined, set: () => {} } as never,
      scheduleRefresh: () => refreshes.push(1),
      scheduleTargetedRefresh: () => {},
      armNextExpiry: () => {},
      evaluate: () => {},
    });
    /** Seed the previous values, then move the row and run the real pass. */
    const runWith = (next: Record<string, unknown>) => {
      timed.processTimedActivations();
      Object.assign(node.data, next);
      timed.processTimedActivations();
    };
    return { timed, refreshes, runWith };
  }

  beforeEach(() => clearTimedRuleState());

  it('activates a rule written with `value`, which used to be dead', () => {
    const h = bulkHarness('value != null', ['esgScore'], { esgScore: 1 });
    h.runWith({ esgScore: 2 });
    expect(getNextTimedExpiry()).not.toBeNull();
    expect(h.refreshes.length).toBeGreaterThan(0);
  });

  /**
   * The pair that makes the one above a test of the BINDING. Same expression,
   * same row, same change — and the answer differs with the scoped column's
   * value, which is only possible if that value is what `x` is bound to.
   */
  it('binds `x` to the scoped column — activating when its value satisfies the rule', () => {
    const h = bulkHarness('x > 100', ['big'], { big: 5 });
    h.runWith({ big: 500 });
    expect(getNextTimedExpiry()).not.toBeNull();
  });

  it('and NOT activating when it does not', () => {
    const h = bulkHarness('x > 100', ['small'], { small: 5 });
    h.runWith({ small: 50 });
    expect(getNextTimedExpiry()).toBeNull();
  });

  it('keeps the CROSS-COLUMN contract for an expression reading no cell value', () => {
    // `[esgScore] != null` names a column rather than the cell, so it stays a
    // row-level predicate evaluated once — and `other`, whose own value never
    // moved, is still lit. That is the contract the null binding was there to
    // protect, and it survives.
    const h = bulkHarness('[esgScore] != null', ['esgScore', 'other'], {
      esgScore: 1,
      other: 'unchanged',
    });
    h.runWith({ esgScore: 2 });
    expect(getNextTimedExpiry()).not.toBeNull();
    expect(h.refreshes.length).toBeGreaterThan(0);
  });
});
