# OpenFin launcher

Host the AG-Grid Customization demo inside an OpenFin runtime
window — giving it a real desktop presence, always-on-top popouts,
and the rest of the OpenFin platform surface.

## One-time setup

1. **Install the OpenFin RVM** — download from
   [install.openfin.co](https://install.openfin.co). The RVM (Runtime
   Version Manager) is a tiny native binary that fetches and runs
   specific OpenFin runtime versions on demand.
2. Nothing else — no per-app license key needed for local dev.

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
locates your installed RVM and invokes it with `--config=<url>`.

Ctrl-C in the terminal shuts the whole pipeline down cleanly.

## Files

| File | Role |
|---|---|
| [`../apps/demo/public/openfin/manifest.json`](../apps/demo/public/openfin/manifest.json) | Dev manifest — points to `http://localhost:5190/`, 1440×900, resizable, framed OS window. |
| [`../apps/demo/public/openfin/manifest.prod.json`](../apps/demo/public/openfin/manifest.prod.json) | Production manifest — points to `http://localhost:4173/` (swap for your real deploy URL). |
| [`launch.mjs`](launch.mjs) | Cross-platform RVM finder + invoker. Falls back to a helpful "install RVM from <url>" error when not found. |

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

If you'd rather not use the npm script (e.g. running against a
staging URL you don't want to add to `package.json`):

```bash
# macOS
/Applications/OpenFin\ RVM.app/Contents/MacOS/OpenFinRVM \
  --config=https://your-deploy.example.com/openfin/manifest.json

# Windows
%LOCALAPPDATA%\OpenFin\OpenFinRVM.exe ^
  --config=https://your-deploy.example.com/openfin/manifest.json
```

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
