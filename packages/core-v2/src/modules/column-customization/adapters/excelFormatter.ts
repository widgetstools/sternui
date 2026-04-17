import SSF from 'ssf';
import type { Formatter } from './valueFormatterFromTemplate';

/**
 * Excel format-string formatter (SSF / SheetJS format).
 *
 * Handles everything Excel does:
 *   - Numbers: `0`, `#,##0`, `#,##0.00`, `0.00E+00` (scientific), `# ?/?` (fractions)
 *   - Currency: `$#,##0.00`, `€#,##0.00`, `¥#,##0`
 *   - Percent: `0.00%`
 *   - Dates: `yyyy-mm-dd`, `mm/dd/yy`, `[h]:mm:ss` (elapsed time)
 *   - Conditional sections: `positive;negative;zero;text`
 *   - Color tags: `[Red]`, `[Blue]`, `[Green]`, `[Yellow]`, `[Black]`, `[White]`,
 *     `[Cyan]`, `[Magenta]` — parsed into a per-value color resolver so cells
 *     actually paint the color (SSF returns plain text; AG-Grid strips HTML).
 *     We expose the color separately via `colorForValue()` and the column
 *     module wires it to `cellStyle.color`.
 *   - Literals: `"prefix"0.00"suffix"`, `\ ` escapes
 *
 * Compile-and-cache by format string — the per-cell render path is just a
 * string lookup + the native SSF format call (fast for a grid with many
 * cells). Bad format strings fall back to an identity formatter (show the
 * raw value as a string) and leave an `[SSF] invalid format` console warn
 * once, so the grid keeps rendering.
 */

type CachedFormatter = Formatter & {
  isValid: boolean;
  /** Returns the color (if any) that applies to the given value under this
   *  format string. Used by the column-customization module to emit a
   *  `cellStyle.color` alongside the formatter. Returns undefined when the
   *  active format section has no `[Color]` tag. */
  colorForValue?: (value: unknown) => string | undefined;
  /** True when ANY section of the format contains a color tag. The column
   *  module uses this to decide whether to emit a `cellStyle` at all. */
  hasColors?: boolean;
};

const _cache = new Map<string, CachedFormatter>();

// ─── Section / color parsing ────────────────────────────────────────────────
//
// Excel format strings contain up to 4 `;`-separated sections:
//   `positive;negative;zero;text`
// Each section can begin with a `[ColorName]` or `[>N]` / `[<N]` conditional
// tag (in brackets). We parse sections to discover their colors ONCE per
// format string, then pick the right section per value at render time.
//
// Split is semicolon-aware: we don't split inside `"strings"` or `[brackets]`
// because both can legitimately contain `;`.

// Map Excel color names to design-system CSS variables where we have them,
// so [Red] / [Green] match the rest of the app's palette (BUY/SELL, positive/
// negative PnL, fill-bar states, etc.). Each entry uses the `var(--token,
// #fallback)` pattern so CSS variables that aren't defined at render time
// degrade gracefully to a sensible hex. Black / White / Magenta aren't in
// the `--bn-*` palette so they stay as plain hex.
const EXCEL_COLOR_MAP: Record<string, string> = {
  BLACK:   '#000000',
  BLUE:    'var(--bn-blue, #3da0ff)',
  CYAN:    'var(--bn-cyan, #22d3ee)',
  GREEN:   'var(--bn-green, #2dd4bf)',     // design-system teal — same token as BUY / positive PnL
  MAGENTA: '#FF00FF',
  RED:     'var(--bn-red, #f87171)',       // design-system red — same token as SELL / negative PnL
  WHITE:   '#FFFFFF',
  YELLOW:  'var(--bn-yellow, #f0b90b)',
};

function splitFormatSections(format: string): string[] {
  const sections: string[] = [];
  let current = '';
  let inString = false;
  let bracketDepth = 0;
  for (let i = 0; i < format.length; i++) {
    const ch = format[i];
    if (ch === '"' && format[i - 1] !== '\\') {
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString) {
      if (ch === '[') bracketDepth++;
      else if (ch === ']' && bracketDepth > 0) bracketDepth--;
      else if (ch === ';' && bracketDepth === 0) {
        sections.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  sections.push(current);
  return sections;
}

/** Extract the leading `[Color]` from a section, if any. Returns the CSS
 *  color string or undefined. Leaves other leading brackets (like `[>100]`
 *  conditionals) alone — they're not color tags. */
function extractSectionColor(section: string): string | undefined {
  // Scan leading bracket groups — Excel lets you combine `[Red][>0]#,##0`.
  let i = 0;
  while (section[i] === '[') {
    const end = section.indexOf(']', i + 1);
    if (end === -1) return undefined;
    const tag = section.slice(i + 1, end).trim().toUpperCase();
    if (tag in EXCEL_COLOR_MAP) return EXCEL_COLOR_MAP[tag];
    i = end + 1;
  }
  return undefined;
}

/**
 * Build a per-value color resolver from the parsed sections. Excel's rules
 * for which section applies:
 *   - 1 section  → always that one.
 *   - 2 sections → [0]=positive+zero, [1]=negative.
 *   - 3 sections → [0]=positive, [1]=negative, [2]=zero.
 *   - 4 sections → add [3]=text (non-numeric values).
 *
 * Returns undefined when no section carries a color.
 */
function buildColorResolver(format: string): { resolver?: (value: unknown) => string | undefined; hasColors: boolean } {
  const sections = splitFormatSections(format);
  const colors = sections.map(extractSectionColor);
  const hasColors = colors.some((c) => !!c);
  if (!hasColors) return { hasColors: false };

  const pickIndex = (value: unknown): number => {
    if (typeof value === 'string') {
      return sections.length >= 4 ? 3 : 0;
    }
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return 0;
    if (sections.length === 1) return 0;
    if (sections.length === 2) return n < 0 ? 1 : 0;
    // 3 or 4 sections
    if (n > 0) return 0;
    if (n < 0) return 1;
    return 2;
  };

  const resolver = (value: unknown): string | undefined => {
    if (value == null || value === '') return undefined;
    return colors[pickIndex(value)];
  };

  return { resolver, hasColors: true };
}

export function excelFormatter(format: string): Formatter {
  const hit = _cache.get(format);
  if (hit) return hit;

  // Pre-validate by attempting a format once against a neutral value. SSF
  // throws on malformed inputs; we catch here so the per-cell path doesn't
  // repeatedly pay that cost.
  let valid = true;
  try { SSF.format(format, 0); }
  catch {
    valid = false;
    // Warn once per bad format — repeated identical warnings get deduped by
    // the Map lookup above.
    console.warn('[core-v2] column-customization: invalid Excel format string:', format);
  }

  const { resolver, hasColors } = valid ? buildColorResolver(format) : { resolver: undefined, hasColors: false };

  // Detect whether the format string uses date codes — `yyyy`, `mm`, `dd`,
  // `hh`, `h`, `ss`, `yy`, `mmm`, `mmmm`. When it does, the formatter
  // needs a real Date (or Excel serial) as input; string values like
  // `"2026-04-17T05:37:16.092Z"` otherwise get fed directly to SSF which
  // treats them as text and renders the raw ISO string.
  const isDateFormat = /\b(yyyy|yy|mmmm|mmm|mm|m|dd|d|hh|h|ss|s|AM\/PM|am\/pm)\b/.test(format);

  /**
   * Coerce an incoming cell value into something SSF can format:
   *   - Date objects pass through.
   *   - ISO-8601-ish strings (starts with yyyy-mm-dd) → parsed into a Date.
   *   - Numeric strings / numbers → numeric.
   *   - Everything else → raw value (SSF's `@` text placeholder handles it).
   */
  const coerceValue = (value: unknown): unknown => {
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      if (isDateFormat && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d;
      }
      const n = Number(value);
      if (Number.isFinite(n)) return n;
      return value;
    }
    if (typeof value === 'number') return value;
    return value;
  };

  const fn: Formatter = valid
    ? ({ value }) => {
        if (value == null || value === '') return '';
        const target = coerceValue(value);
        try {
          return SSF.format(format, target as number);
        } catch {
          return String(value);
        }
      }
    : ({ value }) => (value == null ? '' : String(value));

  const cached = Object.assign(fn, {
    isValid: valid,
    hasColors,
    colorForValue: resolver,
  }) as CachedFormatter;
  _cache.set(format, cached);
  return cached;
}

/**
 * Returns the per-value color resolver for a format string, or undefined if
 * the format has no color tags. Callers (the column-customization module)
 * use this to emit an AG-Grid `cellStyle` function alongside the formatter.
 *
 * Shares the same cache as `excelFormatter` — identical format strings only
 * parse once.
 */
export function excelFormatColorResolver(format: string): ((value: unknown) => string | undefined) | undefined {
  // Ensure the format is cached + parsed. `excelFormatter` populates
  // `colorForValue` on the cached entry.
  const fn = excelFormatter(format) as CachedFormatter;
  return fn.hasColors ? fn.colorForValue : undefined;
}

/**
 * Synchronously check whether a format string is valid Excel syntax. Used
 * by the toolbar's text input to toggle the `aria-invalid` state before
 * commit, so users see the red border as they type.
 */
export function isValidExcelFormat(format: string): boolean {
  if (!format) return false;
  // Fast path: if already cached, reuse the validity flag.
  const hit = _cache.get(format);
  if (hit) return hit.isValid;
  try { SSF.format(format, 0); return true; }
  catch { return false; }
}

/** @internal test helper */
export function __resetExcelFormatterCacheForTests(): void {
  _cache.clear();
}
