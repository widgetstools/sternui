/**
 * Application entry — routing shells for OpenFin Workspace + MarketsUI.
 *
 * ## Architecture (copy this layout into new apps)
 *
 * 1. **Provider route** (`/platform/provider`)
 *    OpenFin loads `manifest.platform.providerUrl` first. Calls `initWorkspace()`.
 *
 * 2. **Tool routes** (DataServicesProvider only)
 *    Admin surfaces: data providers, config browser, workspace setup, import config.
 *    Do NOT wrap these in `StarGridApp` — they only need the SharedWorker hub.
 *
 * 3. **View routes** (DataServicesProvider → StarGridApp)
 *    Grid/workspace views need `StarGridApp` for ConfigManager, runtime port, persistence.
 *
 * 4. **Dual runtime**
 *    `OpenFinRuntime` inside OpenFin; `BrowserRuntime` in plain browser for local dev.
 *
 * See `README.md` in this folder for manifest contracts and fork checklist.
 */
import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { applyTheme, getTheme } from '@starui/design-system';
import { StarGridApp } from '@starui/app';
import { BrowserRuntime } from '@starui/host-browser';
import { OpenFinRuntime, isOpenFin } from '@starui/host-openfin';
import { createConfigManager } from '@starui/host-config';
import { getConfigServiceRestUrlFromManifest } from '@starui/openfin-platform/config';
import { DataServicesProvider, useDataServices } from '@starui/host-data-react/runtime';
import { LOGGED_IN_USER_ID } from '@starui/types';
import type { RuntimePort } from '@starui/host';
import App from './App';
import './index.css';
import { APP_ID, SEED_APP_ID } from './constants';
import { dataServices } from './dataServices.mainThread';

applyTheme(getTheme());

const LOADING = <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

const Provider = React.lazy(() => import('./platform/Provider'));
const BlotterView = React.lazy(() => import('./views/BlotterView'));
const InteropView = React.lazy(() => import('./views/InteropView'));
const ConfigBrowserView = React.lazy(() => import('./views/ConfigBrowserView'));
const DataProvidersView = React.lazy(() => import('./views/DataProvidersView'));
const RenameViewTabView = React.lazy(() => import('./views/RenameViewTabView'));
const ImportConfig = React.lazy(() =>
  import('@starui/workspace-setup-react').then((m) => ({ default: m.ImportConfig })),
);
const WorkspaceSetup = React.lazy(() =>
  import('@starui/workspace-setup-react').then((m) => ({ default: m.WorkspaceSetup })),
);

async function createRuntimeForViews(): Promise<RuntimePort> {
  if (isOpenFin()) {
    return OpenFinRuntime.create();
  }
  return new BrowserRuntime({
    identity: {
      appId: APP_ID,
      userId: LOGGED_IN_USER_ID,
      componentType: 'OpenFinScaffoldDemo',
    },
  });
}

const runtimePromise = createRuntimeForViews();
const configServiceRestUrl = await getConfigServiceRestUrlFromManifest();

function ViewRoutesStarGridShell() {
  const ds = useDataServices();
  const configManager = useMemo(
    () =>
      createConfigManager({
        appId: APP_ID,
        identity: { userId: LOGGED_IN_USER_ID, displayName: LOGGED_IN_USER_ID },
        configServiceRestUrl,
        dataServices: ds,
      }),
    [ds],
  );

  return (
    <StarGridApp
      appId={APP_ID}
      userId={LOGGED_IN_USER_ID}
      persistence="config"
      runtime={runtimePromise}
      configManager={configManager}
    >
      <Outlet />
    </StarGridApp>
  );
}

function ViewRoutesLayout() {
  return (
    <DataServicesProvider services={dataServices} userId={LOGGED_IN_USER_ID}>
      <ViewRoutesStarGridShell />
    </DataServicesProvider>
  );
}

/** Tool windows: SharedWorker only — matches dock actions from initWorkspace(). */
function ToolRoutesLayout() {
  return (
    <DataServicesProvider services={dataServices} userId={LOGGED_IN_USER_ID}>
      <Outlet />
    </DataServicesProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="/platform/provider"
          element={
            <React.Suspense fallback={LOADING}>
              <Provider />
            </React.Suspense>
          }
        />

        <Route element={<ToolRoutesLayout />}>
          <Route
            path="/dataproviders"
            element={
              <React.Suspense fallback={LOADING}>
                <DataProvidersView />
              </React.Suspense>
            }
          />
          <Route
            path="/config-browser"
            element={
              <React.Suspense fallback={LOADING}>
                <ConfigBrowserView />
              </React.Suspense>
            }
          />
          <Route
            path="/import-config"
            element={
              <React.Suspense fallback={LOADING}>
                <ImportConfig />
              </React.Suspense>
            }
          />
          <Route
            path="/workspace-setup"
            element={
              <React.Suspense fallback={LOADING}>
                <WorkspaceSetup />
              </React.Suspense>
            }
          />
          <Route
            path="/rename-view-tab"
            element={
              <React.Suspense fallback={LOADING}>
                <RenameViewTabView />
              </React.Suspense>
            }
          />
        </Route>

        <Route element={<ViewRoutesLayout />}>
          <Route path="/" element={<App />} />
          <Route
            path="/views/blotter"
            element={
              <React.Suspense fallback={LOADING}>
                <BlotterView />
              </React.Suspense>
            }
          />
          <Route
            path="/views/interop"
            element={
              <React.Suspense fallback={LOADING}>
                <InteropView />
              </React.Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);

// SEED_APP_ID is referenced so forkers grep the linkage to seed-config.json.
void SEED_APP_ID;
