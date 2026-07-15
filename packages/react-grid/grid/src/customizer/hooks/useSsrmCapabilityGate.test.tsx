import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GridPlatform } from '@starui/engine';
import { GridProvider } from './GridProvider';
import { useSsrmCapabilityGate } from './useSsrmCapabilityGate';
import { ssrmCapabilityTooltip } from '../../engine/ssrmCapabilities.js';

function makePlatform() {
  return new GridPlatform({ gridId: 'test-grid', modules: [] });
}

describe('useSsrmCapabilityGate', () => {
  it('allows all capabilities on CSRM', () => {
    const platform = makePlatform();
    const { result } = renderHook(() => useSsrmCapabilityGate('calcColumns'), {
      wrapper: ({ children }) => (
        <GridProvider platform={platform} engineKind="csrm">
          {children}
        </GridProvider>
      ),
    });
    expect(result.current.enabled).toBe(true);
    expect(result.current.tooltip).toBeUndefined();
  });

  it('blocks calcColumns on SSRM at phase 0 with tooltip', () => {
    const platform = makePlatform();
    const { result } = renderHook(() => useSsrmCapabilityGate('calcColumns'), {
      wrapper: ({ children }) => (
        <GridProvider platform={platform} engineKind="ssrm">
          {children}
        </GridProvider>
      ),
    });
    expect(result.current.enabled).toBe(false);
    expect(result.current.tooltip).toBe(ssrmCapabilityTooltip('calcColumns'));
  });
});
