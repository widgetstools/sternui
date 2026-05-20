# STOMP DataProvider + MarketsGrid — Getting Started

This guide walks through building a **fresh React web app** that:

1. Bootstraps the MarketsUI **DataServices** layer (SharedWorker hub)
2. Defines and persists a **STOMP** data provider configuration
3. Renders **MarketsGrid** fed by live snapshot + delta updates from that provider

It mirrors the patterns used in `apps/markets-ui-react-reference`, `apps/demo-apps/dataprovider-editor-starui-app`, and `apps/demo-apps/mockdata-provider-starui-app`.

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Your React app                                                         │
│  ┌──────────────────────┐    ┌──────────────────────────────────────┐  │
│  │ DataServicesProvider │───▶│ HostedMarketsGrid / MarketsGridContainer│  │
│  └──────────┬───────────┘    └──────────────────┬───────────────────┘  │
│             │ useDataServices / dpClient         │ columnDefs, rowIdField│
└─────────────┼───────────────────────────────────┼───────────────────────┘
              │ MessagePort RPC                    │ subscribe(providerId)
              ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  SharedWorker — SharedWorkerDataServicesHub                             │
│  ┌─────────────────┐   startStomp(cfg)   ┌──────────────────────────┐  │
│  │ ConfigManager   │◀── saved configs ─│ StompTransport (stomp.ts) │  │
│  │ (IndexedDB)     │                   │  • connect WebSocket       │  │
│  └─────────────────┘                   │  • SUB listenerTopic       │  │
│                                          │  • SEND requestMessage     │  │
│                                          │  • snapshot → replace rows │  │
│                                          │  • live → keyed deltas     │  │
│                                          └─────────────┬──────────────┘  │
└────────────────────────────────────────────────────────┼────────────────┘
                                                         │ ws://host:port
                                                         ▼
                                              STOMP broker / stomp-view-server
```

**Snapshot phase:** JSON rows accumulate until a message body matches `snapshotEndToken` (default `"Success"`). The hub emits one `replace: true` batch and sets status to `ready`.

**Live phase:** Each subsequent message is treated as a keyed delta. The hub upserts into its row cache and forwards updates to subscribers. The grid applies them via AG Grid `applyTransactionAsync`.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 20+ | Same as the monorepo |
| npm 10 | Workspace installs use plain `npm ci` |
| StarUI packages | In-monorepo: workspace `"*"` deps. External app: run `npm run propagate` and install tarballs from `libs/` (see [README](../README.md)) |
| STOMP endpoint | Local dev: `apps/stomp-view-server` on **`ws://localhost:8081`** (`npm run dev:stomp` from repo root) |

---

## Step 1 — Scaffold the app

Create a Vite + React app under `apps/` (in-repo) or in your own repo (external consumer).

### In-repo (recommended for development)

Add a workspace entry in the root `package.json` `workspaces` array, then create `apps/my-stomp-app/` with:

**`package.json`** — depend on the buckets you need:

```json
{
  "name": "@starui/my-stomp-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@starui/design-system": "*",
    "@starui/host-data": "*",
    "@starui/host-data-react": "*",
    "@starui/react-grid": "*",
    "@starui/react-ui": "*",
    "@starui/shared-types": "*",
    "@starui/widgets-react": "*",
    "ag-grid-community": "35.1.0",
    "ag-grid-enterprise": "35.1.0",
    "ag-grid-react": "35.1.0",
    "react": "~19.2.5",
    "react-dom": "~19.2.5"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "~4.5.2",
    "typescript": "~5.9.3",
    "vite": "~7.3.2"
  }
}
```

**`vite.config.ts`** — use the shared consumer config with **worker support** (required for SharedWorker):

```typescript
import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staruiConsumerViteConfig, appDirFromConfig } from '../../scripts/staruiConsumerVite.mjs';

export default defineConfig(
  mergeConfig(staruiConsumerViteConfig(appDirFromConfig(import.meta.url), { worker: true }), {
    plugins: [react()],
    server: { port: 5200, open: true },
  }),
);
```

**`tsconfig.json`** — extend the repo base config (same pattern as other apps).

**Styles** — import design-system CSS in your entry file:

```typescript
import '@starui/design-system/styles.css';
```

Set theme on `<html data-theme="dark">` or `"light"`.

### External consumer

1. Run `npm run propagate` in the StarUI monorepo.
2. Point `"dependencies"` at `file:../../libs/starui-*-*.tgz` (see `apps/demo-react/package.json`).
3. Copy the Vite config pattern above, adjusting the path to `staruiConsumerVite.mjs` or inlining aliases from `scripts/staruiConsumerAliases.mjs`.

---

## Step 2 — Bootstrap DataServices (SharedWorker)

Create `src/dataServices.ts`:

```typescript
import { bootstrapDataServicesWithWorkerAsset } from '@starui/host-data';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';

export const dataServices = bootstrapDataServicesWithWorkerAsset(workerAssetUrl, {
  appName: 'my-stomp-app',
  userId: 'dev1', // must match LOGGED_IN_USER_ID in your React tree
});
```

This returns:

| Property | Role |
|---|---|
| `dpClient` | Subscribe/unsubscribe to provider streams |
| `configManager` | Low-level config persistence (IndexedDB via Dexie) |
| `configStore` | Typed wrapper for data-provider CRUD |
| `hub` | Direct hub access (rare; prefer `dpClient`) |

The `?url` import is resolved by Vite's `staruiHostDataWorkerAssetPlugin` so the SharedWorker script is served correctly in dev and bundled in production.

Reference: `apps/markets-ui-react-reference/src/dataServices.mainThread.ts`.

---

## Step 3 — Wrap the app with `DataServicesProvider`

In `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DataServicesProvider } from '@starui/host-data-react/runtime';
import { LOGGED_IN_USER_ID } from '@starui/shared-types';
import { dataServices } from './dataServices';
import { App } from './App';
import '@starui/design-system/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataServicesProvider services={dataServices} userId={LOGGED_IN_USER_ID}>
      <App />
    </DataServicesProvider>
  </StrictMode>,
);
```

`DataServicesProvider` must wrap any component that calls `useDataServices`, `useProviderStream`, or `useDataProvidersList`.

---

## Step 4 — Configure the STOMP provider

A STOMP provider is a `DataProviderConfig` row whose `config` payload satisfies `StompProviderConfig` (`@starui/shared-types`).

### Field reference

| Field | Required | Description |
|---|---|---|
| `providerType` | yes | Must be `'stomp'` |
| `websocketUrl` | yes | WebSocket URL, e.g. `ws://localhost:8081` |
| `listenerTopic` | yes | STOMP destination to **subscribe** for incoming rows |
| `requestMessage` | yes | STOMP destination to **SEND** to trigger the snapshot |
| `requestBody` | yes | Body for the trigger SEND (often `''` for stomp-view-server) |
| `snapshotEndToken` | recommended | Message body prefix that ends snapshot phase (default `'Success'`, case-insensitive) |
| `keyColumn` | **yes for grid** | Field used to index rows in the hub; rows without this field are **silently dropped** |
| `columnDefinitions` | yes for grid | AG Grid `ColDef[]` — usually from **Infer Fields** in the editor |
| `dataType` | optional | Label, e.g. `'positions'` |
| `snapshotTimeoutMs` | optional | Fail snapshot if no end token within this window |
| `heartbeat` | optional | STOMP heartbeat `{ incoming, outgoing }` ms |
| `throttleMs` | optional | Throttle live delta emission |
| `conflateByKey` | optional | Coalesce rapid updates per key |
| `reconnect.initialDelayMs` | optional | Reconnect backoff |
| `autoStart` | optional | If true, hub starts transport on save (usually false; grid starts on subscribe) |

### Example: stomp-view-server positions feed

Start the local server:

```bash
npm run dev:stomp
# WebSocket: ws://localhost:8081
```

Protocol (from `apps/stomp-view-server/README.md`):

- **Subscribe:** `/snapshot/positions/{clientId}`
- **Trigger snapshot:** SEND to `/snapshot/positions/{clientId}/{rateMs}[/{batchSize}]`
- **Completion:** a message whose body starts with `Success:` ends the snapshot

Example programmatic config:

```typescript
import type { DataProviderConfig, StompProviderConfig } from '@starui/shared-types';

const CLIENT_TAG = 'TRADER001';

const stompConfig: StompProviderConfig = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: `/snapshot/positions/${CLIENT_TAG}`,
  requestMessage: `/snapshot/positions/${CLIENT_TAG}/1000/50`,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: 'positionId', // stomp-view-server positions use positionId
  autoStart: false,
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position ID' },
    { field: 'cusip', headerName: 'CUSIP' },
    { field: 'instrumentType', headerName: 'Type' },
    { field: 'marketValue', headerName: 'MV', type: 'numericColumn' },
    // … add more after Infer Fields, or hand-author
  ],
};

export const positionsProviderDraft: DataProviderConfig = {
  name: 'STOMP Positions (local)',
  description: 'Positions snapshot + live deltas from stomp-view-server',
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  config: stompConfig,
};
```

### Option A — Save via UI (`DataProviderEditor`)

Mount the editor anywhere inside `DataServicesProvider`:

```tsx
import { DataProviderEditor } from '@starui/widgets-react/v2/provider-editor';
import { LOGGED_IN_USER_ID } from '@starui/shared-types';

export function ProviderSetupPage() {
  return <DataProviderEditor userId={LOGGED_IN_USER_ID} />;
}
```

Workflow:

1. Click **+ STOMP** to create a draft.
2. **Connection** tab — set `websocketUrl`, `listenerTopic`, `requestMessage`, `requestBody`, `snapshotEndToken`.
3. **Columns** tab — click **Infer fields** (runs `probeStomp` against your broker), then pick **keyColumn** (`positionId` for stomp-view-server positions).
4. **Save** — persists to IndexedDB via `configStore.save()`.

Reference app: `apps/demo-apps/dataprovider-editor-starui-app`.

### Option B — Save programmatically on startup

```typescript
import { DataProviderConfigStore } from '@starui/host-data/runtime';
import { dataServices } from './dataServices';
import { positionsProviderDraft } from './providers/positionsStomp';
import { LOGGED_IN_USER_ID } from '@starui/types';

const configStore = new DataProviderConfigStore(dataServices.configManager);

async function ensureStompProvider(): Promise<string> {
  const existing = (await configStore.list(LOGGED_IN_USER_ID, { subtype: 'stomp' }))
    .find((p) => p.name === positionsProviderDraft.name);

  if (existing?.providerId) return existing.providerId;

  const saved = await configStore.save(positionsProviderDraft, LOGGED_IN_USER_ID);
  if (!saved.providerId) throw new Error('Provider save did not return providerId');
  return saved.providerId;
}
```

Call `ensureStompProvider()` once before rendering the grid (e.g. in `App` with a loading gate).

---

## Step 5 — Render MarketsGrid with the provider

### Recommended: `HostedMarketsGrid`

This is the production shell used in reference apps — it wires storage, toolbars, provider picker, and `MarketsGridContainer` for you.

```tsx
import { HostedMarketsGrid } from '@starui/widgets-react/hosted';
import { dataServices } from './dataServices';

export function PositionsBlotter() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <HostedMarketsGrid
        gridId="positions-blotter"
        componentName="Positions Blotter"
        defaultInstanceId="positions-blotter"
        withStorage
        dataServices={dataServices}
        configManager={dataServices.configManager}
        showFiltersToolbar
        showFormattingToolbar
      />
    </div>
  );
}
```

User flow:

1. Press **Alt+Shift+P** (Windows/Linux) or **Option+Shift+P** / **Cmd+Shift+P** (macOS) to reveal the grid's **Provider** toolbar.
2. Select your saved STOMP provider from the live-provider list.
3. The grid subscribes, shows loading until snapshot completes, then streams live deltas.

Reference: `apps/markets-ui-react-reference/src/views/BlottersMarketsGrid.tsx`.

### Pre-select a provider (optional)

If you saved programmatically and know `providerId`, persist it in grid-level config via the storage adapter, or use the lower-level API in Step 6 to subscribe immediately without the picker.

---

## Step 6 — How MarketsGrid consumes STOMP data (internals)

Understanding this flow helps when debugging or building custom layouts without `HostedMarketsGrid`.

### Container subscription (`MarketsGridContainer`)

Located in `@starui/widgets-react/hosted` → `MarketsGridContainer.tsx`:

1. **Resolve active provider** — reads `activeProviderId` from grid-level persisted state (Provider toolbar) or props.
2. **Load config** — `useDataProviderConfig(activeId)` fetches the saved `DataProviderConfig`.
3. **Resolve templates** — `useResolvedCfg(cfg)` expands `{{appdata.key}}` placeholders if present.
4. **Derive grid columns** — `columnDefinitions` and `keyColumn` from resolved config become `columnDefs` and `rowIdField`.
5. **Subscribe** — `dataServices.dpClient.subscribe(activeId, resolvedConfig)`:
   - Hub calls `startStomp(resolvedConfig)` if not already running for that provider id.
   - First emission with `replace: true` → `api.setGridOption('rowData', rows)`.
   - Subsequent emissions → `api.applyTransactionAsync({ add/update/remove })`.
6. **Cleanup** — on provider change or unmount, `dpClient.unsubscribe(subscriptionId)`.

### STOMP transport lifecycle (`stomp.ts`)

```text
connect(websocketUrl)
  → SUBSCRIBE listenerTopic
  → SEND requestMessage + requestBody
  → for each MESSAGE on listenerTopic:
       if snapshot phase:
         parse JSON rows → buffer
         if body matches snapshotEndToken → emit { rows, replace: true, status: 'ready' }
       else:
         parse JSON row → emit { rows: [row] }  // keyed delta
```

### Lower-level: raw `MarketsGrid` + `useProviderStream`

For a minimal panel without Hosted shell (see `apps/demo-apps/mockdata-provider-starui-app`):

```tsx
import { MarketsGrid } from '@starui/react-grid';
import { useProviderStream } from '@starui/host-data-react/runtime';

function StompGridPanel({ providerId, cfg }: { providerId: string; cfg: StompProviderConfig }) {
  const { rows, status } = useProviderStream(providerId, cfg);

  return (
    <MarketsGrid
      rowData={rows}
      columnDefs={cfg.columnDefinitions}
      rowIdField={cfg.keyColumn!}
      loading={status !== 'ready'}
    />
  );
}
```

Pass the **same** `keyColumn` on `cfg` that you saved on the provider — the hub indexes its cache by that field.

---

## Step 7 — Run and verify

Terminal 1 — STOMP server:

```bash
cd /path/to/starui
npm run dev:stomp
```

Terminal 2 — your app:

```bash
npm run dev:my-stomp-app
# or: cd apps/my-stomp-app && npm run dev
```

Checklist:

- [ ] Browser devtools → Application → Shared Workers — `data-services-worker` is running
- [ ] Network → WS to `localhost:8081` shows STOMP CONNECT + SUBSCRIBE + SEND
- [ ] Grid shows rows after snapshot; cells update on live phase
- [ ] If grid stays empty, verify **`keyColumn`** matches a field present on every row (`positionId` for stomp-view-server positions)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Empty grid, no errors | Missing or wrong `keyColumn` | Set `keyColumn` to a field on every row (use Infer Fields) |
| WebSocket fails | Wrong port | stomp-view-server uses **8081**, not 8080 |
| SharedWorker 404 | Missing Vite worker plugin | Use `staruiConsumerViteConfig(..., { worker: true })` |
| `[stomp] Client constructor not found` on Infer Fields | Vite resolved `@stomp/stompjs` UMD bundle | Fixed in `staruiConsumerVite.mjs` (ESM alias); restart dev server |
| Snapshot never completes | Wrong `snapshotEndToken` or timeout | Match broker's end message; increase `snapshotTimeoutMs` |
| Provider not in picker | Wrong type or AppData row | Live picker lists `componentSubType: 'stomp'` only |
| Stale worker after code change | SharedWorker cache | Hard refresh or close all tabs sharing the worker |

---

## Reference apps in this repo

| App | What it demonstrates |
|---|---|
| `apps/markets-ui-react-reference` | Production-style `HostedMarketsGrid` + `dataServices` bootstrap |
| `apps/demo-apps/dataprovider-editor-starui-app` | `DataProviderEditor` + two `HostedMarketsGrid` panels |
| `apps/demo-apps/mockdata-provider-starui-app` | Lower-level `useProviderStream` + raw `MarketsGrid` (Mock transport; same hub protocol) |
| `apps/my-stomp-app` | End-to-end sample from this guide — seeded STOMP provider + `HostedMarketsGrid` + editor |
| `apps/stomp-view-server` | Local STOMP broker for development |

---

## Minimal file checklist

```text
my-stomp-app/
├── package.json
├── vite.config.ts          # staruiConsumerViteConfig(..., { worker: true })
├── tsconfig.json
└── src/
    ├── main.tsx            # DataServicesProvider
    ├── dataServices.ts     # bootstrapDataServicesWithWorkerAsset
    ├── App.tsx             # routes / layout
    ├── providers/
    │   └── positionsStomp.ts   # StompProviderConfig draft (optional)
    └── views/
        └── PositionsBlotter.tsx  # HostedMarketsGrid
```

---

## Related documentation

- [README — Getting started](../README.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — package layers and import rules
- [apps/stomp-view-server/README.md](../apps/stomp-view-server/README.md) — STOMP protocol details
