/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createConfigServiceStorage, type ConfigManager } from '@marketsui/config-service';
import type { StorageAdapterFactory } from '@marketsui/markets-grid';
import { getConfigManager } from '@marketsui/openfin-platform/config';
import type { HostedContext } from '@marketsui/widgets-react/hosted';

/**
 * HostedComponent — generic shell for any component this app hosts as a
 * route, regardless of whether it talks to the host's ConfigService
 * (internal) or fetches its own state from elsewhere (external).
 *
 * Responsibilities:
 *   • Resolve the per-instance identity (OpenFin customData → URL
 *     `?instanceId=` → fallback) and pass it through to children.
 *   • Resolve the host ConfigManager and, when `withStorage` is set,
 *     the corresponding StorageAdapterFactory used by MarketsGrid +
 *     other internal storage consumers.
 *   • Render the auto-hide debug overlay shared across every hosted
 *     component (path / instanceId / appId / userId chips).
 *   • Manage the document title.
 *
 * Inner component receives the resolved context via render-prop:
 *
 * ```tsx
 * <HostedComponent
 *   componentName="My Blotter"
 *   defaultInstanceId="my-blotter-default"
 *   withStorage
 * >
 *   {({ instanceId, storage, appId, userId }) =>
 *     instanceId == null
 *       ? <p>Loading…</p>
 *       : <MyBlotter
 *           gridId={instanceId}
 *           storage={storage}
 *           appId={appId}
 *           userId={userId}
 *         />
 *   }
 * </HostedComponent>
 * ```
 *
 * Routes typically host one HostedComponent per route — see the
 * markets-ui-react-reference app's main.tsx for the canonical pattern.
 */

export interface HostedComponentProps {
  /** Logical name shown in the debug overlay's title. */
  componentName: string;
  /** Default instanceId used when neither OpenFin customData nor the
   *  URL `?instanceId=` query param resolves one. Required so first-run
   *  / refresh scenarios converge on a stable id. */
  defaultInstanceId: string;
  /** When true, resolve a ConfigService-backed StorageAdapterFactory and
   *  pass it through `ctx.storage`. Internal components that read/write
   *  the host's ConfigService should set this; external components that
   *  manage their own storage can leave it off. */
  withStorage?: boolean;
  /** Override the document title while this component is mounted.
   *  Defaults to `componentName`. */
  documentTitle?: string;
  /** Render function — receives the resolved context. */
  children: (ctx: HostedContext) => ReactNode;
}

// ─── Identity resolution ─────────────────────────────────────────────

/**
 * Resolve a per-instance identifier from the host environment, in
 * priority order:
 *   1. OpenFin `fin.me.getOptions().customData.instanceId`
 *   2. URL `?instanceId=` query param
 *   3. The supplied default
 */
async function resolveHostInstanceId(defaultId: string): Promise<string> {
  // 1. OpenFin customData
  if (typeof fin !== 'undefined') {
    try {
      const options = await fin.me.getOptions();
      const id = (options as { customData?: { instanceId?: string } })?.customData?.instanceId;
      if (typeof id === 'string' && id.length > 0) return id;
    } catch {
      /* not in an OpenFin view, or getOptions failed — fall through */
    }
  }
  // 2. URL query param
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('instanceId');
    if (fromUrl && fromUrl.length > 0) return fromUrl;
  } catch {
    /* SSR / no window — fall through */
  }
  // 3. Fallback
  return defaultId;
}

/**
 * Resolve `appId` from OpenFin customData, falling back to the value
 * baked into seed-config.json. Same priority as instanceId — OpenFin
 * wins when present so multi-app workspaces stay correctly scoped.
 */
async function resolveAppId(fallback: string): Promise<string> {
  if (typeof fin !== 'undefined') {
    try {
      const options = await fin.me.getOptions();
      const id = (options as { customData?: { appId?: string } })?.customData?.appId;
      if (typeof id === 'string' && id.length > 0) return id;
    } catch { /* fall through */ }
  }
  return fallback;
}

async function resolveUserId(fallback: string): Promise<string> {
  if (typeof fin !== 'undefined') {
    try {
      const options = await fin.me.getOptions();
      const id = (options as { customData?: { userId?: string } })?.customData?.userId;
      if (typeof id === 'string' && id.length > 0) return id;
    } catch { /* fall through */ }
  }
  return fallback;
}

/**
 * Resolve the **registered component identity** from OpenFin
 * customData — `componentType`, `componentSubType`, `isTemplate`,
 * `singleton`. These are stamped onto every AppConfigRow this view
 * persists (via the storage factory's `registeredIdentity` opt) so
 * the row reflects the registry entry that launched it.
 *
 * Returns `null` outside OpenFin — non-OpenFin callers don't have a
 * "registered component" identity and the storage factory falls
 * back to its legacy hardcoded discriminator ("markets-grid-profile-set").
 */
async function resolveRegisteredIdentity(): Promise<{
  componentType: string;
  componentSubType: string;
  isTemplate: boolean;
  singleton: boolean;
} | null> {
  if (typeof fin === 'undefined') return null;
  try {
    const options = await fin.me.getOptions();
    const cd = (options as { customData?: {
      componentType?: string;
      componentSubType?: string;
      isTemplate?: boolean;
      singleton?: boolean;
    } })?.customData;
    if (!cd?.componentType) return null;
    return {
      componentType: cd.componentType,
      componentSubType: cd.componentSubType ?? '',
      isTemplate: cd.isTemplate === true,
      singleton: cd.singleton === true,
    };
  } catch {
    return null;
  }
}

// ─── Defaults — match seed-config.json's primary appRegistry/userProfile rows ──
const DEFAULT_APP_ID = 'TestApp';
const DEFAULT_USER_ID = 'dev1';

// ─── Component ───────────────────────────────────────────────────────

export function HostedComponent({
  componentName,
  defaultInstanceId,
  withStorage = false,
  documentTitle,
  children,
}: HostedComponentProps) {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [appId, setAppId] = useState<string>(DEFAULT_APP_ID);
  const [userId, setUserId] = useState<string>(DEFAULT_USER_ID);
  const [configManager, setConfigManager] = useState<ConfigManager | null>(null);
  const [registeredIdentity, setRegisteredIdentity] = useState<{
    componentType: string;
    componentSubType: string;
    isTemplate: boolean;
    singleton: boolean;
  } | null>(null);

  // Resolve identity on mount. Lookups race-safe via the `cancelled`
  // flag so a fast unmount doesn't write to a torn-down setState.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      resolveHostInstanceId(defaultInstanceId),
      resolveAppId(DEFAULT_APP_ID),
      resolveUserId(DEFAULT_USER_ID),
      resolveRegisteredIdentity(),
    ])
      .then(([id, app, user, regIdentity]) => {
        if (cancelled) return;
        setInstanceId(id);
        setAppId(app);
        setUserId(user);
        setRegisteredIdentity(regIdentity);
      })
      .catch((err) => {
        console.error('[HostedComponent] identity resolution failed:', err);
        if (!cancelled) setInstanceId(defaultInstanceId);
      });
    return () => { cancelled = true; };
  }, [defaultInstanceId]);

  // Resolve ConfigManager — same singleton bridge MarketsGrid uses, so
  // every hosted component shares one Dexie connection.
  useEffect(() => {
    let cancelled = false;
    getConfigManager()
      .then((cm) => { if (!cancelled) setConfigManager(cm); })
      .catch((err) => {
        console.error('[HostedComponent] ConfigManager resolve failed:', err);
      });
    return () => { cancelled = true; };
  }, []);

  // Build the storage factory only if the caller asked for it. The
  // factory is wrapped so every adapter call automatically carries
  // the registered-component identity (componentType,
  // componentSubType, isTemplate, singleton) read from OpenFin
  // customData. The CONSUMING component (e.g. MarketsGrid) doesn't
  // need to know about identity — it just calls
  // `storage({ instanceId, appId, userId })` and the resulting
  // adapter writes rows whose componentType / componentSubType /
  // isTemplate match the Registry Editor entry that launched this
  // view. Configuration stays a hosting concern.
  //
  // Memo on `configManager` + `registeredIdentity` so a userId or
  // identity swap (rare) rebuilds the factory with the right
  // closure values; otherwise reused.
  const storage = useMemo<StorageAdapterFactory | null>(() => {
    if (!withStorage || !configManager) return null;
    const innerFactory = createConfigServiceStorage({ configManager });
    if (!registeredIdentity) {
      // Outside OpenFin or launched without a registered-component
      // customData — fall back to the legacy hardcoded discriminator.
      return innerFactory;
    }
    // Wrap: every factory call gets `registeredIdentity` injected.
    return (opts) => innerFactory({ ...opts, registeredIdentity });
  }, [withStorage, configManager, registeredIdentity]);

  // Document title — restored on unmount so the home page / other
  // routes get their own title back when the user navigates away.
  useEffect(() => {
    const prev = document.title;
    document.title = documentTitle ?? componentName;
    return () => { document.title = prev; };
  }, [componentName, documentTitle]);

  const ctx: HostedContext = useMemo(
    () => ({ instanceId, appId, userId, configManager, storage }),
    [instanceId, appId, userId, configManager, storage],
  );

  return (
    <>
      {/* Neutralise the global body padding while a hosted component is
          mounted full-bleed. React 19 hoists JSX <style> into <head>
          and tears it down on unmount, so other routes (the home page
          card layout) keep their default chrome. */}
      <style>{`
        html, body {
          padding: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bn-bg)',
          color: 'var(--bn-t0)',
          overflow: 'hidden',
        }}
      >
        {/* Hosted content takes the full container. Identity (path,
            instanceId, appId, userId) is now surfaced via the grid's
            own toolbar info popover instead of a hover overlay. */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {children(ctx)}
        </div>
      </div>
    </>
  );
}
