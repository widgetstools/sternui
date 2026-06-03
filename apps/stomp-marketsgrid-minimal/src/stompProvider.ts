/**
 * STOMP provider definition — written to IndexedDB by App.configStore.save().
 *
 * This is the catalog payload (transport cfg + columns). The worker reads it
 * from ConfigCatalogCache on attach; the grid never receives cfg inline.
 */

import type { DataProviderConfig, StompProviderConfig } from '@starui/types';

/** Must match a tag published by stomp-view-server (npm run dev:stomp). */
const TAG = 'TRADER001';

// ─── Live wire destinations ──────────────────────────────────────────
// Live snapshot + realtime tail. No date token — the broker streams the
// current book and keeps pushing deltas.
const liveListenerTopic = `/snapshot/positions/${TAG}`;
const liveRequestMessage = `/snapshot/positions/${TAG}/1000/50`;

// ─── Historical wire destinations (HOW HISTORICAL DATA IS FETCHED) ────
// These carry the `{{positions.asOfDate}}` template token. The date is
// NOT known when this config is authored — it is filled in at runtime
// from the toolbar date picker. End-to-end flow:
//
//   1. User picks a PAST date in the grid's toolbar date picker
//      (ToolbarDatePicker → MarketsGrid.onToolbarDateChange).
//   2. MarketsGridContainer.handleToolbarDateChange sees it's a past
//      date, switches the active provider from the LIVE id to the
//      HISTORICAL id (defaultHistoricalProviderId, see App.tsx), writes
//      the date into AppData under `historicalDateAppDataRef`
//      (= "positions.asOfDate", see App.tsx), and schedules a reload.
//   3. reloadFromSource() restarts the historical provider with the
//      overlay `{ asOfDate: '<picked date>' }`.
//   4. In the worker, the STOMP provider (startStomp) takes that
//      restart overlay and, on reconnect, substitutes the token in the
//      destinations below — `{{positions.asOfDate}}` → the picked date
//      (host-data/.../transports/stomp.ts: resolveStompDestinations +
//      lookupWithRestartOverlay, and mergeOverlay injects `asOfDate`
//      into the trigger body). The overlay date wins over any AppData
//      value, so the reload is deterministic.
//   5. The broker receives a date-specific snapshot path/trigger and
//      replies with that day's positions (snapshot only — no live tail).
//
// So: changing the picker date == swapping the value substituted into
// these two strings, then re-subscribing.
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

// The HISTORICAL provider is a SECOND, separate catalog row. It reuses
// every live setting (columns, keyColumn, conflation/throttle, chunk
// size) but swaps in the date-templated destinations above. The grid
// switches to this provider's id when a past date is picked; the date
// is injected into the tokens at restart (see the flow note above).
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

// Persisted as its own catalog row (distinct `name` → distinct
// providerId). App.tsx seeds this alongside the live one and hands its
// id to the grid as `defaultHistoricalProviderId`, which is what the
// toolbar date picker switches to for past dates.
export const stompHistoricalProviderDraft: DataProviderConfig = {
  name: 'STOMP Positions (Historical)',
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  config: stompHistorical,
};
