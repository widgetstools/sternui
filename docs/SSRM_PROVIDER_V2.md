# SSRM STOMP provider V2 — usage guide

How to wire the `stomp-ssrm` provider (the pull plane) end to end:
catalog row → editor → grid. Design rationale, phase history and
evidence live in [`SSRM_PROVIDER_V2_DESIGN.md`](./SSRM_PROVIDER_V2_DESIGN.md);
this doc is the consumer-facing "how do I use it".

A complete working reference is the lab spike:
`apps/demos/markets-grid-lab/src/spikes/ssrmGridSpike.tsx`
(served at `http://localhost:5300/spikes/ssrmGrid.html`).

## What it is

One SharedWorker per provider (`starui-ssrm:{appId}:{providerId}`)
dials the STOMP broker, parses the snapshot + live ticks, and writes
them straight into a Perspective table it hosts — **the only copy of
the book**. Every window connects to that worker directly and reads
the table through AG Grid's server-side row model. There is no JS row
cache in any window and no fan-out: N windows cost one table.

```
STOMP broker ──► provider SharedWorker (Perspective table, DatasetState, generation)
                   ▲ control port (configure/restart/updateRows + state broadcasts)
                   ▲ data port   (stock @finos/perspective client protocol)
                   └─ window: connectSsrmProvider → createSsrmPullDatasource → AG Grid
```

## 1. The catalog row (`StompSsrmProviderConfig`)

`providerType: 'stomp-ssrm'`, stored as a `data-provider` catalog row
(`componentSubType: 'stomp-ssrm'`) exactly like the other provider
types — create one in the config browser ("New Provider" → **STOMP
SSRM**) or programmatically through `DataProviderConfigStore`:

```ts
import { DataProviderConfigStore } from '@starui/host-data/runtime';
import { validateStompSsrmConfig, type StompSsrmProviderConfig } from '@starui/types';

const config: StompSsrmProviderConfig = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: '/snapshot/positions/GRID1',
  requestMessage: '/snapshot/positions/GRID1/5/1000', // optional trigger SEND
  snapshotEndToken: 'Success',
  keyColumn: 'positionId',            // REQUIRED — the table index; single column
  columnDefinitions: [                 // ONE declaration: table schema AND grid columns
    { field: 'positionId', headerName: 'Position', cellDataType: 'text' },
    { field: 'quantity', headerName: 'Quantity', cellDataType: 'number' },
    // …
  ],
  // window-side query knobs (never sent to the worker):
  calcExpressions: { pnlPerUnit: '"pnl" / "quantity"' },
  treePathFields: ['bookName', 'trader'],
  wideColumnThreshold: 80,
  sweepThrottleWideMs: 1000,
};
const issues = validateStompSsrmConfig(config); // [] = valid
```

Field groups:

| Group | Fields | Consumed by |
|---|---|---|
| Transport | `websocketUrl`, `listenerTopic`, `requestMessage`, `requestBody`, `requestHeaders`, `snapshotEndToken`, `heartbeat` | worker |
| Identity/schema | `keyColumn` (required, single), `columnDefinitions`, `tableName` | worker + grid |
| Ingest bound | `maxBufferedRows` (pre-table buffer; overflow = dataset error) | worker |
| Calc columns | `calcExpressions` — name → Perspective (ExprTK) expression over REAL columns | window (per-view) |
| Tree data | `treePathFields` — ordered categorical fields synthesizing a serverSide tree | window |
| Wide-book gate | `wideColumnThreshold` (default 80), `sweepThrottleWideMs` (default 1000 ms) | window |
| Reserved | `reconnect` — documented, ignored (no silent redial; recovery = explicit restart) | — |

`validateStompSsrmConfig` returns structured issues (field + code +
message) for: blank/malformed URL, blank topic, missing / composite /
not-in-columns `keyColumn`, blank/colliding/reserved-prefix
(`__ssrm`)/cross-referencing calc expressions, blank/duplicate/
undeclared tree levels, and non-positive wide-gate numbers. The same
validator drives the editor's inline errors and
`validateProviderConfig` at the catalog seam.

## 2. The editor

`StompSsrmFields` (registered in the DataProvider editor's Connection
tab for `stomp-ssrm` rows) exposes: Connection (URL/topic), Trigger
(destination/body/end token), Row Identity (key column/table name),
**Calculated Columns** (name → expression rows), **Tree Data** (ordered
level list) and the **Wide-Book Refresh Gate** (threshold + throttle).
The Behaviour tab carries the two worker ingest knobs (`heartbeat`,
`maxBufferedRows`). There are deliberately NO push-plane knobs
(fan-out/throttle/conflation/wire format) and no Diagnostics tab (that
surface attaches through the CSRM hub; SSRM's diagnostics is its
DatasetState). Columns tab + Infer Fields work as for the push
provider.

## 3. Wiring a grid

```tsx
import {
  connectSsrmProvider, createSsrmPullDatasource, createSsrmRowIdGetter,
  createSsrmCellEditHandler, createSsrmRowMasterGetter, createSsrmDetailFetcher,
  isSsrmServerSideGroup, getSsrmServerSideGroupKey,
  toSsrmDatasetConfig, CHILD_COUNT_FIELD,
} from '@starui/ssrm-grid/pull';
import SSRM_WORKER_URL from '@starui/host-data/assets/data-services-ssrm-worker.mjs?url';
import SERVER_WASM_URL from '@finos/perspective/dist/wasm/perspective-server.wasm?url';
import CLIENT_WASM_URL from '@finos/perspective/dist/wasm/perspective-js.wasm?url';

// 1. connect (any number of windows may do this — configure is
//    idempotent worker-side, first configure wins)
const connection = await connectSsrmProvider({
  appId, providerId,                       // providerId = the catalog row id
  workerUrl: SSRM_WORKER_URL,
  config: toSsrmDatasetConfig(config),     // the documented catalog→worker mapping
  wasm: { clientWasmUrl: CLIENT_WASM_URL, serverWasmUrl: SERVER_WASM_URL },
});

// 2. gate the mount on DatasetState; key the grid by (providerId, generation)
connection.onState((s) => {/* connecting | seeding(n) | live(n, gen) | empty | error */});

// 3. one datasource per mounted grid
const datasource = createSsrmPullDatasource({
  connection,
  keyColumn: config.keyColumn,
  quickFilterColumns: ['cusip', 'bookName'],       // string columns quick filter matches
  calcExpressions: config.calcExpressions,          // optional
  treePathFields: config.treePathFields,            // optional — tree mode
  wideColumnThreshold: config.wideColumnThreshold,  // optional wide-book gate
  sweepThrottleWideMs: config.sweepThrottleWideMs,
});

// 4. AG Grid options (enterprise, serverSide row model)
<AgGridReact
  rowModelType="serverSide"
  serverSideDatasource={datasource}
  cacheBlockSize={100}
  maxBlocksInCache={10}
  getRowId={createSsrmRowIdGetter(config.keyColumn)}   // REQUIRED — keyed tick patches
  grandTotalRow="bottom"                               // optional live grand total
  getChildCount={(d) => d?.[CHILD_COUNT_FIELD]}        // group child counts
  onCellValueChanged={createSsrmCellEditHandler({ connection, keyColumn })}
  // tree mode (config.treePathFields):
  treeData isServerSideGroup={isSsrmServerSideGroup}
  getServerSideGroupKey={getSsrmServerSideGroupKey}
  // master-detail:
  masterDetail isRowMaster={createSsrmRowMasterGetter(keyColumn)}
  detailCellRendererParams={{ getDetailRowData: createSsrmDetailFetcher({ connection, keyColumn }) }}
/>
```

Unmount: `datasource.destroy()` per grid, `connection.dispose()` when
the window is done with the provider.

Beyond blocks, the datasource serves: `setQuickFilter(text)` (safe to
call per keystroke — debounced via `quickFilterDebounceMs`, default
250 ms; the settled change refreshes with `purge: true`, which is
required for correctness: a soft refresh cannot shrink AG's lazy-store
row count, so the pre-fix behavior left the scrollbar on the unfiltered
total), `getDistinctValues(field)` (set filters), and `queryAll({ columns?,
chunkSize?, onChunk? })` — the FULL filtered+sorted leaf set for
export/chart (AG's own SSRM export and integrated charts walk only
loaded blocks; build CSV via `rowsToCsv`, Excel via an off-screen
client-side grid, charts via AG Charts standalone — routes documented
in `exportRows.ts` and demonstrated in the spike).

## 4. The DatasetState contract

```
connecting → seeding(rowCount rising) → live(rowCount, generation)
                                       | empty            (honest 0 rows)
any        → error(detail)
restart()  → generation+1 → connecting → …
```

- **Published, never inferred.** The worker owns the state machine and
  broadcasts every transition to every window; the configure ack
  carries the current snapshot, so an attaching window starts correct.
- **`rowCount`** rises during `seeding` and freezes at the seed total
  on `live` (live upserts for new keys surface through the table
  itself, not this counter).
- **THE generation token** bumps once per (re)start; every worker
  response and every datasource load is stamped with it and dropped on
  mismatch. **Mount one grid per `(providerId, generation)`** and
  remount when it changes — that single rule designs out the
  configure-vs-seed, "0 rows", and restart-adoption races.
- Render `connecting`/`seeding` as loading, `empty` as a real empty
  state, `error` with its detail and a Restart affordance
  (`connection.restart()`).

## 5. Operational notes

- **Worker lifetime = last client.** The SharedWorker (and the book)
  dies when its last window disconnects; peers keep it warm. A **solo
  tab's reload re-streams the snapshot by design** (communicated
  through DatasetState, never a hang); a reload WITH a peer attached
  repopulates instantly from the live table with no re-seed
  (e2e-proven: `e2e/ssrm-pull/peer-reload.spec.ts`).
- **No silent redial.** A broken STOMP session surfaces as a dataset
  `error`; recovery is an explicit `restart()` (generation bump, full
  reseed, every window remounts). The catalog `reconnect` block is
  reserved for a future policy and currently ignored.
- **Dev-server worker asset:** the worker ships as a built asset
  (`@starui/host-data/assets/data-services-ssrm-worker.mjs` +
  sibling wasm). Vite serves it from `dist/` — after changing worker
  source, rebuild host-data; browsers also cache SharedWorkers by URL,
  so close every tab holding the old worker (or restart the dev
  server) to pick up a new build.
- **Cell edits** ride the control port (`connection.updateRows` /
  `createSsrmCellEditHandler`): keyed partial rows, schema-coerced
  worker-side (string → float, etc.), generation-fenced, converging in
  every window on the next tick-refresh. Bulk edit shapes must use the
  fetch-or-refuse guards (`fetchLoadedRowsOrRefuse` /
  `updateLoadedRowsOrRefuse`) — never a partial write.
- **Budgets:** keep books within ~50k×120 (a 50k×400 book crashes
  tabs); interaction budgets on a 20k live book: sort ≤ ~250 ms, group
  ≤ ~600 ms, expand ≤ ~250 ms.

## 6. Verification: e2e suite + memory soak

- **e2e (CI):** `npm run e2e:ssrm` (`playwright.ssrm.config.ts`, specs
  under `e2e/ssrm-pull/`) boots stomp-view-server (:8081) + the lab
  (:5300) and covers the multi-window/live-feed classes that hid the
  V1 bugs: cold seed, two-tabs-one-worker, peer reload, restart
  generation adoption, cross-tab edit convergence with schema
  coercion, live grouped aggregates + grand total with zero loading
  stubs, and tree expansion with exact child counts. Live-feed
  exactness assertions use quiet-window sandwiches (control read →
  probe → control read, retried until the control reads agree).
- **Memory soak (opt-in, NOT CI-blocking):** `npm run soak:ssrm`
  (`scripts/soakSsrm.mjs`) runs two tabs on one provider for N minutes
  (default 5), sampling post-GC page heaps (CDP) and the whole browser
  process-tree RSS (which is where the worker's WASM lives), printing
  a sample table and a per-metric + overall **LEAK/FLAT** verdict
  (LEAK = last-third median > first-third by >15% AND >20 MB; exit
  code 1). Knobs: `--minutes`, `--sample-secs`, `--rows`, `--rate`,
  `--upt`. Reuses already-running dev servers, else spawns and reaps
  them.
