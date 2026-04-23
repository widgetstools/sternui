import type { ValueFormatterTemplate, TickToken } from '@marketsui/core';

/**
 * Formatter presets + inspection helpers for the FormattingToolbar.
 * Extracted from the toolbar during the AUDIT i1 split so the long
 * preset table + small pure predicates live in a testable module
 * instead of being buried inside the 1300+ LOC component.
 *
 * Currency / percent / thousands ship as structured preset templates
 * because they're CSP-safe and round-trip through JSON. BPS has no
 * preset equivalent today, so it falls back to a `kind: 'expression'`
 * template (CSP-unsafe — `configureExpressionPolicy` controls runtime
 * behaviour).
 */

export type FormatterChoice = {
  label: string;
  template: ValueFormatterTemplate;
};

export const FMT_USD: FormatterChoice = {
  label: '$',
  template: { kind: 'preset', preset: 'currency', options: { currency: 'USD', decimals: 2 } },
};
export const FMT_EUR: FormatterChoice = {
  label: '\u20AC',
  template: { kind: 'preset', preset: 'currency', options: { currency: 'EUR', decimals: 2 } },
};
export const FMT_GBP: FormatterChoice = {
  label: '\u00A3',
  template: { kind: 'preset', preset: 'currency', options: { currency: 'GBP', decimals: 2 } },
};
export const FMT_JPY: FormatterChoice = {
  label: '\u00A5',
  template: { kind: 'preset', preset: 'currency', options: { currency: 'JPY', decimals: 0 } },
};

export const CURRENCY_FORMATTERS: Record<string, FormatterChoice> = {
  USD: FMT_USD, EUR: FMT_EUR, GBP: FMT_GBP, JPY: FMT_JPY,
};

export const PERCENT_TEMPLATE: ValueFormatterTemplate = {
  kind: 'preset', preset: 'percent', options: { decimals: 2 },
};

export const COMMA_TEMPLATE: ValueFormatterTemplate = {
  kind: 'preset', preset: 'number', options: { decimals: 0, thousands: true },
};

// BPS has no preset equivalent — falls back to expression-kind.
// Strict CSP deployments will see this render as raw values (the
// expression policy gate substitutes an identity formatter).
export const BPS_TEMPLATE: ValueFormatterTemplate = {
  kind: 'expression',
  expression: "(x>=0?'+':'')+x.toFixed(1)+'bp'",
};

export function numberTemplate(decimals: number): ValueFormatterTemplate {
  return {
    kind: 'preset',
    preset: 'number',
    options: { decimals: Math.max(0, Math.min(10, decimals)), thousands: true },
  };
}

/** Pull a decimal count out of an existing formatter template. Returns null if
 *  we can't tell (e.g. date/duration presets that have no decimals concept). */
export function templateDecimals(t: ValueFormatterTemplate | undefined): number | null {
  if (!t) return null;
  if (t.kind === 'preset') {
    const n = (t.options as { decimals?: unknown } | undefined)?.decimals;
    return typeof n === 'number' ? n : null;
  }
  if (t.kind === 'expression') {
    // Expression fallback: try a couple of known patterns so legacy
    // expression-kind snapshots keep working under allow / warn modes.
    const m = t.expression.match(/maximumFractionDigits:(\d+)/);
    if (m) return parseInt(m[1], 10);
    const tx = t.expression.match(/toFixed\((\d+)\)/);
    if (tx) return parseInt(tx[1], 10);
  }
  // excelFormat / tick — no structured decimals concept.
  return null;
}

export function isPercentTemplate(t: ValueFormatterTemplate | undefined): boolean {
  return !!t && t.kind === 'preset' && t.preset === 'percent';
}

/** `true` when the template is any fixed-income tick format. */
export function isTickTemplate(t: ValueFormatterTemplate | undefined): boolean {
  return !!t && t.kind === 'tick';
}

/** Extract the tick token from a template (or null if not a tick). */
export function currentTickToken(t: ValueFormatterTemplate | undefined): TickToken | null {
  return t && t.kind === 'tick' ? t.tick : null;
}

/** Sample-output string per tick token, used inside the dropdown so
 *  traders see exactly what each precision produces. Values come from
 *  TICK_SAMPLES in core-v2; inlined here to keep the dropdown self-
 *  contained without importing yet another barrel symbol. */
export const TICK_MENU: ReadonlyArray<{
  token: TickToken;
  label: string;
  sample: string;
  /** Short denominator label displayed on the toolbar button — reflects
   *  the active tick base (32 / 32+ / 64 / 128 / 256) so the user can see
   *  at a glance which tick system is applied. Derived separately from
   *  `sample` because `sample.split('-').pop()` would incorrectly return
   *  the fractional numerator ('16' from '101-16') instead of the
   *  denominator the user actually cares about. */
  denominator: string;
}> = [
  { token: 'TICK32',      label: '32nds',           sample: '101-16',  denominator: '32'  },
  { token: 'TICK32_PLUS', label: '32nds + halves',  sample: '101-16+', denominator: '32+' },
  { token: 'TICK64',      label: '64ths',           sample: '101-161', denominator: '64'  },
  { token: 'TICK128',     label: '128ths',          sample: '101-162', denominator: '128' },
  { token: 'TICK256',     label: '256ths',          sample: '101-161', denominator: '256' },
];

export function isCommaTemplate(t: ValueFormatterTemplate | undefined): boolean {
  return !!t && t.kind === 'preset' && t.preset === 'number'
    && (t.options as { decimals?: unknown } | undefined)?.decimals === 0;
}
