import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { AppShell } from '@starui/app-shell-react';
import { BrowserRuntime } from '@starui/runtime-browser';
import { createConfigClient } from '@starui/config-service';
import { App } from './App';
import './globals.css';

// Apply persisted theme before first render so there's no FOUC.
applyTheme(getTheme());

// The runtime is the browser flavor (no OpenFin); the configManager is
// a fresh local Dexie ConfigClient. The previous incantation built the
// HostWrapper directly — `<AppShell>` now collapses the provider stack
// so this entry stays small and other apps share the same shape.
//
// Identity defaults: the demo runs as a single anonymous app+user;
// `BrowserRuntime`'s `identity` option supplies stable defaults the
// runtime would otherwise mint as random UUIDs on every reload.
const runtime = new BrowserRuntime({
  identity: {
    appId: 'demo-react',
    userId: 'demo-user',
    instanceId: 'demo-blotter-v2',
    componentType: 'MarketsGrid',
  },
});
const configManager = createConfigClient({});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppShell runtime={runtime} configManager={configManager}>
      <App />
    </AppShell>
  </React.StrictMode>,
);
