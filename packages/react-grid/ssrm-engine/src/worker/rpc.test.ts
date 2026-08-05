import { describe, expect, it } from 'vitest';
import { createSsrmRpcClient, serveSsrmRpc, type SsrmRpcError } from './rpc.js';
import type { SsrmRpcMethod } from './protocol.js';

/**
 * Every test here is a way a reply can go missing.
 *
 * That is the whole subject: across a port, a lost reply is a permanently
 * wedged grid, and the failure is silent on the side that lost it. So each case
 * asserts the promise SETTLES — the value it settles with is secondary.
 */

/** A client and a server on the two ends of one channel. */
function pair(handle: (method: SsrmRpcMethod, params: unknown) => unknown, timeoutMs = 200) {
  const channel = new MessageChannel();
  const stop = serveSsrmRpc(channel.port2 as unknown as MessagePort, handle);
  const client = createSsrmRpcClient(channel.port1 as unknown as MessagePort, { timeoutMs });
  return {
    client,
    close: () => {
      client.dispose();
      stop();
    },
  };
}

describe('the ssrm wire protocol', () => {
  it('round-trips a call', async () => {
    const { client, close } = pair((method, params) => ({ method, echoed: params }));
    await expect(client.call('size', { bookId: 'b' })).resolves.toEqual({
      method: 'size',
      echoed: { bookId: 'b' },
    });
    close();
  });

  it('rejects rather than hangs when the handler throws', async () => {
    const { client, close } = pair(() => {
      throw new Error('the book is on fire');
    });
    await expect(client.call('getRows', {})).rejects.toThrow(/the book is on fire/);
    close();
  });

  it('rejects rather than hangs when the handler rejects', async () => {
    const { client, close } = pair(() => Promise.reject(new Error('async failure')));
    await expect(client.call('getRows', {})).rejects.toThrow(/async failure/);
    close();
  });

  /**
   * The case the July engine did not have at all. A worker that simply never
   * answers must cost the caller a rejection, not an `outboundRequests` slot.
   */
  it('times a call out instead of leaving it pending', async () => {
    const { client, close } = pair(() => new Promise(() => {}), 40);
    const error = (await client.call('getRows', {}).catch((e: SsrmRpcError) => e)) as SsrmRpcError;
    expect(error.code).toBe('timeout');
    expect(error.message).toMatch(/'getRows' did not answer within 40 ms/);
    expect(client.stats().timedOut).toBe(1);
    expect(client.stats().pending).toBe(0);
    close();
  });

  /**
   * A reply that arrives after its timeout has no promise left to settle. It
   * must be COUNTED, because "the worker never answered" and "the worker
   * answered too slowly" are different problems with the same symptom.
   */
  it('counts a late reply rather than dropping it silently', async () => {
    const { client, close } = pair(
      () => new Promise((resolve) => setTimeout(() => resolve('eventually'), 60)),
      20,
    );
    await expect(client.call('size', {})).rejects.toThrow(/did not answer/);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(client.stats().late).toBe(1);
    expect(client.stats().pending).toBe(0);
    close();
  });

  /**
   * A result that will not structured-clone throws inside the WORKER's
   * `postMessage`. Dropping it there costs the caller a full timeout for a
   * failure that is already known, so the server answers with the failure.
   */
  it('answers with an error when the result cannot be cloned', async () => {
    const { client, close } = pair(() => ({ notCloneable: () => 1 }), 5_000);
    const error = (await client.call('getRows', {}).catch((e: SsrmRpcError) => e)) as SsrmRpcError;
    expect(error.code).toBe('remote');
    expect(error.message).toMatch(/could not be cloned/);
    close();
  });

  /** Uncloneable PARAMS throw synchronously in the window — the loud case. */
  it('rejects when the params cannot be cloned', async () => {
    const { client, close } = pair(() => 'never reached');
    const error = (await client
      .call('applyUpdate', { rows: [{ fn: () => 1 }] })
      .catch((e: SsrmRpcError) => e)) as SsrmRpcError;
    expect(error.code).toBe('clone');
    expect(client.stats().pending).toBe(0);
    close();
  });

  it('fails everything in flight when the client is disposed', async () => {
    const { client, close } = pair(() => new Promise(() => {}), 5_000);
    const pending = client.call('getRows', {});
    client.dispose('the window went away');
    const error = (await pending.catch((e: SsrmRpcError) => e)) as SsrmRpcError;
    expect(error.code).toBe('closed');
    await expect(client.call('getRows', {})).rejects.toThrow(/the window went away/);
    close();
  });

  it('answers an unknown method rather than ignoring it', async () => {
    const { client, close } = pair((method) => {
      throw new Error(`unknown method '${method}'`);
    });
    await expect(client.call('nonsense' as SsrmRpcMethod, {})).rejects.toThrow(/unknown method/);
    close();
  });
});
