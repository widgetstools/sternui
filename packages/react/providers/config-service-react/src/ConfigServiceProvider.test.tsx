/**
 * Provider + hook integration tests for `@starui/config-service-react`.
 *
 * The Provider opens a real Dexie connection through `ConfigManager`
 * (fake-indexeddb shim is installed in `test/setup.ts`), so the tests
 * exercise the actual init / dispose / ApplicationContext path that
 * production code follows.
 *
 * `useDataServices()` from `@starui/data-services-react` is mocked to
 * return a tiny in-memory `appData` that satisfies `AppDataMirrorHandle`
 * — `ConfigManager.publishApplicationContext()` writes to this fake
 * during init, and the Provider snapshots the result as
 * `applicationContext` on the context value.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';

import type { AppDataMirrorHandle } from '@starui/config-service';

interface FakeAppData extends AppDataMirrorHandle {
  store: Map<string, unknown>;
  setCalls: Array<{ name: string; key: string; value: unknown }>;
}

function createFakeAppData(): FakeAppData {
  const store = new Map<string, unknown>();
  const setCalls: Array<{ name: string; key: string; value: unknown }> = [];
  const handle: AppDataMirrorHandle = {
    async set(name, key, value) {
      setCalls.push({ name, key, value });
      store.set(`${name} ${key}`, value);
    },
    get(name, key) {
      return store.get(`${name} ${key}`);
    },
    ready() {
      return Promise.resolve();
    },
  };
  return Object.assign(handle, { store, setCalls });
}

const fakeAppData: FakeAppData = createFakeAppData();
const fakeDataServices = { client: {}, appData: fakeAppData, configStore: {} };

vi.mock('@starui/data-services-react', () => ({
  useDataServices: () => fakeDataServices,
}));

// Imported AFTER the mock so the Provider's `useDataServices` import
// resolves to the stub rather than the real hook.
//
// eslint-disable-next-line import/first
import {
  ConfigServiceProvider,
  useConfigService,
  type ConfigServiceContextValue,
} from './index';

afterEach(() => {
  cleanup();
  fakeAppData.store.clear();
  fakeAppData.setCalls.length = 0;
});

function Capture({
  onValue,
}: {
  onValue: (v: ConfigServiceContextValue) => void;
}) {
  const value = useConfigService();
  useEffect(() => {
    onValue(value);
  }, [value, onValue]);
  return <div data-testid="ready">{value.appId}</div>;
}

describe('<ConfigServiceProvider>', () => {
  it('exposes configManager / storage / identity / applicationContext after init', async () => {
    const captured: ConfigServiceContextValue[] = [];
    const identity = { userId: 'alice', displayName: 'Alice' };

    const { findByTestId } = render(
      <ConfigServiceProvider identity={identity} appId="TestApp">
        <Capture onValue={(v) => captured.push(v)} />
      </ConfigServiceProvider>,
    );

    const node = await findByTestId('ready');
    expect(node.textContent).toBe('TestApp');

    const value = captured[0];
    expect(value.appId).toBe('TestApp');
    expect(value.userId).toBe('alice');
    expect(typeof value.storage).toBe('function');
    expect(value.configManager.getAppId()).toBe('TestApp');
    expect(value.applicationContext.AppId).toBe('TestApp');
    expect(value.applicationContext.LoggedInUser).toEqual({
      userId: 'alice',
      displayName: 'Alice',
    });
    expect(value.applicationContext.ImpersonatedUser).toBe(null);
    expect(value.applicationContext.LoggedInUserProfile).toEqual({
      roles: [],
      permissions: [],
    });

    // Sanity: ConfigManager actually published into the fake mirror.
    expect(fakeAppData.store.get('ApplicationContext AppId')).toBe('TestApp');
    expect(fakeAppData.store.get('ApplicationContext LoggedInUser')).toEqual({
      userId: 'alice',
      displayName: 'Alice',
    });
  });

  it('disposes the ConfigManager on unmount', async () => {
    const captured: ConfigServiceContextValue[] = [];
    const identity = { userId: 'bob' };

    const { findByTestId, unmount } = render(
      <ConfigServiceProvider identity={identity} appId="TestApp">
        <Capture onValue={(v) => captured.push(v)} />
      </ConfigServiceProvider>,
    );

    await findByTestId('ready');
    const manager = captured[0].configManager;
    const disposeSpy = vi.spyOn(manager, 'dispose');

    act(() => {
      unmount();
    });

    expect(disposeSpy).toHaveBeenCalled();
  });

  it('renders nothing while bootstrap is pending', async () => {
    const identity = { userId: 'carol' };

    const { container, findByTestId } = render(
      <ConfigServiceProvider identity={identity} appId="TestApp">
        <Capture onValue={() => undefined} />
      </ConfigServiceProvider>,
    );

    // Synchronously after mount, the Provider has no value yet —
    // children don't render until init resolves. (Children are
    // mounted on the next microtask once `setValue` runs, so this
    // assertion uses the initial paint.)
    expect(container.querySelector('[data-testid="ready"]')).toBeNull();

    // Eventually the Provider hydrates.
    await findByTestId('ready');
  });

  it('throws from useConfigService when used outside the Provider', () => {
    function NakedConsumer() {
      useConfigService();
      return null;
    }

    // React 19 logs the error during render; suppress to keep the test
    // output clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(<NakedConsumer />),
    ).toThrowError(/useConfigService must be used within <ConfigServiceProvider>/);
    errSpy.mockRestore();
  });

  it('re-bootstraps when appId changes', async () => {
    const identity = { userId: 'dave' };
    const captured: ConfigServiceContextValue[] = [];

    const { rerender, findByTestId } = render(
      <ConfigServiceProvider identity={identity} appId="AppA">
        <Capture onValue={(v) => captured.push(v)} />
      </ConfigServiceProvider>,
    );

    await findByTestId('ready');
    expect(captured[0].appId).toBe('AppA');

    rerender(
      <ConfigServiceProvider identity={identity} appId="AppB">
        <Capture onValue={(v) => captured.push(v)} />
      </ConfigServiceProvider>,
    );

    await waitFor(() => {
      const last = captured[captured.length - 1];
      expect(last.appId).toBe('AppB');
    });
  });
});
