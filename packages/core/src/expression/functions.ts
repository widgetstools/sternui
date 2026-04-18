import type { FunctionDefinition, EvaluationContext } from './types';

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toStr(v: unknown): string {
  return v == null ? '' : String(v);
}

function toArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

const builtins: FunctionDefinition[] = [
  // ─── Mathematical ────────────────────────────────────────────────────────
  { name: 'ABS', category: 'Math', description: 'Absolute value', signature: 'ABS(n)', minArgs: 1, maxArgs: 1,
    evaluate: ([n]) => Math.abs(toNum(n)) },
  { name: 'ROUND', category: 'Math', description: 'Round to decimals', signature: 'ROUND(n, decimals?)', minArgs: 1, maxArgs: 2,
    evaluate: ([n, d]) => { const dec = d !== undefined ? toNum(d) : 0; const f = 10 ** dec; return Math.round(toNum(n) * f) / f; } },
  { name: 'FLOOR', category: 'Math', description: 'Round down', signature: 'FLOOR(n)', minArgs: 1, maxArgs: 1,
    evaluate: ([n]) => Math.floor(toNum(n)) },
  { name: 'CEIL', category: 'Math', description: 'Round up', signature: 'CEIL(n)', minArgs: 1, maxArgs: 1,
    evaluate: ([n]) => Math.ceil(toNum(n)) },
  { name: 'SQRT', category: 'Math', description: 'Square root', signature: 'SQRT(n)', minArgs: 1, maxArgs: 1,
    evaluate: ([n]) => Math.sqrt(toNum(n)) },
  { name: 'POW', category: 'Math', description: 'Power', signature: 'POW(base, exp)', minArgs: 2, maxArgs: 2,
    evaluate: ([b, e]) => Math.pow(toNum(b), toNum(e)) },
  { name: 'MOD', category: 'Math', description: 'Modulus', signature: 'MOD(a, b)', minArgs: 2, maxArgs: 2,
    evaluate: ([a, b]) => toNum(a) % toNum(b) },
  { name: 'LOG', category: 'Math', description: 'Natural logarithm', signature: 'LOG(n)', minArgs: 1, maxArgs: 1,
    evaluate: ([n]) => Math.log(toNum(n)) },
  { name: 'EXP', category: 'Math', description: 'e^n', signature: 'EXP(n)', minArgs: 1, maxArgs: 1,
    evaluate: ([n]) => Math.exp(toNum(n)) },
  // MIN / MAX double as varargs AND column aggregators:
  //   - `MIN(1, 2, 3)`       → classic vararg reducer (scalar result).
  //   - `MIN([price])`       → per-column aggregate (smallest price in grid).
  // `aggregateColumnRefs: true` tells the evaluator to expand a direct
  // `[col]` arg to the full column array via `ctx.allRows`. `.flat()`
  // handles mixed scalar + array inputs uniformly.
  { name: 'MIN', category: 'Math', description: 'Minimum of values', signature: 'MIN(a, b, ...) | MIN([col])', minArgs: 1, maxArgs: 100, aggregateColumnRefs: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      return nums.length === 0 ? 0 : Math.min(...nums);
    } },
  { name: 'MAX', category: 'Math', description: 'Maximum of values', signature: 'MAX(a, b, ...) | MAX([col])', minArgs: 1, maxArgs: 100, aggregateColumnRefs: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      return nums.length === 0 ? 0 : Math.max(...nums);
    } },

  // ─── Statistical (column-wide when given a [col] arg) ────────────────────
  { name: 'AVG', category: 'Stats', description: 'Average', signature: 'AVG(values... | [col])', minArgs: 1, maxArgs: 100, aggregateColumnRefs: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
    } },
  { name: 'MEDIAN', category: 'Stats', description: 'Median value', signature: 'MEDIAN(values... | [col])', minArgs: 1, maxArgs: 100, aggregateColumnRefs: true,
    evaluate: (args) => {
      const sorted = args.flat().map(toNum).sort((a, b) => a - b);
      if (sorted.length === 0) return 0;
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    } },
  { name: 'STDEV', category: 'Stats', description: 'Standard deviation', signature: 'STDEV(values... | [col])', minArgs: 1, maxArgs: 100, aggregateColumnRefs: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      if (nums.length <= 1) return 0;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (nums.length - 1);
      return Math.sqrt(variance);
    } },
  { name: 'VARIANCE', category: 'Stats', description: 'Variance', signature: 'VARIANCE(values... | [col])', minArgs: 1, maxArgs: 100, aggregateColumnRefs: true,
    evaluate: (args) => {
      const nums = args.flat().map(toNum);
      if (nums.length <= 1) return 0;
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      return nums.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (nums.length - 1);
    } },

  // ─── Aggregation (column-wide when given a [col] arg) ────────────────────
  { name: 'SUM', category: 'Aggregation', description: 'Sum of values', signature: 'SUM(values... | [col])', minArgs: 1, maxArgs: 100, aggregateColumnRefs: true,
    evaluate: (args) => args.flat().map(toNum).reduce((a, b) => a + b, 0) },
  { name: 'COUNT', category: 'Aggregation', description: 'Count of values', signature: 'COUNT(values... | [col])', minArgs: 1, maxArgs: 100, aggregateColumnRefs: true,
    evaluate: (args) => args.flat().filter((v) => v != null).length },
  { name: 'DISTINCT_COUNT', category: 'Aggregation', description: 'Count of distinct values', signature: 'DISTINCT_COUNT(values... | [col])', minArgs: 1, maxArgs: 100, aggregateColumnRefs: true,
    evaluate: (args) => new Set(args.flat().filter((v) => v != null)).size },

  // ─── String ──────────────────────────────────────────────────────────────
  { name: 'CONCAT', category: 'String', description: 'Concatenate strings', signature: 'CONCAT(a, b, ...)', minArgs: 1, maxArgs: 100,
    evaluate: (args) => args.map(toStr).join('') },
  { name: 'UPPER', category: 'String', description: 'Uppercase', signature: 'UPPER(s)', minArgs: 1, maxArgs: 1,
    evaluate: ([s]) => toStr(s).toUpperCase() },
  { name: 'LOWER', category: 'String', description: 'Lowercase', signature: 'LOWER(s)', minArgs: 1, maxArgs: 1,
    evaluate: ([s]) => toStr(s).toLowerCase() },
  { name: 'TRIM', category: 'String', description: 'Trim whitespace', signature: 'TRIM(s)', minArgs: 1, maxArgs: 1,
    evaluate: ([s]) => toStr(s).trim() },
  { name: 'SUBSTRING', category: 'String', description: 'Extract substring', signature: 'SUBSTRING(s, start, len?)', minArgs: 2, maxArgs: 3,
    evaluate: ([s, start, len]) => {
      const str = toStr(s);
      const startIdx = toNum(start);
      return len !== undefined ? str.substring(startIdx, startIdx + toNum(len)) : str.substring(startIdx);
    } },
  { name: 'REPLACE', category: 'String', description: 'Replace text', signature: 'REPLACE(s, from, to)', minArgs: 3, maxArgs: 3,
    evaluate: ([s, from, to]) => {
      const escaped = toStr(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return toStr(s).replace(new RegExp(escaped, 'g'), toStr(to));
    } },
  { name: 'LEN', category: 'String', description: 'String length', signature: 'LEN(s)', minArgs: 1, maxArgs: 1,
    evaluate: ([s]) => toStr(s).length },
  { name: 'STARTS_WITH', category: 'String', description: 'Check prefix', signature: 'STARTS_WITH(s, prefix)', minArgs: 2, maxArgs: 2,
    evaluate: ([s, prefix]) => toStr(s).startsWith(toStr(prefix)) },
  { name: 'ENDS_WITH', category: 'String', description: 'Check suffix', signature: 'ENDS_WITH(s, suffix)', minArgs: 2, maxArgs: 2,
    evaluate: ([s, suffix]) => toStr(s).endsWith(toStr(suffix)) },
  { name: 'CONTAINS', category: 'String', description: 'Check contains', signature: 'CONTAINS(s, substr)', minArgs: 2, maxArgs: 2,
    evaluate: ([s, sub]) => toStr(s).includes(toStr(sub)) },
  { name: 'REGEX_MATCH', category: 'String', description: 'Regex test', signature: 'REGEX_MATCH(s, pattern)', minArgs: 2, maxArgs: 2,
    evaluate: ([s, pattern]) => new RegExp(toStr(pattern)).test(toStr(s)) },

  // ─── Date ────────────────────────────────────────────────────────────────
  { name: 'NOW', category: 'Date', description: 'Current timestamp', signature: 'NOW()', minArgs: 0, maxArgs: 0,
    evaluate: () => new Date().toISOString() },
  { name: 'TODAY', category: 'Date', description: 'Current date string', signature: 'TODAY()', minArgs: 0, maxArgs: 0,
    evaluate: () => new Date().toISOString().slice(0, 10) },
  { name: 'YEAR', category: 'Date', description: 'Extract year', signature: 'YEAR(d)', minArgs: 1, maxArgs: 1,
    evaluate: ([d]) => new Date(toStr(d)).getFullYear() },
  { name: 'MONTH', category: 'Date', description: 'Extract month (1-12)', signature: 'MONTH(d)', minArgs: 1, maxArgs: 1,
    evaluate: ([d]) => new Date(toStr(d)).getMonth() + 1 },
  { name: 'DAY', category: 'Date', description: 'Extract day of month', signature: 'DAY(d)', minArgs: 1, maxArgs: 1,
    evaluate: ([d]) => new Date(toStr(d)).getDate() },
  { name: 'IS_WEEKDAY', category: 'Date', description: 'Check if weekday', signature: 'IS_WEEKDAY(d)', minArgs: 1, maxArgs: 1,
    evaluate: ([d]) => { const day = new Date(toStr(d)).getDay(); return day >= 1 && day <= 5; } },
  { name: 'DATE_DIFF', category: 'Date', description: 'Difference between dates', signature: 'DATE_DIFF(d1, d2, unit)', minArgs: 3, maxArgs: 3,
    evaluate: ([d1, d2, unit]) => {
      const ms = new Date(toStr(d1)).getTime() - new Date(toStr(d2)).getTime();
      const u = toStr(unit).toLowerCase();
      if (u === 'days' || u === 'd') return Math.floor(ms / 86400000);
      if (u === 'hours' || u === 'h') return Math.floor(ms / 3600000);
      if (u === 'minutes' || u === 'm') return Math.floor(ms / 60000);
      if (u === 'seconds' || u === 's') return Math.floor(ms / 1000);
      return ms;
    } },
  { name: 'DATE_ADD', category: 'Date', description: 'Add to date', signature: 'DATE_ADD(d, n, unit)', minArgs: 3, maxArgs: 3,
    evaluate: ([d, n, unit]) => {
      const date = new Date(toStr(d));
      const amount = toNum(n);
      const u = toStr(unit).toLowerCase();
      if (u === 'days' || u === 'd') date.setDate(date.getDate() + amount);
      else if (u === 'months' || u === 'mo') date.setMonth(date.getMonth() + amount);
      else if (u === 'years' || u === 'y') date.setFullYear(date.getFullYear() + amount);
      else if (u === 'hours' || u === 'h') date.setHours(date.getHours() + amount);
      return date.toISOString();
    } },

  // ─── Logical ─────────────────────────────────────────────────────────────
  { name: 'IF', category: 'Logical', description: 'Conditional', signature: 'IF(cond, then, else)', minArgs: 3, maxArgs: 3,
    evaluate: ([cond, t, f]) => (cond ? t : f) },
  { name: 'ISNULL', category: 'Logical', description: 'Null check with default', signature: 'ISNULL(v, default)', minArgs: 2, maxArgs: 2,
    evaluate: ([v, def]) => (v == null ? def : v) },
  { name: 'ISNOTNULL', category: 'Logical', description: 'Not null check', signature: 'ISNOTNULL(v)', minArgs: 1, maxArgs: 1,
    evaluate: ([v]) => v != null },
  { name: 'ISEMPTY', category: 'Logical', description: 'Empty check', signature: 'ISEMPTY(v)', minArgs: 1, maxArgs: 1,
    evaluate: ([v]) => v == null || v === '' || (Array.isArray(v) && v.length === 0) },
];

export function createFunctionRegistry(): Map<string, FunctionDefinition> {
  const registry = new Map<string, FunctionDefinition>();
  for (const fn of builtins) {
    registry.set(fn.name, fn);
  }
  return registry;
}

export function getAllFunctions(): FunctionDefinition[] {
  return [...builtins];
}
