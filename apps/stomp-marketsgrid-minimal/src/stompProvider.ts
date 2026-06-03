/**
 * STOMP provider definition — written to IndexedDB by App.configStore.save().
 *
 * This is the catalog payload (transport cfg + columns). The worker reads it
 * from ConfigCatalogCache on attach; the grid never receives cfg inline.
 */

import type { DataProviderConfig, StompProviderConfig } from '@starui/types';

/** Must match a tag published by stomp-view-server (npm run dev:stomp). */
const TAG = 'TRADER001';

const liveListenerTopic = `/snapshot/positions/${TAG}`;
const liveRequestMessage = `/snapshot/positions/${TAG}/1000/50`;
const historicalListenerTopic = `/snapshot/positions/${TAG}/{{positions.asOfDate}}`;
/** Historical trigger: /snapshot/positions/{clientId}/{asOfDate}[/{batchSize}] — not live rate/batch. */
const historicalRequestMessage = `/snapshot/positions/${TAG}/{{positions.asOfDate}}/50`;

/** Bump when STOMP wire destinations or cfg change so App re-persists catalog rows on load. */
export const STOMP_PROVIDER_CFG_VERSION = 4;

/** StompProviderConfig — passed to hub startStomp() after catalog resolve. */
const stompLive: StompProviderConfig = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: liveListenerTopic,
  requestMessage: liveRequestMessage,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: 'positionId',
  autoStart: false,
  // Snapshot flush frame size (rows per worker→client postMessage).
  // Smaller keeps each main-thread message under the long-task budget.
  snapshotChunkSize: 1000,
  // Live updates: coalesce ticks into a trailing-edge burst every 100ms,
  // collapsing repeated updates for the same positionId to the latest
  // before fanning out to the grid.
  throttleMs: 100,
  conflateByKey: 'positionId',
  columnDefinitions: [
    // Identifiers
    { field: 'positionId', headerName: 'Position ID' },
    { field: 'cusip', headerName: 'CUSIP' },
    { field: 'desk', headerName: 'Desk' },
    { field: 'trader', headerName: 'Trader' },
    { field: 'currency', headerName: 'Ccy' },
    // Agency ratings (nested `rating` object → auto valueGetter for dot-paths)
    { field: 'rating.moody', headerName: "Moody's" },
    { field: 'rating.sp', headerName: 'S&P' },
    { field: 'rating.fitch', headerName: 'Fitch' },
    { field: 'rating.composite', headerName: 'Composite' },
    { field: 'rating.internal', headerName: 'Internal' },
    // Price & size
    { field: 'currentPrice', headerName: 'Price', type: 'numericColumn' },
    { field: 'notionalAmount', headerName: 'Notional', type: 'numericColumn' },
    { field: 'marketValue', headerName: 'MV', type: 'numericColumn' },
    // P&L
    { field: 'pnl', headerName: 'PnL', type: 'numericColumn' },
    { field: 'unrealizedPnl', headerName: 'Unrealized', type: 'numericColumn' },
    { field: 'realizedPnl', headerName: 'Realized', type: 'numericColumn' },
    { field: 'dailyPnl', headerName: 'Daily', type: 'numericColumn' },
    { field: 'mtdPnl', headerName: 'MTD', type: 'numericColumn' },
    { field: 'ytdPnl', headerName: 'YTD', type: 'numericColumn' },
    // Rate risk
    { field: 'dv01', headerName: 'DV01', type: 'numericColumn' },
    { field: 'pv01', headerName: 'PV01', type: 'numericColumn' },
  ],
};

const stompHistorical: StompProviderConfig = {
  ...stompLive,
  listenerTopic: historicalListenerTopic,
  requestMessage: historicalRequestMessage,
};

/** DataProviderConfig row shape for configStore.save() → appConfig in Dexie. */
export const stompProviderDraft: DataProviderConfig = {
  name: 'STOMP Positions',
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  config: stompLive,
};

export const stompHistoricalProviderDraft: DataProviderConfig = {
  name: 'STOMP Positions (Historical)',
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  config: stompHistorical,
};
