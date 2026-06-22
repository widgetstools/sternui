import { useMemo } from 'react';
import type { TerminalState } from '../data/types';
import { fmtPrice } from '../data/formatters';

export interface OrderBookProps {
  state: TerminalState;
  instrumentId: string;
}

interface Level { price: number; size: number; pct: number }

function buildLevels(base: number, step: number, rng: number): Level[] {
  const raw = Array.from({ length: 6 }, (_, i) => ({
    price: base + step * (i + 1),
    size: Math.round(0.5e6 + ((i * 37 + rng) % 5) * 0.6e6),
  }));
  const max = Math.max(...raw.map((l) => l.size));
  return raw.map((l) => ({ ...l, pct: Math.round((l.size / max) * 100) }));
}

export function OrderBook({ state, instrumentId }: OrderBookProps) {
  const q = state.quotes[instrumentId];
  const seed = Math.round((q?.mid ?? 100) * 10);
  const asks = useMemo(() => buildLevels(q?.ask ?? 100, 0.02, seed).reverse(), [q?.ask, seed]);
  const bids = useMemo(() => buildLevels(q?.bid ?? 100, -0.02, seed + 3), [q?.bid, seed]);

  return (
    <div className="flex h-full flex-col" data-testid="order-book">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Depth
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-px p-2 font-[var(--ds-font-mono)] text-[11px]">
        {asks.map((l, i) => (
          <Row key={`a${i}`} price={l.price} size={l.size} pct={l.pct} side="ask" />
        ))}
        <div className="my-1 text-center text-[12px] font-semibold text-[color:var(--ds-text-primary)]">{fmtPrice(q?.mid ?? 0)}</div>
        {bids.map((l, i) => (
          <Row key={`b${i}`} price={l.price} size={l.size} pct={l.pct} side="bid" />
        ))}
      </div>
    </div>
  );
}

function Row({ price, size, pct, side }: Level & { side: 'bid' | 'ask' }) {
  const fill = side === 'bid' ? 'var(--ds-trade-bid-fill)' : 'var(--ds-trade-ask-fill)';
  const color = side === 'bid' ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
  return (
    <div className="relative flex items-center justify-between px-2 py-0.5">
      <div className="absolute inset-y-0 right-0" style={{ width: `${pct}%`, background: fill, opacity: 0.5 }} aria-hidden />
      <span className="relative" style={{ color }}>{fmtPrice(price)}</span>
      <span className="relative text-[color:var(--ds-text-secondary)]">{(size / 1e6).toFixed(1)}M</span>
    </div>
  );
}
