/**
 * DataProviders — admin page that mounts the v2 `<DataProviderEditor>`
 * so users can author STOMP / REST / Mock / AppData providers.
 *
 * This view is the popout target for `openProviderEditorPopout()`.
 * The popout helper passes `?id=<providerId>` when editing an
 * existing row; we read it via `URLSearchParams` and forward as
 * `initialProviderId` so the form snaps to that row on mount.
 *
 * Storage flows through `<DataPlaneProvider>` → `ConfigManager`
 * (Dexie / IndexedDB or REST, depending on `getConfigManager()`'s
 * resolution). No more `dataProviderConfigService` shim.
 *
 * Layout: a thin top bar with a back link, then the editor fills
 * the rest of the window.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { DataPlaneProvider } from '@marketsui/data-plane-react/v2';
import { DataProviderEditor } from '@marketsui/widgets-react/v2/provider-editor';
import { getConfigManager, readHostEnv } from '@marketsui/openfin-platform/config';
import type { ConfigManager } from '@marketsui/config-service';
import { dataPlaneClient } from '../data-plane-client';

const viteEnv = (import.meta as unknown as {
  env?: { VITE_DEFAULT_USER_ID?: string };
}).env;

const DEV_USER_ID = viteEnv?.VITE_DEFAULT_USER_ID || 'dev1';

function DataProviders() {
  const [params] = useSearchParams();
  const initialProviderId = useMemo(() => params.get('id'), [params]);

  const [userId, setUserId] = useState<string>(DEV_USER_ID);
  const [cm, setCm] = useState<ConfigManager | null>(null);

  // Resolve userId + ConfigManager. Both async — render a thin
  // "Connecting…" until they land so we don't flash an empty editor.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      readHostEnv().catch(() => ({ userId: undefined })),
      getConfigManager(),
    ]).then(([env, manager]) => {
      if (cancelled) return;
      if (env.userId) setUserId(env.userId);
      setCm(manager);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Data Providers · Markets UI';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
        <span className="text-[11px] text-muted-foreground">
          user <code className="font-mono">{userId}</code> · storage <code className="font-mono">ConfigManager</code>
        </span>
      </header>
      <div className="flex-1 min-h-0">
        {cm ? (
          <DataPlaneProvider client={dataPlaneClient} configManager={cm} userId={userId}>
            <DataProviderEditor userId={userId} initialProviderId={initialProviderId} />
          </DataPlaneProvider>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            Connecting to ConfigService…
          </div>
        )}
      </div>
    </div>
  );
}

export default DataProviders;
