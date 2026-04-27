/**
 * DataProviders — admin page that mounts `<DataProviderEditor>` so
 * users can author STOMP / REST / Mock / etc. providers and pick them
 * later from the blotter's `<DataProviderSelector>`.
 *
 * Mounting plumbing the editor expects:
 *   1. A QueryClientProvider — `useDataProviders` is a TanStack Query
 *      hook; without it the editor's list panel throws.
 *   2. A configured `dataProviderConfigService.apiUrl`. The default
 *      (`http://localhost:3001`) matches the stern-2 config server
 *      contract; override via VITE_DATA_PROVIDER_API_URL when running
 *      against a different backend.
 *   3. A signed-in `userId`. When this view is launched from the
 *      OpenFin dock (via ACTION_OPEN_DATA_PROVIDERS), workspace.ts
 *      forwards `customData: { appId, userId }` and we read it via
 *      `readHostEnv()`. In a plain browser context we fall back to
 *      VITE_DEFAULT_USER_ID, then 'dev1' — matches the convention
 *      used elsewhere in the integration plan.
 *
 * Layout: a thin top bar with a back link + the active backend, then
 * the editor fills the rest of the window.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataProviderEditor } from '@marketsui/widgets-react';
import { dataProviderConfigService } from '@marketsui/data-plane';
import { readHostEnv } from '@marketsui/openfin-platform/config';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

const API_URL =
  (import.meta.env.VITE_DATA_PROVIDER_API_URL as string | undefined) ||
  'http://localhost:3001';

dataProviderConfigService.configure({ apiUrl: API_URL });

const DEV_USER_ID = (import.meta.env.VITE_DEFAULT_USER_ID as string | undefined) || 'dev1';

function DataProviders() {
  // Resolve the effective userId: openfin customData wins, then env
  // override, then dev fallback. `readHostEnv()` is async because
  // OpenFin's `fin.me.getOptions()` is async; until it returns we
  // mount the editor with the dev fallback so there's no flash of
  // empty state.
  const [userId, setUserId] = useState<string>(DEV_USER_ID);

  useEffect(() => {
    let cancelled = false;
    readHostEnv()
      .then((env) => {
        if (!cancelled && env.userId) setUserId(env.userId);
      })
      .catch(() => {
        // readHostEnv only throws on truly unexpected failures; the
        // dev fallback is already in place so swallow silently.
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Data Providers · Markets UI';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col h-screen w-screen bg-background">
        <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
          <span className="text-[11px] text-muted-foreground">
            user <code className="font-mono">{userId}</code> · backend <code className="font-mono">{API_URL}</code>
          </span>
        </header>
        <div className="flex-1 min-h-0">
          <DataProviderEditor userId={userId} />
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default DataProviders;
