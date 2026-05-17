# {{name}}

A StarUI web app — Vite + React 19.2 + shadcn + tailwind + `@widgetstools/react-dock-manager`.

Scaffolded by `@starui/mcp-server`.

## Quick start

```bash
# Optional: in a separate terminal, start the bundled STOMP test server
npm run dev:stomp

# Start the app
npm run dev
```

The app boots with a Bond Blotter `MarketsGrid` rendered inside a dockable layout. Use the **Save Layout** button (or `Ctrl/Cmd + S`) to persist the current dock arrangement to `localStorage`; **Reset Layout** (`Ctrl/Cmd + Shift + R`) wipes it.

## Adding components

Use the StarUI MCP server's tools to extend the app — for example:

- `add_marketsgrid` — register a new blotter view
- `add_dataprovider` — wire up a STOMP / REST / Mock / AppData provider
- `add_popout` — add a popout window
- `create_component` — generate a new starui-compliant React component

## Architecture

- **Layout** — `@widgetstools/react-dock-manager` drives the panel tree. Each panel is a React component referenced by `widgetType` in `WIDGETS`.
- **Grid** — `MarketsGrid` from `@starui/markets-grid` with `createMarketsGridLocalStorageStorage()` for profile persistence in v1. Switch to ConfigService storage when you need a centralized backend.
- **Theme** — `applyTheme()` from `@starui/design-system` flips `data-theme` on `<html>`. CSS variables (`--ds-*`) flow from there.
- **Tarballs** — All `@starui/*` packages are local tarballs in `./libs/`. Run `upgrade_libs` via the MCP server to refresh.
