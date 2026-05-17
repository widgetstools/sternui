# {{name}}

A StarUI OpenFin workspace app — lean distillation of `markets-ui-react-reference` with all `@starui/*` packages bundled as local tarballs.

Scaffolded by `@starui/mcp-server`.

## Quick start

```bash
# Terminal 1 — dev server
npm run dev

# Terminal 2 — launch OpenFin against the local manifest
npm run client
```

The platform Provider window initializes the dock; navigate via the dock to `/blotters/marketsgrid` to see the MarketsGrid view.

In a plain browser (no OpenFin) you can preview the same view at `http://localhost:{{port}}/blotters/marketsgrid`.

## Architecture

- **Provider window** — `src/platform/Provider.tsx` runs `initWorkspace()` from `@starui/openfin-platform` and prefetches tool-window chunks on idle.
- **View routes** — every non-provider route is wrapped by `<AppShell>`, which collapses the provider stack (`DataServicesProvider` → `ConfigServiceProvider` → `HostWrapper`).
- **Runtime port** — `OpenFinRuntime` inside the desktop runtime; `BrowserRuntime` when the dev server is opened directly in a browser. No `if (isOpenFin())` branching in views.
- **Data services** — `dataServices.mainThread.ts` constructs a `createDataServicesClient(...)` bundle. The bundle owns the SharedWorker. Pass `dataServices` to `<DataServicesProvider>` and `<HostedMarketsGrid>`.
- **ConfigService** — dual mode (REST + Dexie). Master switch lives in `public/platform/manifest.fin.json` `customSettings.{useRest, configServiceRestUrl}`.

## Adding components via MCP

- `add_view` — add a new lazy-loaded view (manifest entry, route, seed-config update)
- `add_marketsgrid` — register a new MarketsGrid blotter view
- `add_dataprovider` — wire a STOMP / REST / Mock / AppData provider
- `add_popout` — wire a popout window via `runtime.openSurface`
- `create_component` — generate a starui-compliant React component
- `upgrade_libs` — refresh bundled `@starui/*` tarballs
- `inspect_app` — audit for version drift, anti-patterns, missing wiring
