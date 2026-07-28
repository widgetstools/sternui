/**
 * The real feed, pointed at the in-repo STOMP view server.
 *
 * Start it first:  cd apps/demos/stomp-view-server && npm run build && npm start
 *
 * The sparse blotter profile is the one measured in
 * `packages/react-grid/perspective-grid/scripts/stompFeedProbe.mjs`: a
 * 20,000-row snapshot in batches of 50, then ~5 frames/sec carrying ~100 rows
 * each, of which only ~4 of 52 fields per row actually move. Partial rows are
 * exactly what `table.update()` wants — it upserts by index and leaves the
 * columns a frame omitted alone.
 */
import type { StompProviderConfig } from '@starui/types';

/** Name the Table is hosted under; windows pass this to `open_table`. */
export const BOOK_TABLE = 'positions';

/** Perspective's index — what makes `update()` an upsert instead of an append. */
export const KEY_COLUMN = 'positionId';

const CLIENT = 'TRADER001';

export const stompConfig = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: `/snapshot/positions/${CLIENT}`,
  // `/{rate}/{batchSize}` — rate 7 is ~143ms per live frame.
  requestMessage: `/snapshot/positions/${CLIENT}/7/50`,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: KEY_COLUMN,
  autoStart: true,
  snapshotChunkSize: 1000,
} as unknown as StompProviderConfig;
