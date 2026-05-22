# StarUI OpenFin Scaffold Demo

Clean, heavily commented reference for building OpenFin Workspace apps on MarketsUI.
Fork this app when starting a new trading shell — it mirrors
`apps/markets-ui-react-reference` with a smaller surface area and inline documentation.

## What this demonstrates

| Feature | Route | OpenFin entry |
|--------|-------|----------------|
| **Platform provider** | `/platform/provider` | `manifest.platform.providerUrl` |
| **Workspace setup** (dock + registry) | `/workspace-setup` | Dock → Tools |
| **Data provider editor** | `/dataproviders` | Dock → Tools · blotter pencil |
| **Config browser** | `/config-browser` | Dock → Tools |
| **Import / export config** | `/import-config` | Dock → Tools |
| **Rename view tab** | `/rename-view-tab` | View tab context menu |
| **Hosted MarketsGrid** | `/views/blotter` | Registered workspace view |
| **FDC3 + notifications** | `/views/interop` | Registered workspace view |

## Quick start

From the monorepo root (after `npm ci` and `npm run propagate`):

```bash
# Vite + OpenFin in one command (port 5180)
npm run start:openfin -w @starui/openfin-scaffold-demo

# Or separately:
npm run dev -w @starui/openfin-scaffold-demo
npm run openfin -w @starui/openfin-scaffold-demo
```

Browser-only dev (no OpenFin): `npm run dev -w @starui/openfin-scaffold-demo` → http://localhost:5180

## STAR-SPG starter config (import)

Pre-built `appConfig` rows: STOMP provider **`positions.dp`**, component registry entries, dock menu **STAR-SPG**, and blotter provider binding.

| File | Use |
|------|-----|
| `public/config/star-spg-starter.appConfig.json` | **Config Browser** → table **appConfig** → Import JSON |
| `public/config/star-spg-starter-bundle.json` | **Dock → Tools → Import Config** (full bundle; same `appConfig` rows) |

While Vite is running, files are also at:

- http://localhost:5180/config/star-spg-starter.appConfig.json

### Import steps

1. Start the local STOMP feed (required before the blotter can stream):

   ```bash
   npm run dev:stomp
   ```

2. Start the scaffold (`npm run start:openfin -w @starui/openfin-scaffold-demo`).

3. Open **Dock → Tools → Config Browser**.

4. Select the **appConfig** table.

5. **Import JSON** → choose `public/config/star-spg-starter.appConfig.json` (or the URL above).

6. Use **Overwrite** so existing `dock-config` / registry / provider rows are replaced.

7. Reload the platform (or restart OpenFin). The dock should show a **STAR-SPG** dropdown with registered views; open **SPG Positions Blotter** and confirm **positions.dp** is selected in the live provider picker.

Rows use the platform persistence scope **`TestApp` / `dev1`** (same as `@starui/openfin-platform` defaults). Config Browser import re-owns `appId` and rewrites scoped `configId` keys (e.g. `component-registry::TestApp::system`). Public provider rows keep `userId: system`.

If STAR-SPG launch still fails after an earlier import, re-import with **Overwrite** (a prior import may have left `component-registry::ScaffoldApp::system` on disk while the runtime looks up `::TestApp::system`).

**No number formatting / colours?** Open the formatting toolbar (brush icon) and click **Auto FI** — applies vendor-style Excel formats, numeric right-alignment, and P&amp;L highlight rules to every column. Formatting also lives in the **Default** profile (`__default__`) after import; the blotter auto-seeds that profile on load (`src/fiBlotterProfile.ts`). You still need **`positions.dp`** selected and STOMP data flowing.

The starter includes **67 STOMP position columns** aligned with `apps/stomp-view-server` (`fiRecords.ts`), plus a **Default** grid profile (`__default__`) with Excel-style formatting inferred from each field’s **last path segment** (e.g. `marketData.bidPrice` → Bid, 3-dec price; `unrealizedPnl` → signed P&amp;L). Source: `config/stompPositionsFiSchema.ts`. Regenerate JSON after editing:

```bash
npm run build:starter-config -w @starui/openfin-scaffold-demo
```

If you fork to another port or app id, edit `hostUrl` entries in the registry row and re-import.

## Tarball dependencies

Like other `apps/demo-apps/*` consumers, this app depends on architecture buckets under `libs/`:

- `@starui/data`, `@starui/design-system`, `@starui/openfin`, `@starui/react-core`, `@starui/react-grid`, `@starui/react-ui`, `@starui/shared`

Refresh after `npm run propagate`:

```bash
rm -rf node_modules/@starui apps/demo-apps/openfin-scaffold-demo/node_modules/@starui
npm install
```

## Fork checklist

1. Copy `apps/demo-apps/openfin-scaffold-demo` to your app path.
2. Update `src/constants.ts` — port, `APP_ID`, `SEED_APP_ID`, platform UUID, security realm.
3. Grep for `5180` and `ScaffoldApp` across `public/` and `constants.ts`.
4. Edit `public/seed-config.json` (`appRegistry`, `userProfiles`).
5. Edit `public/platform/manifest.fin.json` (`customSettings.apps`, all URLs).
6. Add view manifests under `public/views/*.fin.json`.
7. Register routes in `src/main.tsx` (tool shell vs `StarGridApp` shell).
8. Run `npm run sync:app-deps` from repo root to rewrite tarball paths if needed.

## File map

```
src/main.tsx                 # Routing: provider / tools / grid views
src/dataServices.mainThread.ts  # SharedWorker bootstrap (required)
src/platform/Provider.tsx    # initWorkspace()
src/views/                   # Thin route shells around @starui/* packages
public/platform/manifest.fin.json
public/seed-config.json
launch.mjs                   # OpenFin launcher (Vite must be up)
scripts/start-openfin.mjs    # Vite + wait-on + launch.mjs
```

## Related docs

- `apps/markets-ui-react-reference` — full integration reference
- `docs/guides/consumer-app-sharedworker-and-tailwind.md` — SharedWorker + route layout
- `packages/react-core/widgets-react/src/hosted/README.md` — HostedMarketsGrid
