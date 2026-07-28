/**
 * Prove the feed seam with the REAL provider, not a fake.
 *
 * `createPerspectiveTableFeed` is designed around an assumption about what
 * `startStomp` emits — `{rows, replace:true}` snapshot chunks, then
 * `{status:'ready'}`, then `{rows}` deltas. Unit tests can only assert that
 * assumption back to itself, so this runs the actual transport into the actual
 * feed into a real Perspective Table and reports what really happened.
 *
 * Run (needs the STOMP view server on 8081):
 *   node --experimental-strip-types \
 *     packages/react-grid/perspective-grid/scripts/providerToTableProbe.mjs
 */
import perspective from '@perspective-dev/client/node';
import { startStomp } from '../../../data/host-data/src/runtime/providers/transports/stomp.ts';
import { createPerspectiveTableFeed } from '../../../data/host-data/src/runtime/perspective/perspectiveTableFeed.ts';

const CLIENT = process.env.CLIENT ?? 'TRADER001';
const RUN_MS = Number(process.env.RUN_MS ?? 45000);

const cfg = {
  providerType: 'stomp',
  websocketUrl: process.env.WS_URL ?? 'ws://localhost:8081',
  listenerTopic: `/snapshot/positions/${CLIENT}`,
  requestMessage: `/snapshot/positions/${CLIENT}/7/50`,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: 'positionId',
  autoStart: true,
  snapshotChunkSize: 1000,
};

/** What the provider actually emitted, in order. */
const sequence = [];
const diagnostics = [];
let snapshotRows = 0;
let deltaRows = 0;
let deltaFrames = 0;

const feed = createPerspectiveTableFeed({
  keyColumn: cfg.keyColumn,
  createTable: async (schema, index) => {
    const table = await perspective.table(schema, { index });
    return {
      update: (rows) => table.update(rows),
      delete: () => table.delete(),
      _table: table,
    };
  },
  onDiagnostic: (d) => diagnostics.push(d.kind === 'schema' ? { ...d, schema: '(elided)' } : d),
});

const downstream = (event) => {
  if ('rows' in event) {
    const kind = event.replace === true ? 'rows/replace' : 'rows/delta';
    if (event.replace === true) snapshotRows += event.rows.length;
    else {
      deltaRows += event.rows.length;
      deltaFrames += 1;
    }
    const last = sequence.at(-1);
    if (last?.kind === kind) last.count += 1;
    else sequence.push({ kind, count: 1 });
    return;
  }
  const kind = 'status' in event ? `status:${event.status}` : Object.keys(event)[0];
  const last = sequence.at(-1);
  if (last?.kind === kind) last.count += 1;
  else sequence.push({ kind, count: 1 });
};

const handle = startStomp(cfg, feed.tap(downstream));

setTimeout(async () => {
  await feed.drain();
  const table = feed.table?._table ?? null;

  const report = {
    emitSequence: sequence,
    snapshotRowsEmitted: snapshotRows,
    deltaFrames,
    deltaRowsEmitted: deltaRows,
    meanRowsPerDeltaFrame: deltaFrames ? +(deltaRows / deltaFrames).toFixed(1) : 0,
    diagnostics,
    tableBuilt: table !== null,
    schemaColumns: feed.schema ? Object.keys(feed.schema).length : 0,
    integerColumns: feed.schema
      ? Object.entries(feed.schema).filter(([, t]) => t === 'integer').map(([c]) => c)
      : [],
    bufferedLeftover: feed.buffered,
  };

  if (table) {
    report.tableRows = await table.size();
    // The book must not GROW under a live feed — deltas upsert by index.
    const view = await table.view();
    report.viewRows = await view.num_rows();
    const columns = await view.to_columns({ start_row: 0, end_row: 2 });
    report.sampleColumns = Object.keys(columns).length;
    report.sampleId = columns[cfg.keyColumn]?.[0];
    await view.delete();
  }

  console.log(JSON.stringify(report, null, 1));
  await feed.stop();
  await handle.stop();
  process.exit(0);
}, RUN_MS);
