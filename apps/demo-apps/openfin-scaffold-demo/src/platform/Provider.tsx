/**
 * OpenFin Platform Provider window (`/platform/provider`).
 *
 * OpenFin loads this route first (see `platform.providerUrl` in manifest.fin.json).
 * `initWorkspace()` from `@starui/openfin-platform`:
 *   - seeds ConfigManager from `customSettings.seedConfigUrl`
 *   - registers the dock (Tools → Workspace Setup, Data Providers, Config Browser, …)
 *   - wires workspace persistence, theme toggle, notifications, custom actions
 *
 * Set `platform.autoShow: false` in the manifest so this window stays hidden in production.
 */
import { useEffect, useState } from 'react';
import { initWorkspace } from '@starui/openfin-platform';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@starui/ui';
import { DOCK_ICON_URL } from '../constants';

const TOOL_CHUNKS: Record<string, () => Promise<unknown>> = {
  DataProvidersView: () => import('../views/DataProvidersView'),
  ConfigBrowserView: () => import('../views/ConfigBrowserView'),
  BlotterView: () => import('../views/BlotterView'),
  WorkspaceSetup: () => import('@starui/workspace-setup-react'),
};

async function prefetchToolChunks(): Promise<void> {
  const entries = Object.entries(TOOL_CHUNKS);
  const results = await Promise.allSettled(entries.map(([, load]) => load()));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  console.info(`[provider] prefetched ${ok}/${entries.length} route chunks`);
}

export default function Provider() {
  const [progress, setProgress] = useState('Starting platform…');

  useEffect(() => {
    initWorkspace({
      dockIcon: DOCK_ICON_URL,
      onProgress: setProgress,
      roles: ['admin', 'developer'],
      components: { home: false, store: false },
    })
      .then(() => {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => void prefetchToolChunks(), { timeout: 4000 });
        } else {
          setTimeout(() => void prefetchToolChunks(), 1500);
        }
      })
      .catch((err) => {
        console.error('[provider] initWorkspace failed:', err);
        setProgress(`Failed: ${String(err)}`);
      });
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Platform provider</CardTitle>
          <CardDescription>
            Initializes OpenFin Workspace. Hide this window with <code>autoShow: false</code> in the manifest.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{progress}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Dock → Tools: Workspace Setup, Data Providers, Config Browser, Import Config.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
