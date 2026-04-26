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
    // Cast: this app's tsconfig pins `types` to fin/fdc3/svg only, so
    // `vite/client` types aren't ambient — narrow the access locally.
    const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;

    // Initialise the platform first; only AFTER initWorkspace() has fully
    // resolved (which means @openfin/workspace-platform's init() has
    // returned and `WorkspacePlatform.getCurrentSync()` is usable) install
    // the e2e test bridge. Without this chaining, out-of-runtime e2e
    // specs would race the platform-api-ready signal and see
    // "The targeted Platform is not currently running" on their first
    // Storage.getWorkspaces() call.
    initWorkspace({
      dockIcon: "http://localhost:5174/dock-provider.png",
      onProgress: setMessage,
      roles: ["admin", "developer"],
      components: { home: false, store: false },
    })
      .then(() => {
        if (!isDev) return undefined;
        // Test bridge is dev-only — code-split out of production builds.
        // Exposes a small set of WorkspacePlatform.Storage operations over
        // an OpenFin Channel so out-of-runtime test code (e2e-openfin/)
        // can drive saved-workspace lifecycle. See e2e-openfin/README.md.
        return import("../test-bridge/install").then((m) => m.installTestBridge());
      })
      .catch((err) => {
        console.error("Failed to initialize workspace platform:", err);
      });
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
