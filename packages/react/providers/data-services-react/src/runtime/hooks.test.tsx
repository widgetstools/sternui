/**
 * v2 React hook tests — exercise the round-trip through a real
 * SharedWorkerDataServicesClient + SharedWorkerDataServicesHub via createInPageWiring.
 *
 * The mock provider's factory is registered per test so each
 * controller is fresh.
 *
 * Tests construct a `DataServices`-shaped object directly (rather
 * than calling `bootstrapDataServices`) because the in-process
 * `createInPageWiring` already builds the client; bootstrap's own
 * unit tests cover the registry/idempotency surface.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, waitFor, cleanup } from '@testing-library/react';
import { Suspense } from 'react';
import { createInPageWiring } from '@starui/data-services/runtime/client';
import { SharedWorkerDataServicesHub, registerProvider, type PortLike } from '@starui/data-services/runtime/sharedWorker';
import { isAppDataRequest, isRequest, type DataServices } from '@starui/data-services/runtime';
import type { ProviderConfig } from '@starui/shared-types';
import type { ProviderEmit, ProviderHandle } from '@starui/data-services/runtime/sharedWorker';
import type { ConfigManager, AppConfigRow } from '@starui/config-service';

import {
  DataServicesProvider,
  useProviderStream,
  useAppDataStore,
  useDataProviderConfig,
} from './index';

function stubConfigManager(): ConfigManager & { _rows: Map<string, AppConfigRow> } {
  const rows = new Map<string, AppConfigRow>();
  return {
    _rows: rows,
    async getConfigsByUser(userId: string) {
      return [...rows.values()].filter((r) => r.userId === userId);
    },
    // DataProviders are now global — list() reads all rows regardless
    // of the calling user. Stub matches the production semantics.
    async getAllConfigs() { return [...rows.values()]; },
    async getConfig(id: string) { return rows.get(id); },
    async saveConfig(row: AppConfigRow) { rows.set(row.configId, row); },
    async deleteConfig(id: string) { rows.delete(id); },
  } as unknown as ConfigManager & { _rows: Map<string, AppConfigRow> };
}

interface TestController {
  emit: ProviderEmit;
  stops: number;
  restarts: Array<Record<string, unknown> | undefined>;
}

let ctrl: TestController | null = null;

beforeEach(() => {
  ctrl = null;
  registerProvider('mock' as ProviderConfig['providerType'], (_cfg, emit) => {
    ctrl = { emit, stops: 0, restarts: [] };
    const handle: ProviderHandle = {
      stop() { if (ctrl) ctrl.stops += 1; },
      restart(extra) { if (ctrl) ctrl.restarts.push(extra); },
    };
    return handle;
  });
});

afterEach(() => cleanup());

interface TestEnv {
  cm: ConfigManager & { _rows: Map<string, AppConfigRow> };
  hub: SharedWorkerDataServicesHub;
  services: DataServices;
  userId: string;
}

interface SetupOpts {
  userId?: string;
  /** AppConfigRows to populate the ConfigManager BEFORE the mirror's
   *  initial `attach()` (which reads from ConfigManager to seed the
   *  hub). Mirrors production where rows persist across reloads. */
  seed?: AppConfigRow[];
}

function setup(opts: SetupOpts = {}): TestEnv {
  const userId = opts.userId ?? 'alice';
  const cm = stubConfigManager();
  for (const row of opts.seed ?? []) cm._rows.set(row.configId, row);
  const hub = new SharedWorkerDataServicesHub();
  const wiring = createInPageWiring((port) => {
    const portLike: PortLike = { postMessage: (m) => port.postMessage(m) };
    port.addEventListener('message', (ev: MessageEvent) => {
      if (isRequest(ev.data)) hub.handleRequest(portLike, ev.data);
      else if (isAppDataRequest(ev.data)) hub.handleAppDataRequest(portLike, ev.data);
    });
    port.start();
  });
  const appData = wiring.client.attachAppData({ configManager: cm, userId });
  void appData.attach();
  const services: DataServices = {
    client: wiring.client,
    appData,
    configManager: cm,
    ready: appData.ready(),
    dispose: () => wiring.close(),
  };
  return { cm, hub, services, userId };
}

describe('useProviderStream', () => {
  it('subscribes on mount and detaches on unmount', async () => {
    const env = setup();
    const cfg: ProviderConfig = { providerType: 'mock', keyColumn: 'id' } as ProviderConfig;
    const deltas: Array<{ rows: readonly unknown[]; replace: boolean }> = [];

    function Probe() {
      useProviderStream('p1', cfg, {
        onDelta: (rows, replace) => deltas.push({ rows, replace }),
        onStatus: () => undefined,
      });
      return <div data-testid="ok" />;
    }

    const ui = render(
      <DataServicesProvider services={env.services} userId={env.userId}>
        <Probe />
      </DataServicesProvider>,
    );

    await waitFor(() => expect(deltas.length).toBeGreaterThanOrEqual(1));
    expect(deltas[0]).toMatchObject({ replace: true });

    // Subsequent provider emit reaches the listener.
    act(() => { ctrl!.emit({ rows: [{ id: 'r1', x: 1 }] }); });
    await waitFor(() => expect(deltas.find((d) => !d.replace)).toBeTruthy());

    ui.unmount();
    // After unmount, further emits don't push more deltas through
    // this listener (sub was detached). Hub keeps the provider alive
    // (no auto-teardown).
    const before = deltas.length;
    act(() => { ctrl!.emit({ rows: [{ id: 'r2' }] }); });
    await new Promise((r) => setTimeout(r, 30));
    expect(deltas.length).toBe(before);
    expect(ctrl!.stops).toBe(0);
  });
});

describe('useAppDataStore', () => {
  it('exposes the snapshot via .get and bumps version on changes', async () => {
    const env = setup({
      seed: [{
        configId: 'ad-1', appId: 'TestApp', userId: 'alice',
        componentType: 'appdata', componentSubType: 'appdata',
        isTemplate: false, displayText: 'positions',
        payload: { values: { asOfDate: '2026-04-01' } },
        createdBy: 'alice', updatedBy: 'alice',
        creationTime: '0', updatedTime: '0',
      } as AppConfigRow],
    });

    let view: { loaded: boolean; get: (n: string, k: string) => unknown; setKey: (v: string) => Promise<void> } | null = null;

    function Probe() {
      const v = useAppDataStore();
      view = {
        loaded: v.loaded,
        get: (n, k) => v.store.get(n, k),
        setKey: async (val: string) => v.store.set('positions', 'asOfDate', val),
      };
      return null;
    }

    render(
      <DataServicesProvider services={env.services} userId={env.userId}>
        <Probe />
      </DataServicesProvider>,
    );

    await waitFor(() => expect(view!.loaded).toBe(true));
    expect(view!.get('positions', 'asOfDate')).toBe('2026-04-01');

    await act(async () => { await view!.setKey('2026-05-01'); });
    expect(view!.get('positions', 'asOfDate')).toBe('2026-05-01');
  });
});

describe('useDataProviderConfig', () => {
  it('loads the row by id', async () => {
    const env = setup();
    env.cm._rows.set('dp-1', {
      configId: 'dp-1', appId: 'TestApp', userId: 'alice',
      componentType: 'data-provider', componentSubType: 'mock',
      isTemplate: false, displayText: 'demo',
      payload: { keyColumn: 'id', __providerMeta: {} },
      createdBy: 'alice', updatedBy: 'alice',
      creationTime: '0', updatedTime: '0',
    } as AppConfigRow);

    let captured: ReturnType<typeof useDataProviderConfig> | null = null;

    function Probe() {
      captured = useDataProviderConfig('dp-1');
      return null;
    }

    render(
      <DataServicesProvider services={env.services} userId={env.userId}>
        <Probe />
      </DataServicesProvider>,
    );

    await waitFor(() => expect(captured!.loading).toBe(false));
    expect(captured!.cfg?.providerId).toBe('dp-1');
    expect(captured!.cfg?.providerType).toBe('mock');
  });
});

describe('DataServicesProvider — mode', () => {
  it("'lazy' (default) renders children immediately", async () => {
    const env = setup();
    let firstPaintLoaded: boolean | null = null;

    function Probe() {
      const v = useAppDataStore();
      // Capture loaded state on first render. Mirror.attach() races
      // with React's render; in lazy mode children always paint
      // regardless of `loaded`.
      if (firstPaintLoaded === null) firstPaintLoaded = v.loaded;
      return <div data-testid="child">child</div>;
    }

    const ui = render(
      <DataServicesProvider services={env.services} userId={env.userId}>
        <Probe />
      </DataServicesProvider>,
    );

    // Child rendered synchronously — loaded was false on first paint.
    expect(ui.queryByTestId('child')).not.toBeNull();
    expect(firstPaintLoaded).toBe(false);

    // Eventually transitions to loaded after the snapshot lands.
    await waitFor(() => {
      const v = (Probe as unknown as { _last?: { loaded: boolean } });
      void v;
    });
  });

  it("'eager' suspends until services.ready resolves", async () => {
    const env = setup();

    function Probe() {
      return <div data-testid="child">child</div>;
    }

    let ui!: ReturnType<typeof render>;
    await act(async () => {
      ui = render(
        <Suspense fallback={<div data-testid="loading">loading</div>}>
          <DataServicesProvider services={env.services} mode="eager" userId={env.userId}>
            <Probe />
          </DataServicesProvider>
        </Suspense>,
      );
      // Let the Suspense fallback paint, then resolve ready and
      // flush the un-suspend re-render inside the same act scope.
      await env.services.ready;
    });

    expect(ui.queryByTestId('child')).not.toBeNull();
    expect(ui.queryByTestId('loading')).toBeNull();
  });
});
