import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  valueFormatterFromTemplate,
  __resetExpressionCacheForTests,
} from './valueFormatterFromTemplate';
import type { ValueFormatterTemplate } from '../state';

const params = (value: unknown, data: unknown = undefined) => ({ value, data });

describe('valueFormatterFromTemplate — preset branch', () => {
  it('currency: defaults to USD with 2 decimals', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'currency' });
    expect(fn(params(1234.5))).toBe('$1,234.50');
  });

  it('currency: honors options.currency and options.decimals', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'currency',
      options: { currency: 'EUR', decimals: 0 },
    });
    expect(fn(params(1234.5))).toBe('€1,235');
  });

  it('percent: defaults to 0 decimals; treats value as a fraction (0.5 → 50%)', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'percent' });
    expect(fn(params(0.5))).toBe('50%');
  });

  it('percent: honors options.decimals', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'percent',
      options: { decimals: 2 },
    });
    expect(fn(params(0.1234))).toBe('12.34%');
  });

  it('number: groups thousands by default with 0 decimals', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'number' });
    expect(fn(params(1234567))).toBe('1,234,567');
  });

  it('number: honors options.decimals and options.thousands=false', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'number',
      options: { decimals: 2, thousands: false },
    });
    expect(fn(params(1234567.5))).toBe('1234567.50');
  });

  it('date: formats epoch ms with ISO-ish default pattern', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'date' });
    const epoch = Date.UTC(2026, 0, 15);
    expect(fn(params(epoch))).toMatch(/2026-01-15/);
  });

  it('duration: formats a numeric ms value as mm:ss (under one hour)', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'duration' });
    expect(fn(params(125_000))).toBe('02:05');
    expect(fn(params(3_725_000))).toBe('01:02:05');
  });

  it('any preset: null/undefined value returns empty string', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'currency' });
    expect(fn(params(null))).toBe('');
    expect(fn(params(undefined))).toBe('');
  });

  it('numeric presets: non-numeric strings return "" (no "NaN" leak)', () => {
    // The file-level contract promises we never render "NaN". Number("abc") is
    // NaN, so the guard must reject it explicitly before handing to Intl.
    const cur = valueFormatterFromTemplate({ kind: 'preset', preset: 'currency' });
    const pct = valueFormatterFromTemplate({ kind: 'preset', preset: 'percent' });
    const num = valueFormatterFromTemplate({ kind: 'preset', preset: 'number' });
    expect(cur(params('abc'))).toBe('');
    expect(pct(params('abc'))).toBe('');
    expect(num(params('abc'))).toBe('');
  });
});

describe('valueFormatterFromTemplate — expression branch', () => {
  afterEach(() => __resetExpressionCacheForTests());

  it('compiles + executes a simple expression', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'expression',
      expression: "x + ' (raw)'",
    });
    expect(fn(params('foo'))).toBe('foo (raw)');
  });

  it('caches compiled fn per expression string (same object across calls)', () => {
    const t: ValueFormatterTemplate = { kind: 'expression', expression: 'x * 2' };
    const a = valueFormatterFromTemplate(t);
    const b = valueFormatterFromTemplate(t);
    expect(a).toBe(b);
  });

  it('different expression strings produce different fns', () => {
    const a = valueFormatterFromTemplate({ kind: 'expression', expression: 'x * 2' });
    const b = valueFormatterFromTemplate({ kind: 'expression', expression: 'x * 3' });
    expect(a).not.toBe(b);
    expect(a(params(5))).toBe('10');
    expect(b(params(5))).toBe('15');
  });

  it('exposes `data` to the expression', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'expression',
      expression: "data.symbol + ': ' + x",
    });
    expect(fn(params(100, { symbol: 'AAPL' }))).toBe('AAPL: 100');
  });

  it('invalid expression: warns + returns identity formatter (never throws)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = valueFormatterFromTemplate({
      kind: 'expression',
      expression: '))) not a valid js expression',
    });
    expect(() => fn(params(42))).not.toThrow();
    expect(fn(params(42))).toBe('42');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('runtime exception inside expression: returns String(value), does not throw', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'expression',
      expression: 'data.deeply.nested.thing',
    });
    expect(() => fn(params(42, undefined))).not.toThrow();
    expect(fn(params(42, undefined))).toBe('42');
  });
});
