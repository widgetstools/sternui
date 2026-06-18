/**
 * Shared types + render helpers used by both the compact and inline
 * FormatterPicker presentations. Pulled out so the picker's two
 * presentation files (CompactFormatterPicker, InlineFormatterPicker)
 * can share a typed body-props contract without importing from each
 * other.
 */
import {
  Baseline,
  Calendar,
  CalendarClock,
  CircleDollarSign,
  Hash,
  Percent,
  ToggleLeft,
  Type,
  type LucideIcon,
} from 'lucide-react';
import {
  valueFormatterFromTemplate,
  type ValueFormatterTemplate,
} from '@starui/engine';
import type { FormatterPickerDataType, FormatterPreset } from './presetsForDataType';

/** Body-props contract shared by CompactFormatterPicker + InlineFormatterPicker.
 *  Holds the picker's derived state and committed callbacks. */
export interface SharedBodyProps {
  value: ValueFormatterTemplate | undefined;
  onChange: (template: ValueFormatterTemplate | undefined) => void;
  presets: ReadonlyArray<FormatterPreset>;
  activePreset: FormatterPreset | undefined;
  preview: string;
  draftExcel: string;
  setDraftExcel: (next: string) => void;
  isExcelValid: boolean;
  commitExcel: (format: string) => void;
  pickPreset: (preset: FormatterPreset) => void;
  dataType: FormatterPickerDataType;
  /** Re-categorize the picker (rescues a mis-inferred column without
   *  forcing the user into raw Excel syntax). Compact mode only — omit
   *  to hide the type selector. */
  onSelectType?: (next: FormatterPickerDataType) => void;
  testId?: string;
}

/** The data-type pills shown at the top of the compact popover. Order
 *  is everyday-first. Labels are friendlier than the raw enum keys. */
export const SELECTABLE_TYPES: ReadonlyArray<{
  type: FormatterPickerDataType;
  label: string;
}> = [
  { type: 'number', label: 'Number' },
  { type: 'currency', label: 'Currency' },
  { type: 'percent', label: 'Percent' },
  { type: 'date', label: 'Date' },
  { type: 'datetime', label: 'Date + time' },
  { type: 'string', label: 'Text' },
  { type: 'boolean', label: 'Boolean' },
];

/** Type-aware trigger icon. The chip used to always show a `#` (Hash),
 *  which mis-reads as "number" on a date / text / boolean column.
 *  Match the glyph to the data type so the trigger says what it formats. */
export function iconForDataType(dataType: FormatterPickerDataType): LucideIcon {
  switch (dataType) {
    case 'currency':
      return CircleDollarSign;
    case 'percent':
      return Percent;
    case 'date':
      return Calendar;
    case 'datetime':
      return CalendarClock;
    case 'string':
      return Type;
    case 'boolean':
      return ToggleLeft;
    case 'number':
      return Hash;
    default:
      return Baseline;
  }
}

/** Plain-text hint for a preset — used where colored `hintSamples`
 *  can't render (e.g. the inline dropdown's single-line label). Prefers
 *  the authored `hint`; falls back to the joined sample texts. */
export function hintText(preset: FormatterPreset): string | undefined {
  if (preset.hint) return preset.hint;
  if (preset.hintSamples?.length) {
    return preset.hintSamples.map((s) => s.text).join(' / ');
  }
  return undefined;
}

/** Map a `hintSamples` tone to the SAME design-system token the grid's
 *  Excel color map uses (`positive` → `[Green]`, `negative` → `[Red]`),
 *  so the swatch color is truthful to what the cell will render. */
export function toneColor(tone: 'positive' | 'negative' | 'muted' | undefined): string {
  switch (tone) {
    case 'positive':
      return 'var(--ds-accent-positive)';
    case 'negative':
      return 'var(--ds-accent-negative)';
    default:
      return 'var(--ds-text-faint)';
  }
}

/** Tooltip for the trigger chip. Shows the human caption plus, for a
 *  raw Excel format with no matching preset, the underlying format
 *  string (which the caption no longer spells out). */
export function triggerTitle(
  template: ValueFormatterTemplate | undefined,
  activePreset: FormatterPreset | undefined,
): string {
  if (!template) return 'Value formatter — none applied';
  if (activePreset) return `Value format: ${activePreset.label}`;
  if (template.kind === 'excelFormat') return `Custom format: ${template.format}`;
  if (template.kind === 'expression') return 'Custom expression';
  return 'Value formatter';
}

/** Safely render a formatter against a sample value. Swallows all errors
 *  — the preview chip is a help hint, not the source of truth. */
export function renderPreview(
  template: ValueFormatterTemplate | undefined,
  sample: unknown,
): string {
  if (!template) return '';
  try {
    const fn = valueFormatterFromTemplate(template);
    return fn({ value: sample, data: {} });
  } catch {
    return '';
  }
}

/** Short caption for the compact trigger chip and the inline collapsed
 *  trigger. Prefer the active preset's label; otherwise show a human
 *  word ("Custom") rather than a truncated Excel format string — the
 *  raw `#,##0.00;[Red]…` token salad meant nothing to non-Excel users.
 *  The full format string lives in the trigger tooltip (`triggerTitle`). */
export function triggerCaption(
  template: ValueFormatterTemplate | undefined,
  activePreset: FormatterPreset | undefined,
): string {
  if (!template) return 'Format';
  if (activePreset) return activePreset.label;
  switch (template.kind) {
    case 'preset':
      return template.preset;
    case 'excelFormat':
      return 'Custom';
    case 'expression':
      return 'Custom expression';
    case 'tick':
      return template.tick.replace('TICK', '').replace('_PLUS', '+').toLowerCase();
  }
}
