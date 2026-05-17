import { useEffect, useState } from "react";
import * as Notifications from "@openfin/notifications";
import { initWorkspace } from "@starui/openfin-platform";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";

/**
 * Provider — the OpenFin platform provider window.
 *
 * First window OpenFin loads. Calls `initWorkspace()` from
 * `@starui/openfin-platform` to start the platform, register the dock,
 * set up custom action handlers, and (on idle) prefetch every
 * tool-window route chunk so first opens hit warm HTTP + V8 caches.
 *
 * In production, set `platform.autoShow: false` in manifest.fin.json
 * to keep this window hidden. In development, autoShow: true lets you
 * see the progress messages and inspect the window in DevTools.
 */

// Each entry lazy-imports the same chunk a route would load. Names mirror
// the route component names so console log lines up with what the user opens.
const TOOL_WINDOW_CHUNK_LOADERS: Record<string, () => Promise<unknown>> = {
  DataProviders: () => import("../views/DataProviders"),
  ConfigBrowser: () => import("../views/ConfigBrowser"),
  BlottersMarketsGrid: () => import("../views/BlottersMarketsGrid"),
  WorkspaceSetupReact: () => import("@starui/workspace-setup-react"),
  RenameViewTab: () => import("../views/RenameViewTab"),
  // @starui:add-prefetch-here
};

async function prefetchToolWindowChunks(): Promise<void> {
  const start = performance.now();
  const entries = Object.entries(TOOL_WINDOW_CHUNK_LOADERS);
  const results = await Promise.allSettled(entries.map(([, load]) => load()));
  const elapsedMs = Math.round(performance.now() - start);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const failures = entries
    .map(([name], i) => [name, results[i]] as const)
    .filter(([, r]) => r.status === "rejected")
    .map(([name, r]) => ({ name, reason: (r as PromiseRejectedResult).reason }));

  if (failures.length) {
    console.warn(
      `[provider] prefetched ${fulfilled}/${entries.length} tool-window chunks in ${elapsedMs}ms — ${failures.length} failed:`,
      failures,
    );
  } else {
    console.info(
      `[provider] prefetched ${fulfilled}/${entries.length} tool-window chunks in ${elapsedMs}ms`,
    );
  }

  if (typeof fin === "undefined") return;
  try {
    await Notifications.create({
      platform: fin.me.identity.uuid,
      title: failures.length ? "Tool windows partially ready" : "Tool windows ready",
      body: `Prefetched ${fulfilled}/${entries.length} chunks in ${elapsedMs} ms`,
      toast: "transient",
    });
  } catch (err) {
    console.warn("[provider] failed to send prefetch notification:", err);
  }
}

function scheduleIdle(cb: () => void): void {
  type IdleAPI = {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
  };
  const w = window as unknown as IdleAPI;
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(() => cb(), { timeout: 4000 });
  } else {
    setTimeout(cb, 1500);
  }
}

function Provider() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    initWorkspace({
      dockIcon: "http://localhost:{{port}}/dock-provider.png",
      onProgress: setMessage,
      roles: ["admin", "developer"],
      components: { home: false, store: false },
    })
      .then(() => {
        scheduleIdle(() => {
          void prefetchToolWindowChunks();
        });
      })
      .catch((err) => {
        console.error("Failed to initialize workspace platform:", err);
      });
  }, []);

  return (
    <div className="flex flex-col flex-1 gap-5">
      <header className="flex flex-row justify-between items-center">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold">{{name}} — OpenFin Platform Provider</h1>
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
