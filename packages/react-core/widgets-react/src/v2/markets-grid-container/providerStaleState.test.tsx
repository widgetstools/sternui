/**
 * MarketsGridContainer — stale-data banner wiring from provider status
 * events (disconnect → banner + dataStale; loading/ready → clear).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@starui/engine';

const PROVIDER_ID = 'dp-stale-test';

const providerConfig = {
  providerType: 'mock',
  keyColumn: 'id',
  columnDefinitions: [{ field: 'id' }, { field: 'price' }],
};

const providerRow = {
  configId: PROVIDER_ID,
  name: 'Stale Test Provider',
  config: providerConfig,
};

type Status = 'loading' | 'ready' | 'error';

function createSubscribeHandle() {
  const hooks = {
    onStatus: null as null | ((status: Status, err?: string) => void),
    onUpdate: null as null | ((rows: unknown[]) => void),
    onReset: null as null | ((rows: unknown[]) => void),
  };
  return {
    hooks,
    handle: {
      onStatus(cb: (status: Status, err?: string) => void) {
        hooks.onStatus = cb;
      },
      onUpdate(cb: (rows: unknown[]) => void) {
        hooks.onUpdate = cb;
      },
      onReset(cb: (rows: unknown[]) => void) {
        hooks.onReset = cb;
      },
      unsubscribe: vi.fn(),
      snapshot: Promise.resolve([] as unknown[]),
    },
  };
}

let latestSubscribe: ReturnType<typeof createSubscribeHandle> | null = null;
const subscribeMock = vi.fn(() => {
  latestSubscribe = createSubscribeHandle();
  return latestSubscribe.handle;
});
const noopOnError = vi.fn();
const stableDpClient = { subscribe: subscribeMock };

const lastMarketsGridProps: { current: any } = { current: null };

vi.mock('@starui/grid', () => ({
  MarketsGrid: (props: any) => {
    lastMarketsGridProps.current = props;
    const readySentRef = React.useRef(false);
    React.useEffect(() => {
      if (!props.onReady || readySentRef.current) return;
      const api = {
        setGridOption: vi.fn(),
        getDisplayedRowCount: () => 0,
        flushAsyncTransactions: vi.fn(),
        applyTransactionAsync: vi.fn(),
        getRowNode: () => null,
      };
      const t = setTimeout(() => {
        if (readySentRef.current) return;
        readySentRef.current = true;
        props.onReady({
          gridApi: api,
          platform: {},
          profiles: {},
          saveAll: vi.fn(),
        });
      }, 0);
      return () => clearTimeout(t);
    }, [props.onReady]);
    return (
      <div
        data-testid="markets-grid-stub"
        data-stale={props.dataStale ? 'true' : 'false'}
        data-stale-message={props.dataStaleMessage ?? ''}
      />
    );
  },
}));

vi.mock('@starui/host-data-react/runtime', () => ({
  useDataServices: () => ({ client: stableDpClient }),
  useDataProviderConfig: (id: string | null | undefined) => ({
    cfg: id === PROVIDER_ID ? providerRow : null,
    loading: false,
  }),
  useResolvedCfg: (cfg: unknown) => cfg,
  useDataProvidersList: () => ({ configs: [providerRow] }),
  useAppDataStore: () => ({
    store: {
      get: vi.fn(),
      list: () => [],
      subscribe: vi.fn(),
    },
  }),
}));

vi.mock('./ProviderToolbar.js', () => ({ ProviderToolbar: () => null }));
vi.mock('./useChordHotkey.js', () => ({ useChordHotkey: () => {} }));
vi.mock('./LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));
vi.mock('./ProviderEditorDialog.js', () => ({ ProviderEditorDialog: () => null }));

import { MarketsGridContainer } from './MarketsGridContainer.js';

function makeAdapter(initial: unknown = null) {
  let current: unknown = initial;
  const adapter: StorageAdapter = {
    loadGridLevelData: vi.fn(async () => current),
    saveGridLevelData: vi.fn(async (_id: string, data: unknown) => {
      current = data;
    }),
  } as StorageAdapter;
  return adapter;
}

const baseProps = {
  gridId: 'g-stale',
  instanceId: 'inst-stale',
  appId: 'app-1',
  userId: 'u1',
} as const;

describe('MarketsGridContainer — provider stale state', () => {
  beforeEach(() => {
    latestSubscribe = null;
    subscribeMock.mockClear();
    noopOnError.mockClear();
    lastMarketsGridProps.current = null;
  });

  it('sets dataStale on provider error and clears after loading→ready', async () => {
    const adapter = makeAdapter({
      liveProviderId: PROVIDER_ID,
      historicalProviderId: null,
      mode: 'live',
    });
    const storage = vi.fn(() => adapter);

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        onError={noopOnError}
      />,
    );

    await waitFor(() => expect(subscribeMock).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(latestSubscribe?.hooks.onStatus).toBeTypeOf('function'));

    const onStatus = latestSubscribe!.hooks.onStatus!;

    await act(async () => {
      onStatus('loading');
      await Promise.resolve();
      onStatus('ready');
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.dataStale).toBe(false);
    });

    await act(async () => {
      onStatus('error', 'Provider disconnected');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.dataStale).toBe(true);
      expect(lastMarketsGridProps.current?.dataStaleMessage).toContain('Provider disconnected');
    });
    expect(noopOnError).toHaveBeenCalled();

    await act(async () => {
      onStatus('loading');
      await Promise.resolve();
      onStatus('ready');
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.dataStale).toBe(false);
    });
  }, 10_000);
});
