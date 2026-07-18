import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import { GridProvider } from './GridProvider';
import { useSsrmCapabilityGate } from './useSsrmCapabilityGate';

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

  it('allows calcColumns on SSRM at current phase', () => {
    const platform = makePlatform();
    const { result } = renderHook(() => useSsrmCapabilityGate('calcColumns'), {
      wrapper: ({ children }) => (
        <GridProvider platform={platform} engineKind="ssrm">
          {children}
        </GridProvider>
      ),
    });
    expect(result.current.enabled).toBe(true);
    expect(result.current.tooltip).toBeUndefined();
  });

  it('allows oldNewDiff on SSRM at current phase', () => {
    const platform = makePlatform();
    const { result } = renderHook(() => useSsrmCapabilityGate('oldNewDiff'), {
      wrapper: ({ children }) => (
        <GridProvider platform={platform} engineKind="ssrm">
          {children}
        </GridProvider>
      ),
    });
    expect(result.current.enabled).toBe(true);
    expect(result.current.tooltip).toBeUndefined();
  });
});
