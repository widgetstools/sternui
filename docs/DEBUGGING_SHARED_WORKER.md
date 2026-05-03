# Debugging the data-plane SharedWorker (OpenFin)

The data-plane v2 runtime (`@marketsui/data-plane/v2`) lives in a SharedWorker so a single STOMP/REST connection can fan out to N consumers (windows, popouts, blotters) with no extra round-trips. That worker is invisible to the OpenFin window's own DevTools — you have to attach Chrome's external DevTools to inspect it.

## TL;DR

1. Launch the app via `npm run dev:openfin:markets-react` (or the equivalent for whichever app).
2. Open a **separate Chrome browser** window (not OpenFin's DevTools).
3. Navigate to **`http://localhost:9090/`** — this shows a plain index of debuggable targets served by OpenFin's runtime.
4. Find the SharedWorker entry (description ends in `worker/entry.ts` or its bundled equivalent).
5. Click its `devtools/inspector.html?ws=...` link. A DevTools window opens scoped to that worker — Console, Sources, Network, Application all work as if it were a normal page.

## Don't use `chrome://inspect#devices`

It looks like the obvious path, but it generates a `devtools://devtools/remote/serve_rev/@<HASH>/inspector.html` URL that requires Google's `chrome-devtools-frontend.appspot.com` CDN to have an exact match for OpenFin's embedded Chromium revision. That match is often missing — clicking **inspect** lands you on `HTTP/1.1 404 Not Found`.

The `localhost:9090/` index sidesteps the CDN entirely and uses the DevTools bundled with OpenFin's own Chromium, so it always works regardless of revision.

## Alternative: programmatic JSON endpoint

```
http://localhost:9090/json/list
```

Returns a JSON array of every debuggable target. Each object has a `devtoolsFrontendUrl` field pre-built with the bundled-DevTools path — paste that URL into Chrome and you skip the index page.

## Why two settings?

OpenFin needs both halves wired in the manifest before Chrome can attach:

```json
{
  "runtime": {
    "arguments": "--remote-debugging-port=9090 ..."
  },
  "devtools_port": 9090
}
```

| Setting | Purpose |
|---|---|
| `runtime.arguments` includes `--remote-debugging-port=9090` | Tells the embedded Chromium to open a remote-debugging socket on port 9090. |
| Top-level `devtools_port: 9090` | Tells the OpenFin runtime to expose its DevTools front-end on the same port. |

Both must use the **same port number**. Every manifest in this repo uses `9090`.

Reference: [OpenFin View.inspectSharedWorker tutorial](https://cdn.openfin.co/docs/javascript/24.98.69.6/tutorial-View.inspectSharedWorker.html), [OpenFin Manifest reference](https://developer.openfin.co/docs/javascript/stable/interfaces/OpenFin.Manifest.html).

## Programmatic alternative

If you'd rather pop the worker DevTools from inside the app (e.g. a debug menu), call:

```ts
const view = fin.View.getCurrentSync();
await view.inspectSharedWorker();
```

This opens the same DevTools window that `chrome://inspect → inspect` produces, scoped to whichever SharedWorker that View has connected to.

## What you can do once attached

- **Console** — `console.log` from the worker, including the `[v2/hub]` and `[v2/stomp]` debug traces (gated by the `DEBUG` flag in `Hub.ts` / `stomp.ts`).
- **Sources** — set breakpoints in `worker/Hub.ts`, `providers/stomp.ts`, etc. The original TypeScript shows up via source maps.
- **Network** — see the WebSocket frames going to/from the STOMP broker, REST fetches.
- **Application → Storage** — inspect any `caches` / `IndexedDB` the worker writes to (the data plane uses neither today, but ConfigManager does live in the main thread).

## Caveats

- The remote-debugging port stays open for the runtime's lifetime. **Don't ship `--remote-debugging-port` in production manifests** — it's a debug-only knob and the dev manifests committed in this repo are dev-only by name.
- Chrome can attach to **only one DevTools session per target**. If you've already opened the OpenFin window's own DevTools (right-click → Inspect), close that before clicking "inspect" in `chrome://inspect`, otherwise the second session will be rejected.
- Hot-reload / Vite HMR rebuilds the worker bundle and the SharedWorker re-spawns. The DevTools window detaches; click **inspect** again on the new entry.
