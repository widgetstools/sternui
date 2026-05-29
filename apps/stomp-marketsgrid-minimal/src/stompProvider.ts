import type { DataProviderConfig, StompProviderConfig } from '@starui/types';

const TAG = 'TRADER001';

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

/** Saved to the hub catalog — MarketsGrid resolves cfg on attach. */
export const stompProviderDraft: DataProviderConfig = {
  name: 'STOMP Positions',
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  config: stomp,
};
