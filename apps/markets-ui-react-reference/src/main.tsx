import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
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

// DataProvider persistence routes through `<DataServicesProvider>`
// (which wires `DataProviderConfigStore` against the platform's
// `ConfigManager`). No boot-time gate needed — views resolve their
// own `getConfigManager()` and mount the provider when ready.

// ─── Lazy-loaded route components ────────────────────────────────────
// React.lazy() loads each component only when its route is first visited.
// This keeps the initial bundle small — the provider window never loads
// the dock editor code, and vice versa.

const Provider    = React.lazy(() => import("./platform/Provider"));
const View1       = React.lazy(() => import("./views/View1"));
const View2       = React.lazy(() => import("./views/View2"));
const ConfigBrowser   = React.lazy(() => import("./views/ConfigBrowser"));
const RenameViewTab   = React.lazy(() => import("./views/RenameViewTab"));
// MarketsGrid blotter — hosted at /blotters/marketsgrid. Lazy so the
// AG-Grid bundle (~1 MB) stays out of the shell's initial load.
const BlottersMarketsGrid = React.lazy(() => import("./views/BlottersMarketsGrid"));

// DataProviders admin page — hosts <DataProviderEditor>. Lazy so the
// React-Query + provider-editor bundle stays out of the shell.
const DataProviders = React.lazy(() => import("./views/DataProviders"));

// WorkspaceSetup + ImportConfig live in @starui/workspace-setup-react
// (extracted in Task 4 / PR-3). The legacy /dock-editor and
// /registry-editor routes were removed in Task 5 / PR-4 — those features
// are subsumed by WorkspaceSetup.
const ImportConfig = React.lazy(() =>
  import("@starui/workspace-setup-react").then((m) => ({ default: m.ImportConfig })),
);
const WorkspaceSetup = React.lazy(() =>
  import("@starui/workspace-setup-react").then((m) => ({ default: m.WorkspaceSetup })),
);

// ─── Loading fallback ────────────────────────────────────────────────
// Shown while a lazy-loaded component is being fetched.
// Intentionally minimal — these windows are usually small utility windows
// that appear and close quickly.
const LOADING = <div style={{ padding: 16 }}>Loading...</div>;

// ─── Path C Phase X-3b — runtime + HostWrapper for view routes ───────
//
// The OpenFin platform's `/platform/provider` route runs a hidden
// window that calls `bootstrapPlatform()` to initialize the
// platform's own ConfigManager singleton. That route does NOT need
// HostWrapper context — it IS the bootstrap.
//
// Every OTHER route (views, editors, blotters) is a leaf component
// hosted in its own OpenFin window. Those windows benefit from the
// HostWrapper seam: identity flows from `customData` through
// `OpenFinRuntime.resolveIdentity()`, and the per-window
// ConfigManager is co-located.
//
// Runtime selection: when running inside OpenFin (`isOpenFin()` —
// fin.View is reachable), use `OpenFinRuntime.create()` which awaits
// the view's customData. In a plain browser (dev mode, Playwright,
// or anyone clicking the .vite preview URL directly), fall back to
// BrowserRuntime so the views still render with a sensible identity.
//
// At this stage NO leaf component reads `useHost()` yet. The seam
// is here so future commits can migrate identity reads onto it.
async function createRuntimeForViews(): Promise<RuntimePort> {
  if (isOpenFin()) {
    const rt = await OpenFinRuntime.create();
    return rt;
  }
  return new BrowserRuntime({
    identity: {
      appId: "markets-ui-react-reference",
      userId: "dev1",
      componentType: "MarketsUIReactReference",
    },
  });
}

const runtimePromise = createRuntimeForViews();

// Identity wired into <ConfigServiceProvider>. Reuses the same single-
// user dev placeholder every other module pins to (LOGGED_IN_USER_ID),
// so audit / visibility / impersonation defaults stay consistent
// across windows.
const APP_ID = "markets-ui-react-reference";
const IDENTITY = { userId: LOGGED_IN_USER_ID, displayName: LOGGED_IN_USER_ID };

// REST endpoint for `@starui/config-service-server`. Single source of
// truth: the OpenFin manifest's `customSettings.{useRest, configServiceRestUrl}`
// pair. `getConfigServiceRestUrlFromManifest()` enforces the gate
// (`useRest === true` AND non-empty URL → REST mode; anything else →
// local Dexie only). Out of OpenFin (plain-browser dev), the helper
// returns `undefined` so the app still boots — flipping to REST in
// browser mode is intentionally not supported here, since that path
// lacks the manifest customSettings the rest of the platform reads.
//
// Resolved BEFORE `root.render()` so every `<ConfigServiceProvider>`
// in this window starts with the same value the platform Provider
// window's `initWorkspace()` resolved from the same manifest.
const REST_URL = await getConfigServiceRestUrlFromManifest();

/**
 * `HostWrapperWithProviderClient` — reads the live ConfigManager out
 * of `useConfigService()` (set up by the surrounding ConfigServiceProvider)
 * and derives a stable `ConfigClient` for `<HostWrapper>`.
 *
 * Wrapped via `<AppShell>`'s `hostWrapper` render-prop so the shell's
 * provider order (DataServicesProvider → ConfigServiceProvider →
 * HostWrapper) stays declarative — see `ViewRoutesLayout` below.
 */
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

/**
 * Layout for every non-platform-provider route. `<AppShell>` collapses
 * the provider stack (DataServicesProvider → ConfigServiceProvider →
 * HostWrapper) so this stays declarative. The hidden `/platform/provider`
 * window deliberately stays OUTSIDE — it owns the platform's
 * ConfigManager singleton via `bootstrapPlatform()`.
 */
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

// ─── App entry point ─────────────────────────────────────────────────

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          {/* OpenFin platform provider — runs in a hidden window on
              startup. Does its own bootstrap; NOT wrapped in
              HostWrapper. */}
          <Route path="/platform/provider" element={<Provider />} />

          {/* Every other route — view + editor windows — gets the
              HostWrapper seam via the layout route. */}
          <Route element={<ViewRoutesLayout />}>
            {/* Main app shell */}
            <Route path="/" element={<App />} />

            {/* Sample views — launched as OpenFin Views from the dock */}
            <Route path="/views/view1" element={<View1 />} />
            <Route path="/views/view2" element={<View2 />} />

            {/* Blotters — MarketsGrid hosted inside the reference app.
                DexieAdapter persists profile state locally; theme flows
                through the ambient <ThemeProvider>. */}
            <Route
              path="/blotters/marketsgrid"
              element={
                <React.Suspense fallback={LOADING}>
                  <BlottersMarketsGrid />
                </React.Suspense>
              }
            />

            {/* DataProvider admin — author STOMP / REST / Mock providers
                that any blotter in this app can later bind to. */}
            <Route
              path="/dataproviders"
              element={
                <React.Suspense fallback={LOADING}>
                  <DataProviders />
                </React.Suspense>
              }
            />

            {/* Utility windows — opened by dock toolbar buttons */}
            <Route path="/config-browser"   element={<React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense>} />
            <Route path="/import-config"    element={<React.Suspense fallback={LOADING}><ImportConfig /></React.Suspense>} />
            <Route path="/workspace-setup"  element={<React.Suspense fallback={LOADING}><WorkspaceSetup /></React.Suspense>} />
            <Route path="/rename-view-tab"  element={<React.Suspense fallback={LOADING}><RenameViewTab /></React.Suspense>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
