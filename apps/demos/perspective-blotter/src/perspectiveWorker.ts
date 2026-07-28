/**
 * The SharedWorker: one STOMP connection, one Perspective Table, N windows.
 *
 * This is the production shape rather than the mock one. The provider, the
 * feed and the engine all live here; a window holds only a Client and reads
 * the rows its viewport asks for. Nothing pushes rows to windows.
 *
 *   startStomp ──► createPerspectiveTableFeed ──► Table (host-owned)
 *                  createPerspectiveHost.attach(port) ──► ProxySession ──► window
 *
 * Control traffic rides the SharedWorker's own port; Perspective frames ride a
 * separate MessageChannel, so neither has to sniff the other's messages. A
 * SharedWorker has no visible console, so boot progress is broadcast — without
 * it a stall in here is an unexplained blank page.
 */
import {
  createPerspectiveHost,
  createPerspectiveTableFeed,
  type PerspectiveModuleLike,
} from '@starui/host-data/runtime/perspective';
import { startStomp } from '@starui/host-data/runtime/providers/transports/stomp';
import { BOOK_TABLE, KEY_COLUMN, stompConfig } from './feedConfig';

interface ControlPort {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
  start(): void;
}

const ports = new Set<ControlPort>();
const broadcast = (message: unknown) => {
  for (const port of ports) port.postMessage(message);
};

let stage = 'idle';
const enter = (name: string) => {
  stage = name;
  broadcast({ type: 'stage', stage, at: performance.now() });
};

const stats = {
  snapshotRows: 0,
  deltaFrames: 0,
  deltaRows: 0,
  firstRowAt: null as number | null,
  readyAt: null as number | null,
  schemaColumns: 0,
  diagnostics: [] as unknown[],
};

const host = createPerspectiveHost({
  // Dynamic so the 5MB inline build is fetched only by this worker, and only
  // once it is actually needed.
  loadPerspective: async () => {
    enter('loading the Perspective engine');
    const module = await import('@perspective-dev/client/inline');
    return (module.default ?? module) as unknown as PerspectiveModuleLike;
  },
  onError: (where, error) => broadcast({ type: 'error', detail: `${where}: ${String(error)}` }),
});

const feed = createPerspectiveTableFeed({
  keyColumn: KEY_COLUMN,
  createTable: host.tableFactoryFor(BOOK_TABLE),
  onDiagnostic: (diagnostic) => {
    if (diagnostic.kind === 'schema') {
      stats.schemaColumns = Object.keys(diagnostic.schema).length;
      stats.readyAt = performance.now();
      enter(`table built — ${diagnostic.rows} rows, ${stats.schemaColumns} columns`);
      stats.diagnostics.push({
        kind: 'schema',
        rows: diagnostic.rows,
        columns: stats.schemaColumns,
        nested: diagnostic.nested,
        mixed: diagnostic.mixed,
      });
    } else {
      stats.diagnostics.push(diagnostic);
      broadcast({ type: 'diagnostic', diagnostic });
    }
  },
});

/** Counts what the provider actually emitted, for the page to display. */
const observe = (event: Parameters<Parameters<typeof feed.tap>[0]>[0]): void => {
  if ('rows' in event) {
    if (stats.firstRowAt === null && event.rows.length > 0) {
      stats.firstRowAt = performance.now();
      enter('first rows from the broker');
    }
    if (feed.table === null) stats.snapshotRows += event.rows.length;
    else {
      stats.deltaFrames += 1;
      stats.deltaRows += event.rows.length;
    }
    return;
  }
  if ('status' in event) enter(`provider ${event.status}`);
};

enter('connecting to the broker');
const provider = startStomp(stompConfig, feed.tap(observe));

async function onControl(port: ControlPort, event: MessageEvent): Promise<void> {
  const message = (event.data ?? {}) as { cmd?: string };
  try {
    if (message.cmd === 'attach') {
      const framePort = event.ports[0];
      if (!framePort) throw new Error('attach requires a transferred MessagePort');

      // Bind the frame port immediately — the window's Client handshake is
      // already in flight and must not be left waiting.
      await host.attach(framePort);

      // Answer only once the Table EXISTS. A window that opens it any earlier
      // gets `Unknown table` and dies: on a warm worker the table is always
      // there, so this only shows up when a window arrives during the
      // 18-second snapshot — which is the common case on a cold desk.
      await feed.whenReady();

      port.postMessage({
        type: 'attached',
        table: BOOK_TABLE,
        attached: host.attachedPorts,
        stage,
        stats,
      });
      return;
    }
    if (message.cmd === 'status') {
      port.postMessage({ type: 'status', stage, stats, attached: host.attachedPorts });
      return;
    }
    if (message.cmd === 'restart') {
      enter('restarting the provider');
      await provider.restart();
      return;
    }
    port.postMessage({ type: 'error', detail: `unknown command ${String(message.cmd)}` });
  } catch (error) {
    port.postMessage({ type: 'error', detail: String((error as Error)?.message ?? error) });
  }
}

(self as unknown as { onconnect: (event: MessageEvent) => void }).onconnect = (event) => {
  const port = event.ports[0] as unknown as ControlPort;
  ports.add(port);
  port.onmessage = (ev) => void onControl(port, ev);
  port.start();
  port.postMessage({ type: 'connected', stage, at: performance.now(), stats });
};
