/**
 * MarketsGridContainer — provider pencil edit opens an in-browser dialog
 * when not hosted in OpenFin; OpenFin delegates to `onEditProvider`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@starui/engine';

vi.mock('./ProviderToolbar.js', () => ({
  ProviderToolbar: () => <div data-testid="provider-toolbar-stub" />,
}));

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
  useDataServices: () => ({ client: {} }),
  useAppDataStore: () => ({ store: { set: vi.fn() } }),
  useDataProviderConfig: () => ({ cfg: null, loading: false }),
  useResolvedCfg: () => null,
  useDataProvidersList: () => ({ configs: [] }),
}));

let invokeToolbarToggle: (() => void) | undefined;
vi.mock('./useChordHotkey.js', () => ({
  useChordHotkey: (_chords: unknown, cb: (e: { preventDefault: () => void }) => void) => {
    invokeToolbarToggle = () => cb({ preventDefault: () => {} });
  },
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

function toolbarOnEdit(): ((id: string) => void) | undefined {
  const extras = lastMarketsGridProps.current?.headerExtras;
  if (!extras || typeof extras !== 'object') return undefined;
  return (extras as { props?: { onEdit?: (id: string) => void } }).props?.onEdit;
}

const baseProps = {
  gridId: 'g1',
  instanceId: 'inst-1',
  appId: 'app-1',
  userId: 'u1',
} as const;

describe('MarketsGridContainer — provider editor dialog', () => {
  beforeEach(() => {
    invokeToolbarToggle = undefined;
    lastMarketsGridProps.current = null;
    vi.mocked(isOpenFinRuntime).mockReturnValue(false);
  });

  it('opens ProviderEditorDialog in browser when toolbar edit is clicked', async () => {
    const storage = vi.fn(() => makeAdapter());
    const { getByTestId, queryByTestId } = render(
      <MarketsGridContainer {...baseProps} storage={storage as any} />,
    );

    await waitFor(() => expect(lastMarketsGridProps.current).not.toBeNull());
    await act(async () => {
      invokeToolbarToggle?.();
    });
    await waitFor(() => expect(toolbarOnEdit()).toBeTypeOf('function'));
    expect(queryByTestId('provider-editor-dialog')).toBeNull();

    act(() => {
      toolbarOnEdit()?.('provider-abc');
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

    await waitFor(() => expect(lastMarketsGridProps.current).not.toBeNull());
    await act(async () => {
      invokeToolbarToggle?.();
    });
    await waitFor(() => expect(toolbarOnEdit()).toBeTypeOf('function'));

    act(() => {
      toolbarOnEdit()?.('provider-openfin');
    });

    expect(onEditProvider).toHaveBeenCalledWith('provider-openfin');
    expect(queryByTestId('provider-editor-dialog')).toBeNull();
  });
});
