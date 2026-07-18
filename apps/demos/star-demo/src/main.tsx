import React, { Suspense, use, useEffect, useState, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Outlet, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";
import { applyTheme, getTheme } from "@starui/design-system";
applyTheme(getTheme());

import { StarGridApp } from "@starui/app";
import { BrowserRuntime } from "@starui/host-browser";
import { OpenFinRuntime, isOpenFin } from "@starui/host-openfin";
import { useOpenFinThemeSync } from "./useOpenFinThemeSync";
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

/**
 * HashRouter puts the route in `location.hash` (`#/config-browser`), so
 * `pathname` is usually `/`. OpenFin tool windows open that way — using
 * pathname alone incorrectly warmed the full SharedWorker hub for every
 * tool window (ADR Phase 0 / R2).
 */
function resolveInitialRoute(): string {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("/")) {
    const path = hash.split("?")[0] ?? hash;
    return path.length > 0 ? path : "/";
  }
  return window.location.pathname || "/";
}

// Warm only the bootstrap tier this window's initial route needs.
// Catalog invalidation for Config Browser edits reaches a running hub via
// ConfigManager ChangeNotifier → blotter `wireWorkerCatalogSync` (cross-window).
const initialRoute = resolveInitialRoute();
if (initialRoute.startsWith("/rename-view-tab")) {
  // pure-fin dialog — needs neither config rows nor the data plane
} else if (
  initialRoute.startsWith("/workspace-setup") ||
  initialRoute.startsWith("/config-browser")
) {
  void initConfigBootstrap();
} else if (initialRoute.startsWith("/dataproviders")) {
  // Config first (fast paint); hub warms in the background for the editor.
  void initConfigBootstrap();
  void initPlatformBootstrap();
} else if (initialRoute.startsWith("/platform/provider")) {
  // Dock paints on ConfigGate; keep hub warm across grid close/reopen.
  void initConfigBootstrap();
  void initPlatformBootstrap();
} else {
  void initPlatformBootstrap();
}

/** Warm AG Grid vendor chunks while bootstrap runs (no-op if route chunk already started). */
if (typeof window !== "undefined" && initialRoute.includes("/blotters/marketsgrid")) {
  void Promise.all([
    import("ag-grid-community"),
    import("ag-grid-enterprise"),
    import("ag-grid-react"),
  ]).catch(() => { /* dev-only prebundle warm-up */ });
}

/** Suspend on the config-only bootstrap (ConfigManager, no data hub). */
function ConfigGate({ children }: { children: ReactNode }) {
  use(initConfigBootstrap());
  return children;
}

/** Suspend on the full bootstrap (config + SharedWorker data hub). */
function FullGate({ children }: { children: ReactNode }) {
  const boot = use(initPlatformBootstrap());
  return (
    <PlatformBootstrapProvider value={boot}>
      <DataHubProvider platform={boot.platform} userId={boot.config.userId} hubInspector={false}>
        {children}
      </DataHubProvider>
    </PlatformBootstrapProvider>
  );
}

/**
 * Paint after config is ready; hydrate the SharedWorker hub without blocking
 * the first interactive shell (ADR R2 paint-then-hydrate). Used by Data
 * Providers — the editor needs DataHubProvider, but the window must not wait
 * on hub connect before showing chrome.
 */
function DeferredDataGate({ children }: { children: ReactNode }) {
  use(initConfigBootstrap());
  const [boot, setBoot] = useState<PlatformBootstrapResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void initPlatformBootstrap().then((result) => {
      if (!cancelled) setBoot(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!boot) {
    return <div style={{ padding: 16 }}>Connecting data services…</div>;
  }

  return (
    <PlatformBootstrapProvider value={boot}>
      <DataHubProvider platform={boot.platform} userId={boot.config.userId} hubInspector={false}>
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
    <HashRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        {/* Config-only windows — no data hub. RenameViewTab is pure fin
            APIs + UI primitives and needs no bootstrap at all. */}
        <Route path="/rename-view-tab" element={<React.Suspense fallback={LOADING}><RenameViewTab /></React.Suspense>} />
        <Route path="/workspace-setup" element={<ConfigGate><React.Suspense fallback={LOADING}><WorkspaceSetupRoute /></React.Suspense></ConfigGate>} />

        {/* Provider window: dock + platform init only need the ConfigManager
            (initWorkspace picks it up via peekConfigManager). The full hub
            bootstrap is warmed in the background at module scope, keeping
            the SharedWorker alive across grid-window close/reopen. */}
        <Route path="/platform/provider" element={<ConfigGate><React.Suspense fallback={LOADING}><Provider /></React.Suspense></ConfigGate>} />

        {/* Config Browser — ConfigManager only. Provider-row edits invalidate
            a running hub via cross-window ChangeNotifier → wireWorkerCatalogSync
            on blotter windows (ADR Phase 0 / R2). */}
        <Route path="/config-browser" element={<ConfigGate><React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense></ConfigGate>} />

        {/* Data Providers — config-first paint, then hub for the editor. */}
        <Route path="/dataproviders" element={<DeferredDataGate><React.Suspense fallback={LOADING}><DataProviders /></React.Suspense></DeferredDataGate>} />

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
    </HashRouter>
  );
}

/** Workspace-setup mounts outside StarGridApp/OpenFinRuntime, so it subscribes
 *  to the dock theme toggle directly (otherwise it freezes on the boot theme). */
function WorkspaceSetupRoute() {
  useOpenFinThemeSync();
  return <WorkspaceSetup />;
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <Suspense fallback={LOADING}>
      <AppTree />
    </Suspense>
  </React.StrictMode>,
);
