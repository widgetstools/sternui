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

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isConfigBrowserPopup ? <ConfigBrowserPopout /> : <App />}
  </React.StrictMode>,
);
