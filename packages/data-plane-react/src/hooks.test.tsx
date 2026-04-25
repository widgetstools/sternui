import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { Router } from '@marketsui/data-plane/worker';
import { connectInPage as clientConnectInPage } from '@marketsui/data-plane/client';
import { StreamProviderBase } from '@marketsui/data-plane/providers';
import type { ProviderFactory, ProviderInstance } from '@marketsui/data-plane/worker';
import type { AppDataProviderConfig, ProviderType } from '@marketsui/shared-types';
import {
  DataPlaneProvider,
  useDataPlaneAppData,
  useDataPlaneRowStream,
  useDataPlaneValue,
} from './index';

/**
 * Each test builds its own Router wired over `connectInPage` so the
 * hook exercises the full wire format without a worker. The
 * DataPlaneProvider accepts a pre-built client so we can inject.
 */

const flush = () => new Promise<void>((r) => setTimeout(r, 10));

class TestStream extends StreamProviderBase<{ keyColumn: string }, Record<string, unknown>> {
  readonly type: ProviderType = 'stomp';
  async configure(_c: { keyColumn: string }): Promise<void> {}
  async start(): Promise<void> { this.reportConnected(); }
  async stop(): Promise<void> { this.reportDisconnected(); }
  emitSnapshot(rows: Record<string, unknown>[]) { this.ingestSnapshotBatch(rows); }
  emitComplete() { this.markSnapshotComplete(); }
  emitUpdate(rows: Record<string, unknown>[]) { this.ingestUpdate(rows); }
}

describe('useDataPlaneAppData', () => {
  it('reads, subscribes to updates, and lets the component setValue', async () => {
    const router = new Router();
    const conn = clientConnectInPage(router);
    const { client } = conn;
    const cfg: AppDataProviderConfig = { providerType: 'appdata', variables: {} };
    await client.configure('app', cfg);
    await client.put('app', 'token', 'initial');

    function Component() {
      const { value, setValue, isLoading } = useDataPlaneAppData<string>('app', 'token');
      if (isLoading) return <div>loading</div>;
      return (
        <div>
          <span data-testid="v">{value}</span>
          <button onClick={() => void setValue('next')}>set</button>
        </div>
      );
    }

    const { unmount } = render(
      <DataPlaneProvider client={client}>
        <Component />
      </DataPlaneProvider>,
    );
    try {
      await act(async () => { await flush(); });
      expect(screen.getByTestId('v').textContent).toBe('initial');

      await act(async () => {
        screen.getByText('set').click();
        await flush();
      });
      expect(screen.getByTestId('v').textContent).toBe('next');
    } finally {
      unmount();
      conn.close();
      await router.teardownAll();
    }
  });
});

describe('useDataPlaneValue', () => {
  it('renders the fetched value and updates on external put', async () => {
    const router = new Router();
    const connA = clientConnectInPage(router);
    const connB = clientConnectInPage(router);

    await connA.client.configure('app', { providerType: 'appdata', variables: {} });
    await connA.client.put('app', 'shared', 'hello');

    function Component() {
      const { value, isLoading } = useDataPlaneValue<string>('app', 'shared');
      if (isLoading) return <div>loading</div>;
      return <span data-testid="v">{value ?? '(none)'}</span>;
    }

    const { unmount } = render(
      <DataPlaneProvider client={connA.client}>
        <Component />
      </DataPlaneProvider>,
    );
    try {
      await act(async () => { await flush(); });
      expect(screen.getByTestId('v').textContent).toBe('hello');

      await act(async () => {
        await connB.client.put('app', 'shared', 'world');
        await flush();
      });

      expect(screen.getByTestId('v').textContent).toBe('world');
    } finally {
      unmount();
      connA.close();
      connB.close();
      await router.teardownAll();
    }
  });
});

describe('useDataPlaneRowStream — buffered mode', () => {
  it('accumulates snapshot rows, flips on complete, upserts on update', async () => {
    const provider = new TestStream('p', { keyColumn: 'id' });
    const factory: ProviderFactory = async () => ({ shape: 'stream', provider }) as ProviderInstance;
    const router = new Router({ providerFactory: factory });
    const conn = clientConnectInPage(router);
    await conn.client.configure('p', { providerType: 'stomp' } as never);

    function Grid() {
      const { rows, isSnapshotComplete } = useDataPlaneRowStream<{ id: number; v?: string }>('p', {
        keyColumn: 'id',
      });
      return (
        <div>
          <span data-testid="count">{rows.length}</span>
          <span data-testid="complete">{isSnapshotComplete ? 'yes' : 'no'}</span>
        </div>
      );
    }

    const { unmount } = render(
      <DataPlaneProvider client={conn.client}>
        <Grid />
      </DataPlaneProvider>,
    );
    try {
      await act(async () => { await flush(); });

      await act(async () => {
        provider.emitSnapshot([{ id: 1, v: 'a' }, { id: 2, v: 'b' }]);
        await flush();
      });
      expect(screen.getByTestId('count').textContent).toBe('2');
      expect(screen.getByTestId('complete').textContent).toBe('no');

      await act(async () => {
        provider.emitComplete();
        await flush();
      });
      expect(screen.getByTestId('complete').textContent).toBe('yes');

      await act(async () => {
        provider.emitUpdate([{ id: 1, v: 'A-PRIME' }, { id: 3, v: 'c' }]);
        await flush();
      });
      expect(screen.getByTestId('count').textContent).toBe('3'); // 1 updated + 2 + 3 new
    } finally {
      unmount();
      conn.close();
      await router.teardownAll();
    }
  });
});

describe('useDataPlaneRowStream — onEvent mode', () => {
  it('forwards events to the callback and keeps rows empty', async () => {
    const provider = new TestStream('p', { keyColumn: 'id' });
    const factory: ProviderFactory = async () => ({ shape: 'stream', provider }) as ProviderInstance;
    const router = new Router({ providerFactory: factory });
    const conn = clientConnectInPage(router);
    await conn.client.configure('p', { providerType: 'stomp' } as never);

    let snapshotCount = 0;
    let completeCount = 0;
    let updateCount = 0;

    // Stable onEvent reference so effect deps don't re-run mid-test.
    const onEvent = {
      onSnapshotBatch: () => { snapshotCount++; },
      onSnapshotComplete: () => { completeCount++; },
      onRowUpdate: () => { updateCount++; },
    };

    function Grid() {
      const { rows } = useDataPlaneRowStream('p', { onEvent });
      return <span data-testid="count">{rows.length}</span>;
    }

    const { unmount } = render(
      <DataPlaneProvider client={conn.client}>
        <Grid />
      </DataPlaneProvider>,
    );
    try {
      await act(async () => { await flush(); });

      await act(async () => {
        provider.emitSnapshot([{ id: 1 }, { id: 2 }]);
        provider.emitSnapshot([{ id: 3 }]);
        provider.emitComplete();
        provider.emitUpdate([{ id: 1, v: 'new' }]);
        await flush();
      });

      expect(snapshotCount).toBe(2);
      expect(completeCount).toBe(1);
      expect(updateCount).toBe(1);
      // Buffered rows stay empty in onEvent mode.
      expect(screen.getByTestId('count').textContent).toBe('0');
    } finally {
      unmount();
      conn.close();
      await router.teardownAll();
    }
  });
});

describe('DataPlaneProvider', () => {
  it('throws when a hook runs outside the provider', () => {
    function Component() {
      useDataPlaneValue('x', 'y');
      return null;
    }
    // RTL surfaces the throw to console; we just assert it throws.
    expect(() => render(<Component />)).toThrow(/DataPlaneProvider/);
  });
});
