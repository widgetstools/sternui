import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";

import { HostWrapper } from "@marketsui/host-wrapper-react";
import { BrowserRuntime } from "@marketsui/runtime-browser";
import { OpenFinRuntime, isOpenFin } from "@marketsui/runtime-openfin";
import { createConfigClient } from "@marketsui/config-service";
import type { RuntimePort } from "@marketsui/runtime-port";

// DataProvider persistence in v2 routes through `<DataPlaneProvider>`
// (which wires the v2 `DataProviderConfigStore` against the platform's
// `ConfigManager`). No boot-time gate needed — views resolve their
// own `getConfigManager()` and mount the provider when ready.

// ─── Lazy-loaded route components ────────────────────────────────────
// React.lazy() loads each component only when its route is first visited.
// This keeps the initial bundle small — the provider window never loads
// the dock editor code, and vice versa.

const Provider    = React.lazy(() => import("./platform/Provider"));
const View1       = React.lazy(() => import("./views/View1"));
const View2       = React.lazy(() => import("./views/View2"));
const DockEditor      = React.lazy(() => import("./views/DockEditor"));
const RegistryEditor  = React.lazy(() => import("./views/RegistryEditor"));
const ConfigBrowser   = React.lazy(() => import("./views/ConfigBrowser"));
// MarketsGrid blotter — hosted at /blotters/marketsgrid. Lazy so the
// AG-Grid bundle (~1 MB) stays out of the shell's initial load.
const BlottersMarketsGrid = React.lazy(() => import("./views/BlottersMarketsGrid"));

// DataProviders admin page — hosts <DataProviderEditor>. Lazy so the
// React-Query + provider-editor bundle stays out of the shell.
const DataProviders = React.lazy(() => import("./views/DataProviders"));

// ImportConfig lives in the @marketsui/dock-editor package (not a local view file).
// The .then() unwraps the named export into the default export shape that
// React.lazy() requires.
const ImportConfig = React.lazy(() =>
  import("@marketsui/dock-editor").then((m) => ({ default: m.ImportConfig })),
);

// WorkspaceSetup — the unified Components + Dock + Inspector editor
// (Phase 6). Same lazy-import pattern as ImportConfig. Hosts at
// /workspace-setup; the dock launches it via ACTION_OPEN_WORKSPACE_SETUP.
const WorkspaceSetup = React.lazy(() =>
  import("@marketsui/dock-editor").then((m) => ({ default: m.WorkspaceSetup })),
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
    return OpenFinRuntime.create();
  }
  return new BrowserRuntime({
    identity: {
      appId: "markets-ui-react-reference",
      userId: "dev-user",
      componentType: "MarketsUIReactReference",
    },
  });
}

const runtimePromise = createRuntimeForViews();
const configManager = createConfigClient({});

function ViewRoutesLayout() {
  return (
    <HostWrapper runtime={runtimePromise} configManager={configManager}>
      <Outlet />
    </HostWrapper>
  );
}

// ─── App entry point ─────────────────────────────────────────────────

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
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
            <Route path="/dock-editor"       element={<React.Suspense fallback={LOADING}><DockEditor /></React.Suspense>} />
            <Route path="/registry-editor"  element={<React.Suspense fallback={LOADING}><RegistryEditor /></React.Suspense>} />
            <Route path="/config-browser"   element={<React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense>} />
            <Route path="/import-config"    element={<React.Suspense fallback={LOADING}><ImportConfig /></React.Suspense>} />
            <Route path="/workspace-setup"  element={<React.Suspense fallback={LOADING}><WorkspaceSetup /></React.Suspense>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
