/**
 * The header painter decides whether a column header carries a rule's flash or
 * indicator badge, and it decides it by asking "does ANY row match?".
 *
 * On CSRM that question is answered by walking the row model, which holds the
 * whole book. On a server-side path the row model is the loaded blocks — the
 * viewport — so a rule matching a row 8,000 down the book answered "no" and the
 * header stayed unlit. These tests pin the worker-backed answer, and pin that
 * the client scan is still used where the worker cannot be asked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHeaderPainter } from './headerPainter';
import type { ConditionalRule, ConditionalStylingState } from '../state';
import type { DiffCacheByApi } from '../transforms';

/** A row the client holds. The book is deliberately larger than this. */
interface FakeNode {
  data: Record<string, unknown>;
}

function makeRule(overrides: Partial<ConditionalRule> = {}): ConditionalRule {
  return {
    id: 'r1',
    name: 'losses',
    enabled: true,
    priority: 0,
    scope: { type: 'cell', columns: ['pnl'] },
    expression: '[pnl] < 0',
    style: {} as ConditionalRule['style'],
    indicator: { icon: 'warning', target: 'headers' },
    ...overrides,
  } as ConditionalRule;
}

function setupDom(): void {
  document.body.innerHTML = '<div class="ag-header-cell" col-id="pnl"></div>';
}

function headerClasses(): string[] {
  const el = document.querySelector('.ag-header-cell[col-id="pnl"]');
  return el ? [...el.classList] : [];
}

/**
 * A platform whose grid holds `loadedRows` and whose `context` optionally
 * answers whole-book questions — the two halves of the behaviour under test.
 */
function makePlatform(options: {
  rules: ConditionalRule[];
  loadedRows: FakeNode[];
  countMatchingExpression?: (source: string) => Promise<number | null>;
  aggregateScalar?: (colId: string, aggregate: string) => Promise<number | null>;
  /** Absent means Perspective — what it meant when there was only one surface. */
  dialect?: 'perspective' | 'starui';
}) {
  const context = options.countMatchingExpression
    ? {
        ssrmCountMatchingExpression: options.countMatchingExpression,
        ssrmAggregateScalar: options.aggregateScalar,
        ...(options.dialect === undefined ? {} : { ssrmExpressionDialect: options.dialect }),
      }
    : {};

  const api = {
    forEachNodeAfterFilter: (cb: (node: FakeNode) => void) => {
      for (const node of options.loadedRows) cb(node);
    },
    getGridOption: (key: string) => (key === 'context' ? context : undefined),
  };

  const state: ConditionalStylingState = { rules: options.rules };

  const platform = {
    api: { api },
    getState: () => state,
    resources: {
      expression: () => ({
        parseAndEvaluate: (expression: string, ctx: { data: Record<string, unknown> }) => {
          // Only the one shape these tests use; the engine's own parser has its
          // own coverage and is not what this file is about.
          const match = /^\[(\w+)\]\s*<\s*(-?\d+)$/.exec(expression);
          if (!match) return false;
          return Number(ctx.data[match[1]!]) < Number(match[2]);
        },
      }),
    },
  };

  return { platform, state };
}

const NO_DIFF_CACHE = { get: () => undefined } as unknown as DiffCacheByApi;

/** The painter's server refresh is async; let its microtasks drain. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe('createHeaderPainter — worker-backed whole-book answers', () => {
  beforeEach(setupDom);

  /**
   * The gap this closes. Every row the client holds is profitable, so the
   * client scan says "no match" — but the book has losses in it.
   */
  it('lights a header for a rule no LOADED row matches but the book does', async () => {
    const countMatchingExpression = vi.fn(async () => 431);
    const { platform } = makePlatform({
      rules: [makeRule()],
      loadedRows: [{ data: { pnl: 10 } }, { data: { pnl: 20 } }],
      countMatchingExpression,
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();

    expect(countMatchingExpression).toHaveBeenCalledWith('"pnl" < 0');
    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(true);
  });

  /** And the converse — a loaded row matching must not light a header when
   *  the rule has been filtered out of the book. */
  it('leaves a header unlit when the book has no match', async () => {
    const { platform } = makePlatform({
      rules: [makeRule()],
      loadedRows: [{ data: { pnl: -5 } }],
      countMatchingExpression: async () => 0,
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();

    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(false);
  });

  /**
   * A rule the worker cannot be asked keeps the client scan. Partial is better
   * than nothing, and it is exactly what happens today — `.old`/`.new` are
   * viewport-only by definition.
   */
  it('falls back to the client scan for a rule the worker cannot answer', async () => {
    // Timed: a timed activation is about what changed under the user's eyes,
    // so the whole-book answer would be about a different question. The
    // expression itself is ordinary, so the client scan can still evaluate it
    // — which is what has to keep happening.
    const countMatchingExpression = vi.fn(async () => 0);
    const { platform } = makePlatform({
      rules: [makeRule({ activeDurationMs: 3000 })],
      loadedRows: [{ data: { pnl: -5 } }],
      countMatchingExpression,
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();

    expect(countMatchingExpression).not.toHaveBeenCalled();
    // Never planned, so never asked — and the header still lights off the one
    // loaded row that matches, exactly as it does on CSRM.
    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(true);
  });

  /** A rule the worker refuses because its expression cannot compile —
   *  `.old`/`.new` have no meaning over a book — behaves the same way. */
  it('does not ask the worker about a viewport-only expression', async () => {
    const countMatchingExpression = vi.fn(async () => 0);
    const { platform } = makePlatform({
      rules: [makeRule({ expression: '[pnl.new] < [pnl.old]' })],
      loadedRows: [{ data: { pnl: -5 } }],
      countMatchingExpression,
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();

    expect(countMatchingExpression).not.toHaveBeenCalled();
  });

  /** No server contract at all (CSRM) must leave the original path untouched. */
  it('uses the client scan when the context answers nothing', async () => {
    const { platform } = makePlatform({
      rules: [makeRule()],
      loadedRows: [{ data: { pnl: -5 } }],
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();

    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(true);
  });

  /**
   * Cross-row context is two steps: the expression language has no column
   * aggregate, so the scalar is measured and substituted as a literal.
   */
  it('measures a cross-row aggregate and substitutes it before counting', async () => {
    const countMatchingExpression = vi.fn(async () => 7);
    const aggregateScalar = vi.fn(async () => 100);
    const { platform } = makePlatform({
      rules: [makeRule({ expression: '[price] > AVG([price])' })],
      loadedRows: [],
      countMatchingExpression,
      aggregateScalar,
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();

    expect(aggregateScalar).toHaveBeenCalledWith('price', 'avg');
    expect(countMatchingExpression).toHaveBeenCalledWith('"price" > 100');
    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(true);
  });

  /** An "above average" rule with no average is not a rule with a default. */
  it('paints nothing when the aggregate cannot be measured', async () => {
    const countMatchingExpression = vi.fn(async () => 7);
    const { platform } = makePlatform({
      rules: [makeRule({ expression: '[price] > AVG([price])' })],
      loadedRows: [],
      countMatchingExpression,
      aggregateScalar: async () => null,
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();

    expect(countMatchingExpression).not.toHaveBeenCalled();
    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(false);
  });

  /**
   * Painting is what asks, so re-painting unconditionally would recurse
   * forever. The refresh re-enters `evaluate` only when an answer changed.
   */
  it('settles instead of looping when the answer is stable', async () => {
    const countMatchingExpression = vi.fn(async () => 5);
    const { platform } = makePlatform({
      rules: [makeRule()],
      loadedRows: [],
      countMatchingExpression,
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();
    const afterFirst = countMatchingExpression.mock.calls.length;
    await settle();

    expect(afterFirst).toBeLessThanOrEqual(2);
    expect(countMatchingExpression.mock.calls.length).toBe(afterFirst);
  });

  /** A rule whose expression was edited must not keep painting from what the
   *  previous one matched, even for the one cycle a refresh takes. */
  it('drops the previous answer when the rule set changes', async () => {
    const { platform, state } = makePlatform({
      rules: [makeRule()],
      loadedRows: [],
      countMatchingExpression: async (source) => (source === '"pnl" < 0' ? 431 : 0),
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();
    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(true);

    state.rules = [makeRule({ expression: '[pnl] < -999999' })];
    painter.evaluate();
    await settle();
    painter.evaluate();

    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(false);
  });
});

/**
 * ══ TWO DIALECTS ══
 *
 * `@starui/ssrm-engine` replaced Perspective as the engine that ships, and it
 * has no expression language of its own — it evaluates the StarUI AST directly.
 * So the surface declares which language its `ssrmCountMatchingExpression`
 * takes, and the planner leaves a `'starui'` rule uncompiled.
 *
 * Declared rather than sniffed, because both dialects are plain strings: a
 * mismatch would have the worker refuse every rule, and a header that never
 * lights is indistinguishable from a rule nothing matches.
 */
describe('createHeaderPainter — the STARUI dialect', () => {
  beforeEach(setupDom);

  it('sends STARUI source, not Perspective source, when the surface says so', async () => {
    const countMatchingExpression = vi.fn(async () => 431);
    const { platform } = makePlatform({
      rules: [makeRule()],
      loadedRows: [{ data: { pnl: 10 } }],
      countMatchingExpression,
      dialect: 'starui',
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();

    // `[pnl] < 0`, the rule's own source — where the Perspective dialect would
    // have compiled it to `"pnl" < 0`.
    expect(countMatchingExpression).toHaveBeenCalledWith('[pnl] < 0');
    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(true);
  });

  it('substitutes a measured aggregate in the STARUI column form', async () => {
    const countMatchingExpression = vi.fn(async () => 5);
    const aggregateScalar = vi.fn(async () => 42);
    const { platform } = makePlatform({
      rules: [makeRule({ expression: '[pnl] > AVG([pnl])' })],
      loadedRows: [{ data: { pnl: 10 } }],
      countMatchingExpression,
      aggregateScalar,
      dialect: 'starui',
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();

    expect(aggregateScalar).toHaveBeenCalledWith('pnl', 'avg');
    // The placeholder is wearing `[__agg0__]` here, because nothing compiled
    // it. Substituting the Perspective form (`"__agg0__"`) would silently miss
    // and send an expression naming a column the book does not have.
    expect(countMatchingExpression).toHaveBeenCalledWith('[pnl] > 42');
  });

  /**
   * A REFUSED expression is not "no row matches", and conflating them is the
   * failure this seam exists to avoid. The worker cannot evaluate the rule, so
   * it goes back to the client scan — partial, and better than a header that is
   * confidently dark.
   */
  it('falls back to the client scan when the worker REFUSES the expression', async () => {
    const countMatchingExpression = vi.fn(async () => null);
    const { platform } = makePlatform({
      rules: [makeRule()],
      // The one loaded row DOES match, so the client scan has something to say.
      loadedRows: [{ data: { pnl: -5 } }],
      countMatchingExpression,
      dialect: 'starui',
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();
    painter.evaluate();

    expect(countMatchingExpression).toHaveBeenCalled();
    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(true);
  });

  /**
   * And the converse, which is the line between "refused" and "measured": a
   * measured ZERO must unlight the header even though a loaded row matches.
   * Without this, the previous case would pass on a painter that ignored the
   * worker's answer entirely.
   */
  it('still unlights on a measured ZERO, with the same loaded row matching', async () => {
    const { platform } = makePlatform({
      rules: [makeRule()],
      loadedRows: [{ data: { pnl: -5 } }],
      countMatchingExpression: async () => 0,
      dialect: 'starui',
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();
    painter.evaluate();

    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(false);
  });
});

/**
 * ══ THE PAINT IS RECONCILED AGAINST THE DOM, NOT AGAINST A CACHE ══
 *
 * AG virtualises COLUMNS, so a header cell that is not scrolled into view is
 * not in the document. The painter used to record a rule as painted the first
 * time it DECIDED so — with `querySelectorAll` having matched nothing — and
 * never re-applied, because its own cache already said "painted". The header
 * stayed dark for the rest of the session however far the user scrolled.
 *
 * MEASURED on the 50,000 x 120 stress book: the worker answered 50,000 rows
 * matching, the painter recorded the rule as lit, and ZERO header cells carried
 * the class. Not row-model specific — this module serves every surface.
 */
describe('createHeaderPainter — a header cell that arrives LATE', () => {
  beforeEach(() => {
    // Deliberately EMPTY: the column is virtualised out when the rule is first
    // decided, which is the state the old cache could not recover from.
    document.body.innerHTML = '';
  });

  it('paints a header cell created after the rule was decided', async () => {
    const { platform } = makePlatform({
      rules: [makeRule()],
      loadedRows: [{ data: { pnl: -5 } }],
      countMatchingExpression: async () => 431,
      dialect: 'starui',
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);

    painter.evaluate();
    await settle();
    // Nothing to paint yet, and the painter must not remember otherwise.
    expect(document.querySelectorAll('.ag-header-cell').length).toBe(0);

    // The user scrolls the column into view.
    setupDom();
    painter.evaluate();
    await settle();

    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(true);
  });

  it('still REMOVES the class when the answer goes away', async () => {
    // The other half: reconciling against the DOM must not turn the painter
    // into one that only ever adds.
    let matches = 431;
    const { platform } = makePlatform({
      rules: [makeRule()],
      loadedRows: [],
      countMatchingExpression: async () => matches,
      dialect: 'starui',
    });
    const painter = createHeaderPainter(platform as never, NO_DIFF_CACHE);
    setupDom();

    painter.evaluate();
    await settle();
    painter.evaluate();
    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(true);

    matches = 0;
    // Several passes, because the refresh is async and a pass that lands while
    // one is in flight returns early — that is the painter's own overlap guard
    // and not something to work around in the product.
    for (let i = 0; i < 5; i += 1) {
      painter.evaluate();
      await settle();
    }
    expect(headerClasses().some((c) => c.startsWith('ds-rule-'))).toBe(false);
  });
});
