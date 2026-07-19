/**
 * Worklog T7 — header indicators under SSRM mean "matches in book", not
 * "matches on screen": rules whose DSL compiles to a Perspective keep
 * expression are recounted engine-side via `context.ssrmCountMatching`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHeaderPainter } from './headerPainter.js';
import type { ConditionalStylingState } from '../state.js';

function rule(over: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    enabled: true,
    expression: '[pnl] > 1000000',
    scope: { type: 'cell', columns: ['pnl'] },
    indicator: { icon: 'alert', target: 'headers' },
    ...over,
  };
}

function makeHeaderEl(colId: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ag-header-cell';
  el.setAttribute('col-id', colId);
  document.body.appendChild(el);
  return el;
}

function makePlatform(state: ConditionalStylingState, api: unknown) {
  return {
    api: { api },
    getState: () => state,
    resources: {
      // On-screen scan evaluates against loaded rows only.
      expression: () => ({
        parseAndEvaluate: (_expr: string, ctx: { data: Record<string, unknown> }) =>
          Number(ctx.data.pnl ?? 0) > 1_000_000,
      }),
    },
  } as never;
}

describe('headerPainter under SSRM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('paints from the engine-side count when no loaded row matches', async () => {
    const header = makeHeaderEl('pnl');
    const countMatching = vi.fn(async () => 3); // matches exist in the book
    const api = {
      // Loaded blocks hold only small pnl — screen scan says "no match".
      forEachNodeAfterFilter: (cb: (node: { data: Record<string, unknown> }) => void) => {
        cb({ data: { pnl: 10 } });
      },
      getGridOption: (key: string) =>
        key === 'context'
          ? { ssrmConfigured: true, ssrmCountMatching: countMatching }
          : undefined,
      getFilterModel: () => ({}),
    };
    const state = { rules: [rule()] } as never as ConditionalStylingState;
    const painter = createHeaderPainter(makePlatform(state, api), new WeakMap());

    painter.evaluate();
    // Immediate on-screen pass: no match painted yet.
    expect(header.classList.contains('ds-rule-rule-1')).toBe(false);

    await vi.waitFor(() => {
      expect(header.classList.contains('ds-rule-rule-1')).toBe(true);
    });
    expect(countMatching).toHaveBeenCalledWith(
      {},
      { rowKeepExpression: expect.stringContaining('"pnl"') },
    );
  });

  it('clears via the engine-side count when only loaded rows matched a stale paint', async () => {
    const header = makeHeaderEl('pnl');
    let bookCount = 5;
    const countMatching = vi.fn(async () => bookCount);
    const api = {
      forEachNodeAfterFilter: (cb: (node: { data: Record<string, unknown> }) => void) => {
        cb({ data: { pnl: 2_000_000 } }); // screen says "match"
      },
      getGridOption: (key: string) =>
        key === 'context'
          ? { ssrmConfigured: true, ssrmCountMatching: countMatching }
          : undefined,
      getFilterModel: () => ({}),
    };
    const state = { rules: [rule()] } as never as ConditionalStylingState;
    const painter = createHeaderPainter(makePlatform(state, api), new WeakMap());

    painter.evaluate();
    await vi.waitFor(() => expect(header.classList.contains('ds-rule-rule-1')).toBe(true));

    // Book no longer matches (e.g. the matching rows ticked away).
    bookCount = 0;
    painter.evaluate();
    await vi.waitFor(() => {
      // The screen still matches, but the book verdict wins under SSRM.
      expect(header.classList.contains('ds-rule-rule-1')).toBe(false);
    });
  });

  it('keeps the on-screen verdict for diff-based rules that cannot compile', async () => {
    const header = makeHeaderEl('pnl');
    const countMatching = vi.fn(async () => 0);
    const api = {
      forEachNodeAfterFilter: (cb: (node: { data: Record<string, unknown> }) => void) => {
        cb({ data: { pnl: 2_000_000 } });
      },
      getGridOption: (key: string) =>
        key === 'context'
          ? { ssrmConfigured: true, ssrmCountMatching: countMatching }
          : undefined,
      getFilterModel: () => ({}),
    };
    const state = {
      rules: [rule({ expression: '[pnl.new] - [pnl.old] > 0' })],
    } as never as ConditionalStylingState;
    const painter = createHeaderPainter(makePlatform(state, api), new WeakMap());

    painter.evaluate();
    expect(header.classList.contains('ds-rule-rule-1')).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    // Diff rules never go engine-side.
    expect(countMatching).not.toHaveBeenCalled();
    expect(header.classList.contains('ds-rule-rule-1')).toBe(true);
  });
});
