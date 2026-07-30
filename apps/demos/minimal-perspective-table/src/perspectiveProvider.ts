/**
 * STOMP-over-Perspective provider — written to IndexedDB by App.configStore.save().
 *
 * Every wire setting is the same as the plain `stomp` provider in
 * `stomp-marketsgrid-minimal`: same broker, same destinations, same snapshot
 * handshake. What changes is where the book lives — the worker loads it into
 * ONE Perspective Table and each window opens a View against it, so a second
 * and third blotter cost a View rather than a full replay of 20,000 rows.
 *
 * Two fields carry weight here and nowhere else:
 *
 *   `inferredFields`  the Table's schema, declared up front. With it the Table
 *                     is created EMPTY and immediately, so the blotter paints
 *                     on open instead of waiting ~18s for the snapshot to
 *                     finish before there is anything to attach to. It must
 *                     cover `keyColumn`, or the Table would be unindexable and
 *                     `update()` would append instead of upsert.
 *
 *   `tableName`       what a window passes to `open_table`. One per provider.
 *
 * Types are declared `number` rather than split into integer/float on purpose:
 * numerics map to Perspective `float`, and a double holds every integer up to
 * 2^53 exactly. Declaring `integer` risks silent truncation for nothing.
 */

import type { DataProviderConfig, FieldInfo, StompPerspectiveProviderConfig } from '@starui/types';

/** Must match a tag published by stomp-view-server (npm run dev:stomp). */
const TAG = 'TRADER001';

const listenerTopic = `/snapshot/positions/${TAG}`;
const requestMessage = `/snapshot/positions/${TAG}/1000/50`;

/** Bump so App re-persists the catalog row when anything below changes. */
export const PERSPECTIVE_PROVIDER_CFG_VERSION = 1;

/**
 * Deterministic catalog id — `configStore.save()` upserts by `providerId`, so
 * a fixed one makes seeding idempotent under React StrictMode's double-invoked
 * effect (two concurrent runs write the SAME row instead of two random ones).
 */
export const PERSPECTIVE_PROVIDER_ID = 'minimal-perspective-table:positions';

/** Name the worker hosts the Table under; windows open it by this id. */
export const PERSPECTIVE_TABLE_NAME = 'positions';

export const KEY_COLUMN = 'positionId';

/** Columns as they arrive on the wire. Order here is the grid's column order. */
const FIELDS: ReadonlyArray<readonly [string, FieldInfo['type'], string]> = [
  // Identifiers
  [KEY_COLUMN, 'string', 'Position Id'],
  ['cusip', 'string', 'Cusip'],
  ['ticker', 'string', 'Ticker'],
  ['instrumentName', 'string', 'Instrument Name'],
  ['instrumentType', 'string', 'Instrument Type'],
  ['bookName', 'string', 'Book Name'],
  ['portfolio', 'string', 'Portfolio'],
  ['trader', 'string', 'Trader'],
  ['desk', 'string', 'Desk'],
  ['region', 'string', 'Region'],
  ['country', 'string', 'Country'],
  // Price & size
  ['notionalAmount', 'number', 'Notional Amount'],
  ['marketValue', 'number', 'Market Value'],
  ['currentPrice', 'number', 'Current Price'],
  ['quantity', 'number', 'Quantity'],
  // P&L
  ['pnl', 'number', 'Pnl'],
  ['unrealizedPnl', 'number', 'Unrealized Pnl'],
  ['realizedPnl', 'number', 'Realized Pnl'],
  ['dailyPnl', 'number', 'Daily Pnl'],
  ['mtdPnl', 'number', 'Mtd Pnl'],
  ['ytdPnl', 'number', 'Ytd Pnl'],
  // Yield & spread
  ['yield', 'number', 'Yield'],
  ['spread', 'number', 'Spread'],
  // Rate risk
  ['dv01', 'number', 'Dv01'],
  ['pv01', 'number', 'Pv01'],
  ['cs01', 'number', 'Cs01'],
];

/**
 * Which numeric columns are worth a subtotal when the user groups. Aggregation
 * happens in the worker's View, not in this window — a group row is read, not
 * computed here.
 */
const AGG_FUNC: Record<string, 'sum' | 'avg'> = {
  notionalAmount: 'sum',
  marketValue: 'sum',
  quantity: 'sum',
  pnl: 'sum',
  unrealizedPnl: 'sum',
  realizedPnl: 'sum',
  dailyPnl: 'sum',
  mtdPnl: 'sum',
  ytdPnl: 'sum',
  dv01: 'sum',
  pv01: 'sum',
  cs01: 'sum',
  currentPrice: 'avg',
  yield: 'avg',
  spread: 'avg',
};

const inferredFields: FieldInfo[] = FIELDS.map(([path, type]) => ({
  path,
  type,
  nullable: false,
}));

const columnDefinitions = FIELDS.map(([field, type, headerName]) => {
  const numeric = type === 'number';
  return {
    field,
    headerName,
    cellDataType: numeric ? ('number' as const) : ('text' as const),
    filter: true,
    sortable: true,
    resizable: true,
    ...(numeric
      ? { type: 'numericColumn', enableValue: true, aggFunc: AGG_FUNC[field] }
      : { enableRowGroup: true }),
  };
});

const perspectiveCfg: StompPerspectiveProviderConfig = {
  providerType: 'stomp-perspective',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic,
  requestMessage,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: KEY_COLUMN,
  autoStart: false,
  snapshotChunkSize: 1000,
  // These still govern the classic push path for anything that subscribes to
  // it. The Table is fed from the same emit stream either way.
  throttleMs: 100,
  conflateByKey: KEY_COLUMN,
  tableName: PERSPECTIVE_TABLE_NAME,
  inferredFields,
  columnDefinitions,
};

export const perspectiveProviderDraft: DataProviderConfig = {
  providerId: PERSPECTIVE_PROVIDER_ID,
  name: 'Positions (Perspective Table)',
  providerType: 'stomp-perspective',
  userId: 'dev1',
  public: false,
  config: perspectiveCfg,
};
