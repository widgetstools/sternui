import { useEffect, useRef, useCallback } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { IBlotterDataProvider } from '../../interfaces.js';

export interface UseBlotterDataConnectionOptions {
  gridApi: GridApi | null;
  providerId: string | null;
  dataProvider?: IBlotterDataProvider;
  getRowId?: (row: Record<string, unknown>) => string;
}

export interface UseBlotterDataConnectionResult {
  isConnected: boolean;
  rowCount: number;
}

/**
 * useBlotterDataConnection — manages data provider connection lifecycle.
 * Handles snapshot loading and incremental updates via AG Grid transaction API.
 */
export function useBlotterDataConnection({
  gridApi,
  providerId,
  dataProvider,
  getRowId
}: UseBlotterDataConnectionOptions): UseBlotterDataConnectionResult {
  const isConnectedRef = useRef(false);
  const rowCountRef = useRef(0);

  useEffect(() => {
    if (!gridApi || !providerId || !dataProvider) return;

    const unsubSnapshot = dataProvider.onSnapshot((rows) => {
      gridApi.setGridOption('rowData', rows);
      rowCountRef.current = rows.length;
    });

    const unsubUpdate = dataProvider.onUpdate((row) => {
      const rowId = getRowId?.(row) || (row as any).id;
      if (!rowId) return;

      // Check if row exists
      const existing = gridApi.getRowNode(String(rowId));
      if (existing) {
        gridApi.applyTransaction({ update: [row] });
      } else {
        gridApi.applyTransaction({ add: [row] });
        rowCountRef.current++;
      }
    });

    const unsubError = dataProvider.onError((error) => {
      console.error('[BlotterDataConnection] Error:', error);
    });

    dataProvider.connect(providerId);
    isConnectedRef.current = true;

    return () => {
      unsubSnapshot();
      unsubUpdate();
      unsubError();
      dataProvider.disconnect();
      isConnectedRef.current = false;
    };
  }, [gridApi, providerId, dataProvider, getRowId]);

  return {
    isConnected: isConnectedRef.current,
    rowCount: rowCountRef.current
  };
}
