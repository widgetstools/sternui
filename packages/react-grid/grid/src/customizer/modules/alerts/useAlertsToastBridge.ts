/**
 * Subscribes to the alerts module state and pushes each fresh notification
 * through `@starui/ui`'s `toast()` when its rule asked for the `'toast'`
 * channel and `settings.enabledChannels.toast` is on.
 *
 * The bridge diffs `state.history` against a per-mount `seenIds` set so a
 * remount (e.g. profile switch) doesn't replay older notifications. New
 * notifications always sit at index 0 of the history array (dispatcher
 * prepends), so we walk from the start and stop at the first already-seen id.
 */

import { useEffect, useRef } from 'react';
import { toast } from '@starui/ui';
import type {
  AlertNotification,
  AlertsState,
  AlertSeverity,
  PlatformHandle,
} from '@starui/engine';

const SEVERITY_TO_VARIANT: Record<AlertSeverity, 'default' | 'destructive'> = {
  info: 'default',
  success: 'default',
  warning: 'default',
  critical: 'destructive',
};

export function useAlertsToastBridge(
  platform: PlatformHandle<AlertsState> | null,
): void {
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!platform) return;
    const seen = seenIdsRef.current;
    for (const n of platform.getState().history) seen.add(n.id);

    return platform.subscribe((state) => {
      const fresh: AlertNotification[] = [];
      for (const n of state.history) {
        if (seen.has(n.id)) break;
        fresh.push(n);
      }
      if (fresh.length === 0) return;

      const settings = state.settings;
      const channelOn = settings.enabled && settings.enabledChannels.toast;

      for (let i = fresh.length - 1; i >= 0; i -= 1) {
        const n = fresh[i];
        seen.add(n.id);
        if (!channelOn) continue;
        toast({
          title: n.ruleName,
          description: n.message,
          variant: SEVERITY_TO_VARIANT[n.severity],
        });
      }
    });
  }, [platform]);
}
