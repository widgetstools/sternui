/**
 * HostedMarketsGrid — single component that collapses the previous
 * BlottersMarketsGrid → HostedFeatureView → HostedComponent →
 * BlotterGrid → MarketsGridContainer → MarketsGrid stack into one
 * call site. Composes the building blocks from sessions 1–3 plus
 * MarketsGridContainer:
 *
 *   <DataPlaneProvider>
 *     <FullBleedLayout>
 *       <ConfigManagerLoadingGuard>
 *         <MarketsGridContainer ... />
 *       </ConfigManagerLoadingGuard>
 *     </FullBleedLayout>
 *   </DataPlaneProvider>
 *
 * Props are flat (no `gridProps` namespacing) per refactor decision D7.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import type { DataPlane } from '@marketsui/data-plane/v2/client';
import { DataPlaneProvider } from '@marketsui/data-plane-react/v2';
import { MarketsGridContainer, type MarketsGridContainerProps } from '../v2/markets-grid-container/index.js';
import { useHostedIdentity } from './useHostedIdentity.js';
import { useAgGridTheme, type AgGridThemeMode } from './useAgGridTheme.js';
import type { ConfigManager } from './types.js';

const LEGACY_CLEANUP_SENTINEL = 'hosted-mg.legacy-cleanup';

/**
 * The subset of `MarketsGridContainerProps` the wrapper owns and
 * therefore omits from passthrough — they are derived from the hosted
 * identity / theme.
 */
type ContainerOwnedKeys =
  | 'instanceId'
  | 'appId'
  | 'userId'
  | 'storage'
  | 'theme'
  | 'componentName';

export interface HostedMarketsGridProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
> extends Omit<MarketsGridContainerProps<TData>, ContainerOwnedKeys> {
  /** Logical component name — surfaces in the toolbar info popover and
   *  is used for diagnostic identifiers. */
  componentName: string;
  /** Default `instanceId` when neither OpenFin customData nor URL param
   *  resolves one. Required so first-run / refresh converge. */
  defaultInstanceId: string;
  /** Default `appId` when OpenFin customData doesn't supply one. */
  defaultAppId?: string;
  /** Default `userId` when OpenFin customData doesn't supply one. */
  defaultUserId?: string;
  /** Document title while this component is mounted. Restored on
   *  unmount. Defaults to `componentName`. */
  documentTitle?: string;
  /** When true, resolve a ConfigService-backed StorageAdapterFactory
   *  from the host ConfigManager and pass it through to the grid. */
  withStorage?: boolean;
  /** Optional ConfigManager override. When omitted, the host singleton
   *  is resolved via `@marketsui/openfin-platform/config`. Pass an
   *  explicit ConfigManager in tests / non-OpenFin runtimes. */
  configManager?: ConfigManager;
  /** Theme mode for the AG-Grid blotter preset. Defaults to `'auto'`
   *  (follows the host's `[data-theme]` attribute). */
  theme?: AgGridThemeMode;
  /** Optional DataPlane client. When provided, the wrapper mounts a
   *  `<DataPlaneProvider>` for it. Omit when an ancestor already
   *  provides DataPlane context. */
  dataPlaneClient?: DataPlane;
}

function fullBleedReset(): ReactNode {
  return (
    <style>{`
      html, body {
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
      }
    `}</style>
  );
}

const FULL_BLEED_STYLE = {
  position: 'fixed' as const,
  inset: 0,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  background: 'var(--bn-bg)',
  color: 'var(--bn-t0)',
  overflow: 'hidden' as const,
};

const INNER_FILL_STYLE = {
  flex: 1,
  minHeight: 0,
  position: 'relative' as const,
};

const LOADING_STYLE = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  height: '100%',
  fontSize: 12,
  color: 'var(--bn-t2, #7a8494)',
};

export function HostedMarketsGrid<
  TData extends Record<string, unknown> = Record<string, unknown>,
>(props: HostedMarketsGridProps<TData>): ReactNode {
  const {
    componentName,
    defaultInstanceId,
    defaultAppId,
    defaultUserId,
    documentTitle,
    withStorage = false,
    configManager,
    theme = 'auto',
    dataPlaneClient,
    ...containerProps
  } = props;

  const { identity } = useHostedIdentity({
    defaultInstanceId,
    defaultAppId,
    defaultUserId,
    withStorage,
    configManager,
    componentName,
  });

  const agTheme = useAgGridTheme(theme);

  // Document title — restored on unmount.
  useEffect(() => {
    const prev = document.title;
    document.title = documentTitle ?? componentName;
    return () => {
      document.title = prev;
    };
  }, [componentName, documentTitle]);

  // One-shot legacy `marketsgrid-view-state::*` cleanup. Sentinel-gated
  // so it only runs once per browser regardless of how many hosted
  // grids mount.
  useEffect(() => {
    if (!identity.configManager || !identity.instanceId) return;
    try {
      if (window.localStorage.getItem(LEGACY_CLEANUP_SENTINEL) === '1') return;
    } catch {
      // localStorage unavailable (private mode, SSR) — best-effort skip.
      return;
    }
    void identity.configManager
      .deleteConfig(`marketsgrid-view-state::${identity.instanceId}`)
      .catch(() => {
        /* no row to clean — fine */
      })
      .finally(() => {
        try {
          window.localStorage.setItem(LEGACY_CLEANUP_SENTINEL, '1');
        } catch {
          /* ignore */
        }
      });
  }, [identity.configManager, identity.instanceId]);

  const containerNode = useMemo(() => {
    if (!identity.configManager || !identity.instanceId) {
      return <div style={LOADING_STYLE}>Connecting to ConfigService…</div>;
    }
    if (withStorage && !identity.storage) {
      return <div style={LOADING_STYLE}>Connecting to ConfigService…</div>;
    }
    return (
      <MarketsGridContainer<TData>
        {...(containerProps as MarketsGridContainerProps<TData>)}
        instanceId={identity.instanceId}
        appId={identity.appId}
        userId={identity.userId}
        componentName={componentName}
        storage={identity.storage ?? undefined}
        theme={agTheme}
      />
    );
    // containerProps changes per render; spread is shallow so we depend
    // on the underlying primitives indirectly via React's normal flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    identity.configManager,
    identity.instanceId,
    identity.appId,
    identity.userId,
    identity.storage,
    withStorage,
    componentName,
    agTheme,
    containerProps,
  ]);

  const dataPlaneWrapped = dataPlaneClient && identity.configManager
    ? (
      <DataPlaneProvider
        client={dataPlaneClient}
        configManager={identity.configManager}
        userId={identity.userId}
      >
        {containerNode}
      </DataPlaneProvider>
    )
    : containerNode;

  return (
    <>
      {fullBleedReset()}
      <div style={FULL_BLEED_STYLE}>
        <div style={INNER_FILL_STYLE}>{dataPlaneWrapped}</div>
      </div>
    </>
  );
}
