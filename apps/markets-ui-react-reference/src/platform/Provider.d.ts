/**
 * Provider — the OpenFin platform provider window.
 *
 * This is the first window that OpenFin loads. It calls initWorkspace()
 * to start the platform, register the dock, home, store, and notifications,
 * and set up all custom action handlers.
 *
 * In production you would set `platform.autoShow: false` in manifest.fin.json
 * to keep this window hidden. In development, autoShow: true lets you see
 * the progress messages and inspect the window in DevTools.
 */
declare function Provider(): import("react/jsx-runtime").JSX.Element;
export default Provider;
//# sourceMappingURL=Provider.d.ts.map