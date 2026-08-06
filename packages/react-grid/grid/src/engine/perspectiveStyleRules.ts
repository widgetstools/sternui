/**
 * Style rules that have to be answered by the worker, not by the rows this
 * window holds.
 *
 * Most conditional-styling work is presentational and stays client-side: a
 * rule paints the cells AG Grid is rendering, and those rows are in hand. What
 * does NOT survive the move to a pull path is any question about the book
 * rather than the viewport. The one such question the runtime actually asks is
 * `headerPainter`'s "does ANY row match this rule?", which decides whether a
 * column header carries the rule's flash or indicator badge. It is implemented
 * as `api.forEachNodeAfterFilter`, and on this path that walks the ~100 rows in
 * the loaded blocks — so a rule matching 8,000 rows down the book paints
 * nothing until the user happens to scroll there. Same species as every other
 * gap on this path: code that assumed the client holds the whole book.
 *
 * The answer is to compile the rule to a Perspective boolean expression and
 * count it over the whole filtered book.
 *
 * **The expression columns are transient, never live.** An expression column is
 * recomputed on every Table update for as long as its View lives — the property
 * that made a 26-column quick search unusable. Putting a rule column into the
 * viewport's View would charge that on every tick, permanently, for something
 * only the header painter reads. Each count builds its own View, reads it once
 * and drops it, and the engine throttles.
 *
 * Not every rule can go. A rule is refused — and left to its client-side
 * evaluation, which is still correct for painting the rows on screen — when it
 * uses `.old` / `.new` (viewport-only by definition: the worker has one value
 * per cell, not a before and an after), when it uses a function the compiler
 * cannot express, or when it is timed (`activeDurationMs`), because a timed
 * activation is about what changed under the user's eyes and is meaningless
 * over a book.
 */
import { parse, tokenize } from '@starui/engine';
import type { ConditionalRule } from '../customizer/modules/conditional-styling/state.js';
import { compileStarUiExpressionToPerspective } from './ssrmExpressionCompile.js';

/**
 * Which expression language the worker on the other side of this speaks.
 *
 * `'perspective'` compiles to Perspective source, because that worker owns a
 * second expression language. `'starui'` leaves the rule in StarUI source and
 * the surface parses it to an AST — `@starui/ssrm-engine` evaluates the SAME
 * tree calculated columns already send it, so there is one language and one
 * parser, and a compiled closure could not cross a port in any case.
 */
export type ServerStyleRuleDialect = 'perspective' | 'starui';

/** A rule the worker can answer, and the expression it answers with. */
export interface PerspectiveStyleRulePlan {
  ruleId: string;
  /** Source in the plan's dialect, boolean-valued. */
  expression: string;
  /**
   * Column aggregates the expression needs resolved to literals before it can
   * be evaluated. Empty for the ordinary case.
   *
   * The expression language has no cross-row aggregate at all — `avg("col")`
   * parses, never errors, and answers the column's own values, so
   * `"col" > avg("col")` is false for every row silently. "Above average"
   * therefore has to measure the scalar with a separate aggregate View and
   * substitute it in. See ARCHITECTURE.md, "avg() and sum() are row-wise".
   */
  aggregates: PerspectiveAggregateRef[];
}

export interface PerspectiveAggregateRef {
  /** Placeholder token occupying the aggregate's position in `expression`. */
  token: string;
  colId: string;
  aggregate: 'sum' | 'avg' | 'median' | 'count' | 'high' | 'low';
}

/** A rule that stays client-side, and why — surfaced so a refusal is
 *  explicable rather than a rule that silently does nothing extra. */
export interface PerspectiveStyleRuleRefusal {
  ruleId: string;
  reason: string;
}

export interface PerspectiveStyleRulePlans {
  plans: PerspectiveStyleRulePlan[];
  refusals: PerspectiveStyleRuleRefusal[];
}

/** StarUI aggregate functions, mapped onto Perspective's View aggregates.
 *  NOT onto its same-named expression functions, which are row-wise. */
const AGGREGATE_FUNCTIONS: Record<string, PerspectiveAggregateRef['aggregate']> = {
  SUM: 'sum',
  AVG: 'avg',
  MEDIAN: 'median',
  COUNT: 'count',
  MAX: 'high',
  MIN: 'low',
};

const EMPTY: PerspectiveStyleRulePlans = { plans: [], refusals: [] };

/**
 * Rewrite `AVG([price])`-shaped calls into placeholder literals the caller
 * substitutes once it has measured them, and report which ones it needs.
 *
 * Only the single-column-argument form is an aggregate. StarUI's `MIN(a, b)`
 * over scalars is an ordinary row-wise function and is left alone — which the
 * compiler will then refuse, since it has no Perspective equivalent, and the
 * rule stays client-side rather than compiling to something plausible.
 */
function extractAggregates(
  expression: string,
): { rewritten: string; aggregates: PerspectiveAggregateRef[] } | null {
  try {
    parse(tokenize(expression));
  } catch {
    return null;
  }

  // Rewritten as source text, before compilation, so the placeholder is an
  // ordinary column reference by the time the compiler sees it — a valid
  // operand everywhere the aggregate call was. Substituting after compilation
  // instead means the measured number never has to survive the compiler.
  //
  // Only `NAME([col])` is treated as an aggregate. `MIN(a, b)` over scalars is
  // an ordinary row-wise function in StarUI and is deliberately left alone, so
  // the compiler refuses it and the rule stays client-side rather than
  // compiling into something plausible and wrong.
  const aggregates: PerspectiveAggregateRef[] = [];
  let rewritten = expression;
  for (const [name, aggregate] of Object.entries(AGGREGATE_FUNCTIONS)) {
    const pattern = new RegExp(String.raw`\b${name}\s*\(\s*\[([^\]]+)\]\s*\)`, 'gi');
    rewritten = rewritten.replace(pattern, (_match, colId: string) => {
      const token = `__agg${aggregates.length}__`;
      aggregates.push({ token, colId: colId.trim(), aggregate });
      return `[${token}]`;
    });
  }
  return { rewritten, aggregates };
}

/**
 * Plan the rules that need a worker-side answer.
 *
 * Only rules the header painter actually consults are planned — a rule with no
 * header flash and no header indicator is answered entirely by the cells on
 * screen, and planning it would cost a full-book View for nothing.
 */
export function planPerspectiveStyleRules(
  rules: readonly ConditionalRule[] | undefined,
  dialect: ServerStyleRuleDialect = 'perspective',
): PerspectiveStyleRulePlans {
  if (!rules || rules.length === 0) return EMPTY;

  const plans: PerspectiveStyleRulePlan[] = [];
  const refusals: PerspectiveStyleRuleRefusal[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!needsWorkerAnswer(rule)) continue;

    if (rule.activeDurationMs != null && rule.activeDurationMs > 0) {
      // A timed rule is active because a value changed while the user was
      // looking at it. The book has no notion of that, so the whole-book answer
      // would be about a different question.
      refusals.push({ ruleId: rule.id, reason: 'timed rules are viewport-scoped' });
      continue;
    }

    const extracted = extractAggregates(rule.expression);
    if (!extracted) {
      refusals.push({ ruleId: rule.id, reason: 'expression does not parse' });
      continue;
    }

    if (dialect === 'starui') {
      // No compilation at all: `@starui/ssrm-engine` evaluates this tree. What
      // it CANNOT evaluate it refuses by name at the port, and the painter
      // falls back to its client scan for that rule — which is why there is no
      // second copy of the engine's refusal list here.
      //
      // `.old` / `.new` are the exception and are refused up front, because
      // they are viewport-only BY DEFINITION on every backend: the book holds
      // one value per cell, not a before and an after. Refusing them here keeps
      // the rule on its client scan, where it is still correct for the rows on
      // screen, instead of spending a port round trip to be told so.
      if (/\[[^\]]*\.(old|new)\]/i.test(extracted.rewritten)) {
        refusals.push({ ruleId: rule.id, reason: '.old/.new refs are viewport-only' });
        continue;
      }
      plans.push({
        ruleId: rule.id,
        expression: extracted.rewritten,
        aggregates: extracted.aggregates,
      });
      continue;
    }

    const compiled = compileStarUiExpressionToPerspective(extracted.rewritten);
    if (!compiled.ok) {
      refusals.push({ ruleId: rule.id, reason: compiled.reason });
      continue;
    }
    if (compiled.perspectiveType !== 'boolean') {
      // A rule's expression is used as a predicate. One that does not compile
      // to a boolean would be filtered with `== true` against a float, which
      // Perspective accepts and answers false for — a rule that never matches
      // rather than one that visibly could not be moved.
      refusals.push({
        ruleId: rule.id,
        reason: 'expression is not boolean-valued server-side',
      });
      continue;
    }

    plans.push({
      ruleId: rule.id,
      expression: compiled.perspectiveExpression,
      aggregates: extracted.aggregates,
    });
  }

  return plans.length === 0 && refusals.length === 0 ? EMPTY : { plans, refusals };
}

/** True when a rule paints something that depends on the whole book rather
 *  than on the cells in view — today, a header flash or a header badge. */
export function needsWorkerAnswer(rule: ConditionalRule): boolean {
  if (!rule.enabled || rule.scope.type !== 'cell') return false;
  if (
    rule.flash?.enabled &&
    (rule.flash.target === 'headers' || rule.flash.target === 'cells+headers')
  ) {
    return true;
  }
  if (!rule.indicator?.icon) return false;
  const target = rule.indicator.target ?? 'cells+headers';
  return target === 'headers' || target === 'cells+headers';
}

/**
 * Swap measured aggregate scalars into a planned expression.
 *
 * Returns null when any of them is unavailable: an "above average" rule with no
 * average is not a rule with a default, and substituting one would make it
 * quietly mean something else.
 */
export function substituteAggregates(
  plan: PerspectiveStyleRulePlan,
  measured: ReadonlyMap<string, number | null>,
  dialect: ServerStyleRuleDialect = 'perspective',
): string | null {
  if (plan.aggregates.length === 0) return plan.expression;

  let out = plan.expression;
  for (const ref of plan.aggregates) {
    const value = measured.get(ref.token);
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    // The form the token is WEARING differs by dialect, and getting it wrong is
    // silent: the substitution simply does not happen and the expression goes
    // out still naming a column nothing has. The Perspective compiler renders a
    // column reference as `"name"`; StarUI source keeps it as `[name]`, because
    // no compilation happened.
    out =
      dialect === 'starui'
        ? out.split(`[${ref.token}]`).join(String(value))
        : out.split(`"${ref.token}"`).join(String(value));
  }
  return out;
}
