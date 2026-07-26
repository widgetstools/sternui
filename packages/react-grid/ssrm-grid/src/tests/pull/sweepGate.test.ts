import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SWEEP_THROTTLE_WIDE_MS,
  DEFAULT_WIDE_COLUMN_THRESHOLD,
  NARROW_SWEEP_MAX_BLOCKS,
  resolveSweepGate,
  WIDE_SWEEP_MAX_BLOCKS,
} from '../../pull/sweepGate.js';

const CONFIG = {
  tickRefreshMs: 250,
  wideColumnThreshold: 80,
  sweepThrottleWideMs: 1000,
};

describe('resolveSweepGate', () => {
  it('narrow books keep the base throttle with the narrow MRU budget', () => {
    expect(resolveSweepGate(40, CONFIG)).toEqual({
      wide: false,
      throttleMs: 250,
      maxSweepBlocks: NARROW_SWEEP_MAX_BLOCKS,
    });
  });

  it('wide books degrade: longer throttle, tighter MRU budget', () => {
    expect(resolveSweepGate(120, CONFIG)).toEqual({
      wide: true,
      throttleMs: 1000,
      maxSweepBlocks: WIDE_SWEEP_MAX_BLOCKS,
    });
  });

  it('the threshold is inclusive (at the boundary = wide)', () => {
    expect(resolveSweepGate(80, CONFIG).wide).toBe(true);
    expect(resolveSweepGate(79, CONFIG).wide).toBe(false);
  });

  it('unknown width (nothing read yet) stays on the narrow path', () => {
    expect(resolveSweepGate(null, CONFIG)).toEqual({
      wide: false,
      throttleMs: 250,
      maxSweepBlocks: NARROW_SWEEP_MAX_BLOCKS,
    });
  });

  it('the degraded throttle never undercuts the base throttle', () => {
    const decision = resolveSweepGate(200, { ...CONFIG, sweepThrottleWideMs: 50 });
    expect(decision.throttleMs).toBe(250); // clamped up to tickRefreshMs
  });

  it('ships sane defaults (every width is MRU-gated; narrow ≥ wide budget)', () => {
    expect(DEFAULT_WIDE_COLUMN_THRESHOLD).toBe(80);
    expect(DEFAULT_SWEEP_THROTTLE_WIDE_MS).toBe(1000);
    expect(WIDE_SWEEP_MAX_BLOCKS).toBeGreaterThan(0);
    expect(NARROW_SWEEP_MAX_BLOCKS).toBeGreaterThanOrEqual(WIDE_SWEEP_MAX_BLOCKS);
  });
});
