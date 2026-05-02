/**
 * v2 React hook tests — exercise the round-trip through a real
 * DataPlane client + Hub via createInPageWiring.
 *
 * The mock provider's factory is registered per test so each
 * controller is fresh.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, waitFor, cleanup } from '@testing-library/react';
import { createInPageWiring } from '@marketsui/data-plane/v2/client';
import { Hub, registerProvider, type PortLike } from '@marketsui/data-plane/v2/worker';
import type { ProviderConfig } from '@marketsui/shared-types';
import type { ProviderEmit, ProviderHandle } from '@marketsui/data-plane/v2/worker';
import type { ConfigManager, AppConfigRow } from '@marketsui/config-service';

import {
  DataPlaneProvider,
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

function setup(userId = 'alice') {
  const cm = stubConfigManager();
  const hub = new Hub();
  const wiring = createInPageWiring((port) => {
    const portLike: PortLike = { postMessage: (m) => port.postMessage(m) };
    port.addEventListener('message', (ev: MessageEvent) => hub.handleRequest(portLike, ev.data));
    port.start();
  });
  return { cm, hub, client: wiring.client, userId };
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
      <DataPlaneProvider client={env.client} configManager={env.cm} userId={env.userId}>
        <Probe />
      </DataPlaneProvider>,
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
    const env = setup();
    env.cm._rows.set('ad-1', {
      configId: 'ad-1', appId: 'TestApp', userId: 'alice',
      componentType: 'appdata', componentSubType: 'appdata',
      isTemplate: false, displayText: 'positions',
      payload: { values: { asOfDate: '2026-04-01' } },
      createdBy: 'alice', updatedBy: 'alice',
      creationTime: '0', updatedTime: '0',
    } as AppConfigRow);

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
      <DataPlaneProvider client={env.client} configManager={env.cm} userId={env.userId}>
        <Probe />
      </DataPlaneProvider>,
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
      <DataPlaneProvider client={env.client} configManager={env.cm} userId={env.userId}>
        <Probe />
      </DataPlaneProvider>,
    );

    await waitFor(() => expect(captured!.loading).toBe(false));
    expect(captured!.cfg?.providerId).toBe('dp-1');
    expect(captured!.cfg?.providerType).toBe('mock');
  });
});
