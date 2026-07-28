/**
 * Proves Perspective's wasm engine initializes inside a REAL SharedWorker.
 *
 * The whole topology rests on this: one Table hosted in the SharedWorker,
 * with each blotter window opening its own View. Static analysis said the
 * `inline` build (wasm embedded, no separate .wasm fetch) should work here;
 * this is the runtime proof.
 *
 * Also exercises the multi-port case — a SharedWorker serving several
 * windows is exactly the production shape, and each port opens its own View
 * against the shared Table.
 */
import perspective from '@perspective-dev/client/inline';

const COLS = 52;
const ROWS = 20_000;

function schema() {
  const s = { positionId: 'string' };
  for (let i = 1; i < COLS; i++) s[`c${i}`] = i % 3 === 0 ? 'string' : 'float';
  return s;
}

function rows(n, offset = 0) {
  const out = [];
  for (let r = 0; r < n; r++) {
    const row = { positionId: `p${r + offset}` };
    for (let i = 1; i < COLS; i++) row[`c${i}`] = i % 3 === 0 ? `s${r}` : r + i;
    out.push(row);
  }
  return out;
}

/** Single shared Table for every connected port — the production topology. */
let tablePromise = null;
function getTable() {
  if (!tablePromise) {
    tablePromise = (async () => {
      const t0 = performance.now();
      const table = await perspective.table(schema(), { index: 'positionId' });
      const created = performance.now() - t0;
      const t1 = performance.now();
      await table.update(rows(ROWS));
      return { table, createMs: created, loadMs: performance.now() - t1 };
    })();
  }
  return tablePromise;
}

const ports = [];

async function handle(port, msg) {
  const reply = (payload) => port.postMessage(payload);
  try {
    if (msg.cmd === 'discover') {
      // Find the path that yields a client exposing `.table()` INSIDE a
      // SharedWorker: no DOM, no nested worker, engine hosted in-process.
      const attempts = [
        ['init_server()', async () => await perspective.init_server()],
        ['init_client()', async () => await perspective.init_client()],
        [
          'init_server()+init_client(handler)',
          async () => {
            const server = await perspective.init_server();
            const handler = perspective.createMessageHandler?.(server);
            return await perspective.init_client(handler ?? server);
          },
        ],
        [
          'init_client(getCompiledClientWasm())',
          async () => await perspective.init_client(perspective.getCompiledClientWasm()),
        ],
      ];
      const lines = [];
      for (const [label, fn] of attempts) {
        try {
          const r = await fn();
          const keys = [
            ...Object.keys(r ?? {}),
            ...Object.keys(Object.getPrototypeOf(r ?? {}) ?? {}),
          ];
          lines.push(`${label} => ${typeof r} table=${typeof r?.table} keys=[${keys.slice(0, 8).join(',')}]`);
        } catch (e) {
          lines.push(`${label} => THREW ${String(e?.message ?? e).slice(0, 60)}`);
        }
      }
      reply({ ok: true, step: 'discover', detail: lines.join('  ||  ') });
      return;
    }

    if (msg.cmd === 'introspect') {
      const shape = {
        typeofDefault: typeof perspective,
        ownKeys: Object.keys(perspective ?? {}),
        protoKeys: Object.keys(Object.getPrototypeOf(perspective ?? {}) ?? {}),
      };
      // If it is a factory, see what awaiting/calling it yields.
      let resolved = null;
      try {
        if (typeof perspective === 'function') {
          const r = await perspective();
          resolved = Object.keys(Object.getPrototypeOf(r) ?? {}).concat(Object.keys(r ?? {}));
        } else if (typeof perspective?.worker === 'function') {
          const r = await perspective.worker();
          resolved = Object.keys(Object.getPrototypeOf(r) ?? {}).concat(Object.keys(r ?? {}));
        } else if (typeof perspective?.default === 'object') {
          resolved = Object.keys(perspective.default);
        }
      } catch (e) {
        resolved = `resolve threw: ${String(e?.message ?? e).slice(0, 80)}`;
      }
      reply({
        ok: true,
        step: 'introspect',
        detail: `typeof=${shape.typeofDefault} own=[${shape.ownKeys.join(',')}] proto=[${shape.protoKeys.join(',')}] resolved=${JSON.stringify(resolved)}`,
      });
      return;
    }

    if (msg.cmd === 'init') {
      const { table, createMs, loadMs } = await getTable();
      reply({
        ok: true,
        step: 'init',
        detail: `wasm OK in SharedWorker — table created in ${createMs.toFixed(0)}ms, ${await table.size()} rows loaded in ${loadMs.toFixed(0)}ms`,
      });
      return;
    }

    if (msg.cmd === 'view') {
      const { table } = await getTable();
      const t0 = performance.now();
      const view = await table.view({ sort: [['c1', 'desc']] });
      const cols = await view.to_columns({ start_row: msg.start ?? 0, end_row: (msg.start ?? 0) + 100 });
      const readMs = performance.now() - t0;
      // Drain-before-delete: no in-flight reads remain at this point.
      await view.delete();
      reply({
        ok: true,
        step: `view(port ${msg.portId})`,
        detail: `sorted 100-row window @${msg.start ?? 0} in ${readMs.toFixed(1)}ms, ${Object.keys(cols).length} cols`,
      });
      return;
    }

    if (msg.cmd === 'concurrentViews') {
      const { table } = await getTable();
      const t0 = performance.now();
      const views = await Promise.all(Array.from({ length: msg.n }, () => table.view()));
      const reads = await Promise.all(
        views.map((v, i) => v.to_columns({ start_row: i * 100, end_row: i * 100 + 100 })),
      );
      await Promise.all(views.map((v) => v.delete()));
      reply({
        ok: true,
        step: `${msg.n} concurrent views`,
        detail: `all opened, read and closed in ${(performance.now() - t0).toFixed(0)}ms (${reads.length} windows)`,
      });
      return;
    }

    if (msg.cmd === 'liveUpdate') {
      const { table } = await getTable();
      const views = await Promise.all(Array.from({ length: msg.views }, () => table.view()));
      const t0 = performance.now();
      const N = 10;
      for (let i = 0; i < N; i++) await table.update(rows(500));
      const per = (performance.now() - t0) / N;
      await Promise.all(views.map((v) => v.delete()));
      reply({
        ok: true,
        step: `update w/ ${msg.views} live views`,
        detail: `${per.toFixed(2)}ms per 500-row tick`,
      });
      return;
    }

    reply({ ok: false, step: msg.cmd, detail: 'unknown command' });
  } catch (err) {
    reply({ ok: false, step: msg?.cmd ?? '?', detail: String(err?.message ?? err) });
  }
}

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.push(port);
  port.onmessage = (ev) => handle(port, ev.data);
  port.start();
  port.postMessage({ ok: true, step: 'connect', detail: `port #${ports.length} connected` });
};
