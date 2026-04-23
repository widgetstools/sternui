import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import "./index.css";
// ─── Lazy-loaded route components ────────────────────────────────────
// React.lazy() loads each component only when its route is first visited.
// This keeps the initial bundle small — the provider window never loads
// the dock editor code, and vice versa.
const Provider = React.lazy(() => import("./platform/Provider"));
const View1 = React.lazy(() => import("./views/View1"));
const View2 = React.lazy(() => import("./views/View2"));
const DockEditor = React.lazy(() => import("./views/DockEditor"));
const RegistryEditor = React.lazy(() => import("./views/RegistryEditor"));
// ImportConfig lives in the @marketsui/dock-editor package (not a local view file).
// The .then() unwraps the named export into the default export shape that
// React.lazy() requires.
const ImportConfig = React.lazy(() => import("@marketsui/dock-editor").then((m) => ({ default: m.ImportConfig })));
// ─── Loading fallback ────────────────────────────────────────────────
// Shown while a lazy-loaded component is being fetched.
// Intentionally minimal — these windows are usually small utility windows
// that appear and close quickly.
const LOADING = _jsx("div", { style: { padding: 16 }, children: "Loading..." });
// ─── App entry point ─────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(_jsx(React.StrictMode, { children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(App, {}) }), _jsx(Route, { path: "/platform/provider", element: _jsx(Provider, {}) }), _jsx(Route, { path: "/views/view1", element: _jsx(View1, {}) }), _jsx(Route, { path: "/views/view2", element: _jsx(View2, {}) }), _jsx(Route, { path: "/dock-editor", element: _jsx(React.Suspense, { fallback: LOADING, children: _jsx(DockEditor, {}) }) }), _jsx(Route, { path: "/registry-editor", element: _jsx(React.Suspense, { fallback: LOADING, children: _jsx(RegistryEditor, {}) }) }), _jsx(Route, { path: "/import-config", element: _jsx(React.Suspense, { fallback: LOADING, children: _jsx(ImportConfig, {}) }) })] }) }) }));
//# sourceMappingURL=main.js.map