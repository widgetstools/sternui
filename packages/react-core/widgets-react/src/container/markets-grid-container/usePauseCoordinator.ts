/**
 * Coordinates realtime-update pausing for a grid across multiple, independent
 * reasons (the customizer drawer being open, a manual user toggle). The grid
 * stays paused while *any* reason is active and resumes only when all are
 * cleared — so closing the customizer doesn't resume a stream the user manually
 * paused, and vice-versa.
 *
 * This is a pure reason-set → boolean: it owns no transport. The consumer-side
 * apply-gate in {@link useProviderDataWiring} reads `paused` and simply stops
 * applying live ticks to the grid while paused (the heavy `applyTransactionAsync`
 * + filter/sort re-run is what starves the UI thread); on resume it calls
 * `provider.refresh()` so the grid catches up in one `rowData` reset — reusing
 * the same path as the `document.hidden` visibility gate.
 */
import { useCallback, useRef, useState } from 'react';

export type PauseReason = 'customizer' | 'manual';

export interface PauseCoordinator {
  /** True while at least one pause reason is active. */
  readonly paused: boolean;
  /** Add or remove a pause reason. */
  setReason: (reason: PauseReason, active: boolean) => void;
  /** Flip the manual pause reason (for a user-facing toggle). */
  toggleManual: () => void;
}

export function usePauseCoordinator(): PauseCoordinator {
  const reasons = useRef<Set<PauseReason>>(new Set());
  const [paused, setPaused] = useState(false);

  const setReason = useCallback((reason: PauseReason, active: boolean) => {
    if (active) reasons.current.add(reason);
    else reasons.current.delete(reason);
    setPaused(reasons.current.size > 0);
  }, []);

  const toggleManual = useCallback(() => {
    setReason('manual', !reasons.current.has('manual'));
  }, [setReason]);

  return { paused, setReason, toggleManual };
}
