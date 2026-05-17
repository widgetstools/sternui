import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";
import { applyTheme, getTheme } from "@starui/design-system";
applyTheme(getTheme());

import { AppShell } from "@starui/app-shell-react";
import { HostWrapper } from "@starui/host-wrapper-react";
import { BrowserRuntime } from "@starui/runtime-browser";
import { OpenFinRuntime, isOpenFin } from "@starui/runtime-openfin";
import { createConfigClient } from "@starui/config-service";
import {
  ConfigServiceProvider,
  useConfigService,
} from "@starui/config-service-react";
import { getConfigServiceRestUrlFromManifest } from "@starui/openfin-platform/config";
import { DataServicesProvider } from "@starui/data-services-react/runtime";
import { LOGGED_IN_USER_ID } from "@starui/runtime-port";
import type { RuntimePort } from "@starui/runtime-port";
import { dataServices } from "./dataServices.mainThread";
import { ErrorBoundary } from "./components/ErrorBoundary";

// ─── Lazy-loaded route components ────────────────────────────────────
// React.lazy() loads each component only when its route is first visited.
// The provider window prefetches every chunk on idle so first opens hit
// warm HTTP + V8 caches (see src/platform/Provider.tsx).

const Provider = React.lazy(() => import("./platform/Provider"));
const View1 = React.lazy(() => import("./views/View1"));
const View2 = React.lazy(() => import("./views/View2"));
const ConfigBrowser = React.lazy(() => import("./views/ConfigBrowser"));
const RenameViewTab = React.lazy(() => import("./views/RenameViewTab"));
const BlottersMarketsGrid = React.lazy(() => import("./views/BlottersMarketsGrid"));
const DataProviders = React.lazy(() => import("./views/DataProviders"));
const ImportConfig = React.lazy(() =>
  import("@starui/workspace-setup-react").then((m) => ({ default: m.ImportConfig })),
);
const WorkspaceSetup = React.lazy(() =>
  import("@starui/workspace-setup-react").then((m) => ({ default: m.WorkspaceSetup })),
);
// @starui:add-lazy-import-here

const LOADING = <div style={{ padding: 16 }}>Loading...</div>;

// ─── Runtime + HostWrapper for view routes ───────────────────────────
//
// The OpenFin platform's `/platform/provider` route runs a hidden
// window that calls `initWorkspace()` to initialize the platform's
// own ConfigManager singleton. That route does NOT need HostWrapper
// context — it IS the bootstrap.
//
// Every OTHER route is a leaf component hosted in its own OpenFin
// window. Identity flows from `customData` through
// `OpenFinRuntime.resolveIdentity()`; the per-window ConfigManager
// is co-located.
async function createRuntimeForViews(): Promise<RuntimePort> {
  if (isOpenFin()) {
    return await OpenFinRuntime.create();
  }
  return new BrowserRuntime({
    identity: {
      appId: "{{name}}",
      userId: LOGGED_IN_USER_ID,
      componentType: "{{name}}-view",
    },
  });
}

const runtimePromise = createRuntimeForViews();

const APP_ID = "{{name}}";
const IDENTITY = { userId: LOGGED_IN_USER_ID, displayName: LOGGED_IN_USER_ID };

// REST endpoint for the config service. Single source of truth: the
// OpenFin manifest's `customSettings.{useRest, configServiceRestUrl}`
// pair, resolved by `getConfigServiceRestUrlFromManifest()`.
const REST_URL = await getConfigServiceRestUrlFromManifest();

function HostWrapperWithProviderClient({ children }: { children: React.ReactNode }) {
  const { configManager } = useConfigService();
  const configClient = useMemo(
    () => createConfigClient({ configManager }),
    [configManager],
  );
  return (
    <HostWrapper runtime={runtimePromise} configManager={configClient}>
      {children}
    </HostWrapper>
  );
}

function ViewRoutesLayout() {
  return (
    <AppShell
      runtime={runtimePromise}
      dataServicesProvider={<DataServicesProvider services={dataServices} />}
      configServiceProvider={
        <ConfigServiceProvider identity={IDENTITY} appId={APP_ID} restUrl={REST_URL} />
      }
      hostWrapper={(children) => (
        <HostWrapperWithProviderClient>{children}</HostWrapperWithProviderClient>
      )}
    >
      <Outlet />
    </AppShell>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
        {/* OpenFin platform provider — runs in a hidden window on
            startup. Does its own bootstrap; NOT wrapped in HostWrapper. */}
        <Route
          path="/platform/provider"
          element={
            <React.Suspense fallback={LOADING}>
              <Provider />
            </React.Suspense>
          }
        />

        {/* Every other route — view + editor windows — gets the
            HostWrapper seam via the layout route. */}
        <Route element={<ViewRoutesLayout />}>
          {/* Main app shell — landing page */}
          <Route path="/" element={<App />} />

          {/* Sample views — launched as OpenFin Views from the dock */}
          <Route
            path="/views/view1"
            element={<React.Suspense fallback={LOADING}><View1 /></React.Suspense>}
          />
          <Route
            path="/views/view2"
            element={<React.Suspense fallback={LOADING}><View2 /></React.Suspense>}
          />

          {/* MarketsGrid blotter — hosted inside the reference app. */}
          <Route
            path="/blotters/marketsgrid"
            element={
              <React.Suspense fallback={LOADING}>
                <BlottersMarketsGrid />
              </React.Suspense>
            }
          />

          {/* DataProvider admin — author STOMP / REST / Mock / AppData
              providers that any blotter can later bind to. */}
          <Route
            path="/dataproviders"
            element={
              <React.Suspense fallback={LOADING}>
                <DataProviders />
              </React.Suspense>
            }
          />

          {/* Utility windows — opened by dock toolbar buttons */}
          <Route
            path="/config-browser"
            element={<React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense>}
          />
          <Route
            path="/import-config"
            element={<React.Suspense fallback={LOADING}><ImportConfig /></React.Suspense>}
          />
          <Route
            path="/workspace-setup"
            element={<React.Suspense fallback={LOADING}><WorkspaceSetup /></React.Suspense>}
          />
          <Route
            path="/rename-view-tab"
            element={<React.Suspense fallback={LOADING}><RenameViewTab /></React.Suspense>}
          />

          {/* @starui:add-route-here */}
        </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
