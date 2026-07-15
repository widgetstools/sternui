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

  it('phase 2 enables calc columns and traffic light; not phase-3 caps', () => {
    expect(isSsrmCapabilityEnabled('calcColumns', 2)).toBe(true);
    expect(isSsrmCapabilityEnabled('customJsAgg', 2)).toBe(true);
    expect(isSsrmCapabilityEnabled('trafficLightAgg', 2)).toBe(true);
    expect(isSsrmCapabilityEnabled('alerts', 2)).toBe(false);
    expect(isSsrmCapabilityEnabled('smartEdit', 2)).toBe(false);
    expect(isSsrmCapabilityEnabled('externalFilter', 2)).toBe(false);
  });

  it('phase 3 enables alerts, smart-edit, and context-link', () => {
    expect(isSsrmCapabilityEnabled('alerts', 3)).toBe(true);
    expect(isSsrmCapabilityEnabled('smartEdit', 3)).toBe(true);
    expect(isSsrmCapabilityEnabled('externalFilter', 3)).toBe(true);
  });

  it('CURRENT_SSRM_PHASE enables through phase 3 by default', () => {
    expect(CURRENT_SSRM_PHASE).toBe(3);
    expect(isSsrmCapabilityEnabled('calcColumns')).toBe(true);
    expect(isSsrmCapabilityEnabled('trafficLightAgg')).toBe(true);
    expect(isSsrmCapabilityEnabled('oldNewDiff')).toBe(true);
    expect(isSsrmCapabilityEnabled('liveTicks')).toBe(true);
    expect(isSsrmCapabilityEnabled('alerts')).toBe(true);
    expect(isSsrmCapabilityEnabled('smartEdit')).toBe(true);
    expect(isSsrmCapabilityEnabled('externalFilter')).toBe(true);
  });
});
