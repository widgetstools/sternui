import { describe, expect, it, vi } from 'vitest';
import type { DatasetStateSnapshot, SsrmDatasetConfig } from '@starui/host-data/runtime/ssrm';
import { connectSsrmProvider } from '../../pull/connectSsrmProvider.js';
import type { SharedWorkerHandle, SsrmDataClient } from '../../pull/connectSsrmProvider.js';

interface ControlRequest {
  kind: 'ssrm-configure' | 'ssrm-restart' | 'ssrm-state';
  reqId: number;
}

/** Scripted worker control port — acks every request with its state. */
class FakeControlPort {
  state: DatasetStateSnapshot = { phase: 'live', rowCount: 20_000, generation: 1 };
  tableName = 'positions';
  closed = false;
  readonly sent: ControlRequest[] = [];
  private readonly handlers: Array<(ev: MessageEvent) => void> = [];

  addEventListener(_type: 'message', cb: (ev: MessageEvent) => void): void {
    this.handlers.push(cb);
  }

  start(): void {}

  close(): void {
    this.closed = true;
  }

  postMessage(message: ControlRequest): void {
    this.sent.push(message);
    queueMicrotask(() => {
      if (message.kind === 'ssrm-restart') {
        this.state = { phase: 'connecting', rowCount: 0, generation: this.state.generation + 1 };
      }
      this.emit({ kind: 'ssrm-ack', reqId: message.reqId, state: this.state, tableName: this.tableName });
    });
  }

  emit(data: unknown): void {
    for (const cb of [...this.handlers]) cb({ data } as MessageEvent);
  }
}

const config: SsrmDatasetConfig = {
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: '/snapshot/positions/T',
  keyColumn: 'positionId',
  tableName: 'positions',
};

function harness(openTableImpl?: (name: string) => Promise<unknown>) {
  const controlPort = new FakeControlPort();
  const workerNames: string[] = [];
  const openTable = vi.fn(openTableImpl ?? (async (name: string) => ({ hosted: name })));
  const client: SsrmDataClient = { open_table: openTable, terminate: vi.fn() };
  let workerCount = 0;
  const createWorker = (_url: string | URL, name: string): SharedWorkerHandle => {
    workerNames.push(name);
    workerCount += 1;
    return { port: (workerCount === 1 ? controlPort : {}) as unknown as MessagePort };
  };
  const openDataClient = vi.fn(async (_worker: SharedWorkerHandle) => client);
  return { controlPort, workerNames, openTable, client, createWorker, openDataClient };
}

describe('connectSsrmProvider', () => {
  it('configures over the control port and records the acked state', async () => {
    const h = harness();
    const connection = await connectSsrmProvider({
      appId: 'app',
      providerId: 'prov',
      workerUrl: 'worker.mjs',
      config,
      createWorker: h.createWorker,
      openDataClient: h.openDataClient,
    });
    expect(h.workerNames).toEqual(['starui-ssrm:app:prov']);
    expect(h.controlPort.sent[0]!.kind).toBe('ssrm-configure');
    expect(connection.state).toEqual({ phase: 'live', rowCount: 20_000, generation: 1 });
    expect(connection.tableName).toBe('positions');
    connection.dispose();
  });

  it('replays the latest state to new subscribers and forwards broadcasts', async () => {
    const h = harness();
    const connection = await connectSsrmProvider({
      appId: 'app',
      providerId: 'prov',
      workerUrl: 'worker.mjs',
      config,
      createWorker: h.createWorker,
      openDataClient: h.openDataClient,
    });
    const seen: DatasetStateSnapshot[] = [];
    connection.onState((state) => seen.push(state));
    expect(seen).toHaveLength(1); // immediate replay
    h.controlPort.emit({
      kind: 'ssrm-state',
      state: { phase: 'live', rowCount: 20_001, generation: 1 },
      tableName: 'positions',
    });
    expect(seen).toHaveLength(2);
    expect(connection.state!.rowCount).toBe(20_001);
    connection.dispose();
  });

  it('opens the hosted table once via a second worker port (memoized)', async () => {
    const h = harness();
    const connection = await connectSsrmProvider({
      appId: 'app',
      providerId: 'prov',
      workerUrl: 'worker.mjs',
      config,
      createWorker: h.createWorker,
      openDataClient: h.openDataClient,
    });
    const first = await connection.openTable();
    const second = await connection.openTable();
    expect(second).toBe(first);
    expect(h.workerNames).toEqual(['starui-ssrm:app:prov', 'starui-ssrm:app:prov']);
    expect(h.openDataClient).toHaveBeenCalledTimes(1);
    expect(h.openTable).toHaveBeenCalledTimes(1);
    expect(h.openTable).toHaveBeenCalledWith('positions');
    connection.dispose();
  });

  it('retries open_table while the seed has not created the table yet', async () => {
    let calls = 0;
    const h = harness(async (name: string) => {
      calls += 1;
      if (calls === 1) throw new Error(`no such table: ${name}`);
      return { hosted: name };
    });
    const connection = await connectSsrmProvider({
      appId: 'app',
      providerId: 'prov',
      workerUrl: 'worker.mjs',
      config,
      createWorker: h.createWorker,
      openDataClient: h.openDataClient,
    });
    await expect(connection.openTable()).resolves.toEqual({ hosted: 'positions' });
    expect(calls).toBe(2);
    connection.dispose();
  }, 10_000);

  it('restart() returns the bumped generation and updates state', async () => {
    const h = harness();
    const connection = await connectSsrmProvider({
      appId: 'app',
      providerId: 'prov',
      workerUrl: 'worker.mjs',
      config,
      createWorker: h.createWorker,
      openDataClient: h.openDataClient,
    });
    const state = await connection.restart();
    expect(state.generation).toBe(2);
    expect(connection.state!.generation).toBe(2);
    connection.dispose();
  });

  it('dispose() closes the control port and terminates the data client', async () => {
    const h = harness();
    const connection = await connectSsrmProvider({
      appId: 'app',
      providerId: 'prov',
      workerUrl: 'worker.mjs',
      config,
      createWorker: h.createWorker,
      openDataClient: h.openDataClient,
    });
    await connection.openTable();
    connection.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.controlPort.closed).toBe(true);
    expect(h.client.terminate).toHaveBeenCalledTimes(1);
  });
});
