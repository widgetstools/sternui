/**
 * Coordinates realtime-update pausing for a grid's data provider across
 * multiple, independent reasons (the customizer drawer being open, a manual
 * user toggle). The provider stays paused while *any* reason is active and
 * resumes only when all are cleared — so closing the customizer doesn't resume
 * a stream the user manually paused, and vice-versa.
 *
 * Delegates the actual transport control to {@link IDataProvider.pause} /
 * `resume` (a hub-level, per-subscriber pause). Re-asserts the desired state
 * when the active provider changes (a switched provider is a fresh adapter).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { IDataProvider } from '@starui/host-data';

export type PauseReason = 'customizer' | 'manual';

export interface PauseCoordinator {
  /** True while at least one pause reason is active. */
  readonly paused: boolean;
  /** Add or remove a pause reason; applies pause/resume as the set changes. */
  setReason: (reason: PauseReason, active: boolean) => void;
  /** Flip the manual pause reason (for a user-facing toggle). */
  toggleManual: () => void;
}

export function usePauseCoordinator(provider: IDataProvider | null): PauseCoordinator {
  const reasons = useRef<Set<PauseReason>>(new Set());
  const [paused, setPaused] = useState(false);
  const providerRef = useRef(provider);
  providerRef.current = provider;

  const apply = useCallback(() => {
    const shouldPause = reasons.current.size > 0;
    const p = providerRef.current;
    if (p) {
      if (shouldPause && !p.isPaused()) p.pause();
      else if (!shouldPause && p.isPaused()) p.resume();
    }
    setPaused(shouldPause);
  }, []);

  const setReason = useCallback((reason: PauseReason, active: boolean) => {
    if (active) reasons.current.add(reason);
    else reasons.current.delete(reason);
    apply();
  }, [apply]);

  const toggleManual = useCallback(() => {
    setReason('manual', !reasons.current.has('manual'));
  }, [setReason]);

  // A switched provider is a brand-new adapter that doesn't know the prior
  // reasons — re-assert the desired pause state onto it.
  useEffect(() => { apply(); }, [provider, apply]);

  return { paused, setReason, toggleManual };
}
