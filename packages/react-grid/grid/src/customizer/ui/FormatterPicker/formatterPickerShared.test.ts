import { describe, expect, it } from 'vitest';
import { Calendar, Hash } from 'lucide-react';
import {
  hintText,
  iconForDataType,
  toneColor,
  triggerCaption,
  triggerTitle,
} from './formatterPickerShared';
import {
  presetsForDataType,
  type FormatterPickerDataType,
  type FormatterPreset,
} from './presetsForDataType';

const ALL_TYPES: FormatterPickerDataType[] = [
  'number',
  'currency',
  'percent',
  'date',
  'datetime',
  'string',
  'boolean',
];

describe('hintText', () => {
  it('prefers the authored hint', () => {
    const p = { id: 'x', label: 'X', hint: 'authored' } as FormatterPreset;
    expect(hintText(p)).toBe('authored');
  });

  it('falls back to joined hintSamples when no hint', () => {
    const p = {
      id: 'x',
      label: 'X',
      hintSamples: [{ text: '1,234.57', tone: 'positive' }, { text: '1,234.57', tone: 'negative' }],
    } as FormatterPreset;
    expect(hintText(p)).toBe('1,234.57 / 1,234.57');
  });

  it('returns undefined when neither is present', () => {
    expect(hintText({ id: 'x', label: 'X' } as FormatterPreset)).toBeUndefined();
  });
});

describe('toneColor', () => {
  it('maps tones to the same tokens the grid Excel color map uses', () => {
    expect(toneColor('positive')).toBe('var(--ds-accent-positive)');
    expect(toneColor('negative')).toBe('var(--ds-accent-negative)');
    expect(toneColor('muted')).toBe('var(--ds-text-faint)');
    expect(toneColor(undefined)).toBe('var(--ds-text-faint)');
  });
});

describe('iconForDataType', () => {
  it('uses a type-specific glyph, not always Hash', () => {
    expect(iconForDataType('date')).toBe(Calendar);
    expect(iconForDataType('number')).toBe(Hash);
    expect(iconForDataType('date')).not.toBe(iconForDataType('number'));
  });
});

describe('triggerCaption', () => {
  it('shows a human word for a raw Excel format, not the token salad', () => {
    expect(triggerCaption({ kind: 'excelFormat', format: '#,##0.00;[Red](#,##0.00)' }, undefined)).toBe(
      'Custom',
    );
  });

  it('shows the preset label when one is active', () => {
    const preset = { id: 'num-2dp', label: '2 decimals' } as FormatterPreset;
    expect(triggerCaption({ kind: 'excelFormat', format: '#,##0.00' }, preset)).toBe('2 decimals');
  });

  it('falls back to "Format" when nothing is applied', () => {
    expect(triggerCaption(undefined, undefined)).toBe('Format');
  });
});

describe('triggerTitle', () => {
  it('exposes the raw format string in the tooltip', () => {
    expect(triggerTitle({ kind: 'excelFormat', format: '#,##0.00' }, undefined)).toBe(
      'Custom format: #,##0.00',
    );
  });
});

describe('preset catalog hygiene', () => {
  it('never leaks raw [Red]/[Green]/[Blue] color tokens into tile hints', () => {
    for (const type of ALL_TYPES) {
      for (const p of presetsForDataType(type)) {
        expect(p.hint ?? '', `${type}/${p.id} hint`).not.toMatch(/\[(Red|Green|Blue|Yellow)\]/i);
        for (const s of p.hintSamples ?? []) {
          expect(s.text, `${type}/${p.id} hintSample`).not.toMatch(/\[(Red|Green|Blue|Yellow)\]/i);
        }
      }
    }
  });

  it('every sign-colored preset carries colored hintSamples and is tier=advanced', () => {
    for (const type of ALL_TYPES) {
      for (const p of presetsForDataType(type)) {
        const isSignColored =
          p.template.kind === 'excelFormat' && /\[(Green|Red)\]/.test(p.template.format);
        if (isSignColored) {
          expect(p.hintSamples?.length, `${p.id} hintSamples`).toBeGreaterThan(0);
          expect(p.tier, `${p.id} tier`).toBe('advanced');
        }
      }
    }
  });

  it('exposes a non-empty common (non-advanced) set for every numeric type', () => {
    for (const type of ['number', 'currency', 'percent'] as FormatterPickerDataType[]) {
      const common = presetsForDataType(type).filter((p) => p.tier !== 'advanced');
      expect(common.length, `${type} common presets`).toBeGreaterThan(0);
    }
  });
});
