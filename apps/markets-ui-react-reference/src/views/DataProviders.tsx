/**
 * DataProviders — admin page that mounts `<DataProviderEditor>` so
 * users can author STOMP / REST / Mock / etc. providers and pick them
 * later from the blotter's `<DataProviderSelector>`.
 *
 * Storage is wired in main.tsx via `ensureDataProvidersLocalBackend()`.
 * The service's internal gate (`expectLocalBackend`) holds CRUD calls
 * until the ConfigManager resolves, so this view doesn't need a
 * "ready" flag — it just mounts the editor and trusts the service to
 * do the right thing.
 *
 * Mounting plumbing the editor still owns:
 *   • A QueryClientProvider — `useDataProviders` is a TanStack Query
 *     hook; without it the editor's list panel throws.
 *   • A signed-in `userId`. When this view is launched from the
 *     OpenFin dock (via ACTION_OPEN_DATA_PROVIDERS), workspace.ts
 *     forwards `customData: { appId, userId }` and we read it via
 *     `readHostEnv()`. Falls back to VITE_DEFAULT_USER_ID → 'dev1'
 *     outside OpenFin.
 *
 * Layout: a thin top bar with a back link, then the editor fills
 * the rest of the window.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataProviderEditor } from '@marketsui/widgets-react';
import { readHostEnv } from '@marketsui/openfin-platform/config';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

// Local cast: this app's tsconfig pins `types` to fin/fdc3/svg only,
// so `vite/client` types aren't ambient — narrow the access locally
// (same idiom as platform/Provider.tsx).
const viteEnv = (import.meta as unknown as {
  env?: { VITE_DEFAULT_USER_ID?: string };
}).env;

const DEV_USER_ID = viteEnv?.VITE_DEFAULT_USER_ID || 'dev1';

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
        /* dev fallback already set */
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
            user <code className="font-mono">{userId}</code> · storage <code className="font-mono">local (IndexedDB)</code>
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
