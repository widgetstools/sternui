/**
 * P1b — config read hooks are served window-side (hub-free).
 *
 * `useDataProviderConfig` / `useDataProvidersList` must read through the
 * main-thread `DataProviderConfigStore` (over the window's own ConfigManager)
 * when a manager is present, tick invalidation off `configManager.onConfigChanged`,
 * and fall back to the hub client only in a manager-less bootstrap.
 *
 * The store is mocked so we can assert *which path* each hook takes (window
 * store vs hub client) without exercising ConfigManager/IndexedDB. Its
 * get()/list() resolve to module-level values set before each render (the
 * read effect fires on mount, so the value must exist by then).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ConfigManager } from '@starui/host-config';
import type { DataServices } from '@starui/host-data/runtime';
import type { DataProviderConfig } from '@starui/types';
import { DataServicesProvider } from './DataServicesProvider.js';
import { useDataProviderConfig, useDataProvidersList } from './index.js';

let nextGet: DataProviderConfig | null = null;
let nextList: DataProviderConfig[] = [];
const storeInstances: Array<{ get: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn> }> = [];

vi.mock('@starui/host-data/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@starui/host-data/runtime')>();
  class MockConfigStore {
    get = vi.fn(async () => nextGet);
    list = vi.fn(async () => nextList);
    constructor(_cm: unknown, _invalidate: unknown) {
      storeInstances.push(this);
    }
  }
  return { ...actual, DataProviderConfigStore: MockConfigStore };
});

function cfg(providerId: string): DataProviderConfig {
  return { providerId, name: providerId, providerType: 'stomp', config: {} } as unknown as DataProviderConfig;
}

interface Harness {
  services: DataServices;
  client: {
    getProviderConfig: ReturnType<typeof vi.fn>;
    listProviderConfigs: ReturnType<typeof vi.fn>;
    onCatalogChange: ReturnType<typeof vi.fn>;
    invalidateConfig: ReturnType<typeof vi.fn>;
  };
  /** Fire the captured `onConfigChanged` listener (no-op until the hook subscribes). */
  fireConfigChanged: (id: string) => void;
  onConfigChanged: ReturnType<typeof vi.fn>;
}

function makeHarness(opts: { withManager: boolean }): Harness {
  const client = {
    getProviderConfig: vi.fn().mockResolvedValue(null),
    listProviderConfigs: vi.fn().mockResolvedValue([]),
    onCatalogChange: vi.fn(() => () => undefined),
    invalidateConfig: vi.fn(),
  };

  let listener: ((id: string) => void) | null = null;
  const onConfigChanged = vi.fn((cb: (id: string) => void) => {
    listener = cb;
    return () => { listener = null; };
  });

  const configManager = opts.withManager
    ? ({
        onConfigChanged,
        getAppId: () => 'app',
        getIdentity: () => ({ userId: 'u' }),
      } as unknown as ConfigManager)
    : undefined;

  const services = {
    client: client as unknown as DataServices['client'],
    appData: {
      ready: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(() => () => undefined),
    } as unknown as DataServices['appData'],
    configManager,
    ready: Promise.resolve(),
    dispose: vi.fn(),
  } as DataServices;

  return {
    services,
    client,
    onConfigChanged,
    fireConfigChanged: (id: string) => act(() => listener?.(id)),
  };
}

function wrapperFor(services: DataServices) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <DataServicesProvider services={services}>{children}</DataServicesProvider>;
  };
}

beforeEach(() => {
  storeInstances.length = 0;
  nextGet = null;
  nextList = [];
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe('useDataProviderConfig — window-side reads (P1b)', () => {
  it('reads via configStore.get (not the hub client) when a manager is present', async () => {
    const h = makeHarness({ withManager: true });
    nextGet = cfg('p1');
    const { result } = renderHook(() => useDataProviderConfig('p1'), { wrapper: wrapperFor(h.services) });

    await waitFor(() => expect(result.current.cfg?.providerId).toBe('p1'));
    expect(storeInstances.at(-1)!.get).toHaveBeenCalledWith('p1');
    expect(h.client.getProviderConfig).not.toHaveBeenCalled();
  });

  it('re-reads only when onConfigChanged fires for this provider', async () => {
    const h = makeHarness({ withManager: true });
    nextGet = cfg('p1');
    const { result } = renderHook(() => useDataProviderConfig('p1'), { wrapper: wrapperFor(h.services) });
    const store = storeInstances.at(-1)!;
    await waitFor(() => expect(result.current.cfg?.providerId).toBe('p1'));
    const initialCalls = store.get.mock.calls.length;

    // Unrelated provider change → no re-read.
    h.fireConfigChanged('other');
    expect(store.get.mock.calls.length).toBe(initialCalls);

    // Matching provider change → re-read.
    h.fireConfigChanged('p1');
    await waitFor(() => expect(store.get.mock.calls.length).toBe(initialCalls + 1));
  });

  it('falls back to the hub client when no manager is present', async () => {
    const h = makeHarness({ withManager: false });
    h.client.getProviderConfig.mockResolvedValue(cfg('p1'));
    const { result } = renderHook(() => useDataProviderConfig('p1'), { wrapper: wrapperFor(h.services) });

    await waitFor(() => expect(result.current.cfg?.providerId).toBe('p1'));
    expect(h.client.getProviderConfig).toHaveBeenCalledWith('p1');
    expect(storeInstances.at(-1)!.get).not.toHaveBeenCalled();
  });
});

describe('useDataProvidersList — window-side reads (P1b)', () => {
  it('lists via configStore.list (not the hub client) when a manager is present', async () => {
    const h = makeHarness({ withManager: true });
    nextList = [cfg('p1'), cfg('p2')];
    const { result } = renderHook(() => useDataProvidersList({ subtype: 'stomp' }), { wrapper: wrapperFor(h.services) });

    await waitFor(() => expect(result.current.configs).toHaveLength(2));
    expect(storeInstances.at(-1)!.list).toHaveBeenCalledWith(expect.any(String), { subtype: 'stomp' });
    expect(h.client.listProviderConfigs).not.toHaveBeenCalled();
  });

  it('re-lists on any config change', async () => {
    const h = makeHarness({ withManager: true });
    const { result } = renderHook(() => useDataProvidersList(), { wrapper: wrapperFor(h.services) });
    const store = storeInstances.at(-1)!;
    await waitFor(() => expect(result.current.loading).toBe(false));
    const initialCalls = store.list.mock.calls.length;

    h.fireConfigChanged('anything');
    await waitFor(() => expect(store.list.mock.calls.length).toBe(initialCalls + 1));
  });

  it('falls back to the hub client when no manager is present', async () => {
    const h = makeHarness({ withManager: false });
    h.client.listProviderConfigs.mockResolvedValue([cfg('p1')]);
    const { result } = renderHook(() => useDataProvidersList(), { wrapper: wrapperFor(h.services) });

    await waitFor(() => expect(result.current.configs).toHaveLength(1));
    expect(h.client.listProviderConfigs).toHaveBeenCalled();
    expect(storeInstances.at(-1)!.list).not.toHaveBeenCalled();
  });
});
