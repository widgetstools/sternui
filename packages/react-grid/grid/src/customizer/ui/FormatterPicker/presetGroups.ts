/**
 * Preset-group derivation for the FormatterPicker's compact-mode tile grid.
 *
 * The compact popover renders presets bucketed by category (Number,
 * Decimals, Negatives, …). The preset catalog in `presetsForDataType.ts`
 * isn't explicitly tagged with a category, so we derive one from the
 * preset id. Pulled out of FormatterPicker.tsx so the picker JSX can
 * stay focused on layout.
 */
import type { FormatterPreset } from './presetsForDataType';

/** Category labels for the popover's preset tile grid. Covers every
 *  `group` key returned by `groupKeyForPreset`. */
export const GROUP_LABELS: Record<string, string> = {
  number: 'Number',
  decimals: 'Decimals',
  negatives: 'Negatives',
  scientific: 'Scientific',
  bps: 'Basis points',
  tick: 'Fixed-income tick',
  currency: 'Currency',
  percent: 'Percent',
  date: 'Date',
  datetime: 'Date + time',
  string: 'String',
  boolean: 'Boolean',
};

/**
 * Derive a category key for a preset from its id. The preset catalog
 * isn't explicitly tagged, so group by id-prefix:
 *   num-*        → 'number' / 'decimals' / 'negatives' / 'scientific' / 'bps'
 *   tick-*       → 'tick'
 *   cur-*        → 'currency'
 *   pct-*        → 'percent'
 *   date-/dt-*   → 'date' / 'datetime'
 *   str-*        → 'string'
 *   bool-*       → 'boolean'
 *
 * Groupings within 'number' are refined so the popover can show
 * related presets together (e.g. all the green/red variants under
 * 'Negatives' rather than scattered through 'Number').
 */
export function groupKeyForPreset(p: FormatterPreset): string {
  const id = p.id;
  if (id.startsWith('tick-')) return 'tick';
  if (id.startsWith('cur-')) return 'currency';
  if (id.startsWith('pct-')) return 'percent';
  if (id.startsWith('date-')) return 'date';
  if (id.startsWith('dt-')) return 'datetime';
  if (id.startsWith('str-')) return 'string';
  if (id.startsWith('bool-')) return 'boolean';
  if (id.startsWith('num-')) {
    if (/neg|green-red/.test(id)) return 'negatives';
    if (/scientific/.test(id)) return 'scientific';
    if (/bps/.test(id)) return 'bps';
    return /\d/.test(id) || /integer/.test(id) ? 'decimals' : 'number';
  }
  return 'number';
}
