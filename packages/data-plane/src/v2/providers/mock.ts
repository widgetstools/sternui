/**
 * MockProvider — synthesises ticking row data for tests + dev demos.
 *
 * Snapshot:
 *   On start, emits N rows with `replace: true` (the initial set).
 *   Then transitions to `status: 'ready'`.
 *
 * Realtime:
 *   Every `updateInterval` ms, picks a random row from the snapshot
 *   and emits it as an upsert (price ± a small delta). Emits at most
 *   one row per tick to keep the stats throughput readable.
 *
 * `restart(extra)` clears the cache, emits an empty replace, and
 *   re-snapshots. The `extra` overlay is merged into the seed config
 *   for that snapshot (e.g. `{ rowCount: 100 }` lets the test resize
 *   the data set per restart).
 */

import type { MockProviderConfig } from '@marketsui/shared-types';
import type { ProviderEmit, ProviderHandle } from './Provider.js';

interface MockRow extends Record<string, unknown> {
  id: string;
  instrument: string;
  side: 'Buy' | 'Sell';
  status: 'New' | 'PartiallyFilled' | 'Filled' | 'Cancelled';
  quantity: number;
  price: number;
  timestamp: number;
}

const INSTRUMENTS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'BAC', 'GS'];
const SIDES: MockRow['side'][] = ['Buy', 'Sell'];
const STATUSES: MockRow['status'][] = ['New', 'PartiallyFilled', 'Filled', 'Cancelled'];

function buildRow(idx: number): MockRow {
  return {
    id: `row-${idx}`,
    instrument: INSTRUMENTS[idx % INSTRUMENTS.length],
    side: SIDES[idx % SIDES.length],
    status: STATUSES[idx % STATUSES.length],
    quantity: 100 + (idx * 37) % 900,
    price: Number((50 + (idx * 17) % 450 + Math.random() * 0.99).toFixed(2)),
    timestamp: Date.now(),
  };
}

export interface MockProviderOpts {
  /** Inject for deterministic tests. Defaults to `setInterval`. */
  setTicker?: (cb: () => void, ms: number) => unknown;
  /** Companion to `setTicker`. Defaults to `clearInterval`. */
  clearTicker?: (handle: unknown) => void;
}

export function startMock(
  cfg: MockProviderConfig,
  emit: ProviderEmit,
  opts: MockProviderOpts = {},
): ProviderHandle {
  const setTicker = opts.setTicker ?? ((cb, ms) => setInterval(cb, ms));
  const clearTicker = opts.clearTicker ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));

  let rowCount = cfg.rowCount ?? 50;
  let updates = cfg.enableUpdates ?? true;
  let interval = cfg.updateIntervalMs ?? cfg.updateInterval ?? 2000;
  let snapshot: MockRow[] = [];
  let ticker: unknown = null;

  const buildSnapshot = (): MockRow[] => {
    const rows: MockRow[] = [];
    for (let i = 0; i < rowCount; i++) rows.push(buildRow(i));
    return rows;
  };

  const startTicker = () => {
    if (!updates || rowCount === 0) return;
    ticker = setTicker(() => {
      const idx = Math.floor(Math.random() * rowCount);
      const updated: MockRow = {
        ...snapshot[idx],
        price: Number((snapshot[idx].price + (Math.random() - 0.5)).toFixed(2)),
        timestamp: Date.now(),
      };
      snapshot[idx] = updated;
      emit({ rows: [updated] });
    }, interval);
  };

  const stopTicker = () => {
    if (ticker !== null) {
      clearTicker(ticker);
      ticker = null;
    }
  };

  const fireSnapshot = () => {
    snapshot = buildSnapshot();
    emit({ rows: snapshot, replace: true });
    emit({ status: 'ready' });
    startTicker();
  };

  // Kick off async via microtask so handlers attached after `startMock`
  // returns still see the initial events.
  emit({ status: 'loading' });
  Promise.resolve().then(fireSnapshot);

  return {
    stop: () => {
      stopTicker();
    },
    restart: (extra) => {
      stopTicker();
      // Re-seed parameters from the overlay if supplied.
      if (extra && typeof extra === 'object') {
        const o = extra as Record<string, unknown>;
        if (typeof o.rowCount === 'number') rowCount = o.rowCount;
        if (typeof o.updateIntervalMs === 'number') interval = o.updateIntervalMs;
        if (typeof o.enableUpdates === 'boolean') updates = o.enableUpdates;
      }
      // Wipe the consumer's view, then re-snapshot.
      emit({ rows: [], replace: true });
      emit({ status: 'loading' });
      Promise.resolve().then(fireSnapshot);
    },
  };
}
