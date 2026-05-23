/**
 * openfin-workspace entry — multi-view OpenFin app.
 *
 * The platform manifest spawns this app's URL with `?view=<name>` to
 * select which view component the router mounts:
 *
 *   ?view=provider   → Provider (calls initWorkspace; idle hidden window)
 *   ?view=blotter    → Blotter (MarketsGrid + mock provider)
 *
 * In the browser (no OpenFin), the default is `blotter` so the app
 * stays usable for quick visual checks during dev.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@starui/design-system';
import '@starui/design-system/css';
import './globals.css';

applyTheme(getTheme());

type View = 'provider' | 'blotter';

function resolveView(): View {
  if (typeof window === 'undefined') return 'blotter';
  const q = new URLSearchParams(window.location.search);
  const v = q.get('view');
  if (v === 'provider' || v === 'blotter') return v;
  return 'blotter';
}

const Provider = React.lazy(() => import('./platform/Provider').then((m) => ({ default: m.Provider })));
const Blotter = React.lazy(() => import('./views/Blotter').then((m) => ({ default: m.Blotter })));

const root = createRoot(document.getElementById('root')!);

const view = resolveView();

root.render(
  <React.StrictMode>
    <React.Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      {view === 'provider' ? <Provider /> : <Blotter />}
    </React.Suspense>
  </React.StrictMode>,
);
