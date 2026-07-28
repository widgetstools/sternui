/**
 * Scan the WHOLE snapshot for type stability.
 *
 * Perspective needs one declared type per column up front and silently
 * COERCES anything that disagrees — a float arriving in an integer column is
 * truncated, not rejected. Sampling row 0 (which is what `inferFields` style
 * sampling effectively does for type purposes) is therefore not enough: a
 * column that looks integer in the first row and carries fractions in row 900
 * would lose those fractions in every window, permanently and silently.
 */
import WebSocket from 'ws';

const URL = process.env.WS_URL ?? 'ws://localhost:8081';
const CLIENT = process.env.CLIENT ?? 'TRADER001';
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
    const lines = head.split('\n');
    const headers = {};
    for (const line of lines.slice(1)) {
      const i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i)] = line.slice(i + 1);
    }
    out.push({ command: lines[0], headers, body });
  }
  return out;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** column -> observations, kept separately for snapshot and live deltas:
 *  a column can be integral across the whole snapshot and still be repriced
 *  with a fraction by the feed, which would truncate under an `integer` type. */
const cols = new Map();
const liveCols = new Map();
let rows = 0;
let liveRows = 0;
let done = false;

function observe(row, into = cols) {
  if (into === cols) rows += 1;
  else liveRows += 1;
  for (const [k, v] of Object.entries(row)) {
    let c = into.get(k);
    if (!c) {
      c = { seen: 0, nulls: 0, ints: 0, floats: 0, strings: 0, bools: 0, objects: 0,
            isoDate: 0, isoDateTime: 0, numericString: 0, min: Infinity, max: -Infinity };
      into.set(k, c);
    }
    c.seen += 1;
    if (v === null || v === undefined) { c.nulls += 1; continue; }
    if (typeof v === 'boolean') { c.bools += 1; continue; }
    if (typeof v === 'number') {
      if (Number.isInteger(v)) c.ints += 1; else c.floats += 1;
      if (v < c.min) c.min = v;
      if (v > c.max) c.max = v;
      continue;
    }
    if (typeof v === 'string') {
      c.strings += 1;
      if (ISO_DATETIME.test(v)) c.isoDateTime += 1;
      else if (ISO_DATE.test(v)) c.isoDate += 1;
      else if (v !== '' && !Number.isNaN(Number(v))) c.numericString += 1;
      continue;
    }
    c.objects += 1;
  }
}

const ws = new WebSocket(URL);
ws.on('open', () => ws.send(f('CONNECT', { 'accept-version': '1.2', host: 'localhost' })));
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
    if (msg.body.startsWith('Success:')) { done = true; setTimeout(report, Number(process.env.LIVE_MS ?? 25000)); continue; }
    let parsed;
    try { parsed = JSON.parse(msg.body); } catch { continue; }
    for (const row of Array.isArray(parsed) ? parsed : [parsed]) observe(row, done ? liveCols : cols);
  }
});
ws.on('error', (e) => { console.error('WS ERROR', e.message); process.exit(1); });

function report() {
  const mixed = [];
  const dates = [];
  const nullable = [];
  const constant = [];
  for (const [name, c] of cols) {
    const numeric = c.ints + c.floats;
    if (numeric > 0 && c.ints > 0 && c.floats > 0) {
      mixed.push({ column: name, ints: c.ints, floats: c.floats,
                   floatPct: +((c.floats / numeric) * 100).toFixed(1) });
    }
    if (c.isoDate > 0 || c.isoDateTime > 0) {
      dates.push({ column: name, kind: c.isoDateTime > c.isoDate ? 'datetime' : 'date',
                   isoDate: c.isoDate, isoDateTime: c.isoDateTime, other: c.strings - c.isoDate - c.isoDateTime });
    }
    if (c.nulls > 0) nullable.push({ column: name, nulls: c.nulls, pct: +((c.nulls / c.seen) * 100).toFixed(1) });
    if (c.seen < rows) constant.push({ column: name, missingIn: rows - c.seen });
  }
  const intOnly = [...cols].filter(([, c]) => c.ints > 0 && c.floats === 0).map(([n]) => n);

  // The decisive check: a column integral across the ENTIRE snapshot that the
  // feed later reprices with a fraction would be truncated under `integer`.
  const betrayedByLive = [];
  for (const name of intOnly) {
    const l = liveCols.get(name);
    if (l && l.floats > 0) {
      betrayedByLive.push({ column: name, liveInts: l.ints, liveFloats: l.floats });
    }
  }

  console.log(JSON.stringify({
    rowsScanned: rows,
    liveRowsScanned: liveRows,
    columns: cols.size,
    mixedIntFloat: mixed,
    intOnlyAcrossWholeSnapshot: intOnly,
    intInSnapshotButFractionalInLiveDeltas: betrayedByLive,
    liveColumnsSeen: [...liveCols.keys()],
    dateLikeStrings: dates,
    nullable,
    notPresentInEveryRow: constant,
  }, null, 1));
  ws.close();
  process.exit(0);
}

setTimeout(() => { if (!done) { console.error('timed out before snapshot completed'); report(); } }, 120000);
