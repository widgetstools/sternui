import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigEditorProvider } from '@starui/config-editor-ui';
import { createConfigClient } from '@starui/config-service';
import type { AppIdentity, ConfigClient } from '@starui/config-service';

import './index.css';
import { AppShell } from './AppShell';
import { SignIn } from './SignIn';
import { clearToken, readTokenFromUrl, setToken } from './auth';

/**
 * apps/config-admin-web — entry point.
 *
 * The admin app talks to the same `apps/config-service-server` it is
 * bundled into via the REST `ConfigClient` (`baseUrl: '/api/v1'`).
 * That same shape works in dev (Vite proxies `/api` → :3001) and in
 * production (the SPA is served from `/` by the same Express app
 * that owns the API, so the relative path resolves naturally).
 *
 * Auth is the placeholder Decision-16 gate: any non-empty token
 * counts as signed-in and is plumbed into `RestConfigClient` via
 * `AppIdentity.getAccessToken`. Real IDP integration is deferred.
 */

function buildClient(token: string): ConfigClient {
  const identity: AppIdentity = {
    userId: 'config-admin-operator',
    displayName: 'Config Admin',
    getAccessToken: async () => token,
  };
  return createConfigClient({ baseUrl: '/api/v1', identity });
}

function Root() {
  const [token, setTokenState] = useState<string | null>(() =>
    readTokenFromUrl(),
  );
  const [client, setClient] = useState<ConfigClient | null>(() => {
    const initial = readTokenFromUrl();
    return initial ? buildClient(initial) : null;
  });

  function handleSignIn(next: string) {
    setToken(next);
    setTokenState(next);
    setClient(buildClient(next));
  }

  function handleSignOut() {
    clearToken();
    setTokenState(null);
    setClient(null);
  }

  if (!token || !client) {
    return <SignIn onSubmit={handleSignIn} />;
  }

  return (
    <ConfigEditorProvider client={client}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AppShell onSignOut={handleSignOut} />
      </BrowserRouter>
    </ConfigEditorProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
