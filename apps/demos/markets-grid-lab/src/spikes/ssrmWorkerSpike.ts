/**
 * SSRM STOMP provider V2 — P1 headless spike (served at
 * /spikes/ssrmWorker.html, driven by Playwright).
 *
 * Proves, against a live stomp-view-server (`npm run dev:stomp`):
 *  (a) DatasetState transitions monotone connecting→seeding→live with
 *      rising rowCount (control port);
 *  (b) a window-side Perspective client connected DIRECTLY to the
 *      provider SharedWorker reads a sorted 100-row viewport block;
 *  (c) live ticks land in the hosted table (block re-read differs);
 *  (d) restart bumps the generation and reseeds.
 *
 * All probes are exposed on `window.__ssrmSpike` for the driver.
 */

import perspective from '@finos/perspective';
import type { Client, Table, View } from '@finos/perspective';
import SERVER_WASM_URL from '@finos/perspective/dist/wasm/perspective-server.wasm?url';
import CLIENT_WASM_URL from '@finos/perspective/dist/wasm/perspective-js.wasm?url';
import SSRM_WORKER_URL from '@starui/host-data/assets/data-services-ssrm-worker.mjs?url';
import {
  SsrmControlClient,
  ssrmWorkerName,
  type DatasetStateSnapshot,
  type SsrmDatasetConfig,
} from '@starui/host-data/runtime/ssrm';

const logEl = document.getElementById('log')!;
const log = (line: string): void => {
  logEl.textContent += `${line}\n`;
  // eslint-disable-next-line no-console
  console.log(`[ssrm-spike] ${line}`);
};

// ─── scenario config ───────────────────────────────────────────────

const CLIENT_TAG = 'SPIKE1';
const WORKER_NAME = ssrmWorkerName('markets-grid-lab', 'positions-ssrm-spike');

interface SpikeParams {
  snapshotRows: number;
  /** Live ticks per second (trigger path segment). */
  rate: number;
  /** Rows per live tick (STOMP header). */
  updatesPerTick: number;
}

const DEFAULT_PARAMS: SpikeParams = {
  snapshotRows: 20_000,
  rate: 20,
  updatesPerTick: 3_000, // 20/s × 3000 = 60k rows/s — the slim-profile sweep cap
};

function spikeConfig(params: SpikeParams): SsrmDatasetConfig {
  return {
    websocketUrl: 'ws://localhost:8081',
    listenerTopic: `/snapshot/positions/${CLIENT_TAG}`,
    requestMessage: `/snapshot/positions/${CLIENT_TAG}/${params.rate}/1000`,
    requestBody: '',
    requestHeaders: {
      'snapshot-rows': String(params.snapshotRows),
      'updates-per-tick': String(params.updatesPerTick),
    },
    snapshotEndToken: 'Success',
    keyColumn: 'positionId',
    tableName: 'positions',
    // No columnDefinitions on purpose: exercises schema discovery from
    // the first snapshot rows (slim profile ≈ 40 primitive columns).
  };
}

// ─── timeline (proof a) ────────────────────────────────────────────

interface TimelineEntry extends DatasetStateSnapshot {
  at: number;
}

const timeline: TimelineEntry[] = [];
let control: SsrmControlClient | null = null;
let dataClient: Client | null = null;
let table: Table | null = null;

function recordState(state: DatasetStateSnapshot): void {
  timeline.push({ ...state, at: Date.now() });
  log(
    `state → gen=${state.generation} phase=${state.phase} rows=${state.rowCount}${
      state.error ? ` error=${state.error}` : ''
    }`,
  );
}

function waitForPhase(
  phase: DatasetStateSnapshot['phase'],
  generation: number,
  timeoutMs = 60_000,
): Promise<DatasetStateSnapshot> {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const entry = timeline[i]!;
    if (entry.generation === generation && entry.phase === phase) {
      return Promise.resolve(entry);
    }
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${phase} (gen ${generation})`)),
      timeoutMs,
    );
    const off = control!.onState((state) => {
      if (state.generation === generation && state.phase === phase) {
        clearTimeout(timer);
        off();
        resolve(state);
      }
      if (state.phase === 'error') {
        clearTimeout(timer);
        off();
        reject(new Error(`dataset error: ${state.error}`));
      }
    });
  });
}

// ─── probes ────────────────────────────────────────────────────────

const newWorker = (): SharedWorker =>
  new SharedWorker(SSRM_WORKER_URL, { name: WORKER_NAME, type: 'module' });

/** Boot control port + configure; resolves once the dataset is live. */
async function init(params: Partial<SpikeParams> = {}): Promise<{
  timeline: TimelineEntry[];
  state: DatasetStateSnapshot;
}> {
  control = new SsrmControlClient(newWorker());
  control.onState(recordState);
  const { state } = await control.configure(spikeConfig({ ...DEFAULT_PARAMS, ...params }));
  recordState(state); // configure-ack snapshot (dedup'd by `at` in analysis)
  const live = await waitForPhase('live', state.generation);
  return { timeline, state: live };
}

/** Window-side Perspective client DIRECTLY on the worker (proof b). */
async function connectData(): Promise<{ tables: string[] }> {
  perspective.init_server(fetch(SERVER_WASM_URL));
  perspective.init_client(fetch(CLIENT_WASM_URL));
  dataClient = await perspective.worker(
    Promise.resolve(newWorker()) as Promise<SharedWorker>,
  );
  table = await dataClient.open_table('positions');
  const tables = (await dataClient.get_hosted_table_names()) as string[];
  log(`data client connected; hosted tables: ${tables.join(', ')}`);
  return { tables };
}

/** Sorted viewport block read through the direct client. */
async function readBlock(
  sortColumn = 'marketValue',
  rows = 100,
): Promise<Record<string, unknown>[]> {
  if (!table) throw new Error('connectData first');
  const view: View = await table.view({
    columns: ['positionId', 'cusip', 'marketValue', 'currentPrice', 'pnl', 'quantity'],
    sort: [[sortColumn, 'desc']],
  });
  try {
    return (await view.to_json({ start_row: 0, end_row: rows })) as Record<string, unknown>[];
  } finally {
    await view.delete();
  }
}

/** Two block reads `gapMs` apart keyed by positionId (proof c). */
async function tickProbe(gapMs = 1_500): Promise<{
  compared: number;
  changed: number;
  sample: Array<{ positionId: unknown; before: unknown; after: unknown }>;
}> {
  const before = await readBlock('positionId', 200);
  await new Promise((resolve) => setTimeout(resolve, gapMs));
  const after = await readBlock('positionId', 200);
  const byId = new Map(before.map((row) => [row.positionId, row]));
  let compared = 0;
  let changed = 0;
  const sample: Array<{ positionId: unknown; before: unknown; after: unknown }> = [];
  for (const row of after) {
    const prev = byId.get(row.positionId);
    if (!prev) continue;
    compared += 1;
    if (
      prev.currentPrice !== row.currentPrice ||
      prev.pnl !== row.pnl ||
      prev.marketValue !== row.marketValue
    ) {
      changed += 1;
      if (sample.length < 3) {
        sample.push({
          positionId: row.positionId,
          before: prev.currentPrice,
          after: row.currentPrice,
        });
      }
    }
  }
  log(`tick probe: ${changed}/${compared} rows changed across ${gapMs}ms`);
  return { compared, changed, sample };
}

async function tableSize(): Promise<number> {
  if (!table) throw new Error('connectData first');
  return table.size();
}

/** Restart → generation bump + reseed (proof d). */
async function restart(): Promise<{
  state: DatasetStateSnapshot;
  timelineTail: TimelineEntry[];
  tableSizeAfter: number;
}> {
  if (!control) throw new Error('init first');
  const markerIndex = timeline.length;
  const { state } = await control.restart();
  const live = await waitForPhase('live', state.generation);
  // The book is reachable through the SAME table handle after reseed.
  const size = table ? await table.size() : -1;
  return { state: live, timelineTail: timeline.slice(markerIndex), tableSizeAfter: size };
}

// ─── driver surface ────────────────────────────────────────────────

declare global {
  interface Window {
    __ssrmSpike: {
      init: typeof init;
      connectData: typeof connectData;
      readBlock: typeof readBlock;
      tickProbe: typeof tickProbe;
      tableSize: typeof tableSize;
      restart: typeof restart;
      timeline: () => TimelineEntry[];
    };
  }
}

window.__ssrmSpike = {
  init,
  connectData,
  readBlock,
  tickProbe,
  tableSize,
  restart,
  timeline: () => timeline,
};

log(`spike ready — worker: ${SSRM_WORKER_URL} (name ${WORKER_NAME})`);
