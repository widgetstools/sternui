import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import './globals.css';

// Apply persisted theme before first render so there's no FOUC.
applyTheme(getTheme());
import { AppShell } from '@starui/app-shell-react';
import { BrowserRuntime } from '@starui/runtime-browser';
import { createConfigClient } from '@starui/config-service';
import { App } from './App';
import { ConfigBrowserPopout } from './ConfigBrowserPopout';

/**
 * Entry router. The demo has two surfaces sharing one Vite bundle:
 *
 *   /                     → the trading-app demo (MarketsGrid + views)
 *   /?configBrowser=1     → a ConfigBrowser popup spawned from the demo
 *
 * The popup is opened via `window.open(...)` from App.tsx when the user
 * clicks the Database icon on the grid's toolbar. Single-bundle
 * architecture keeps the story simple: no separate build target, no
 * separate vite server, and the popup sees the same IndexedDB (Dexie
 * cross-window sharing is automatic for same-origin).
 */
const params = new URLSearchParams(window.location.search);
const isConfigBrowserPopup = params.get('configBrowser') === '1';

// Both surfaces below (the App and the ConfigBrowser popup) get the
// shell so any future leaf consumer reads identical context. Plain
// browser flavor — BrowserRuntime is the only choice; OpenFin lives
// elsewhere.
const runtime = new BrowserRuntime({
  identity: {
    appId: 'demo-configservice-react',
    userId: 'dev1',
    instanceId: 'demo-blotter-v2',
    componentType: 'MarketsGrid',
  },
});
// Mode is env-driven (see .env.example):
//   VITE_CONFIG_SERVICE_URL unset → LocalConfigClient (Dexie)
//   VITE_CONFIG_SERVICE_URL set   → RestConfigClient (HTTP backend)
// Same client interface either way — leaf consumers don't care.
const configManager = createConfigClient({
  baseUrl: import.meta.env.VITE_CONFIG_SERVICE_URL || undefined,
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppShell runtime={runtime} configManager={configManager}>
      {isConfigBrowserPopup ? <ConfigBrowserPopout /> : <App />}
    </AppShell>
  </React.StrictMode>,
);
