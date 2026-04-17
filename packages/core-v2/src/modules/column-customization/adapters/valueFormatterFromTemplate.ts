import type { PresetId, ValueFormatterTemplate } from '../state';
import { excelFormatter } from './excelFormatter';

export type FormatterParams = { value: unknown; data?: unknown };
export type Formatter = (params: FormatterParams) => string;

// ─── Preset registry ────────────────────────────────────────────────────────
//
// Each preset returns a Formatter. All are CSP-safe (Intl.* + arithmetic).
// Null/undefined value short-circuits to '' so we never render "NaN" / "null".

type PresetFactory = (opts?: Record<string, unknown>) => Formatter;

const currency: PresetFactory = (opts) => {
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: typeof opts?.currency === 'string' ? opts.currency : 'USD',
    maximumFractionDigits: typeof opts?.decimals === 'number' ? opts.decimals : 2,
    minimumFractionDigits: typeof opts?.decimals === 'number' ? opts.decimals : 2,
  });
  return ({ value }) => {
    if (value == null) return '';
    const n = Number(value);
    return Number.isFinite(n) ? fmt.format(n) : '';
  };
};

const percent: PresetFactory = (opts) => {
  const decimals = typeof opts?.decimals === 'number' ? opts.decimals : 0;
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return ({ value }) => {
    if (value == null) return '';
    const n = Number(value);
    return Number.isFinite(n) ? fmt.format(n) : '';
  };
};

const number: PresetFactory = (opts) => {
  const decimals = typeof opts?.decimals === 'number' ? opts.decimals : 0;
  const thousands = opts?.thousands !== false;
  const fmt = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: thousands,
  });
  return ({ value }) => {
    if (value == null) return '';
    const n = Number(value);
    return Number.isFinite(n) ? fmt.format(n) : '';
  };
};

const date: PresetFactory = (opts) => {
  // For v2.1 we ship a single fixed pattern (yyyy-MM-dd). The `pattern` option
  // is reserved for a future minor release; documented in the spec.
  const pattern = typeof opts?.pattern === 'string' ? opts.pattern : 'yyyy-MM-dd';
  void pattern;
  return ({ value }) => {
    if (value == null) return '';
    const d = value instanceof Date ? value : new Date(Number(value));
    if (isNaN(d.getTime())) return '';
    // Manual ISO date slice — Intl.DateTimeFormat respects the host TZ which
    // makes tests flaky on CI. Stick to UTC components.
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
};

const duration: PresetFactory = () => {
  return ({ value }) => {
    if (value == null) return '';
    const ms = Number(value);
    if (!Number.isFinite(ms)) return '';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };
};

const presetRegistry: Record<PresetId, PresetFactory> = {
  currency,
  percent,
  number,
  date,
  duration,
};

// ─── Expression branch (CSP-unsafe; cached per expression string) ───────────

// Unbounded — fine for user-authored templates (handful per profile). Revisit
// with an LRU if expressions ever come from programmatic / less-trusted sources.
const expressionCache = new Map<string, Formatter>();

/**
 * Test-only: clear the cache between tests so cache-hit assertions are reliable.
 * @internal
 */
export function __resetExpressionCacheForTests(): void {
  expressionCache.clear();
}

function compileExpression(expression: string): Formatter {
  try {
    // eslint-disable-next-line no-new-func
    const compiled = new Function('x', 'data', `return (${expression});`) as
      (x: unknown, data?: unknown) => unknown;
    return ({ value, data }) => {
      try {
        const out = compiled(value, data);
        return out == null ? '' : String(out);
      } catch {
        // Runtime error inside the user expression — fall back to identity.
        return value == null ? '' : String(value);
      }
    };
  } catch (err) {
    console.warn(
      '[core-v2] column-customization',
      'invalid valueFormatter expression; falling back to identity formatter:',
      expression,
      err,
    );
    return ({ value }) => (value == null ? '' : String(value));
  }
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

export function valueFormatterFromTemplate(t: ValueFormatterTemplate): Formatter {
  if (t.kind === 'preset') {
    return presetRegistry[t.preset](t.options);
  }
  if (t.kind === 'excelFormat') {
    // SSF-backed; caches by format string internally.
    return excelFormatter(t.format);
  }
  // kind: 'expression' — cache by expression string.
  let fn = expressionCache.get(t.expression);
  if (!fn) {
    fn = compileExpression(t.expression);
    expressionCache.set(t.expression, fn);
  }
  return fn;
}
