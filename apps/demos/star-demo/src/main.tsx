import React, { Suspense, use, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";
import { applyTheme, getTheme } from "@starui/design-system";
applyTheme(getTheme());

import { StarGridApp } from "@starui/app";
import { BrowserRuntime } from "@starui/host-browser";
import { OpenFinRuntime, isOpenFin } from "@starui/host-openfin";
import { DataHubProvider } from "@starui/host-data-react/runtime";
import type { RuntimePort } from "@starui/host";
import {
  initConfigBootstrap,
  initPlatformBootstrap,
  PlatformBootstrapProvider,
  usePlatformBootstrap,
  type PlatformBootstrapResult,
} from "./platformBootstrap";

const Provider            = React.lazy(() => import("./platform/Provider"));
const ConfigBrowser       = React.lazy(() => import("./views/ConfigBrowser"));
const RenameViewTab       = React.lazy(() => import("./views/RenameViewTab"));
/** Start downloading+parsing the MarketsGrid route chunk in parallel with platform bootstrap. */
const blottersMarketsGridChunk = import("./views/BlottersMarketsGrid");
const BlottersMarketsGrid = React.lazy(() => blottersMarketsGridChunk);
const DataProviders       = React.lazy(() => import("./views/DataProviders"));

const WorkspaceSetup = React.lazy(() =>
  import("@starui/workspace-setup-react").then((m) => ({ default: m.WorkspaceSetup })),
);

const LOADING = <div style={{ padding: 16 }}>Loading...</div>;

// Warm platform bootstrap for every route except pure-fin dialogs.
// Config-only and data-plane windows share the worker ConfigManager.
const initialPath = typeof window !== "undefined" ? window.location.pathname : "";
if (!initialPath.startsWith("/rename-view-tab")) {
  void initPlatformBootstrap();
}

/** Warm AG Grid vendor chunks while bootstrap runs (no-op if route chunk already started). */
if (typeof window !== "undefined" && window.location.pathname.includes("/blotters/marketsgrid")) {
  void Promise.all([
    import("ag-grid-community"),
    import("ag-grid-enterprise"),
    import("ag-grid-react"),
  ]).catch(() => { /* dev-only prebundle warm-up */ });
}

/** Suspend on the config-only bootstrap (worker config facade, no DataHubProvider). */
function ConfigGate({ children }: { children: ReactNode }) {
  use(initConfigBootstrap());
  return children;
}

/** Suspend on the full bootstrap (config + SharedWorker data hub). */
function FullGate({ children }: { children: ReactNode }) {
  const boot = use(initPlatformBootstrap());
  return (
    <PlatformBootstrapProvider value={boot}>
      <DataHubProvider platform={boot.platform} userId={boot.config.userId}>
        {children}
      </DataHubProvider>
    </PlatformBootstrapProvider>
  );
}

async function createRuntimeForViews(config: PlatformBootstrapResult['config']): Promise<RuntimePort> {
  if (isOpenFin()) {
    return OpenFinRuntime.create();
  }
  return new BrowserRuntime({
    identity: {
      appId: config.appId,
      userId: config.userId,
      componentType: "StarDemo",
    },
  });
}

function ViewRoutesLayout() {
  const boot = usePlatformBootstrap();
  const runtimePromise = React.useMemo(
    () => createRuntimeForViews(boot.config),
    [boot.config.appId, boot.config.userId],
  );

  return (
    <StarGridApp
      appId={boot.config.appId}
      userId={boot.config.userId}
      persistence="config"
      runtime={runtimePromise}
      configManager={boot.platform.configManager}
    >
      <Outlet />
    </StarGridApp>
  );
}

function AppTree() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        {/* Config-only windows — worker config facade, no DataHubProvider. */}
        <Route path="/rename-view-tab" element={<React.Suspense fallback={LOADING}><RenameViewTab /></React.Suspense>} />
        <Route path="/workspace-setup" element={<ConfigGate><React.Suspense fallback={LOADING}><WorkspaceSetup /></React.Suspense></ConfigGate>} />

        {/* Provider window: dock + platform init use peekConfigManager from bootstrap. */}
        <Route path="/platform/provider" element={<ConfigGate><React.Suspense fallback={LOADING}><Provider /></React.Suspense></ConfigGate>} />

        {/* Data-plane windows — full bootstrap. Config Browser reads/writes
            via the worker ConfigManager (no main-thread Dexie). */}
        <Route path="/dataproviders" element={<FullGate><React.Suspense fallback={LOADING}><DataProviders /></React.Suspense></FullGate>} />
        <Route path="/config-browser" element={<FullGate><React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense></FullGate>} />

        <Route element={<FullGate><ViewRoutesLayout /></FullGate>}>
          <Route path="/" element={<App />} />
          <Route
            path="/blotters/marketsgrid"
            element={
              <React.Suspense fallback={LOADING}>
                <BlottersMarketsGrid />
              </React.Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <Suspense fallback={LOADING}>
      <AppTree />
    </Suspense>
  </React.StrictMode>,
);
