/**
 * HostedFeatureView — universal wrapper for any feature component in this OpenFin app.
 *
 * Consolidates boilerplate across all route views:
 * - Wraps with HostedComponent to resolve OpenFin identity + ConfigManager
 * - Mounts DataPlaneProvider for data-plane features
 * - Exposes full HostedContext to children via render-prop
 *
 * Every feature view (MarketsGrid, Charts, TradeTickets, etc.) uses this once,
 * eliminating per-view boilerplate. Views that need storage, theme switching,
 * or other context details access it via the render-prop callback.
 *
 * Usage (simple):
 * ```tsx
 * <HostedFeatureView
 *   componentName="Simple Feature"
 *   defaultInstanceId="simple-default"
 * >
 *   <SimpleFeature />
 * </HostedFeatureView>
 * ```
 *
 * Usage (with storage + context):
 * ```tsx
 * <HostedFeatureView
 *   componentName="Markets Grid"
 *   defaultInstanceId="marketsgrid-default"
 *   withStorage
 * >
 *   {({ instanceId, storage, configManager, userId, appId }) => (
 *     <MarketsGridContainer
 *       gridId={instanceId}
 *       storage={storage}
 *       userId={userId}
 *       appId={appId}
 *       {...otherProps}
 *     />
 *   )}
 * </HostedFeatureView>
 * ```
 */

import type { ReactNode } from 'react';
import { DataPlaneProvider } from '@marketsui/data-plane-react/v2';
import { HostedComponent, type HostedContext } from './HostedComponent';
import { dataPlaneClient } from '../data-plane-client';

export interface HostedFeatureViewProps {
  /** Logical name shown in the debug overlay. */
  componentName: string;

  /** Default instanceId (fallback for identity resolution). */
  defaultInstanceId: string;

  /** Override the path label shown in the debug chip. */
  pathLabel?: string;

  /** When true, resolve ConfigService storage adapter for this feature. */
  withStorage?: boolean;

  /** Override document title (defaults to componentName). */
  documentTitle?: string;

  /** The feature component(s) to host. Can be a ReactNode or render-prop callback. */
  children: ReactNode | ((ctx: HostedContext) => ReactNode);
}

export function HostedFeatureView({
  componentName,
  defaultInstanceId,
  pathLabel,
  withStorage = false,
  documentTitle,
  children,
}: HostedFeatureViewProps): ReactNode {
  return (
    <HostedComponent
      componentName={componentName}
      defaultInstanceId={defaultInstanceId}
      pathLabel={pathLabel}
      withStorage={withStorage}
      documentTitle={documentTitle}
    >
      {(ctx: HostedContext) => {
        // If ConfigManager hasn't resolved yet, show loading state.
        if (!ctx.configManager) {
          return (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Connecting to ConfigService…
            </div>
          );
        }

        // Render the child (either a ReactNode or call the render-prop callback).
        const content = typeof children === 'function' ? children(ctx) : children;

        // Always wrap with DataPlaneProvider so data-plane features are available.
        return (
          <DataPlaneProvider
            client={dataPlaneClient}
            configManager={ctx.configManager}
            userId={ctx.userId}
          >
            {content}
          </DataPlaneProvider>
        );
      }}
    </HostedComponent>
  );
}
