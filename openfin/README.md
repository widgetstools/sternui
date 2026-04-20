# OpenFin launcher

Host the AG-Grid Customization demo inside an OpenFin runtime
window — giving it a real desktop presence, always-on-top popouts,
and the rest of the OpenFin platform surface.

## Setup

**Nothing.** `npm install` at the repo root pulls in
`@openfin/node-adapter`, which auto-provisions the OpenFin RVM on
first launch (cached under `~/.openfin-cache`). No separate user
install step, no PATH wiring, no per-OS binary hunting.

## Run it

From the repository root:

```bash
# Dev — boots Vite + launches OpenFin against http://localhost:5190
npm run dev:openfin

# Prod — builds the demo, serves dist/ on :4173, launches OpenFin
npm run build && npm run start:openfin
```

Either command runs two processes side-by-side via `concurrently`:
the web server, and `node openfin/launch.mjs <manifest-url>` which
uses `@openfin/node-adapter`'s `launch()` → `connect()` to boot
the platform and wrap it with a programmatic `fin` handle. Ctrl-C
forwards SIGINT to both; the launcher calls `platform.quit()` /
`application.quit()` so the RVM exits cleanly instead of hanging
around.

First-run behavior: node-adapter downloads the requested OpenFin
runtime version (see `manifest.runtime.version`) to
`~/.openfin-cache`. Subsequent runs hit the cache and boot in ~1s.

## Files

| File | Role |
|---|---|
| [`../apps/demo/public/openfin/manifest.json`](../apps/demo/public/openfin/manifest.json) | Dev manifest — points to `http://localhost:5190/`, 1440×900, resizable, framed OS window. |
| [`../apps/demo/public/openfin/manifest.prod.json`](../apps/demo/public/openfin/manifest.prod.json) | Production manifest — points to `http://localhost:4173/` (swap for your real deploy URL). |
| [`launch.mjs`](launch.mjs) | Cross-platform launcher built on `@openfin/node-adapter`. `launch({manifestUrl})` boots the RVM (auto-downloading on first run), `connect(...)` hands back a `fin` handle, SIGINT/SIGTERM call `platform.quit()` for clean teardown. Pattern lifted from the markets-ui reference app. |

Manifests live under `apps/demo/public/openfin/` so Vite serves them
at `/openfin/manifest.json` — OpenFin RVM accepts either local
file paths or HTTP URLs, and same-origin HTTP is more portable
(works identically in dev and prod, no fiddling with `file://`
permissions on macOS Catalina+).

## How it looks at runtime

When launched via OpenFin:

- `window.fin` is defined → `isOpenFin()` returns `true`
- The `PopoutPortal` layer automatically routes through
  `fin.Window.create` instead of `window.open`
- Popouts requesting `alwaysOnTop: true` (e.g. the formatter
  toolbar) pin themselves above other windows — a feature browsers
  deliberately don't expose
- Windows carry real OS chrome (minimize, maximize, close) instead
  of the browser tab shell

Everything else is identical to the browser version — same state,
same profiles, same grid — because the only runtime split is inside
`openFinWindowOpener()`.

## Manual launch

If you'd rather not use the npm scripts (e.g. running against a
staging URL you don't want to add to `package.json`):

```bash
# Launch the demo against any manifest URL
node openfin/launch.mjs https://your-deploy.example.com/openfin/manifest.json
```

The launcher is pure Node — same behavior in every environment.

## Customising for internal deployment

For a production rollout the typical changes are:

1. **License key** — replace `"licenseKey": "openfin-demo"` in the
   manifest with your organisation's license from OpenFin.
2. **Manifest URL** — host the manifest on an internal CDN so users
   can launch with a URL like
   `fin+https://internal.example.com/openfin/manifest.json`. The
   `fin://` / `fin+https://` protocol handler is registered by the
   RVM installer.
3. **Shortcut target** — `manifest.json → shortcut.target` controls
   whether the RVM offers to install a desktop / Start-menu icon on
   first launch. Set to `["desktop", "start-menu"]` for both,
   `[]` to disable.
4. **Runtime pinning** — `runtime.version` set to `"stable"` in
   both manifests. For reproducibility pin to an explicit version
   (e.g. `"30.120.77.17"`) so rolling runtime updates don't affect
   your users mid-session.
