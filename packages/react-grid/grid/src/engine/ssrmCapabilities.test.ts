import { describe, expect, it } from 'vitest';
import {
  CURRENT_SSRM_PHASE,
  isSsrmCapabilityEnabled,
} from './ssrmCapabilities.js';

describe('isSsrmCapabilityEnabled', () => {
  it('phase 0 enables presentation and excelFormat only', () => {
    expect(isSsrmCapabilityEnabled('presentation', 0)).toBe(true);
    expect(isSsrmCapabilityEnabled('excelFormat', 0)).toBe(true);
    expect(isSsrmCapabilityEnabled('liveTicks', 0)).toBe(false);
    expect(isSsrmCapabilityEnabled('calcColumns', 0)).toBe(false);
  });

  it('phase 1 enables blotter core + oldNewDiff', () => {
    expect(isSsrmCapabilityEnabled('liveTicks', 1)).toBe(true);
    expect(isSsrmCapabilityEnabled('grouping', 1)).toBe(true);
    expect(isSsrmCapabilityEnabled('oldNewDiff', 1)).toBe(true);
    expect(isSsrmCapabilityEnabled('trafficLightAgg', 1)).toBe(false);
    expect(isSsrmCapabilityEnabled('alerts', 1)).toBe(false);
  });

  it('CURRENT_SSRM_PHASE enables phase-1 capabilities by default', () => {
    expect(CURRENT_SSRM_PHASE).toBe(1);
    expect(isSsrmCapabilityEnabled('oldNewDiff')).toBe(true);
    expect(isSsrmCapabilityEnabled('liveTicks')).toBe(true);
    expect(isSsrmCapabilityEnabled('calcColumns')).toBe(false);
    expect(isSsrmCapabilityEnabled('alerts')).toBe(false);
  });
});
