/**
 * Worker-level tests for the P4b `ssrm-update-rows` control message:
 * the full accept path (port dialect claim → handleControl →
 * SsrmDataset.updateRows → TableWriter → table surface) with an
 * injected Perspective boot + STOMP client — asserting schema
 * coercion, generation fencing, and the refuse-with-error acks.
 */

import { describe, expect, it } from 'vitest';
import type { BootedPerspective } from './perspectiveBoot.js';
import { installSsrmWorker } from './installSsrmWorker.js';
import type {
  SsrmAckEvent,
  SsrmControlEvent,
  SsrmDatasetConfig,
} from '../types.js';
import type {
  SsrmStompClient,
  SsrmStompClientCfg,
  SsrmStompMessage,
} from './stompIngest.js';

// ─── fakes ──────────────────────────────────────────────────────────

class FakePort {
  readonly posted: unknown[] = [];
  private readonly handlers: Array<(ev: MessageEvent) => void> = [];

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  addEventListener(_type: 'message', cb: (ev: MessageEvent) => void): void {
    this.handlers.push(cb);
  }

  removeEventListener(_type: 'message', cb: (ev: MessageEvent) => void): void {
    const i = this.handlers.indexOf(cb);
    if (i >= 0) this.handlers.splice(i, 1);
  }

  start(): void {}

  /** Window→worker message. */
  send(data: unknown): void {
    for (const cb of [...this.handlers]) cb({ data } as MessageEvent);
  }

  acks(): SsrmAckEvent[] {
    return (this.posted as SsrmControlEvent[]).filter(
      (m): m is SsrmAckEvent => m.kind === 'ssrm-ack',
    );
  }
}

class FakeStompClient implements SsrmStompClient {
  onConnect: (() => void) | undefined;
  onStompError: ((frame: { headers: Record<string, string> }) => void) | undefined;
  onWebSocketError: ((event: unknown) => void) | undefined;
  onDisconnect: (() => void) | undefined;
  reconnectDelay = 0;
  private readonly subs: Array<(msg: SsrmStompMessage) => void> = [];

  subscribe(_destination: string, cb: (msg: SsrmStompMessage) => void) {
    this.subs.push(cb);
    return { unsubscribe: () => {} };
  }

  publish(): void {}
  activate(): void {}
  deactivate(): void {}

  deliver(body: string): void {
    for (const cb of [...this.subs]) cb({ body, headers: {} });
  }
}

/** In-memory keyed table surface standing in for the Perspective Table. */
class FakeHostedTable {
  readonly updates: Array<Record<string, unknown>[]> = [];
  cleared = 0;

  async clear(): Promise<void> {
    this.cleared += 1;
  }

  async update(rows: Record<string, unknown>[], _opts?: unknown): Promise<void> {
    this.updates.push(rows.map((r) => ({ ...r })));
  }

  async size(): Promise<number> {
    return this.updates.reduce((n, batch) => n + batch.length, 0);
  }
}

const config: SsrmDatasetConfig = {
  websocketUrl: 'ws://test:8081',
  listenerTopic: '/snapshot/positions/T1',
  snapshotEndToken: 'Success',
  keyColumn: 'positionId',
  tableName: 'positions',
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position', cellDataType: 'text' },
    { field: 'pnl', headerName: 'PnL', cellDataType: 'number' },
  ],
};

const flush = async (times = 4): Promise<void> => {
  for (let i = 0; i < times; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

/** Boot a worker + one control port, seeded to `live` gen 1 with one row. */
async function liveWorkerHarness() {
  const selfRef: { onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null } = {
    onconnect: null,
  };
  const table = new FakeHostedTable();
  const boot = async (): Promise<BootedPerspective> =>
    ({
      makeSession: () => ({ handle_request: async () => {}, close: () => {} }),
      localClient: { table: async () => table },
    }) as unknown as BootedPerspective;
  let stomp: FakeStompClient | null = null;
  const handle = installSsrmWorker({
    selfRef,
    bootPerspectiveImpl: boot,
    ingestOpts: {
      createClient: (_cfg: SsrmStompClientCfg) => {
        stomp = new FakeStompClient();
        return stomp;
      },
    },
  });
  await handle.ready;

  const port = new FakePort();
  selfRef.onconnect!({ ports: [port as unknown as MessagePort] });
  port.send({ kind: 'ssrm-configure', reqId: 1, config });
  await flush();
  stomp!.onConnect!();
  stomp!.deliver('[{"positionId":"a","pnl":1.5},{"positionId":"b","pnl":-2}]');
  stomp!.deliver('Success');
  await flush();
  port.send({ kind: 'ssrm-state', reqId: 999 });
  await flush(1);
  expect(port.acks().find((a) => a.reqId === 999)!.state.phase).toBe('live'); // harness sanity
  return { port, table, handle };
}

// ─── tests ──────────────────────────────────────────────────────────

describe('installSsrmWorker — ssrm-update-rows (P4b cell-edit write-back)', () => {
  it('applies keyed partial rows through the writer with schema coercion', async () => {
    const { port, table, handle } = await liveWorkerHarness();
    const before = table.updates.length;

    port.send({
      kind: 'ssrm-update-rows',
      reqId: 2,
      generation: 1,
      rows: [{ positionId: 'a', pnl: '42.5' }], // string editor input on a float column
    });
    await flush();

    const ack = port.acks().find((a) => a.reqId === 2)!;
    expect(ack.error).toBeUndefined();
    expect(ack.state.generation).toBe(1);
    expect(table.updates.length).toBe(before + 1);
    expect(table.updates.at(-1)).toEqual([{ positionId: 'a', pnl: 42.5 }]);
    await handle.stop();
  });

  it('fences a stale generation: acked as an error, nothing written', async () => {
    const { port, table, handle } = await liveWorkerHarness();
    port.send({ kind: 'ssrm-restart', reqId: 2 }); // gen 1 → 2
    await flush();
    const before = table.updates.length;

    port.send({
      kind: 'ssrm-update-rows',
      reqId: 3,
      generation: 1, // computed against the dead generation
      rows: [{ positionId: 'a', pnl: 99 }],
    });
    await flush();

    const ack = port.acks().find((a) => a.reqId === 3)!;
    expect(ack.error).toMatch(/stale generation 1/);
    expect(table.updates.length).toBe(before);
    await handle.stop();
  });

  it('refuses rows missing the key column — all-or-nothing, nothing written', async () => {
    const { port, table, handle } = await liveWorkerHarness();
    const before = table.updates.length;

    port.send({
      kind: 'ssrm-update-rows',
      reqId: 2,
      generation: 1,
      rows: [
        { positionId: 'a', pnl: 1 },
        { pnl: 2 }, // unkeyed — the whole batch must be refused
      ],
    });
    await flush();

    const ack = port.acks().find((a) => a.reqId === 2)!;
    expect(ack.error).toMatch(/missing key column 'positionId'/);
    expect(table.updates.length).toBe(before);
    await handle.stop();
  });

  it('refuses update-rows before configure', async () => {
    const selfRef: { onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null } = {
      onconnect: null,
    };
    const handle = installSsrmWorker({
      selfRef,
      bootPerspectiveImpl: async () =>
        ({
          makeSession: () => ({ handle_request: async () => {}, close: () => {} }),
          localClient: { table: async () => new FakeHostedTable() },
        }) as unknown as BootedPerspective,
    });
    await handle.ready;
    const port = new FakePort();
    selfRef.onconnect!({ ports: [port as unknown as MessagePort] });
    port.send({ kind: 'ssrm-update-rows', reqId: 1, generation: 1, rows: [{ positionId: 'a' }] });
    await flush();

    const ack = port.acks()[0]!;
    expect(ack.error).toBe('update-rows before configure');
    await handle.stop();
  });
});
