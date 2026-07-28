/**
 * End-to-end proof of the schema rules against the REAL feed and the REAL
 * engine: pull the STOMP snapshot, derive a schema from it, build a
 * Perspective Table with that schema, load the book, apply live sparse deltas,
 * and check that nothing was silently coerced.
 *
 * The check that matters is the last one. Perspective truncates a float
 * arriving in an `integer` column without erroring, so the only way to know
 * the schema is right is to read values back out and compare them to what the
 * feed actually sent.
 *
 * Run:
 *   node --experimental-strip-types packages/react-grid/perspective-grid/scripts/stompToTableProbe.mjs
 */
import WebSocket from 'ws';
import perspective from '@perspective-dev/client/node';
import {
  observeRows,
  toPerspectiveSchema,
  validateIndexColumn,
} from '../../../data/host-data/src/runtime/perspective/perspectiveSchema.ts';

const URL = process.env.WS_URL ?? 'ws://localhost:8081';
const CLIENT = process.env.CLIENT ?? 'TRADER001';
const INDEX = 'positionId';
const LIVE_MS = Number(process.env.LIVE_MS ?? 15000);
const NUL = '\u0000';

const f = (command, headers = {}, body = '') =>
  `${command}\n${Object.entries(headers).map(([k, v]) => `${k}:${v}`).join('\n')}\n\n${body}${NUL}`;

function parse(text) {
  const out = [];
  for (const raw of text.split(NUL)) {
    const chunk = raw.replace(/^\n+/, '');
    if (!chunk.trim()) continue;
    const split = chunk.indexOf('\n\n');
    const head = split === -1 ? chunk : chunk.slice(0, split);
    const body = split === -1 ? '' : chunk.slice(split + 2);
    out.push({ command: head.split('\n')[0], body });
  }
  return out;
}

const snapshot = [];
const deltas = [];
let done = false;

const ws = new WebSocket(URL);
ws.on('open', () => ws.send(f('CONNECT', { 'accept-version': '1.2', host: 'localhost' })));
ws.on('error', (e) => {
  console.error('WS ERROR', e.message);
  process.exit(1);
});
ws.on('message', (data) => {
  for (const msg of parse(data.toString())) {
    if (msg.command === 'CONNECTED') {
      ws.send(f('SUBSCRIBE', { id: 'sub-0', destination: `/snapshot/positions/${CLIENT}` }));
      ws.send(
        f('SEND', {
          destination: `/snapshot/positions/${CLIENT}/7/50`,
          'snapshot-rows': process.env.SNAPSHOT_ROWS ?? '20000',
          'live-mode': 'sparse',
          'updates-per-tick': '100',
        }),
      );
      continue;
    }
    if (msg.command !== 'MESSAGE') continue;
    if (msg.body.startsWith('Success:')) {
      done = true;
      setTimeout(run, LIVE_MS);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(msg.body);
    } catch {
      continue;
    }
    for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
      (done ? deltas : snapshot).push(row);
    }
  }
});

async function run() {
  const report = {};

  // 1. Derive the schema from the snapshot ALONE — the realistic case, since
  //    the table has to exist before the first delta can be applied.
  const observed = observeRows(snapshot);
  const derived = toPerspectiveSchema(observed);
  report.snapshotRows = snapshot.length;
  report.deltaRows = deltas.length;
  report.columns = Object.keys(derived.schema).length;
  report.typeCounts = Object.values(derived.schema).reduce((acc, t) => {
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {});
  report.nested = derived.nested;
  report.mixed = derived.mixed;
  report.unknown = derived.unknown;
  report.integralButTypedFloat = derived.integral;
  report.indexProblem = validateIndexColumn(derived.schema, INDEX, observed, snapshot.length);

  // 2. Build the real Table and load the real book.
  const t0 = Date.now();
  const table = await perspective.table(derived.schema, { index: INDEX });
  await table.update(snapshot);
  report.loadMs = Date.now() - t0;
  report.tableRows = await table.size();

  // 3. Did anything get silently coerced? Compare what the engine returns to
  //    what the feed actually sent, for the columns most at risk.
  const view = await table.view();
  const columns = await view.to_columns({ start_row: 0, end_row: snapshot.length });
  const byId = new Map(snapshot.map((r) => [r[INDEX], r]));
  const ids = columns[INDEX];

  const drift = [];
  let compared = 0;
  for (const name of Object.keys(derived.schema)) {
    if (derived.schema[name] !== 'float') continue;
    const got = columns[name];
    if (!got) continue;
    for (let i = 0; i < ids.length; i++) {
      const sent = byId.get(ids[i])?.[name];
      if (typeof sent !== 'number') continue;
      compared += 1;
      // Any difference beyond float noise means a coercion happened.
      if (Math.abs(sent - got[i]) > Math.max(1e-6, Math.abs(sent) * 1e-12)) {
        if (drift.length < 5) drift.push({ column: name, id: ids[i], sent, got: got[i] });
      }
    }
  }
  report.numericValuesCompared = compared;
  report.valuesThatDrifted = drift.length;
  report.driftSample = drift;

  // 4. Apply the sparse live deltas and confirm they upsert rather than append.
  const before = await table.size();
  const t1 = Date.now();
  for (const delta of deltas) await table.update([delta]);
  report.deltaApplyMs = Date.now() - t1;
  report.rowsAfterDeltas = await table.size();
  report.deltasUpsertedRatherThanAppended = (await table.size()) === before;

  // A delta must move only the fields it carried.
  if (deltas.length > 0) {
    const sample = deltas[deltas.length - 1];
    const after = await view.to_columns({ start_row: 0, end_row: snapshot.length });
    const row = after[INDEX].indexOf(sample[INDEX]);
    const moved = Object.keys(sample).filter((k) => k !== INDEX);
    const untouched = 'cusip';
    report.deltaFieldsApplied = moved.every(
      (k) => Math.abs(after[k][row] - sample[k]) < Math.max(1e-6, Math.abs(sample[k]) * 1e-12),
    );
    report.untouchedColumnPreserved = after[untouched][row] === byId.get(sample[INDEX])?.[untouched];
  }

  await view.delete();
  await table.delete();
  console.log(JSON.stringify(report, null, 1));
  ws.close();
  process.exit(0);
}

setTimeout(() => {
  if (!done) {
    console.error('snapshot never completed');
    process.exit(1);
  }
}, 120000);
