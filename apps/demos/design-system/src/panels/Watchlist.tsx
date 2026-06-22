import { ArrowDown, ArrowUp } from 'lucide-react';
import { ScrollArea } from '@starui/ui';
import type { TerminalState } from '../data/types';
import { fmtPrice, fmtSignedPct } from '../data/formatters';

export interface WatchlistProps {
  state: TerminalState;
  onSelect?: (id: string) => void;
  selectedId?: string;
}

export function Watchlist({ state, onSelect, selectedId }: WatchlistProps) {
  return (
    <div className="flex h-full flex-col" data-testid="watchlist">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Watchlist
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          {state.instruments.map((inst) => {
            const q = state.quotes[inst.id];
            const up = q.changePct >= 0;
            const selected = inst.id === selectedId;
            return (
              <button
                key={inst.id}
                type="button"
                onClick={() => onSelect?.(inst.id)}
                className={`flex items-center justify-between gap-2 border-b border-[color:var(--ds-border-primary)] px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[color:var(--ds-surface-secondary)] ${
                  selected ? 'bg-[color:var(--ds-surface-secondary)]' : ''
                }`}
              >
                <span className="truncate text-[color:var(--ds-text-primary)]">{inst.ticker}</span>
                <span className="flex items-center gap-2 font-[var(--ds-font-mono)]">
                  <span className="text-[color:var(--ds-text-primary)]">{fmtPrice(q.mid)}</span>
                  <span className="flex w-16 items-center justify-end gap-0.5" style={{ color: up ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)' }}>
                    {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                    {fmtSignedPct(q.changePct)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
