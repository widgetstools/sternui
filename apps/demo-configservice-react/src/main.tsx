import React from 'react';
import { createRoot } from 'react-dom/client';
// FI Trading Terminal design-system themes. Imported BEFORE globals.css
// so the demo's hex-encoded shadcn vars (in globals.css) take precedence
// over the design system's HSL-triplet shadcn vars — we keep the demo's
// teal brand while still inheriting the design system's order-book /
// trade-ticket overlay tokens and legacy --fi-* aliases.
import '@marketsui/design-system/themes/fi-dark.css';
import '@marketsui/design-system/themes/fi-light.css';
import './globals.css';
import { HostWrapper } from '@marketsui/host-wrapper-react';
import { BrowserRuntime } from '@marketsui/runtime-browser';
import { createConfigClient } from '@marketsui/config-service';
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

// ─── Path C Phase X-3 (ConfigService demo) — root-level HostWrapper ──
//
// HostWrapper is the contract a 3rd-party component reads when dropped
// into a workspace view: identity (instanceId / appId / userId / etc.)
// flows from `customData` (OpenFin) or URL/mount-prop fallbacks
// (browser), and runtime events (theme change, window-shown,
// window-closing, customData updates) propagate via subscribe hooks.
//
// Both surfaces below (the App and the ConfigBrowser popup) get the
// wrapper so any future leaf consumer reads identical context. This is
// the third app to consume the seam (after demo-react and
// markets-ui-react-reference). Plain browser flavor — BrowserRuntime
// is the only choice; OpenFin lives elsewhere.
//
// At this stage no leaf component reads `useHost()` yet — the seam is
// passive. Future commits can migrate App.tsx's identity threading
// onto it: today App.tsx maintains `appId`/`userId` in React state and
// passes them as MarketsGrid props; once leaves consume `useHost()`,
// that plumbing collapses.
const runtime = new BrowserRuntime({
  identity: {
    appId: 'demo-configservice-react',
    userId: 'dev-user',
    instanceId: 'demo-blotter-v2',
    componentType: 'MarketsGrid',
  },
});
const configManager = createConfigClient({});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HostWrapper runtime={runtime} configManager={configManager}>
      {isConfigBrowserPopup ? <ConfigBrowserPopout /> : <App />}
    </HostWrapper>
  </React.StrictMode>,
);
