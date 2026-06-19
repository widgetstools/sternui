import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePauseCoordinator } from './usePauseCoordinator';

describe('usePauseCoordinator', () => {
  it('is paused while any reason is active and resumes only when all clear', () => {
    const { result } = renderHook(() => usePauseCoordinator());
    expect(result.current.paused).toBe(false);

    act(() => result.current.setReason('customizer', true));
    expect(result.current.paused).toBe(true);

    // A second reason while already paused keeps it paused.
    act(() => result.current.setReason('manual', true));
    expect(result.current.paused).toBe(true);

    // Clearing one reason while another is active must NOT resume.
    act(() => result.current.setReason('customizer', false));
    expect(result.current.paused).toBe(true);

    // Clearing the last reason resumes.
    act(() => result.current.setReason('manual', false));
    expect(result.current.paused).toBe(false);
  });

  it('toggleManual flips the manual reason', () => {
    const { result } = renderHook(() => usePauseCoordinator());

    act(() => result.current.toggleManual());
    expect(result.current.paused).toBe(true);
    act(() => result.current.toggleManual());
    expect(result.current.paused).toBe(false);
  });

  it('clearing an inactive reason is a no-op', () => {
    const { result } = renderHook(() => usePauseCoordinator());
    act(() => result.current.setReason('manual', false));
    expect(result.current.paused).toBe(false);
  });
});
