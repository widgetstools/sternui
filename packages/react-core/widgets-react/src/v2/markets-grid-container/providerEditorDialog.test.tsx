/**
 * MarketsGridContainer — provider edit opens an in-browser dialog
 * when not hosted in OpenFin; OpenFin delegates to `onEditProvider`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@starui/engine';

vi.mock('./ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: (props: any) => (
    props.open ? <div data-testid="provider-editor-dialog" data-provider-id={props.providerId ?? ''} /> : null
  ),
}));

vi.mock('./openFinRuntime.js', () => ({
  isOpenFinRuntime: vi.fn(() => false),
}));

const lastMarketsGridProps: { current: any } = { current: null };
vi.mock('@starui/grid', () => ({
  MarketsGrid: (props: any) => {
    lastMarketsGridProps.current = props;
    return <div data-testid="markets-grid-stub" />;
  },
}));

vi.mock('@starui/host-data-react/runtime', () => ({
  useDataProvider: () => ({
    provider: null,
    status: 'loading',
    error: undefined,
    start: vi.fn(),
    refresh: vi.fn(),
    restart: vi.fn(),
  }),
  useAppDataStore: () => ({ store: { set: vi.fn() } }),
  useDataProviderConfig: () => ({ cfg: null, loading: false }),
  useResolvedCfg: () => null,
  useDataProvidersList: () => ({ configs: [] }),
}));

vi.mock('./LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));

import { isOpenFinRuntime } from './openFinRuntime.js';
import { MarketsGridContainer } from './MarketsGridContainer.js';

afterEach(() => {
  cleanup();
});

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
  gridId: 'g1',
  instanceId: 'inst-1',
  appId: 'app-1',
  userId: 'u1',
} as const;

describe('MarketsGridContainer — provider editor dialog', () => {
  beforeEach(() => {
    lastMarketsGridProps.current = null;
    vi.mocked(isOpenFinRuntime).mockReturnValue(false);
  });

  it('wires providerGridHost.onEditProvider to open ProviderEditorDialog in browser', async () => {
    const storage = vi.fn(() => makeAdapter());
    const { getByTestId, queryByTestId } = render(
      <MarketsGridContainer {...baseProps} storage={storage as any} />,
    );

    await waitFor(() => expect(lastMarketsGridProps.current?.providerGridHost?.onEditProvider).toBeTypeOf('function'));
    expect(queryByTestId('provider-editor-dialog')).toBeNull();

    act(() => {
      lastMarketsGridProps.current.providerGridHost.onEditProvider('provider-abc');
    });

    await waitFor(() => {
      expect(getByTestId('provider-editor-dialog').getAttribute('data-provider-id')).toBe('provider-abc');
    });
  });

  it('delegates edit to onEditProvider when running in OpenFin', async () => {
    vi.mocked(isOpenFinRuntime).mockReturnValue(true);
    const onEditProvider = vi.fn();
    const storage = vi.fn(() => makeAdapter());

    const { queryByTestId } = render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        onEditProvider={onEditProvider}
      />,
    );

    await waitFor(() => expect(lastMarketsGridProps.current?.providerGridHost?.onEditProvider).toBeTypeOf('function'));

    act(() => {
      lastMarketsGridProps.current.providerGridHost.onEditProvider('provider-openfin');
    });

    expect(onEditProvider).toHaveBeenCalledWith('provider-openfin');
    expect(queryByTestId('provider-editor-dialog')).toBeNull();
  });
});
