import React, { Suspense, use, useEffect, useState, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Outlet, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";
import { applyTheme, getTheme } from "@wellsfargo-starui/design-system";
applyTheme(getTheme());

import { StarGridApp } from "@wellsfargo-starui/app";
import { BrowserRuntime } from "@wellsfargo-starui/host-browser";
import { OpenFinRuntime, isOpenFin } from "@wellsfargo-starui/host-openfin";
import { useOpenFinThemeSync } from "./useOpenFinThemeSync";
import { DataHubProvider } from "@wellsfargo-starui/host-data-react/runtime";
import type { RuntimePort } from "@wellsfargo-starui/host";
import {
  initConfigBootstrap,
  initPlatformBootstrap,
  PlatformBootstrapProvider,
  usePlatformBootstrap,
  type PlatformBootstrapResult,
} from "./platformBootstrap";

/**
 * star-demo route gates — ADR optional data-plane topology.
 *
 * Problem we fixed (Phase 0): every OpenFin tool window used to await the full
 * SharedWorker hub (`FullGate` / `ensurePlatformReady`) before paint. Config
 * Browser and Workspace Setup do not need streaming providers; forcing the hub
 * competed with live fan-out and slowed new windows.
 *
 * What changed
 * ------------
 * 1. Hash-aware warm-up (`resolveInitialRoute`) — HashRouter puts the path in
 *    `location.hash`; pathname-only warm incorrectly started the data hub for
 *    every tool window.
 * 2. Three gates instead of one FullGate for all routes:
 *    • ConfigGate       — P1: Config (+ Config/AppData SWs via platformBootstrap)
 *    • DeferredDataGate — config paint first, then hub (Data Providers editor)
 *    • FullGate         — P2: blotters that need DataHubProvider immediately
 * 3. Catalog edits from Config Browser reach a running hub via ChangeNotifier →
 *    blotter `wireWorkerCatalogSync` (no FullGate on the editor window).
 *
 * Phase 2–3 worker URLs live in `platformBootstrap.tsx`, not here.
 * Phase 4 per-provider SWs are not demo-default yet (still monolith hub).
 */

const Provider            = React.lazy(() => import("./platform/Provider"));
const ConfigBrowser       = React.lazy(() => import("./views/ConfigBrowser"));
const RenameViewTab       = React.lazy(() => import("./views/RenameViewTab"));
/** Start downloading+parsing the MarketsGrid route chunk in parallel with platform bootstrap. */
const blottersMarketsGridChunk = import("./views/BlottersMarketsGrid");
const BlottersMarketsGrid = React.lazy(() => blottersMarketsGridChunk);
const DataProviders       = React.lazy(() => import("./views/DataProviders"));

const WorkspaceSetup = React.lazy(() =>
  import("@wellsfargo-starui/workspace-setup-react").then((m) => ({ default: m.WorkspaceSetup })),
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

// ── Module-scope warm (fire-and-forget) ─────────────────────────────
// Match the bootstrap tier to the window's *initial* route so we do not
// spawn `mkt-data-services` for Config-only tools. Catalog invalidation
// for Config Browser edits reaches a running hub via ConfigManager
// ChangeNotifier → blotter `wireWorkerCatalogSync` (cross-window).
const initialRoute = resolveInitialRoute();
if (initialRoute.startsWith("/rename-view-tab")) {
  // Pure fin dialog — neither ConfigManager nor data plane.
} else if (
  initialRoute.startsWith("/workspace-setup") ||
  initialRoute.startsWith("/config-browser")
) {
  // P1 — Config + Config/AppData SharedWorkers only (no data hub).
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
  // Blotters / home — full P2 platform bootstrap.
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

/**
 * P1 gate — suspend until ConfigManager (+ Phase 2–3 workers) is ready.
 * Does not connect the monolith data hub. Used by Config Browser, Workspace
 * Setup, and the provider dock shell.
 */
function ConfigGate({ children }: { children: ReactNode }) {
  use(initConfigBootstrap());
  return children;
}

/**
 * P2 gate — suspend until config + monolith SharedWorker hub are ready, then
 * mount DataHubProvider. Used by MarketsGrid blotter routes that need live
 * subscribe before first paint of the grid shell.
 */
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
 * Paint-then-hydrate (ADR R2) — config-ready chrome first; connect the data
 * hub without blocking the first interactive shell. Data Providers needs
 * DataHubProvider for the editor, but must not wait on hub connect before
 * showing UI (was a FullGate regression before Phase 0).
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
        {/* ── ADR route → gate map (Phase 0) ─────────────────────────
            Config-only windows must NOT use FullGate. RenameViewTab is
            pure fin APIs + UI and needs no bootstrap at all. */}
        <Route path="/rename-view-tab" element={<React.Suspense fallback={LOADING}><RenameViewTab /></React.Suspense>} />
        <Route path="/workspace-setup" element={<ConfigGate><React.Suspense fallback={LOADING}><WorkspaceSetupRoute /></React.Suspense></ConfigGate>} />

        {/* Provider dock: ConfigGate for paint; module-scope also warms the
            hub so the SharedWorker survives grid window close/reopen. */}
        <Route path="/platform/provider" element={<ConfigGate><React.Suspense fallback={LOADING}><Provider /></React.Suspense></ConfigGate>} />

        {/* Config Browser — ConfigManager + Config/AppData SWs only.
            Provider-row edits invalidate a running hub via cross-window
            ChangeNotifier → wireWorkerCatalogSync on blotter windows
            (never FullGate here — ADR Phase 0 / R2). */}
        <Route path="/config-browser" element={<ConfigGate><React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense></ConfigGate>} />

        {/* Data Providers editor — DeferredDataGate (config chrome, then hub). */}
        <Route path="/dataproviders" element={<DeferredDataGate><React.Suspense fallback={LOADING}><DataProviders /></React.Suspense></DeferredDataGate>} />

        {/* Blotters — FullGate + DataHubProvider (monolith hub until Phase 4d). */}
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
