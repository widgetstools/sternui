import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";
import { applyTheme, getTheme } from "@starui/design-system";
applyTheme(getTheme());

import { StarGridApp } from "@starui/app";
import { BrowserRuntime } from "@starui/host-browser";
import { OpenFinRuntime, isOpenFin } from "@starui/host-openfin";
import { createConfigManager } from "@starui/host-config";
import { getConfigServiceRestUrlFromManifest } from "@starui/openfin-platform/config";
import {
  DataServicesProvider,
  useDataServices,
} from "@starui/host-data-react/runtime";
import { LOGGED_IN_USER_ID } from "@starui/types";
import type { RuntimePort } from "@starui/host";
import { dataServices } from "./dataServices.mainThread";

const Provider    = React.lazy(() => import("./platform/Provider"));
const View1       = React.lazy(() => import("./views/View1"));
const View2       = React.lazy(() => import("./views/View2"));
const ConfigBrowser   = React.lazy(() => import("./views/ConfigBrowser"));
const RenameViewTab   = React.lazy(() => import("./views/RenameViewTab"));
const BlottersMarketsGrid = React.lazy(() => import("./views/BlottersMarketsGrid"));
const DataProviders = React.lazy(() => import("./views/DataProviders"));

const ImportConfig = React.lazy(() =>
  import("@starui/workspace-setup-react").then((m) => ({ default: m.ImportConfig })),
);
const WorkspaceSetup = React.lazy(() =>
  import("@starui/workspace-setup-react").then((m) => ({ default: m.WorkspaceSetup })),
);

const LOADING = <div style={{ padding: 16 }}>Loading...</div>;

async function createRuntimeForViews(): Promise<RuntimePort> {
  if (isOpenFin()) {
    return OpenFinRuntime.create();
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

const APP_ID = "markets-ui-react-reference";
const IDENTITY = { userId: LOGGED_IN_USER_ID, displayName: LOGGED_IN_USER_ID };

const REST_URL = await getConfigServiceRestUrlFromManifest();

function ViewRoutesStarGridShell() {
  const ds = useDataServices();
  const configManager = useMemo(
    () =>
      createConfigManager({
        appId: APP_ID,
        identity: IDENTITY,
        configServiceRestUrl: REST_URL,
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

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/platform/provider" element={<Provider />} />
        {/* Tool windows — DataServices only; no StarGridApp shell. */}
        <Route
          element={
            <DataServicesProvider services={dataServices} userId={LOGGED_IN_USER_ID}>
              <Outlet />
            </DataServicesProvider>
          }
        >
          <Route
            path="/dataproviders"
            element={
              <React.Suspense fallback={LOADING}>
                <DataProviders />
              </React.Suspense>
            }
          />
          <Route path="/config-browser" element={<React.Suspense fallback={LOADING}><ConfigBrowser /></React.Suspense>} />
          <Route path="/import-config" element={<React.Suspense fallback={LOADING}><ImportConfig /></React.Suspense>} />
          <Route path="/workspace-setup" element={<React.Suspense fallback={LOADING}><WorkspaceSetup /></React.Suspense>} />
          <Route path="/rename-view-tab" element={<React.Suspense fallback={LOADING}><RenameViewTab /></React.Suspense>} />
        </Route>
        <Route element={<ViewRoutesLayout />}>
          <Route path="/" element={<App />} />
          <Route path="/views/view1" element={<View1 />} />
          <Route path="/views/view2" element={<View2 />} />
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
  </React.StrictMode>,
);
