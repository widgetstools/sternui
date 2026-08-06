import { describe, expect, it, vi } from 'vitest';
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
