import { describe, it, expect } from 'vitest';
import {
  isRequest,
  isResponse,
  type ConfigureRequest,
  type GetRequest,
  type PutRequest,
  type SubscribeRequest,
  type UnsubscribeRequest,
  type InvalidateRequest,
  type TeardownRequest,
  type PingRequest,
  type SubscribeStreamRequest,
  type GetCachedRowsRequest,
  type OkResponse,
  type UpdateResponse,
  type SubEstablishedResponse,
  type ErrResponse,
  type PongResponse,
  type SnapshotBatchResponse,
  type SnapshotCompleteResponse,
  type RowUpdateResponse,
  type DataPlaneRequest,
  type DataPlaneResponse,
} from './protocol';

/**
 * Round-trip coverage: every message shape must survive
 *   • JSON.stringify + JSON.parse (the cross-process fallback path)
 *   • structured clone (the native SharedWorker path)
 * without losing any field, and must pass its matching type guard
 * after the round-trip.
 */

function jsonRoundTrip<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function cloneRoundTrip<T>(v: T): T {
  // jsdom ships structuredClone as of recent versions; fall back to
  // JSON in environments where it isn't available.
  const fn = (globalThis as { structuredClone?: <U>(x: U) => U }).structuredClone;
  return fn ? fn(v) : jsonRoundTrip(v);
}

describe('protocol — request shapes', () => {
  const requests: DataPlaneRequest[] = [
    {
      op: 'configure',
      reqId: 'r1',
      providerId: 'p1',
      config: {
        providerType: 'mock',
        dataType: 'positions',
        rowCount: 50,
        updateInterval: 2000,
      },
    } satisfies ConfigureRequest,
    { op: 'get', reqId: 'r2', providerId: 'p1', key: '/positions' } satisfies GetRequest,
    { op: 'put', reqId: 'r3', providerId: 'app1', key: 'token1', value: { x: 1 } } satisfies PutRequest,
    { op: 'subscribe', reqId: 'r4', subId: 's1', providerId: 'p1', key: '/positions' } satisfies SubscribeRequest,
    { op: 'unsubscribe', subId: 's1' } satisfies UnsubscribeRequest,
    { op: 'invalidate', reqId: 'r5', providerId: 'p1' } satisfies InvalidateRequest,
    { op: 'invalidate', reqId: 'r6', providerId: 'p1', key: '/positions' } satisfies InvalidateRequest,
    { op: 'teardown', reqId: 'r7', providerId: 'p1' } satisfies TeardownRequest,
    { op: 'ping', reqId: 'r8' } satisfies PingRequest,
    {
      op: 'subscribe-stream',
      reqId: 'r9',
      subId: 's2',
      providerId: 'bond-blotter',
    } satisfies SubscribeStreamRequest,
    { op: 'get-cached-rows', reqId: 'r10', providerId: 'bond-blotter' } satisfies GetCachedRowsRequest,
  ];

  it.each(requests)('survives JSON round-trip: %o', (req) => {
    const out = jsonRoundTrip(req);
    expect(out).toEqual(req);
    expect(isRequest(out)).toBe(true);
  });

  it.each(requests)('survives structured-clone round-trip: %o', (req) => {
    const out = cloneRoundTrip(req);
    expect(out).toEqual(req);
    expect(isRequest(out)).toBe(true);
  });
});

describe('protocol — response shapes', () => {
  const responses: DataPlaneResponse[] = [
    { op: 'ok', reqId: 'r1', cached: false, fetchedAt: 0 } satisfies OkResponse,
    {
      op: 'ok',
      reqId: 'r2',
      value: [{ id: 1 }, { id: 2 }],
      cached: true,
      fetchedAt: 1_700_000_000_000,
    } satisfies OkResponse,
    {
      op: 'update',
      subId: 's1',
      providerId: 'p1',
      key: '/positions',
      value: { id: 1, px: 100 },
      seq: 42,
    } satisfies UpdateResponse,
    { op: 'sub-established', reqId: 'r4', subId: 's1' } satisfies SubEstablishedResponse,
    {
      op: 'err',
      reqId: 'r2',
      error: { code: 'FETCH_FAILED', message: 'network', retryable: true },
    } satisfies ErrResponse,
    { op: 'pong', reqId: 'r8' } satisfies PongResponse,
    {
      op: 'snapshot-batch',
      providerId: 'bond-blotter',
      subId: 's2',
      rows: [{ positionId: 'P1', quantity: 100 }, { positionId: 'P2', quantity: 50 }],
      batch: 0,
      isFinal: false,
    } satisfies SnapshotBatchResponse,
    {
      op: 'snapshot-batch',
      reqId: 'r10',
      providerId: 'bond-blotter',
      rows: [{ positionId: 'P1' }],
      batch: 0,
      isFinal: true,
      diagnostics: {
        keyColumn: 'positionId',
        cacheSize: 1,
        rowsReceived: 1,
        skipped: 0,
      },
    } satisfies SnapshotBatchResponse,
    {
      op: 'snapshot-complete',
      providerId: 'bond-blotter',
      subId: 's2',
      rowCount: 1000,
    } satisfies SnapshotCompleteResponse,
    {
      op: 'row-update',
      providerId: 'bond-blotter',
      subId: 's2',
      rows: [{ positionId: 'P1', quantity: 150 }],
      seq: 1,
    } satisfies RowUpdateResponse,
  ];

  it.each(responses)('survives JSON round-trip: %o', (res) => {
    const out = jsonRoundTrip(res);
    expect(out).toEqual(res);
    expect(isResponse(out)).toBe(true);
  });

  it.each(responses)('survives structured-clone round-trip: %o', (res) => {
    const out = cloneRoundTrip(res);
    expect(out).toEqual(res);
    expect(isResponse(out)).toBe(true);
  });
});

describe('protocol — type guards', () => {
  it('isRequest rejects non-objects', () => {
    expect(isRequest(null)).toBe(false);
    expect(isRequest(undefined)).toBe(false);
    expect(isRequest('hello')).toBe(false);
    expect(isRequest(42)).toBe(false);
    expect(isRequest([])).toBe(false);
  });

  it('isRequest rejects unknown ops', () => {
    expect(isRequest({ op: 'unknown', reqId: 'x' })).toBe(false);
    expect(isRequest({ op: 'ok' })).toBe(false); // response op, not request
  });

  it('isResponse rejects request ops', () => {
    expect(isResponse({ op: 'get' })).toBe(false);
    expect(isResponse({ op: 'configure' })).toBe(false);
  });

  it('guards narrow correctly inside switch/case', () => {
    const msg: unknown = { op: 'get', reqId: 'r', providerId: 'p', key: 'k' };
    if (isRequest(msg)) {
      if (msg.op === 'get') {
        // narrowed to GetRequest
        const providerId: string = msg.providerId;
        const key: string = msg.key;
        expect(providerId).toBe('p');
        expect(key).toBe('k');
      }
    }
  });
});
