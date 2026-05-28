import { useEffect, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { IDataProvider } from '@starui/host-data';
import { useDataProvider } from '@starui/host-data-react/runtime';
import { createApplyProviderToGridState } from '../../v2/markets-grid-container/applyProviderToGrid.js';

export interface UseBlotterDataConnectionOptions {
  gridApi: GridApi | null;
  /** Hub provider id — resolved via {@link useDataProvider} when `provider` is omitted. */
  providerId?: string | null;
  /** Explicit {@link IDataProvider} (DI). Takes precedence over `providerId`. */
  provider?: IDataProvider | null;
  getRowId?: (row: Record<string, unknown>) => string;
}

export interface UseBlotterDataConnectionResult {
  isConnected: boolean;
  rowCount: number;
}

function applyTickWithGetRowId(
  gridApi: GridApi,
  rows: readonly Record<string, unknown>[],
  getRowId: (row: Record<string, unknown>) => string,
): void {
  const adds: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  for (const row of rows) {
    const rowId = getRowId(row);
    if (!rowId) continue;
    if (gridApi.getRowNode(rowId)) updates.push(row);
    else adds.push(row);
  }
  if (adds.length > 0 || updates.length > 0) {
    gridApi.applyTransaction({ add: adds, update: updates });
  }
}

/**
 * useBlotterDataConnection — grid wiring for {@link IDataProvider}.
 *
 * When `provider` is omitted, resolves one via {@link useDataProvider}
 * (requires an ancestor {@link DataServicesProvider} / {@link DataHubProvider}).
 */
export function useBlotterDataConnection({
  gridApi,
  providerId,
  provider: explicitProvider,
  getRowId,
}: UseBlotterDataConnectionOptions): UseBlotterDataConnectionResult {
  const { provider: hubProvider } = useDataProvider(
    explicitProvider ? null : (providerId ?? null),
    { autoStart: false },
  );
  const provider = explicitProvider ?? hubProvider;

  const [rowCount, setRowCount] = useState(0);
  const isConnectedRef = useRef(false);

  useEffect(() => {
    if (!gridApi || !provider) {
      isConnectedRef.current = false;
      return;
    }

    if (providerId && provider.id !== providerId) {
      // eslint-disable-next-line no-console
      console.warn(
        `[useBlotterDataConnection] provider.id=${provider.id} does not match providerId=${providerId}`,
      );
    }

    const gridApply = createApplyProviderToGridState();
    let cancelled = false;

    const unsubSnapshot = provider.onSnapshotData((rows) => {
      if (cancelled) return;
      gridApi.setGridOption('rowData', rows.slice());
      setRowCount(rows.length);
    });

    const unsubTick = provider.onTick((rows) => {
      if (cancelled || rows.length === 0) return;
      if (getRowId) {
        applyTickWithGetRowId(gridApi, rows as Record<string, unknown>[], getRowId);
      } else {
        gridApply.applyTick(gridApi, rows as Record<string, unknown>[], 'id');
      }
      setRowCount(gridApi.getDisplayedRowCount());
    });

    const unsubError = provider.onError((error) => {
      // eslint-disable-next-line no-console
      console.error('[BlotterDataConnection] Error:', error);
    });

    isConnectedRef.current = true;

    void provider.start().catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[BlotterDataConnection] start failed:', error);
    });

    return () => {
      cancelled = true;
      unsubSnapshot();
      unsubTick();
      unsubError();
      isConnectedRef.current = false;
      void provider.stop();
    };
  }, [gridApi, provider, providerId, getRowId]);

  return {
    isConnected: isConnectedRef.current,
    rowCount,
  };
}
