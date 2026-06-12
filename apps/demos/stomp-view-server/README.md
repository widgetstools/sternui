# STOMP FI View Server

TypeScript sibling service to `stomp-fixed-income-server`: **synthetic fixed-income positions/trades**, **same STOMP destinations and triggers**, snapshot → **Success:** completion line → live updates **only for rows delivered in that snapshot**.

Default listen: **8081** (so it can run beside the original on 8080).

### Connecting from existing Node clients

Use **`ws://localhost:8081`**, not `8080`. Options:

- **Environment:** `WS_URL=ws://localhost:8081` before running your client.
- **From repo root:** `npm run example:view` or `npm run test-enhanced:view` (scripts set `WS_URL` for you).

If nothing listens on `8081`, the TCP connection fails (`ECONNREFUSED`). Start the view server: `cd stomp-view-server && npm run build && npm start`.

### Troubleshooting

| Symptom | Likely cause |
|--------|----------------|
| Connection refused | View server not running, or wrong port (use **8081**). |
| TCP connects but STOMP hangs | Rare CRLF issue — fixed in server frame parsing; rebuild `stomp-view-server`. |
| Browser app still fails | Point `WebSocket` / stomp URL at **`ws://<host>:8081`** (same host as where the server runs). |
| Process exits with **code 130** or you see **`^C`** in the terminal | You pressed **Ctrl+C** — that stops the server on purpose. |
| Server disappears mid-run (no **^C**) | Often **out-of-memory**: default snapshot is **20k** wide rows. Lower **`DEFAULT_SNAPSHOT_ROWS`** / **`snapshot-rows`** header, or run Node with more heap: `NODE_OPTIONS=--max-old-space-size=8192 npm start`. |
| Error logged from **`[snapshot]`** / **`[live]`** | An exception during send/update — check the stack trace; the server should stay up after our handlers log it. |

## Protocol compatibility

Matches `stomp-server/protocolContract.js`:

- `CONNECT` / `STOMP` → `CONNECTED` (`version:1.2`, `server:stomp-fixed-income/1.0.0`, `heart-beat:0,0`)
- Subscribe: `/snapshot/positions`, `/snapshot/trades`, or `/snapshot/{type}/{clientId}`
- Subscribe (historical positions): `/snapshot/positions/{clientId}/{asOfDate}` — **separate from live** so concurrent live + historical providers do not cross-receive
- Trigger (live stream): `/snapshot/{type}/{rate}[/{batchSize}]` or `/snapshot/{type}/{clientId}/{rate}[/{batchSize}]`
- Trigger (historical positions, snapshot only): `/snapshot/positions/{clientId}/{asOfDate}[/{batchSize}]` — subscribe to the same path **without** `{batchSize}`; `asOfDate` is `YYYY-MM-DD` or `YYYYMMDD`; every row gets that `asOfDate`; **no live updates** after completion
- Snapshot batches: `content-type:application/json`, `message-type:snapshot` (legacy path includes these)
- Completion: body starts with `Success: All …`
- Live: JSON array of one-or-more rows, `message-type:live-update` (row count per frame = `updates-per-tick`, default 1)

## Extension (optional)

Clients may add optional STOMP headers on the **SEND** frame:

- **Snapshot size** (1k–20k by default env bounds): `snapshot-rows: 15000` — alias `row-count`.
- **Live frequency** — `updates-per-tick: 100` mutates that many distinct rows and ships them in **one** live-update frame. Aggregate rows/sec ≈ `rate × updates-per-tick` (rate is the trigger segment, e.g. `/1000/`). Default `1` (one row per frame, original behaviour). Falls back to the `UPDATES_PER_TICK` env default when omitted.
- **Sparse live mode** — `live-mode: sparse` (alias `sparse-erratic`) for **positions** only: each live frame carries **partial row JSON** (`positionId` + an erratic subset of headline fields: `marketValue`, `currentPrice`, `pnl`, `yield`, `spread`, `pv01`, `dv01`). Row count per frame defaults to `SPARSE_ROWS_PER_TICK` (100) with ±35% jitter; override with `updates-per-tick`. No full-set coverage floor — rows are chosen at random each tick. Set env `LIVE_MODE=sparse` to make sparse the default for all streams.

Existing clients that omit these headers keep prior behavior with server defaults.

> **Tuning note (legacy mode).** Per-*row* update frequency = `rate × updates-per-tick ÷ snapshot-rows`. With the defaults (`rate=1000`, `updates-per-tick=1`, `snapshot-rows=20000`) any single row changes only ~once per 20s. Node also can't sustain a true 1000 timers/sec at a 1ms interval, so prefer a **moderate rate with a large `updates-per-tick`** (e.g. `rate=30`, `updates-per-tick=200` → ~6,000 rows/sec across 30 fat frames) rather than a very high rate with one row per frame.

> **Sparse blotter profile (~150 ms, 20k rows).** Trigger `rate=7` (~143 ms/frame), `snapshot-rows=20000`, `live-mode: sparse`, `updates-per-tick: 100`. Use `ROW_PROFILE=slim` for sustainable throughput. Example below.

Example (stompjs):

```javascript
// Legacy — 100 full rows per live frame
client.send('/snapshot/positions/TRADER001/1000/50', { 'snapshot-rows': '4000', 'updates-per-tick': '100' }, '');

// Sparse erratic — ~150 ms ticks, partial field deltas, ~100 random rows/frame
client.send('/snapshot/positions/TRADER001/7/50', {
  'snapshot-rows': '20000',
  'live-mode': 'sparse',
  'updates-per-tick': '100',
}, '');

// Historical positions for one as-of date (snapshot only)
// Subscribe: /snapshot/positions/TRADER001/2024-05-28
client.subscribe('/snapshot/positions/TRADER001/2024-05-28', ...);
client.send('/snapshot/positions/TRADER001/2024-05-28/50', { 'snapshot-rows': '4000' }, '');
```

## Configuration

| Variable | Default |
|----------|---------|
| `PORT` | `8081` |
| `DEFAULT_SNAPSHOT_ROWS` | `20000` |
| `MIN_SNAPSHOT_ROWS` | `1000` |
| `MAX_SNAPSHOT_ROWS` | `20000` |
| `UPDATES_PER_TICK` | `1` — distinct rows mutated + sent per live frame (legacy mode); overridable per-SEND via the `updates-per-tick` header |
| `LIVE_MODE` | `legacy` — set `sparse` for partial headline-field deltas (positions only) |
| `SPARSE_ROWS_PER_TICK` | `100` — target rows per sparse live frame (jittered); overridable via `updates-per-tick` when `live-mode: sparse` |
| `ROW_PROFILE` | `wide` — set `slim` for high-frequency sparse streams |
| `SWEEP_ROWS_PER_SEC` | `10000` (`wide`) / `40000` (`slim`) — legacy live sweep cap only |
| `DEBUG` | unset (`1` / `true` for verbose logs) |
| `LOG_OUTBOUND` | `1` by default; set to `0` or `false` to stop printing each outbound **MESSAGE** body |
| `LOG_LIVE_EVERY` | `1` = log every live-update message; use `50` or `100` at high msg/sec to reduce noise |
| `LOG_BODY_PREVIEW` | Max characters of each MESSAGE body to print (default `400`; large snapshots truncate) |

## Scripts

```bash
npm install
npm run dev      # tsx watch
npm run build
npm start        # node dist/main.js
```

## Data

Rows are **deterministic from a seed** (stable IDs and shapes per client/topic). Instrument coverage includes gov, credit, securitized, EM, derivatives overlay, money-market styles, with wide nested payloads for grid/view testing.
