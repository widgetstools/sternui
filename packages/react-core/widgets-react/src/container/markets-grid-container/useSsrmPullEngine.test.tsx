/**
 * useSsrmPullEngine — psp-attach retry (blank-blotter fix). A schema-less
 * link fails retryably when the provider has no rows yet (feed down during
 * blotter open); the hook must re-post the hand-off with backoff instead of
 * leaving the table uncreated and the grid blank.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const linkCalls: Array<{ providerPort: unknown }> = [];

vi.mock('@wellsfargo-starui/host-data', () => ({
  createPerspectiveReadClient: vi.fn(
    () => new Promise(() => undefined), // read side irrelevant here
  ),
  linkProviderToPerspective: vi.fn((opts: { providerPort: unknown }) => {
    linkCalls.push(opts);
    return { readPort: {} };
  }),
  isPerspectiveAttachAck: (m: unknown) =>
    Boolean(m) && (m as { kind?: unknown }).kind === 'psp-attach-ok',
}));

vi.mock('@wellsfargo-starui/grid', () => ({
  createPerspectiveEngine: vi.fn(() => ({ dispose: vi.fn() })),
}));

import { useSsrmPullEngine } from './useSsrmPullEngine.js';

interface FakePort {
  onmessage: ((ev: { data: unknown }) => void) | null;
  start: () => void;
}
const ports: FakePort[] = [];

class FakeSharedWorker {
  port: FakePort;
  constructor() {
    this.port = { onmessage: null, start: () => undefined };
    ports.push(this.port);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  linkCalls.length = 0;
  ports.length = 0;
  vi.stubGlobal('SharedWorker', FakeSharedWorker as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const OPTS = {
  enabled: true,
  providerId: 'dp-1',
  keyColumn: 'id',
  routing: {
    appId: 'App',
    workerScriptUrl: '/provider.mjs',
    perspectiveWorkerScriptUrl: '/psp.mjs',
  } as never,
};

describe('useSsrmPullEngine psp-attach retry', () => {
  it('re-posts the hand-off with backoff on a retryable link error', async () => {
    const view = renderHook(() => useSsrmPullEngine(OPTS));
    expect(linkCalls).toHaveLength(1);

    // Worker acks: link failed because the provider has no rows yet.
    act(() => {
      ports[0]!.onmessage?.({
        data: {
          kind: 'psp-attach-ok',
          providerId: 'dp-1',
          linked: false,
          error: 'no schema available to create table — retry once data exists',
        },
      });
    });
    expect(linkCalls).toHaveLength(1); // retry is scheduled, not immediate

    await act(async () => {
      vi.advanceTimersByTime(2_100); // first backoff step
    });
    expect(linkCalls).toHaveLength(2);

    // Second attempt succeeds (or another window's link won) — no more retries.
    act(() => {
      ports[1]!.onmessage?.({
        data: { kind: 'psp-attach-ok', providerId: 'dp-1', linked: true },
      });
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(linkCalls).toHaveLength(2);

    view.unmount();
  });

  it('stops retrying on unmount', async () => {
    const view = renderHook(() => useSsrmPullEngine(OPTS));
    act(() => {
      ports[0]!.onmessage?.({
        data: { kind: 'psp-attach-ok', providerId: 'dp-1', linked: false, error: 'nope' },
      });
    });
    view.unmount();
    await act(async () => {
      vi.advanceTimersByTime(120_000);
    });
    expect(linkCalls).toHaveLength(1);
  });
});
