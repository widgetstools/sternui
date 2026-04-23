import { useEffect, useState } from "react";
import { initWorkspace } from "@markets/openfin-workspace";
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
        // @markets/openfin-workspace. Override here if you want custom ones.
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
    } catch (err) {
      console.error("Failed to initialize workspace platform:", err);
    }
  }, []); // Empty array — run once on mount, never again

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">OpenFin Platform Window</h1>
          <p className="text-sm text-muted-foreground">Workspace platform window</p>
        </div>
      </header>
      <main className="flex flex-col gap-2.5">
        <Card>
          <CardHeader>
            <CardTitle>Platform Provider</CardTitle>
            <CardDescription>This window initializes the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <p>
              The window would usually be hidden. Set the platform.autoShow flag to false in
              manifest.fin.json to hide it on startup.
            </p>
            <p className="mt-2 font-medium">{message}</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default Provider;
