/**
 * What an expression MEANS. One definition, mirroring the grid's own.
 *
 * ## The rule: this evaluator follows the GRID, and the grid is JavaScript
 *
 * The values a calculated column shows on the client-side row model come from
 * `@starui/engine`'s `evalOps.ts` — `applyBinary`, `applyUnary`, `isTruthy` —
 * called per row by `buildVirtualColDef`'s `valueGetter`. Everything below is
 * written to those rules deliberately, operator for operator, because a
 * calculated column that means one thing on CSRM and another on the server row
 * model is worse than one that does not exist. Which surface holds the book has
 * to be invisible.
 *
 * That matters most for NULL, and there is a recorded incident:
 * **`null > 95` is FALSE in JavaScript and TRUE in Perspective's expression
 * language**, and the same authored rule painted different rows on the two
 * surfaces (`docs/PERSPECTIVE_GRID_PARITY_WORKLOG.md`, "Traps that produced
 * false findings"). This engine is JavaScript. `null` coerces to 0 in a
 * relational comparison, so `null > 95` is false, `null > -1` is TRUE, and
 * `null == 0` is FALSE (`==` here is `===`). Those three are not typos and are
 * asserted individually — the second is the one that surprises people, and
 * "nulls never match a comparison" is the wrong summary of the rule.
 *
 * ## The three places the grid's rules are NOT plain JavaScript
 *
 * Copied anyway, because the grid is the contract:
 *
 *   1. **`x / 0` is `null`, not `Infinity`.** `applyBinary` guards it. But `x /
 *      null` is NOT guarded — `null` is not `=== 0` — so it goes through as
 *      `x / null`, which JavaScript answers `Infinity`. Divide by zero and
 *      divide by an absent value therefore differ, and both are fuzzed;
 *   2. **`isTruthy(NaN)` is TRUE.** The falsy set is exactly
 *      `null | undefined | false | 0 | ''`, and NaN is not in it — so `NaN AND
 *      1` is 1 where JavaScript would say NaN. This drives AND, OR, the
 *      ternary, `IFS` and `NOT`;
 *   3. **`IF` and `IFS` disagree with each other on NaN.** `IF` is an ordinary
 *      function whose body is `cond ? t : f`, so its condition uses JAVASCRIPT
 *      truthiness and `IF(NaN, a, b)` answers `b`; `IFS` uses `isTruthy`, so
 *      `IFS(NaN, a, b)` answers `a`. That is upstream's behaviour, it is
 *      reproduced here rather than tidied, and the fuzz pins it — tidying it
 *      would be this engine disagreeing with the surface beside it.
 *
 * ## NaN is a value, and an expression that produces one keeps it
 *
 * Session 3 settled what NaN is in this engine and nothing here weakens it: the
 * store keeps NaN as a real value, `blank` does not match it, an aggregate
 * skips it, and it sorts with the nulls because it has no position on the
 * number line — last in BOTH directions (`sort.ts`). A calculated column obeys
 * the same contract. **`SQRT(-1)` is NaN and is stamped as NaN**, never
 * quietly turned into null: null means "no value here" and a cell that renders
 * blank because an expression went wrong is indistinguishable from a genuine
 * absence, which is the failure the skeleton renderer was built for on the
 * other path. A NaN is visibly a NaN, sorts where an unorderable value belongs,
 * and is skipped by an aggregate — three behaviours a null would get wrong.
 *
 * Nothing in this module throws for a bad VALUE. It throws only for a
 * malformed CALL (an operator or a function that does not exist, or the wrong
 * number of arguments), which `calc.ts` turns into a compile-time refusal
 * wherever it can and a caught, warned-once fallback where it cannot.
 */

/** Falsy: `null`, `undefined`, `false`, `0`, `''`. NaN is TRUTHY — see above. */
export function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === '') {
    return false;
  }
  return true;
}

export function applyUnary(op: string, value: unknown): unknown {
  switch (op) {
    case 'NOT':
      return !isTruthy(value);
    case '-':
      return -(value as number);
    default:
      throw new Error(`unknown unary operator '${op}'`);
  }
}

/** Every binary operator except AND/OR, which short-circuit in the compiler. */
export function applyBinary(op: string, left: unknown, right: unknown): unknown {
  switch (op) {
    case '+':
      // A string on EITHER side concatenates, which is how a text column joins
      // a number without a cast. `1 + null` is 1; `'a' + null` is 'anull'.
      if (typeof left === 'string' || typeof right === 'string') return `${left}${right}`;
      return (left as number) + (right as number);
    case '-':
      return (left as number) - (right as number);
    case '*':
      return (left as number) * (right as number);
    case '/':
      // Divide by zero is null, divide by null is Infinity. See the header.
      if ((right as number) === 0) return null;
      return (left as number) / (right as number);
    case '%':
      return (left as number) % (right as number);
    case '>':
      return (left as number) > (right as number);
    case '<':
      return (left as number) < (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '<=':
      return (left as number) <= (right as number);
    case '==':
      // STRICT. `null == 0` is false, `'5' == 5` is false, `NaN == NaN` is
      // false. A loose `==` here would make a null equal to an empty string and
      // to zero, which on a price column is three different facts collapsed.
      return left === right;
    case '!=':
      return left !== right;
    case 'IN':
      return Array.isArray(right) && right.includes(left);
    case 'BETWEEN':
      if (!Array.isArray(right) || right.length !== 2) return false;
      return (left as number) >= (right[0] as number) && (left as number) <= (right[1] as number);
    default:
      throw new Error(`unknown binary operator '${op}'`);
  }
}

function toNum(value: unknown): number {
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function toStr(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export interface CalcFunction {
  minArgs: number;
  maxArgs: number;
  /**
   * True when `@starui/engine` marks this `aggregateColumnRefs`, i.e. a direct
   * `[col]` argument means the WHOLE COLUMN there rather than this row's cell.
   * The compiler refuses those call sites — see `calc.ts`.
   */
  crossRowOnColumnRef?: boolean;
  evaluate(args: unknown[]): unknown;
}

/**
 * The functions this backend evaluates, mirroring `@starui/engine`'s registry
 * (`packages/shared/engine/src/expression/functions.ts`) implementation for
 * implementation.
 *
 * **Two families are deliberately absent, and absence here is a REFUSAL rather
 * than a wrong answer** — the compiler names the function in the reason and the
 * column falls back to its field binding:
 *
 *   - **`NOW` / `TODAY`.** They answer the wall clock, so the same expression
 *     over the same book gives a different value on each read and cannot be
 *     compared to the surface beside it. Session 5 has to decide whether calc
 *     values are materialised into the store; a value that goes stale on its
 *     own would make that decision meaningless. Refused until something needs
 *     them enough to say what "now" means for a materialised column;
 *   - **`LOG10`, and anything else the registry does not define.** Refused by
 *     name. Worth knowing: the lab's own seeded curriculum authors
 *     `LOG10([avgDailyVolume30d])` and `LOG10` **does not exist upstream** — on
 *     CSRM `buildVirtualColDef` catches the "Unknown function" and returns
 *     `null` for every row, silently, so that column has been rendering empty.
 *     Here it is refused with the function named, which is how it was noticed.
 */
export const CALC_FUNCTIONS: Record<string, CalcFunction> = {
  // ── Math ────────────────────────────────────────────────────────────────
  ABS: { minArgs: 1, maxArgs: 1, evaluate: ([n]) => Math.abs(toNum(n)) },
  ROUND: {
    minArgs: 1,
    maxArgs: 2,
    evaluate: ([n, d]) => {
      const dec = d !== undefined ? toNum(d) : 0;
      const f = 10 ** dec;
      return Math.round(toNum(n) * f) / f;
    },
  },
  FLOOR: { minArgs: 1, maxArgs: 1, evaluate: ([n]) => Math.floor(toNum(n)) },
  CEIL: { minArgs: 1, maxArgs: 1, evaluate: ([n]) => Math.ceil(toNum(n)) },
  SQRT: { minArgs: 1, maxArgs: 1, evaluate: ([n]) => Math.sqrt(toNum(n)) },
  POW: { minArgs: 2, maxArgs: 2, evaluate: ([b, e]) => Math.pow(toNum(b), toNum(e)) },
  MOD: { minArgs: 2, maxArgs: 2, evaluate: ([a, b]) => toNum(a) % toNum(b) },
  LOG: { minArgs: 1, maxArgs: 1, evaluate: ([n]) => Math.log(toNum(n)) },
  EXP: { minArgs: 1, maxArgs: 1, evaluate: ([n]) => Math.exp(toNum(n)) },

  // ── Reducers: row-wise here, CROSS-ROW upstream when handed a bare [col] ──
  MIN: {
    minArgs: 1,
    maxArgs: 100,
    crossRowOnColumnRef: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      return nums.length === 0 ? 0 : Math.min(...nums);
    },
  },
  MAX: {
    minArgs: 1,
    maxArgs: 100,
    crossRowOnColumnRef: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      return nums.length === 0 ? 0 : Math.max(...nums);
    },
  },
  AVG: {
    minArgs: 1,
    maxArgs: 100,
    crossRowOnColumnRef: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
    },
  },
  MEDIAN: {
    minArgs: 1,
    maxArgs: 100,
    crossRowOnColumnRef: true,
    evaluate: (args) => {
      const sorted = args.flat().map(toNum).sort((a, b) => a - b);
      if (sorted.length === 0) return 0;
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    },
  },
  STDEV: {
    minArgs: 1,
    maxArgs: 100,
    crossRowOnColumnRef: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      if (nums.length <= 1) return 0;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return Math.sqrt(nums.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (nums.length - 1));
    },
  },
  VARIANCE: {
    minArgs: 1,
    maxArgs: 100,
    crossRowOnColumnRef: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      if (nums.length <= 1) return 0;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return nums.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (nums.length - 1);
    },
  },
  SUM: {
    minArgs: 1,
    maxArgs: 100,
    crossRowOnColumnRef: true,
    evaluate: (args) => args.flat().map(toNum).reduce((a, b) => a + b, 0),
  },
  COUNT: {
    minArgs: 1,
    maxArgs: 100,
    crossRowOnColumnRef: true,
    evaluate: (args) => args.flat().filter((v) => v !== null && v !== undefined).length,
  },
  DISTINCT_COUNT: {
    minArgs: 1,
    maxArgs: 100,
    crossRowOnColumnRef: true,
    evaluate: (args) => new Set(args.flat().filter((v) => v !== null && v !== undefined)).size,
  },

  // ── String ──────────────────────────────────────────────────────────────
  CONCAT: { minArgs: 1, maxArgs: 100, evaluate: (args) => args.map(toStr).join('') },
  UPPER: { minArgs: 1, maxArgs: 1, evaluate: ([s]) => toStr(s).toUpperCase() },
  LOWER: { minArgs: 1, maxArgs: 1, evaluate: ([s]) => toStr(s).toLowerCase() },
  TRIM: { minArgs: 1, maxArgs: 1, evaluate: ([s]) => toStr(s).trim() },
  SUBSTRING: {
    minArgs: 2,
    maxArgs: 3,
    evaluate: ([s, start, len]) => {
      const str = toStr(s);
      const from = toNum(start);
      return len !== undefined ? str.substring(from, from + toNum(len)) : str.substring(from);
    },
  },
  REPLACE: {
    minArgs: 3,
    maxArgs: 3,
    evaluate: ([s, from, to]) => {
      const escaped = toStr(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return toStr(s).replace(new RegExp(escaped, 'g'), toStr(to));
    },
  },
  LEN: { minArgs: 1, maxArgs: 1, evaluate: ([s]) => toStr(s).length },
  STARTS_WITH: {
    minArgs: 2,
    maxArgs: 2,
    evaluate: ([s, prefix]) => toStr(s).startsWith(toStr(prefix)),
  },
  ENDS_WITH: {
    minArgs: 2,
    maxArgs: 2,
    evaluate: ([s, suffix]) => toStr(s).endsWith(toStr(suffix)),
  },
  CONTAINS: { minArgs: 2, maxArgs: 2, evaluate: ([s, sub]) => toStr(s).includes(toStr(sub)) },
  REGEX_MATCH: {
    minArgs: 2,
    maxArgs: 2,
    evaluate: ([s, pattern]) => {
      try {
        return new RegExp(toStr(pattern)).test(toStr(s));
      } catch {
        return false;
      }
    },
  },

  // ── Date ────────────────────────────────────────────────────────────────
  YEAR: { minArgs: 1, maxArgs: 1, evaluate: ([d]) => new Date(toStr(d)).getFullYear() },
  MONTH: { minArgs: 1, maxArgs: 1, evaluate: ([d]) => new Date(toStr(d)).getMonth() + 1 },
  DAY: { minArgs: 1, maxArgs: 1, evaluate: ([d]) => new Date(toStr(d)).getDate() },
  IS_WEEKDAY: {
    minArgs: 1,
    maxArgs: 1,
    evaluate: ([d]) => {
      const day = new Date(toStr(d)).getDay();
      return day >= 1 && day <= 5;
    },
  },
  DATE_DIFF: {
    minArgs: 3,
    maxArgs: 3,
    evaluate: ([d1, d2, unit]) => {
      const ms = new Date(toStr(d1)).getTime() - new Date(toStr(d2)).getTime();
      const u = toStr(unit).toLowerCase();
      if (u === 'days' || u === 'd') return Math.floor(ms / 86400000);
      if (u === 'hours' || u === 'h') return Math.floor(ms / 3600000);
      if (u === 'minutes' || u === 'm') return Math.floor(ms / 60000);
      if (u === 'seconds' || u === 's') return Math.floor(ms / 1000);
      return ms;
    },
  },
  DATE_ADD: {
    minArgs: 3,
    maxArgs: 3,
    evaluate: ([d, n, unit]) => {
      const date = new Date(toStr(d));
      const amount = toNum(n);
      const u = toStr(unit).toLowerCase();
      if (u === 'days' || u === 'd') date.setDate(date.getDate() + amount);
      else if (u === 'months' || u === 'mo') date.setMonth(date.getMonth() + amount);
      else if (u === 'years' || u === 'y') date.setFullYear(date.getFullYear() + amount);
      else if (u === 'hours' || u === 'h') date.setHours(date.getHours() + amount);
      return date.toISOString();
    },
  },

  // ── Logical ─────────────────────────────────────────────────────────────
  /**
   * EAGER, and its condition is JAVASCRIPT truthy rather than {@link isTruthy}.
   *
   * Both halves are upstream's and both are load-bearing. Eager: `IF` is an
   * ordinary function, so every argument is evaluated before it runs and the
   * untaken branch runs too — which is why `IF([d] > 0, [y] / [d], null)` is
   * safe only because `x / 0` is null. JavaScript truthy: `IF(NaN, a, b)`
   * answers `b` while `IFS(NaN, a, b)` answers `a`.
   */
  IF: { minArgs: 3, maxArgs: 3, evaluate: ([cond, t, f]) => (cond ? t : f) },
  IFS: {
    minArgs: 2,
    maxArgs: 100,
    evaluate: (args) => {
      const hasDefault = args.length % 2 === 1;
      const pairs = Math.floor(args.length / 2);
      for (let i = 0; i < pairs; i++) {
        if (isTruthy(args[i * 2])) return args[i * 2 + 1];
      }
      return hasDefault ? args[args.length - 1] : null;
    },
  },
  SWITCH: { minArgs: 3, maxArgs: 100, evaluate: (args) => switchCase(args) },
  /** Alias of SWITCH upstream, so an alias here too — not a second rule. */
  CASE: { minArgs: 3, maxArgs: 100, evaluate: (args) => switchCase(args) },
  ISNULL: {
    minArgs: 2,
    maxArgs: 2,
    evaluate: ([v, fallback]) => (v === null || v === undefined ? fallback : v),
  },
  ISNOTNULL: { minArgs: 1, maxArgs: 1, evaluate: ([v]) => v !== null && v !== undefined },
  ISEMPTY: {
    minArgs: 1,
    maxArgs: 1,
    evaluate: ([v]) =>
      v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0),
  },
};

function switchCase(args: unknown[]): unknown {
  const target = args[0];
  const rest = args.slice(1);
  const hasDefault = rest.length % 2 === 1;
  const pairs = Math.floor(rest.length / 2);
  for (let i = 0; i < pairs; i++) {
    // Strict equality, matching upstream. A string '5' does not match a 5.
    if (target === rest[i * 2]) return rest[i * 2 + 1];
  }
  return hasDefault ? rest[rest.length - 1] : null;
}
