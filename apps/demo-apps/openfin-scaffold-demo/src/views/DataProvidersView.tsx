/**
 * Data Provider Editor — author Mock / STOMP / REST / AppData providers.
 *
 * Opened from:
 *   - Dock → Tools → Data Providers
 *   - Blotter pencil → popout with `?id=<providerId>`
 *
 * Requires ancestor `<DataServicesProvider>` (see `main.tsx` tool routes).
 */
import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { DataProviderEditor } from '@starui/widgets-react/v2/provider-editor';
import { LOGGED_IN_USER_ID } from '@starui/types';

export default function DataProvidersView() {
  const [params] = useSearchParams();
  const initialProviderId = useMemo(() => params.get('id'), [params]);

  useEffect(() => {
    document.title = 'Data Providers · OpenFin Scaffold';
    const body = document.body.style;
    const prev = { padding: body.padding, margin: body.margin, overflow: body.overflow };
    body.padding = '0';
    body.margin = '0';
    body.overflow = 'hidden';
    return () => {
      body.padding = prev.padding;
      body.margin = prev.margin;
      body.overflow = prev.overflow;
    };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Dev home
        </Link>
        <span className="font-mono text-[11px] text-muted-foreground">
          user {LOGGED_IN_USER_ID} · ConfigManager
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <DataProviderEditor userId={LOGGED_IN_USER_ID} initialProviderId={initialProviderId} />
      </div>
    </div>
  );
}
