import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { IDataProvider } from '@starui/host-data';
import { usePauseCoordinator } from './usePauseCoordinator';

/** Minimal IDataProvider whose pause/resume/isPaused track a real flag. */
function makeProvider() {
  let paused = false;
  return {
    pause: vi.fn(() => { paused = true; }),
    resume: vi.fn(() => { paused = false; }),
    isPaused: vi.fn(() => paused),
  } as unknown as IDataProvider & {
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };
}

describe('usePauseCoordinator', () => {
  it('pauses on the first reason and resumes only when all reasons clear', () => {
    const provider = makeProvider();
    const { result } = renderHook(() => usePauseCoordinator(provider));

    act(() => result.current.setReason('customizer', true));
    expect(provider.pause).toHaveBeenCalledTimes(1);
    expect(result.current.paused).toBe(true);

    // A second reason while already paused doesn't pause again.
    act(() => result.current.setReason('manual', true));
    expect(provider.pause).toHaveBeenCalledTimes(1);

    // Clearing one reason while another is active must NOT resume.
    act(() => result.current.setReason('customizer', false));
    expect(provider.resume).not.toHaveBeenCalled();
    expect(result.current.paused).toBe(true);

    // Clearing the last reason resumes.
    act(() => result.current.setReason('manual', false));
    expect(provider.resume).toHaveBeenCalledTimes(1);
    expect(result.current.paused).toBe(false);
  });

  it('toggleManual flips the manual reason', () => {
    const provider = makeProvider();
    const { result } = renderHook(() => usePauseCoordinator(provider));

    act(() => result.current.toggleManual());
    expect(result.current.paused).toBe(true);
    act(() => result.current.toggleManual());
    expect(result.current.paused).toBe(false);
  });

  it('is inert with no provider but still tracks paused state', () => {
    const { result } = renderHook(() => usePauseCoordinator(null));
    act(() => result.current.setReason('manual', true));
    expect(result.current.paused).toBe(true);
  });
});
