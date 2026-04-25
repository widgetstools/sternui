/**
 * MockProvider — deterministic offline provider for tests + demos.
 *
 * Implements `ProviderBase` with:
 *   • `fetch(key)`      — returns a fresh snapshot row set for the key.
 *   • `subscribe(key,)` — emits synthetic updates every
 *                         `config.updateInterval` ms while at least
 *                         one consumer is subscribed. Updates are
 *                         single rows (not snapshots) so consumers
 *                         can exercise the "snapshot then updates"
 *                         flow end-to-end.
 *   • Refcounted: multiple subscribers share one tick interval; the
 *                 timer stops when the last consumer unsubscribes.
 *
 * NOT the same as `apps/stern-reference-react/src/data/MockDataProvider.ts` —
 * that one implements the legacy per-widget `IBlotterDataProvider`
 * interface. This version is the data-plane contract and is
 * framework-agnostic (no React, no widget assumptions).
 */

import type { MockProviderConfig, ProviderType } from '@marketsui/shared-types';
import { ProviderBase, type ProviderEmitter, type Unsubscribe } from './ProviderBase';

export type MockRow = Record<string, unknown>;

export interface MockSnapshot {
  rows: MockRow[];
}

interface KeyTicker {
  interval: ReturnType<typeof setInterval> | null;
  emitters: Set<ProviderEmitter<MockRow | MockSnapshot>>;
  rowCount: number;
}

const INSTRUMENTS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'BAC', 'GS'];
const SIDES = ['Buy', 'Sell'] as const;
const STATUSES = ['New', 'PartiallyFilled', 'Filled', 'Cancelled'] as const;

export class MockProvider extends ProviderBase<MockProviderConfig, MockSnapshot | MockRow> {
  readonly type: ProviderType = 'mock';

  private config: MockProviderConfig = {
    providerType: 'mock',
    dataType: 'positions',
    rowCount: 50,
    updateInterval: 2000,
    enableUpdates: true,
  };

  private readonly keyTickers = new Map<string, KeyTicker>();

  async configure(config: MockProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
  }

  async fetch(key: string): Promise<MockSnapshot> {
    const rowCount = this.config.rowCount ?? 50;
    return { rows: this.generateSnapshot(key, rowCount) };
  }

  override subscribe(
    key: string,
    emit: ProviderEmitter<MockSnapshot | MockRow>,
  ): Unsubscribe {
    let ticker = this.keyTickers.get(key);
    if (!ticker) {
      ticker = {
        interval: null,
        emitters: new Set(),
        rowCount: this.config.rowCount ?? 50,
      };
      this.keyTickers.set(key, ticker);
    }

    ticker.emitters.add(emit);
    this.track(key);

    // Deliver initial snapshot synchronously so new subscribers don't
    // have to wait one tick for first data.
    emit({ rows: this.generateSnapshot(key, ticker.rowCount) });

    // Start (or keep) the tick interval for this key when updates
    // are enabled and this is the first subscriber.
    if (
      this.config.enableUpdates !== false &&
      ticker.interval === null &&
      ticker.emitters.size === 1
    ) {
      const ms = this.config.updateIntervalMs ?? this.config.updateInterval ?? 2000;
      ticker.interval = setInterval(() => {
        const row = this.generateRow(key, ticker!.rowCount);
        for (const fn of ticker!.emitters) fn(row);
      }, ms);
    }

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      ticker!.emitters.delete(emit);
      this.untrack(key);
      if (ticker!.emitters.size === 0 && ticker!.interval !== null) {
        clearInterval(ticker!.interval);
        ticker!.interval = null;
      }
    };
  }

  async teardown(): Promise<void> {
    for (const t of this.keyTickers.values()) {
      if (t.interval !== null) clearInterval(t.interval);
      t.emitters.clear();
    }
    this.keyTickers.clear();
  }

  // ─── Synthetic data generators ──────────────────────────────────────

  private generateSnapshot(key: string, rowCount: number): MockRow[] {
    const rows: MockRow[] = [];
    for (let i = 0; i < rowCount; i++) {
      rows.push(this.generateRow(key, rowCount, i));
    }
    return rows;
  }

  private generateRow(_key: string, rowCount: number, i?: number): MockRow {
    const idx = i ?? Math.floor(Math.random() * rowCount);
    const instrument = INSTRUMENTS[idx % INSTRUMENTS.length];
    const side = SIDES[idx % SIDES.length];
    const status = STATUSES[idx % STATUSES.length];
    return {
      id: `row-${idx}`,
      instrument,
      side,
      status,
      quantity: 100 + (idx * 37) % 900,
      price: 50 + ((idx * 17) % 450) + Math.random() * 0.99,
      timestamp: Date.now(),
    };
  }
}
