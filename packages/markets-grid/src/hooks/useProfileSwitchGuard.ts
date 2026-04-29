import { useCallback, useState } from 'react';
import type { UseProfileManagerResult } from '@marketsui/core';

/**
 * Profile-switch unsaved-changes guard. When the user picks a different
 * profile from the switcher AND there are unsaved edits, we stash the
 * target id and surface an AlertDialog offering Save / Discard / Cancel.
 *
 * With no dirty edits the switch goes through directly via
 * `requestLoadProfile`.
 *
 * The Save path routes through the consumer-supplied `handleSaveAll` so
 * AG-Grid native state (column widths / sort / filters / pagination) is
 * captured before the snapshot lands — otherwise a Save-then-Switch
 * would persist stale grid-state.
 *
 * Extracted verbatim from `MarketsGrid.Host` during Phase C-3.
 */
export interface ProfileSwitchGuardHandle {
  /** Currently-pending switch target, or null when idle. */
  readonly pendingSwitch: { id: string } | null;
  /** Request a profile switch. If dirty, pops the dialog; otherwise loads directly. */
  requestLoadProfile(id: string): void;
  /** Dialog handler: Save current, then switch to pending target. */
  confirmSwitchSave(): Promise<void>;
  /** Dialog handler: Discard current edits, then switch. */
  confirmSwitchDiscard(): Promise<void>;
  /** Dialog handler: Cancel the pending switch (close the dialog). */
  cancelSwitch(): void;
}

export function useProfileSwitchGuard(
  profiles: UseProfileManagerResult,
  handleSaveAll: () => Promise<void>,
): ProfileSwitchGuardHandle {
  const [pendingSwitch, setPendingSwitch] = useState<null | { id: string }>(null);

  const requestLoadProfile = useCallback(
    (id: string) => {
      if (id === profiles.activeProfileId) return;
      if (profiles.isDirty) {
        setPendingSwitch({ id });
        return;
      }
      void profiles.loadProfile(id);
    },
    [profiles],
  );

  const confirmSwitchSave = useCallback(async () => {
    if (!pendingSwitch) return;
    const targetId = pendingSwitch.id;
    setPendingSwitch(null);
    try {
      // Route through the same Save-button path so AG-Grid native state
      // (column widths / sort / filters / pagination) is captured before
      // the snapshot lands — otherwise a Save-then-Switch would persist
      // stale grid-state.
      await handleSaveAll();
      await profiles.loadProfile(targetId);
    } catch (err) {
      console.warn('[markets-grid] save-and-switch failed:', err);
    }
  }, [pendingSwitch, handleSaveAll, profiles]);

  const confirmSwitchDiscard = useCallback(async () => {
    if (!pendingSwitch) return;
    const targetId = pendingSwitch.id;
    setPendingSwitch(null);
    try {
      // Discard in-memory edits (reverts to the last-saved snapshot of
      // the outgoing profile) BEFORE loading the new one. The discard
      // is technically optional since load() also replaces state, but
      // it keeps semantics clean: dirty=false is observable in between.
      await profiles.discardActiveProfile();
      await profiles.loadProfile(targetId);
    } catch (err) {
      console.warn('[markets-grid] discard-and-switch failed:', err);
    }
  }, [pendingSwitch, profiles]);

  const cancelSwitch = useCallback(() => {
    setPendingSwitch(null);
  }, []);

  return {
    pendingSwitch,
    requestLoadProfile,
    confirmSwitchSave,
    confirmSwitchDiscard,
    cancelSwitch,
  };
}
