import type { ValueFormatterTemplate } from '../../modules/column-customization/state';

/**
 * `FormatterPicker.dataType` — a semantic-level enum the picker uses to
 * filter its preset list. Deliberately richer than the existing
 * `ColumnDataType` (`'numeric' | 'date' | 'string' | 'boolean'`): the
 * picker splits 'numeric' into `number | currency | percent` so the
 * preset dropdown can surface the right sub-menu without a second
 * "what kind of number?" prompt.
 *
 * Hosts map their own column datatype to this enum — see
 * `inferPickerDataType()` in `FormatterPicker.tsx`.
 */
export type FormatterPickerDataType =
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'string'
  | 'boolean';

export interface FormatterPreset {
  /** Stable id used for dropdown equality + as the menu key. */
  id: string;
  /** Short label shown in the dropdown row. */
  label: string;
  /** Optional second-line hint (e.g. "101-16" sample output). */
  hint?: string;
  /** The template emitted when the user picks this preset. */
  template: ValueFormatterTemplate;
  /** Stable sample-value the live preview renders against. When
   *  omitted the picker uses its own default (`1234.5678`). */
  sampleValue?: unknown;
}

// ─── Number presets ─────────────────────────────────────────────────────────

const NUMBER_PRESETS: ReadonlyArray<FormatterPreset> = [
  {
    id: 'num-integer',
    label: 'Integer',
    hint: '1,235',
    template: { kind: 'excelFormat', format: '#,##0' },
  },
  {
    id: 'num-2dp',
    label: '2 decimals',
    hint: '1,234.57',
    template: { kind: 'excelFormat', format: '#,##0.00' },
  },
  {
    id: 'num-4dp',
    label: '4 decimals',
    hint: '1,234.5678',
    template: { kind: 'excelFormat', format: '#,##0.0000' },
  },
  {
    id: 'num-neg-parens',
    label: 'Parens negative',
    hint: '(1,234.57)',
    template: { kind: 'excelFormat', format: '#,##0.00;(#,##0.00)' },
  },
  {
    id: 'num-neg-red-parens',
    label: 'Red parens neg',
    hint: '[Red](1,234.57)',
    template: { kind: 'excelFormat', format: '#,##0.00;[Red](#,##0.00)' },
  },
  {
    // US desk convention — P&L columns display gains green, losses red,
    // and crucially the negative section has NO leading minus (Excel
    // honours the literal format in section 2; since `#,##0.00` has no
    // sign, -1,234.57 renders as `1,234.57` in red, not `-1,234.57`).
    // Green on positive + red on negative is the Bloomberg-style cue
    // traders read at a glance.
    id: 'num-green-red-nosign',
    label: 'Green / Red (no sign)',
    hint: '[Green]1,234.57 · [Red]1,234.57',
    template: {
      kind: 'excelFormat',
      format: '[Green]#,##0.00;[Red]#,##0.00',
    },
    sampleValue: -1234.5678,
  },
  {
    id: 'num-scientific',
    label: 'Scientific',
    hint: '1.23E+03',
    template: { kind: 'excelFormat', format: '0.00E+00' },
  },
  {
    id: 'num-bps',
    label: 'Basis points',
    hint: '+12.3 bps',
    template: { kind: 'expression', expression: "(x>=0?'+':'')+x.toFixed(1)+' bp'" },
    sampleValue: 12.345,
  },
  // Fixed-income tick formats
  {
    id: 'tick-32',
    label: '32nds (bond price)',
    hint: '101-16',
    template: { kind: 'tick', tick: 'TICK32' },
    sampleValue: 101.5,
  },
  {
    id: 'tick-32-plus',
    label: '32nds + halves',
    hint: '101-16+',
    template: { kind: 'tick', tick: 'TICK32_PLUS' },
    sampleValue: 101.515625,
  },
  {
    id: 'tick-64',
    label: '64ths',
    hint: '101-161',
    template: { kind: 'tick', tick: 'TICK64' },
    sampleValue: 101.515625,
  },
  {
    id: 'tick-128',
    label: '128ths',
    hint: '101-162',
    template: { kind: 'tick', tick: 'TICK128' },
    sampleValue: 101.515625,
  },
  {
    id: 'tick-256',
    label: '256ths',
    hint: '101-161',
    template: { kind: 'tick', tick: 'TICK256' },
    sampleValue: 101.50390625,
  },
];

// ─── Currency presets ───────────────────────────────────────────────────────

const CURRENCY_PRESETS: ReadonlyArray<FormatterPreset> = [
  {
    id: 'cur-usd',
    label: 'USD',
    hint: '$1,234.56',
    template: { kind: 'excelFormat', format: '$#,##0.00' },
  },
  {
    id: 'cur-usd-red-neg',
    label: 'USD red negative',
    hint: '[Red]-$1,234.56',
    template: { kind: 'excelFormat', format: '$#,##0.00;[Red]-$#,##0.00' },
  },
  {
    id: 'cur-usd-parens',
    label: 'USD parens neg',
    hint: '($1,234.56)',
    template: { kind: 'excelFormat', format: '$#,##0.00;($#,##0.00)' },
  },
  {
    id: 'cur-eur',
    label: 'EUR',
    hint: '€1,234.56',
    template: { kind: 'excelFormat', format: '€#,##0.00' },
  },
  {
    id: 'cur-gbp',
    label: 'GBP',
    hint: '£1,234.56',
    template: { kind: 'excelFormat', format: '£#,##0.00' },
  },
  {
    id: 'cur-jpy',
    label: 'JPY',
    hint: '¥1,235',
    template: { kind: 'excelFormat', format: '¥#,##0' },
  },
];

// ─── Percent presets ────────────────────────────────────────────────────────

const PERCENT_PRESETS: ReadonlyArray<FormatterPreset> = [
  {
    id: 'pct-0',
    label: 'Percent (0dp)',
    hint: '12%',
    template: { kind: 'excelFormat', format: '0%' },
    sampleValue: 0.1234,
  },
  {
    id: 'pct-2',
    label: 'Percent (2dp)',
    hint: '12.34%',
    template: { kind: 'excelFormat', format: '0.00%' },
    sampleValue: 0.1234,
  },
  {
    id: 'pct-bps',
    label: 'Basis points',
    hint: '+12.3 bps',
    template: { kind: 'expression', expression: "(x>=0?'+':'')+x.toFixed(1)+' bp'" },
    sampleValue: 12.345,
  },
];

// ─── Date/datetime presets ──────────────────────────────────────────────────

const DATE_PRESETS: ReadonlyArray<FormatterPreset> = [
  {
    id: 'date-iso',
    label: 'ISO (yyyy-mm-dd)',
    hint: '2026-04-17',
    template: { kind: 'excelFormat', format: 'yyyy-mm-dd' },
    sampleValue: new Date('2026-04-17T00:00:00Z'),
  },
  {
    id: 'date-us',
    label: 'US (mm/dd/yyyy)',
    hint: '04/17/2026',
    template: { kind: 'excelFormat', format: 'mm/dd/yyyy' },
    sampleValue: new Date('2026-04-17T00:00:00Z'),
  },
  {
    id: 'date-eu',
    label: 'EU (dd-mmm-yy)',
    hint: '17-Apr-26',
    template: { kind: 'excelFormat', format: 'dd-mmm-yy' },
    sampleValue: new Date('2026-04-17T00:00:00Z'),
  },
  {
    id: 'date-long',
    label: 'Long',
    hint: '17 April 2026',
    template: { kind: 'excelFormat', format: 'dd mmmm yyyy' },
    sampleValue: new Date('2026-04-17T00:00:00Z'),
  },
];

const DATETIME_PRESETS: ReadonlyArray<FormatterPreset> = [
  ...DATE_PRESETS,
  {
    id: 'dt-iso',
    label: 'ISO with time',
    hint: '2026-04-17 09:30:00',
    template: { kind: 'excelFormat', format: 'yyyy-mm-dd hh:mm:ss' },
    sampleValue: new Date('2026-04-17T09:30:00Z'),
  },
  {
    id: 'dt-us-short',
    label: 'US short',
    hint: '04/17/26 9:30 AM',
    template: { kind: 'excelFormat', format: 'mm/dd/yy h:mm AM/PM' },
    sampleValue: new Date('2026-04-17T09:30:00Z'),
  },
];

// ─── String / boolean ───────────────────────────────────────────────────────
//
// Strings and booleans rarely need numeric-style formatting. We expose a
// minimal set (uppercase / lowercase via excel "@") so the user has *some*
// option without flooding the dropdown.

const STRING_PRESETS: ReadonlyArray<FormatterPreset> = [
  {
    id: 'str-default',
    label: 'Default (pass-through)',
    hint: 'value as-is',
    template: { kind: 'excelFormat', format: '@' },
  },
  {
    id: 'str-suffix-units',
    label: 'Suffix: units',
    hint: '42 units',
    template: { kind: 'excelFormat', format: '@" units"' },
  },
];

const BOOLEAN_PRESETS: ReadonlyArray<FormatterPreset> = [
  {
    id: 'bool-yn',
    label: 'Y / N',
    hint: 'Y / N',
    template: { kind: 'expression', expression: "x?'Y':'N'" },
  },
  {
    id: 'bool-yes-no',
    label: 'Yes / No',
    hint: 'Yes / No',
    template: { kind: 'expression', expression: "x?'Yes':'No'" },
  },
  {
    id: 'bool-check',
    label: 'Check / —',
    hint: '✓ / —',
    template: { kind: 'expression', expression: "x?'✓':'—'" },
  },
];

// ─── Public entry ───────────────────────────────────────────────────────────

export function presetsForDataType(dataType: FormatterPickerDataType): ReadonlyArray<FormatterPreset> {
  switch (dataType) {
    case 'number':
      return NUMBER_PRESETS;
    case 'currency':
      return CURRENCY_PRESETS;
    case 'percent':
      return PERCENT_PRESETS;
    case 'date':
      return DATE_PRESETS;
    case 'datetime':
      return DATETIME_PRESETS;
    case 'string':
      return STRING_PRESETS;
    case 'boolean':
      return BOOLEAN_PRESETS;
    default:
      return [];
  }
}

/** Default "live preview" sample for each dataType when the host
 *  doesn't pass an explicit `sampleValue`. Picked to show off the
 *  format (e.g. negative with 4 decimals for numbers; a real date
 *  object for dates). */
export function defaultSampleValue(dataType: FormatterPickerDataType): unknown {
  switch (dataType) {
    case 'number':
    case 'currency':
      return 1234.5678;
    case 'percent':
      return 0.1234;
    case 'date':
    case 'datetime':
      return new Date('2026-04-17T09:30:00Z');
    case 'string':
      return 'sample';
    case 'boolean':
      return true;
    default:
      return 0;
  }
}

/**
 * Given a template, find the preset whose template matches (stable id).
 * Used by the dropdown to highlight the currently-applied preset when the
 * user re-opens it. Returns `undefined` if the template is a custom Excel
 * format that doesn't match any preset — in that case the picker's custom
 * input is the source of truth.
 */
export function findMatchingPreset(
  dataType: FormatterPickerDataType,
  template: ValueFormatterTemplate | undefined,
): FormatterPreset | undefined {
  if (!template) return undefined;
  const list = presetsForDataType(dataType);
  return list.find((p) => templatesEqual(p.template, template));
}

function templatesEqual(a: ValueFormatterTemplate, b: ValueFormatterTemplate): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'preset' && b.kind === 'preset') {
    return a.preset === b.preset && JSON.stringify(a.options ?? {}) === JSON.stringify(b.options ?? {});
  }
  if (a.kind === 'expression' && b.kind === 'expression') return a.expression === b.expression;
  if (a.kind === 'excelFormat' && b.kind === 'excelFormat') return a.format === b.format;
  if (a.kind === 'tick' && b.kind === 'tick') return a.tick === b.tick;
  return false;
}
