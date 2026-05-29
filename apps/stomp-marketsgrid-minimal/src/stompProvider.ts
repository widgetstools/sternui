/**
 * STOMP provider definition — written to IndexedDB by App.configStore.save().
 *
 * This is the catalog payload (transport cfg + columns). The worker reads it
 * from ConfigCatalogCache on attach; the grid never receives cfg inline.
 */

import type { DataProviderConfig, StompProviderConfig } from '@starui/types';

/** Must match a tag published by stomp-view-server (npm run dev:stomp). */
const TAG = 'TRADER001';

/** StompProviderConfig — passed to hub startStomp() after catalog resolve. */
const stomp: StompProviderConfig = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: `/snapshot/positions/${TAG}`,
  requestMessage: `/snapshot/positions/${TAG}/1000/50`,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: 'positionId',
  autoStart: false,
  columnDefinitions: [
    { field: 'positionId', headerName: 'Position ID' },
    { field: 'cusip', headerName: 'CUSIP' },
    { field: 'instrumentType', headerName: 'Type' },
    { field: 'instrumentName', headerName: 'Instrument' },
    { field: 'marketValue', headerName: 'MV', type: 'numericColumn' },
    { field: 'notional', headerName: 'Notional', type: 'numericColumn' },
    { field: 'currentprice', headerName: 'Price', type: 'numericColumn' },
  ],
};

/** DataProviderConfig row shape for configStore.save() → appConfig in Dexie. */
export const stompProviderDraft: DataProviderConfig = {
  name: 'STOMP Positions',
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  config: stomp,
};
