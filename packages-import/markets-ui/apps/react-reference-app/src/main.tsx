import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";

// ─── Lazy-loaded route components ────────────────────────────────────
// React.lazy() loads each component only when its route is first visited.
// This keeps the initial bundle small — the provider window never loads
// the dock editor code, and vice versa.

const Provider    = React.lazy(() => import("./platform/Provider"));
const View1       = React.lazy(() => import("./views/View1"));
const View2       = React.lazy(() => import("./views/View2"));
const DockEditor      = React.lazy(() => import("./views/DockEditor"));
const RegistryEditor  = React.lazy(() => import("./views/RegistryEditor"));

// ImportConfig lives in the @markets/dock-editor package (not a local view file).
// The .then() unwraps the named export into the default export shape that
// React.lazy() requires.
const ImportConfig = React.lazy(() =>
  import("@markets/dock-editor").then((m) => ({ default: m.ImportConfig })),
);

// ─── Loading fallback ────────────────────────────────────────────────
// Shown while a lazy-loaded component is being fetched.
// Intentionally minimal — these windows are usually small utility windows
// that appear and close quickly.
const LOADING = <div style={{ padding: 16 }}>Loading...</div>;

// ─── App entry point ─────────────────────────────────────────────────

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Main app shell */}
        <Route path="/" element={<App />} />

        {/* OpenFin platform provider — runs in a hidden window on startup */}
        <Route path="/platform/provider" element={<Provider />} />

        {/* Sample views — launched as OpenFin Views from the dock */}
        <Route path="/views/view1" element={<View1 />} />
        <Route path="/views/view2" element={<View2 />} />

        {/* Utility windows — opened by dock toolbar buttons */}
        <Route path="/dock-editor"       element={<React.Suspense fallback={LOADING}><DockEditor /></React.Suspense>} />
        <Route path="/registry-editor"  element={<React.Suspense fallback={LOADING}><RegistryEditor /></React.Suspense>} />
        <Route path="/import-config"    element={<React.Suspense fallback={LOADING}><ImportConfig /></React.Suspense>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
