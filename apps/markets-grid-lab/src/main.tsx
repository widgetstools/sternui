import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { Alert, AlertDescription, AlertTitle } from '@starui/ui';
import { DataServicesProvider } from '@starui/host-data-react/runtime';
import { App } from './App';
import { initPlatformBootstrap } from './platformBootstrap';
import './globals.css';

applyTheme(getTheme());

const rootElement = document.getElementById('root')!;

function BootstrapError({ error }: { error: Error }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[color:var(--ds-surface-ground)] p-8">
      <Alert
        variant="destructive"
        className="max-w-lg border-[color:var(--ds-status-error-border)] bg-[color:var(--ds-surface-primary)]"
      >
        <AlertTitle>MarketsGrid Feature Lab — data services unavailable</AlertTitle>
        <AlertDescription className="space-y-3 text-[color:var(--ds-text-secondary)]">
          <p>
            The SharedWorker mock-data hub failed to start. Live streams and grid tabs will not work
            until this is resolved.
          </p>
          <pre className="overflow-x-auto rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-raised)] px-3 py-2 text-[12px] text-[color:var(--ds-status-error-fg)]">
            {error.message}
          </pre>
        </AlertDescription>
      </Alert>
    </div>
  );
}

void initPlatformBootstrap()
  .then(({ dataServices }) => {
    createRoot(rootElement).render(
      <React.StrictMode>
        <DataServicesProvider services={dataServices}>
          <App />
        </DataServicesProvider>
      </React.StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    createRoot(rootElement).render(
      <React.StrictMode>
        <BootstrapError error={error} />
      </React.StrictMode>,
    );
  });
