import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import { HostWrapper } from '@starui/host-wrapper-react';
import { BrowserRuntime } from '@starui/runtime-browser';
import { createConfigClient } from '@starui/config-service';
import { App } from './App';
import './globals.css';

// Apply persisted theme before first render so there's no FOUC.
applyTheme(getTheme());

// ─── Path C Phase X-3a — root-level HostWrapper wiring ─────────────────
//
// Adds the seam from docs/ARCHITECTURE.md (Seam #2) at the demo-react
// root. The runtime is the browser flavor (no OpenFin); the
// configManager is a fresh local Dexie ConfigClient.
//
// At this stage NO leaf component reads `useHost()` yet — the demo
// continues to use its existing `DexieAdapter` for LayoutManager
// state and its hardcoded view/orders state. The wiring is here so
// future commits can migrate identity reads (`appId` / `userId` /
// `instanceId`) and config-driven persistence onto the seam without
// having to add the wrapper in the same change.
//
// Identity defaults: the demo runs as a single anonymous app+user;
// `BrowserRuntime`'s `identity` option supplies stable defaults the
// runtime would otherwise mint as random UUIDs on every reload.
//
// Verification: full Playwright e2e on this branch must match the
// `main` failure count. If `HostWrapper` fails to resolve runtime or
// configManager, children never mount and every e2e test that
// expects the grid would fail.
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
    <HostWrapper runtime={runtime} configManager={configManager}>
      <App />
    </HostWrapper>
  </React.StrictMode>,
);
