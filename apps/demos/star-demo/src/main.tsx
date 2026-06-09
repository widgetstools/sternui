import React, { Suspense, use } from "react";
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
  initPlatformBootstrap,
  PlatformBootstrapProvider,
  type PlatformBootstrapResult,
} from "./platformBootstrap";

const Provider            = React.lazy(() => import("./platform/Provider"));
const ConfigBrowser       = React.lazy(() => import("./views/ConfigBrowser"));
const RenameViewTab       = React.lazy(() => import("./views/RenameViewTab"));
const BlottersMarketsGrid = React.lazy(() => import("./views/BlottersMarketsGrid"));
const DataProviders       = React.lazy(() => import("./views/DataProviders"));

const WorkspaceSetup = React.lazy(() =>
  import("@starui/workspace-setup-react").then((m) => ({ default: m.WorkspaceSetup })),
);

const LOADING = <div style={{ padding: 16 }}>Loading...</div>;

const bootstrapPromise = initPlatformBootstrap();

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

function ViewRoutesLayout({ boot }: { boot: PlatformBootstrapResult }) {
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

function AppTree({ boot }: { boot: PlatformBootstrapResult }) {
  return (
    <PlatformBootstrapProvider value={boot}>
      <DataHubProvider platform={boot.platform} userId={boot.config.userId}>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path="/platform/provider" element={<Provider />} />

            <Route element={<Outlet />}>
              <Route path="/dataproviders" element={<React.Suspense fallback={LOADING}><DataProviders /></React.Suspense>} />
              <Route path="/config-browser" element={<React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense>} />
              <Route path="/workspace-setup" element={<React.Suspense fallback={LOADING}><WorkspaceSetup /></React.Suspense>} />
              <Route path="/rename-view-tab" element={<React.Suspense fallback={LOADING}><RenameViewTab /></React.Suspense>} />
            </Route>

            <Route element={<ViewRoutesLayout boot={boot} />}>
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
      </DataHubProvider>
    </PlatformBootstrapProvider>
  );
}

function BootstrapRoot() {
  const boot = use(bootstrapPromise);
  return <AppTree boot={boot} />;
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <Suspense fallback={LOADING}>
      <BootstrapRoot />
    </Suspense>
  </React.StrictMode>,
);
