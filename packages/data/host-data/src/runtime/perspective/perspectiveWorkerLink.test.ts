import { describe, expect, it, vi } from 'vitest';
import {
  isPerspectiveAttachAck,
  isPerspectiveAttachRequest,
  linkProviderToPerspective,
  parsePerspectiveWorkerName,
  perspectiveSharedWorkerName,
  resolvePerspectiveWorkerUrl,
  type SharedWorkerLike,
} from './perspectiveWorkerLink.js';

describe('perspective worker naming', () => {
  it('names one engine worker per (appId, providerId)', () => {
    expect(perspectiveSharedWorkerName('Star-Demo', 'dp-1')).toBe(
      'starui-psp:Star-Demo:dp-1',
    );
  });

  it('round-trips the name', () => {
    const name = perspectiveSharedWorkerName('Star-Demo', 'dp-1');
    expect(parsePerspectiveWorkerName(name)).toEqual({
      appId: 'Star-Demo',
      providerId: 'dp-1',
    });
  });

  it('keeps colons inside a providerId (uuids, composite ids)', () => {
    const parsed = parsePerspectiveWorkerName('starui-psp:App:stomp:live');
    expect(parsed).toEqual({ appId: 'App', providerId: 'stomp:live' });
  });

  it('rejects foreign or malformed names', () => {
    expect(parsePerspectiveWorkerName('mkt-data-services:App')).toBeNull();
    expect(parsePerspectiveWorkerName('starui-psp:App')).toBeNull();
    expect(parsePerspectiveWorkerName('starui-psp:App:')).toBeNull();
    expect(parsePerspectiveWorkerName('starui-psp::dp-1')).toBeNull();
  });

  it('resolves the worker asset as a sibling of the host bundle', () => {
    expect(
      resolvePerspectiveWorkerUrl('https://x/assets/provider-worker.mjs').href,
    ).toBe('https://x/assets/perspective-server.worker.mjs');
  });
});

describe('linkProviderToPerspective', () => {
  function harness() {
    const created: string[] = [];
    const posted: Array<{ message: unknown; transfer?: Transferable[] }> = [];
    const ports: MessagePort[] = [];
    const createWorker = (url: string, name: string): SharedWorkerLike => {
      created.push(name);
      const port = { __id: created.length } as unknown as MessagePort;
      ports.push(port);
      return { port };
    };
    const providerPort = {
      postMessage: vi.fn((message: unknown, transfer?: Transferable[]) => {
        posted.push({ message, transfer });
      }),
    };
    return { created, posted, ports, createWorker, providerPort };
  }

  const opts = (h: ReturnType<typeof harness>) => ({
    appId: 'Star-Demo',
    providerId: 'dp-1',
    dataset: 'main',
    keyColumn: 'positionId',
    workerScriptUrl: '/assets/perspective-server.worker.mjs',
    providerPort: h.providerPort,
    createWorker: h.createWorker,
  });

  it('transfers a port to the provider worker with the attach request', () => {
    const h = harness();
    linkProviderToPerspective(opts(h));

    expect(h.providerPort.postMessage).toHaveBeenCalledTimes(1);
    const { message, transfer } = h.posted[0]!;
    expect(isPerspectiveAttachRequest(message)).toBe(true);
    expect(message).toMatchObject({
      kind: 'psp-attach',
      providerId: 'dp-1',
      dataset: 'main',
      keyColumn: 'positionId',
    });
    // The port must be TRANSFERRED — a copy would leave writes on this thread.
    expect(transfer).toHaveLength(1);
    expect(transfer![0]).toBe(h.ports[0]);
  });

  it('returns a SEPARATE port for this window to read on', () => {
    const h = harness();
    const { readPort } = linkProviderToPerspective(opts(h));
    // Never the transferred port — that one belongs to the provider worker.
    expect(readPort).not.toBe(h.ports[0]);
    expect(readPort).toBe(h.ports[1]);
  });

  it('uses the same worker NAME for both connections (one server, one table)', () => {
    const h = harness();
    linkProviderToPerspective(opts(h));
    expect(h.created).toEqual([
      'starui-psp:Star-Demo:dp-1',
      'starui-psp:Star-Demo:dp-1',
    ]);
  });

  it('gives different providers different engine workers', () => {
    const h = harness();
    linkProviderToPerspective(opts(h));
    linkProviderToPerspective({ ...opts(h), providerId: 'dp-2' });
    expect(h.created).toContain('starui-psp:Star-Demo:dp-1');
    expect(h.created).toContain('starui-psp:Star-Demo:dp-2');
  });
});

describe('attach message guards', () => {
  it('accepts well-formed messages and rejects noise', () => {
    expect(isPerspectiveAttachRequest({ kind: 'psp-attach' })).toBe(true);
    expect(isPerspectiveAttachRequest({ kind: 'attach' })).toBe(false);
    expect(isPerspectiveAttachRequest(null)).toBe(false);
    expect(isPerspectiveAttachAck({ kind: 'psp-attach-ok' })).toBe(true);
    expect(isPerspectiveAttachAck({ kind: 'psp-attach' })).toBe(false);
  });
});
