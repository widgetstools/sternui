import { describe, expect, it } from 'vitest';
import { tickFormatter, TICK_LABELS, TICK_SAMPLES } from './tickFormatter';

describe('tickFormatter - TICK32 (nearest 32nd)', () => {
  const fmt = tickFormatter('TICK32');

  it('renders handle-ticks with 2-digit pad', () => {
    expect(fmt(101)).toBe('101-00');
    expect(fmt(101.5)).toBe('101-16');
    expect(fmt(101.53125)).toBe('101-17'); // 17/32
  });

  it('rounds to nearest integer 32nd', () => {
    // 0.515625 → 16.5 ticks → rounds to 17
    expect(fmt(99.515625)).toBe('99-17');
    // 0.5078125 → 16.25 ticks → rounds down to 16
    expect(fmt(99.5078125)).toBe('99-16');
  });

  it('carries to next handle when ticks round to 32', () => {
    // 100 + 31.5/32 = 100.984375 → 31.5 rounds to 32 → carry
    expect(fmt(100.984375)).toBe('101-00');
  });

  it('prefixes a single minus for negatives (no parens)', () => {
    expect(fmt(-101.5)).toBe('-101-16');
    expect(fmt(-101)).toBe('-101-00');
  });

  it('empty-renders non-finite input', () => {
    expect(fmt(null)).toBe('');
    expect(fmt(undefined)).toBe('');
    expect(fmt(NaN)).toBe('');
    expect(fmt('hello')).toBe(''); // non-numeric strings → empty
    expect(fmt('')).toBe('');
  });
});

describe('tickFormatter - TICK32_PLUS (half-32nd precision)', () => {
  const fmt = tickFormatter('TICK32_PLUS');

  it('omits + when aligned with a whole 32nd', () => {
    expect(fmt(101.5)).toBe('101-16');
    expect(fmt(101.53125)).toBe('101-17');
  });

  it('appends + for half-ticks', () => {
    // +0.015625 = 0.5/32 above 16
    expect(fmt(101.515625)).toBe('101-16+');
    expect(fmt(101.546875)).toBe('101-17+');
  });
});

describe('tickFormatter - TICK64 (half-tick / 64th precision)', () => {
  const fmt = tickFormatter('TICK64');

  it('appends digit 0 or 1 for whole vs half tick', () => {
    expect(fmt(101.5)).toBe('101-160'); // 0/2 (whole)
    // 101 + 16.5/32 = 101.515625 → nearest half-tick is 16.5 → 1
    expect(fmt(101.515625)).toBe('101-161');
    // 101 + 17.0/32 = 101.53125 → nearest half-tick is 17.0 → carry, ticks=17, digit=0
    expect(fmt(101.53125)).toBe('101-170');
  });
});

describe('tickFormatter - TICK128 (quarter-tick / 128th precision)', () => {
  const fmt = tickFormatter('TICK128');

  it('appends quarter-tick digit 0..3', () => {
    expect(fmt(101.5)).toBe('101-160'); // 0/4
    // 0.0078125 = 1/128 = 1/4 tick
    expect(fmt(101.5078125)).toBe('101-161');
    // 0.015625 = 2/128 = 1/2 tick
    expect(fmt(101.515625)).toBe('101-162');
    // 0.0234375 = 3/128 = 3/4 tick
    expect(fmt(101.5234375)).toBe('101-163');
  });
});

describe('tickFormatter - TICK256 (eighth-tick / 256th precision)', () => {
  const fmt = tickFormatter('TICK256');

  it('appends eighth-tick digit 0..7', () => {
    expect(fmt(101.5)).toBe('101-160'); // 0/8
    // 0.00390625 = 1/256 = 1/8 tick
    expect(fmt(101.50390625)).toBe('101-161');
    // 0.01171875 = 3/256 = 3/8 tick
    expect(fmt(101.51171875)).toBe('101-163');
    // 7/256 above the 32nd boundary
    expect(fmt(101.5 + 7 / 256)).toBe('101-167');
  });
});

describe('tickFormatter constants', () => {
  it('TICK_LABELS covers every token', () => {
    expect(TICK_LABELS.TICK32).toMatch(/32/);
    expect(TICK_LABELS.TICK32_PLUS).toMatch(/\+/);
    expect(TICK_LABELS.TICK64).toMatch(/64/);
    expect(TICK_LABELS.TICK128).toMatch(/128/);
    expect(TICK_LABELS.TICK256).toMatch(/256/);
  });

  it('TICK_SAMPLES renders a non-empty string per token', () => {
    expect(TICK_SAMPLES.TICK32).toMatch(/^\d+-\d{2}$/);
    expect(TICK_SAMPLES.TICK32_PLUS).toMatch(/^\d+-\d{2}\+?$/);
    expect(TICK_SAMPLES.TICK64).toMatch(/^\d+-\d{2}\d$/);
  });
});
