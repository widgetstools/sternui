/**
 * DataProviders — admin page that mounts `<DataProviderEditor>` so
 * users can author STOMP / REST / Mock / etc. providers and pick them
 * later from the blotter's `<DataProviderSelector>`.
 *
 * Two pieces of mounting plumbing the editor expects:
 *   1. A QueryClientProvider — `useDataProviders` is a TanStack Query
 *      hook; without it the editor's list panel throws.
 *   2. A configured `dataProviderConfigService.apiUrl`. The default
 *      (`http://localhost:3001`) matches the stern-2 config server
 *      contract; override via VITE_DATA_PROVIDER_API_URL when running
 *      against a different backend.
 *
 * The page is intentionally chrome-light: a one-line top bar with a
 * back link, then the editor fills the rest of the viewport. Users
 * land here either from the home-page "Manage Data Providers" card or
 * from the blotter's <DataProviderSelector> "New" button.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DataProviderEditor } from '@marketsui/widgets-react';
import { dataProviderConfigService } from '@marketsui/data-plane';

// One client per page mount. The editor's mutations invalidate caches
// on this client; sharing it across routes isn't required.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

// Bootstrap the config service against the configured backend. Falls
// back to the localhost default when no env override is present.
const API_URL =
  (import.meta.env.VITE_DATA_PROVIDER_API_URL as string | undefined) ||
  'http://localhost:3001';

dataProviderConfigService.configure({ apiUrl: API_URL });

// In development the reference app doesn't ship a real signed-in user;
// 'dev1' matches the userId convention the integration plan uses for
// the development scope. Public providers are always reachable too —
// they're stored under userId='system'.
const DEV_USER_ID = (import.meta.env.VITE_DEFAULT_USER_ID as string | undefined) || 'dev1';

function DataProviders() {
  // Quick page title for browser tab parity with the rest of the
  // /views/* pages.
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
            Backend: <code className="font-mono">{API_URL}</code>
          </span>
        </header>
        <div className="flex-1 min-h-0">
          <DataProviderEditor userId={DEV_USER_ID} />
        </div>
      </div>
    </QueryClientProvider>
  );
}

export default DataProviders;
