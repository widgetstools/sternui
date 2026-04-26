/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createConfigServiceStorage, type ConfigManager } from '@marketsui/config-service';
import type { StorageAdapterFactory } from '@marketsui/markets-grid';
import { getConfigManager } from '@marketsui/openfin-platform/config';

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

export interface HostedContext {
  /** Per-instance identity. `null` while the host environment is being
   *  resolved on first mount. */
  instanceId: string | null;
  /** App identity used as part of the ConfigService scope key. */
  appId: string;
  /** User identity used as part of the ConfigService scope key. */
  userId: string;
  /** The host ConfigManager singleton. `null` until resolved. */
  configManager: ConfigManager | null;
  /** ConfigService-backed StorageAdapterFactory. Only populated when the
   *  caller passed `withStorage`; otherwise `null`. */
  storage: StorageAdapterFactory | null;
}

export interface HostedComponentProps {
  /** Logical name shown in the debug overlay's title. */
  componentName: string;
  /** Default instanceId used when neither OpenFin customData nor the
   *  URL `?instanceId=` query param resolves one. Required so first-run
   *  / refresh scenarios converge on a stable id. */
  defaultInstanceId: string;
  /** Override the path label shown in the debug chip. Defaults to
   *  `window.location.pathname` so users see the current route. */
  pathLabel?: string;
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

// ─── Defaults — match seed-config.json's primary appRegistry/userProfile rows ──
const DEFAULT_APP_ID = 'TestApp';
const DEFAULT_USER_ID = 'dev1';

// ─── Component ───────────────────────────────────────────────────────

export function HostedComponent({
  componentName,
  defaultInstanceId,
  pathLabel,
  withStorage = false,
  documentTitle,
  children,
}: HostedComponentProps) {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [appId, setAppId] = useState<string>(DEFAULT_APP_ID);
  const [userId, setUserId] = useState<string>(DEFAULT_USER_ID);
  const [configManager, setConfigManager] = useState<ConfigManager | null>(null);

  // Resolve identity on mount. All three lookups race-safe via the
  // `cancelled` flag so a fast unmount doesn't write to a torn-down
  // setState.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      resolveHostInstanceId(defaultInstanceId),
      resolveAppId(DEFAULT_APP_ID),
      resolveUserId(DEFAULT_USER_ID),
    ])
      .then(([id, app, user]) => {
        if (cancelled) return;
        setInstanceId(id);
        setAppId(app);
        setUserId(user);
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

  // Build the storage factory only if the caller asked for it. Memo on
  // `configManager` so the closure is stable and inner components don't
  // re-create their storage adapter on every render.
  const storage = useMemo<StorageAdapterFactory | null>(
    () => (withStorage && configManager ? createConfigServiceStorage({ configManager }) : null),
    [withStorage, configManager],
  );

  // Document title — restored on unmount so the home page / other
  // routes get their own title back when the user navigates away.
  useEffect(() => {
    const prev = document.title;
    document.title = documentTitle ?? componentName;
    return () => { document.title = prev; };
  }, [componentName, documentTitle]);

  // ─── Auto-hide debug overlay ───────────────────────────────────
  // Hidden by default. Slides down when the cursor approaches the top
  // edge (8px hover strip), stays visible while the cursor is over the
  // strip OR the header itself, hides 250ms after both lose hover.
  const [debugVisible, setDebugVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const showHeader = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setDebugVisible(true);
  }, []);
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setDebugVisible(false);
      hideTimerRef.current = null;
    }, 250);
  }, []);
  useEffect(() => () => {
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
  }, []);

  const ctx: HostedContext = useMemo(
    () => ({ instanceId, appId, userId, configManager, storage }),
    [instanceId, appId, userId, configManager, storage],
  );

  const resolvedPath = pathLabel ?? (typeof window !== 'undefined' ? window.location.pathname : '');

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
        {/* 8px hover strip — invisible. Captures the mouseenter that
            triggers the header reveal. zIndex 10 so it sits above the
            grid chrome but below the expanded header. */}
        <div
          aria-hidden="true"
          onMouseEnter={showHeader}
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: 8,
            zIndex: 10,
          }}
        />

        {/* Debug overlay — slides down from the top, NEVER pushes
            content. The grid below keeps its full height. */}
        <header
          onMouseEnter={showHeader}
          onMouseLeave={scheduleHide}
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            zIndex: 20,
            padding: '10px 16px',
            background: 'color-mix(in srgb, var(--bn-bg1, #161a1e) 92%, transparent)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottom: '1px solid var(--bn-border, #313944)',
            boxShadow: debugVisible ? '0 4px 16px rgba(0,0,0,0.35)' : 'none',
            transform: debugVisible ? 'translateY(0)' : 'translateY(-100%)',
            opacity: debugVisible ? 1 : 0,
            pointerEvents: debugVisible ? 'auto' : 'none',
            transition: 'transform 160ms ease-out, opacity 160ms ease-out, box-shadow 160ms ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--bn-t0)',
                letterSpacing: 0.2,
              }}
            >
              {componentName}
            </span>
            <span style={{ color: 'var(--bn-t3, #5a6472)', fontSize: 12 }}>·</span>
            <DebugChip label="path" value={resolvedPath} mono />
            <DebugChip label="instanceId" value={instanceId ?? '…'} mono truncate />
            <DebugChip label="appId" value={appId} />
            <DebugChip label="user" value={userId} />
          </div>
        </header>

        {/* Hosted content. Takes the full container; the debug overlay
            floats above without displacing it. */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {children(ctx)}
        </div>
      </div>
    </>
  );
}

// ─── Debug chip ──────────────────────────────────────────────────────

function DebugChip({
  label,
  value,
  mono = false,
  truncate = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        background: 'var(--bn-bg2, #1e2329)',
        border: '1px solid var(--bn-border, #313944)',
        borderRadius: 4,
        maxWidth: truncate ? 280 : undefined,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: 'var(--bn-t3, #5a6472)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--bn-t0, #eaecef)',
          fontFamily: mono ? "'JetBrains Mono', 'IBM Plex Mono', monospace" : 'inherit',
          whiteSpace: 'nowrap',
          overflow: truncate ? 'hidden' : 'visible',
          textOverflow: truncate ? 'ellipsis' : 'clip',
        }}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </span>
  );
}
