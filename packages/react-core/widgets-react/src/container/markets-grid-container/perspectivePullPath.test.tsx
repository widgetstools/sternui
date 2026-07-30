/**
 * MarketsGridContainer on the Perspective pull path.
 *
 * The claim under test is that `rowModel="perspective"` changes the row supply
 * and nothing else: the same catalog row, the same column defs, the same
 * toolbar — but the book stays in the worker and this window never receives it.
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ProviderStatus } from '@starui/host-data/runtime';
import type { StorageAdapter } from '@starui/engine';

const LIVE_PROVIDER_ID = 'dp-live';

const liveProviderRow = {
  providerId: LIVE_PROVIDER_ID,
  name: 'Live Provider',
  providerType: 'stomp-perspective',
  config: {
    providerType: 'stomp-perspective',
    keyColumn: 'positionId',
    columnDefinitions: [{ field: 'positionId' }, { field: 'pnl' }],
  },
} as const;

const fakeTable = { view: vi.fn() };

const lastMarketsGridProps: { current: Record<string, unknown> | null } = { current: null };
const { perspectiveCalls, perspectiveState } = vi.hoisted(() => ({
  perspectiveCalls: [] as Array<{ providerId: unknown; enabled: unknown }>,
  perspectiveState: {
    current: { table: null as unknown, tableName: null as string | null, status: 'idle', reason: undefined as string | undefined },
  },
}));

vi.mock('@starui/grid', () => ({
  resolvePerspective: (opts: { rowModel?: string }) => opts.rowModel === 'perspective',
  usePerspectiveTable: (
    _client: unknown,
    providerId: unknown,
    opts: { enabled?: boolean } = {},
  ) => {
    perspectiveCalls.push({ providerId, enabled: opts.enabled });
    return perspectiveState.current;
  },
  resolveUseSsrm: (opts: { useSSRM?: boolean; rowModel?: string }) =>
    opts.useSSRM !== undefined ? Boolean(opts.useSSRM) : opts.rowModel === 'server',
  useGeneralSettingsSnapshot: () => undefined,
  MarketsGrid: (props: Record<string, unknown>) => {
    lastMarketsGridProps.current = props;
    // The push path only wires once AG Grid reports ready, so the stub has to
    // deliver a handle — otherwise "did not subscribe" would pass for the
    // wrong reason on every row model.
    const sent = React.useRef(false);
    const onReady = props.onReady as ((handle: unknown) => void) | undefined;
    React.useEffect(() => {
      if (!onReady || sent.current) return;
      // Deferred a macrotask: the container stamps the api against the key it
      // expects, and that ref is set by an effect of its own.
      const t = setTimeout(() => {
        if (sent.current) return;
        sent.current = true;
        onReady({
          gridApi: {
            setGridOption: vi.fn(),
            getDisplayedRowCount: () => 0,
            flushAsyncTransactions: vi.fn(),
            applyTransactionAsync: vi.fn(),
            getRowNode: () => null,
          },
          platform: {},
          profiles: {},
          saveAll: vi.fn(),
        });
      }, 0);
      return () => clearTimeout(t);
    }, [onReady]);
    return <div data-testid="markets-grid-stub" />;
  },
  createMarketsGridContainerEventBus: () => ({ emit: vi.fn(), on: vi.fn(() => () => {}) }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

const { dataHubClientMock, providerMock } = vi.hoisted(() => {
  const provider = {
    onRowsReceived: vi.fn(() => () => {}),
    onSnapshotData: vi.fn(() => () => {}),
    onTick: vi.fn(() => () => {}),
    onStatus: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
    refresh: vi.fn(async () => {}),
  };
  return {
    providerMock: provider,
    dataHubClientMock: {
      isProviderRunning: vi.fn().mockResolvedValue(false),
      waitForProviderRunning: vi.fn().mockResolvedValue(false),
    },
  };
});

vi.mock('@starui/host-data-react/runtime', () => ({
  useDataServices: () => ({ client: dataHubClientMock }),
  useDataProvider: () => ({
    provider: providerMock,
    status: 'ready' as ProviderStatus,
    error: undefined,
    start: vi.fn(),
    refresh: vi.fn(),
    restart: vi.fn(async () => {}),
  }),
  useDataProviderConfig: () => ({ cfg: liveProviderRow, loading: false }),
  useResolvedCfg: (cfg: unknown) => (cfg as { config?: unknown })?.config ?? cfg,
  useDataProvidersList: () => ({ configs: [liveProviderRow] }),
  useAppDataStore: () => ({
    store: { get: vi.fn(), set: vi.fn(), list: () => [], subscribe: vi.fn() },
  }),
}));

vi.mock('./LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));
vi.mock('./ProviderEditorDialog.js', () => ({ ProviderEditorDialog: () => null }));

import { MarketsGridContainer } from './MarketsGridContainer.js';

function makeStorage() {
  const adapter: StorageAdapter = {
    loadGridLevelData: vi.fn(async () => null),
    saveGridLevelData: vi.fn(async () => {}),
  } as StorageAdapter;
  return vi.fn(() => adapter);
}

const renderContainer = (rowModel?: 'client' | 'server' | 'perspective') =>
  render(
    <MarketsGridContainer
      gridId="g1"
      instanceId="inst-1"
      appId="app-1"
      userId="u1"
      storage={makeStorage() as never}
      defaultLiveProviderId={LIVE_PROVIDER_ID}
      {...(rowModel ? { rowModel } : {})}
    />,
  );

describe('MarketsGridContainer — Perspective pull path', () => {
  beforeEach(() => {
    lastMarketsGridProps.current = null;
    perspectiveCalls.length = 0;
    providerMock.onSnapshotData.mockClear();
    perspectiveState.current = {
      table: fakeTable,
      tableName: 'positions',
      status: 'ready',
      reason: undefined,
    };
  });

  it('hands the worker-held Table to MarketsGrid, keyed by the provider key column', async () => {
    renderContainer('perspective');

    await waitFor(() => expect(lastMarketsGridProps.current?.perspectiveTable).toBe(fakeTable));
    expect(lastMarketsGridProps.current?.perspectiveKeyColumn).toBe('positionId');
    expect(perspectiveCalls.at(-1)).toEqual({ providerId: LIVE_PROVIDER_ID, enabled: true });
  });

  // Subscribing would ship the whole book to this window every snapshot — the
  // exact cost the pull path exists to avoid.
  it('never subscribes to the push stream', async () => {
    renderContainer('perspective');

    await waitFor(() => expect(lastMarketsGridProps.current).not.toBeNull());
    // Give the deferred onReady — the push path's own trigger — a chance to fire.
    await new Promise((r) => setTimeout(r, 10));
    expect(providerMock.onSnapshotData).not.toHaveBeenCalled();
  });

  it('leaves the push path untouched on the default row model', async () => {
    renderContainer();

    await waitFor(() => expect(providerMock.onSnapshotData).toHaveBeenCalled());
    expect(lastMarketsGridProps.current?.perspectiveTable).toBeUndefined();
    // The hook still runs — hooks are unconditional — but attaches nothing.
    expect(perspectiveCalls.at(-1)).toEqual({ providerId: null, enabled: false });
  });

  it('reports a provider that holds no Table instead of waiting on it', async () => {
    perspectiveState.current = {
      table: null,
      tableName: null,
      status: 'unavailable',
      reason: "provider 'dp-live' is stomp, which holds no Table",
    };
    const onError = vi.fn();

    render(
      <MarketsGridContainer
        gridId="g1"
        instanceId="inst-1"
        appId="app-1"
        userId="u1"
        storage={makeStorage() as never}
        defaultLiveProviderId={LIVE_PROVIDER_ID}
        rowModel="perspective"
        onError={onError}
      />,
    );

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect((onError.mock.calls[0][0] as Error).message).toContain('holds no Table');
  });
});
