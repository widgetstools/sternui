import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { initWorkspace } from "@marketsui/openfin-platform";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
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
function Provider() {
    const [message, setMessage] = useState("");
    useEffect(() => {
        // Wrap in try/catch so any initialization error surfaces in the console
        // rather than crashing the window silently.
        try {
            initWorkspace({
                // The icon shown at the left end of the dock bar.
                dockIcon: "http://localhost:5174/dock-provider.png",
                // Theme toggle icons default to the built-in sun/moon SVGs from
                // @marketsui/openfin-platform. Override here if you want custom ones.
                // themeToggleDarkIcon: "...",
                // themeToggleLightIcon: "...",
                // Progress callback — updates the status message shown below.
                onProgress: setMessage,
                // User roles — controls which system buttons are shown in the dock
                // (e.g. only admin/developer see the Dock Editor button).
                roles: ["admin", "developer"],
                // Home (search bar) and Store are disabled for this reference app
                // because they require additional manifest configuration to be useful.
                // Remove these lines to re-enable them.
                components: {
                    home: false,
                    store: false,
                },
            });
        }
        catch (err) {
            console.error("Failed to initialize workspace platform:", err);
        }
    }, []); // Empty array — run once on mount, never again
    return (_jsxs("div", { className: "flex flex-col flex-1 gap-5", children: [_jsx("header", { className: "flex flex-row justify-between items-center", children: _jsxs("div", { className: "flex flex-col", children: [_jsx("h1", { className: "text-xl font-bold", children: "OpenFin Platform Window" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "Workspace platform window" })] }) }), _jsx("main", { className: "flex flex-col gap-2.5", children: _jsxs(Card, { children: [_jsxs(CardHeader, { children: [_jsx(CardTitle, { children: "Platform Provider" }), _jsx(CardDescription, { children: "This window initializes the platform" })] }), _jsxs(CardContent, { children: [_jsx("p", { children: "The window would usually be hidden. Set the platform.autoShow flag to false in manifest.fin.json to hide it on startup." }), _jsx("p", { className: "mt-2 font-medium", children: message })] })] }) })] }));
}
export default Provider;
//# sourceMappingURL=Provider.js.map