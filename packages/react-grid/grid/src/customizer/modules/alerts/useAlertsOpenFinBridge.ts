/**
 * OpenFin notification bridge for the alerts module.
 *
 * Mount this hook once per MarketsGrid instance (the grid does it automatically
 * via the alerts widget tree). The hook is a no-op in plain-browser apps:
 *
 *   - On first render we runtime-check `typeof window !== 'undefined' &&
 *     typeof (window as any).fin !== 'undefined'`. If `fin` is absent, the hook
 *     returns immediately and never imports the OpenFin notifications package.
 *   - When `fin` IS present, we dynamic-import `@openfin/workspace/notifications`
 *     so the dependency is only loaded for OpenFin-hosted apps. The import is
 *     wrapped in try/catch so the bridge degrades silently if the package isn't
 *     installed.
 *
 * Provider registration is one-shot per page (we attempt to register on first
 * `fin` detection). The notification source uses the OpenFin app's
 * `fin.me.identity.uuid` automatically.
 *
 * Channel gating happens upstream in `dispatch.ts` — by the time a notification
 * lands in `state.history`, the user has already opted in via `rule.channels`
 * and `settings.enabledChannels.openfin`.
 */

import { useEffect, useRef } from 'react';
import type {
  AlertNotification,
  AlertsState,
  AlertSeverity,
  GridPlatform,
} from '@starui/engine';

const MODULE_ID = 'alerts';

interface FinGlobal {
  me?: { identity?: { uuid?: string } };
}

interface OpenFinNotificationsApi {
  register?: () => Promise<unknown>;
  create: (options: Record<string, unknown>) => Promise<unknown>;
}

const SEVERITY_TO_CATEGORY: Record<AlertSeverity, string> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  critical: 'critical',
};

function getFin(): FinGlobal | null {
  if (typeof window === 'undefined') return null;
  const fin = (window as unknown as { fin?: FinGlobal }).fin;
  return fin && typeof fin === 'object' ? fin : null;
}

async function loadNotificationsApi(): Promise<OpenFinNotificationsApi | null> {
  try {
    // Dynamic + string-literal-only import; bundlers leave this as a
    // runtime call so the package isn't required at build time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional peer dependency; absent in non-OpenFin apps.
    const mod = (await import('@openfin/workspace/notifications')) as unknown;
    if (mod && typeof mod === 'object' && 'create' in mod) {
      return mod as OpenFinNotificationsApi;
    }
    return null;
  } catch {
    return null;
  }
}

export function useAlertsOpenFinBridge(platform: GridPlatform | null): void {
  const seenIdsRef = useRef<Set<string>>(new Set());
  const apiRef = useRef<OpenFinNotificationsApi | null>(null);
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!platform) return;
    const fin = getFin();
    if (!fin) return;
    const store = platform.store;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void (async () => {
      const api = await loadNotificationsApi();
      if (cancelled || !api) return;
      apiRef.current = api;

      // Provider registration is idempotent across the page — wrap in
      // try/catch so a second register call (e.g. from another widget)
      // doesn't crash the bridge.
      if (!registeredRef.current && typeof api.register === 'function') {
        try {
          await api.register();
        } catch {
          /* registration already done by another consumer */
        }
        registeredRef.current = true;
      }

      // Seed seenIds with whatever history already exists so a profile
      // load doesn't replay every old notification through OpenFin.
      const initial = store.getModuleState<AlertsState | undefined>(MODULE_ID);
      if (initial?.history) for (const n of initial.history) seenIdsRef.current.add(n.id);

      unsubscribe = store.subscribeToModule<AlertsState | undefined>(MODULE_ID, (state) => {
        if (!state) return;
        const seen = seenIdsRef.current;
        // Iterate newest → oldest; the first already-seen entry means everything
        // older has already been dispatched.
        const fresh: AlertNotification[] = [];
        for (const n of state.history) {
          if (seen.has(n.id)) break;
          fresh.push(n);
        }
        if (fresh.length === 0) return;

        // Re-check settings live — a user toggling `enabledChannels.openfin`
        // off should immediately stop new dispatches even mid-burst.
        const enabled = state.settings.enabled && state.settings.enabledChannels.openfin;

        // Fire in chronological order so OpenFin's notification centre shows
        // them in the same sequence the user would have seen them in-app.
        const rulesById = new Map(state.rules.map((r) => [r.id, r]));

        for (let i = fresh.length - 1; i >= 0; i -= 1) {
          const n = fresh[i];
          seen.add(n.id);
          if (!enabled) continue;
          const rule = rulesById.get(n.ruleId);
          if (!rule?.channels.includes('openfin')) continue;
          void dispatchOpenFinNotification(apiRef.current!, n, fin);
        }
      });
    })();

    return () => {
      cancelled = true;
      try {
        unsubscribe?.();
      } catch {
        /* swallow */
      }
    };
  }, [platform]);
}

async function dispatchOpenFinNotification(
  api: OpenFinNotificationsApi,
  notification: AlertNotification,
  fin: FinGlobal,
): Promise<void> {
  try {
    await api.create({
      platform: fin.me?.identity?.uuid,
      title: notification.ruleName,
      body: notification.message,
      toast: 'transient',
      category: SEVERITY_TO_CATEGORY[notification.severity],
      template: 'markdown',
      customData: {
        ruleId: notification.ruleId,
        notificationId: notification.id,
        rowId: notification.rowId,
        column: notification.column,
        severity: notification.severity,
        firedAt: notification.firedAt,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[alerts] OpenFin notification dispatch failed:', err);
  }
}
