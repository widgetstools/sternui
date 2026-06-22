import { Activity } from 'lucide-react';
import { Badge } from '@starui/ui';
import type { TerminalState } from '../data/types';
import { fmtPrice, fmtSignedPct } from '../data/formatters';
import { ThemeToggle } from './ThemeToggle';

const STRIP_IDS = ['i01', 'i03', 'i05', 'i07', 'i15'];

export interface TopBarProps {
  state: TerminalState;
}

export function TopBar({ state }: TopBarProps) {
  return (
    <header
      className="flex h-14 shrink-0 items-center gap-4 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] pl-5 pr-3"
      data-testid="ds-topbar"
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-5 w-1.5 rounded-sm bg-[color:var(--ds-accent-info)]" aria-hidden />
        <h1 className="text-[15px] font-semibold tracking-tight">StarUI FI Terminal</h1>
        <Badge
          variant="outline"
          className="ml-1 gap-1 border-[color:var(--ds-border-primary)] text-[10px] text-[color:var(--ds-text-secondary)]"
        >
          <Activity size={11} /> design-system demo
        </Badge>
      </div>

      <div className="ml-2 hidden min-w-0 flex-1 items-center gap-4 overflow-hidden lg:flex">
        {STRIP_IDS.map((id) => {
          const q = state.quotes[id];
          const inst = state.instruments.find((i) => i.id === id);
          if (!q || !inst) return null;
          const up = q.changePct >= 0;
          return (
            <div key={id} className="flex items-center gap-1.5 whitespace-nowrap font-[var(--ds-font-mono)] text-[12px]">
              <span className="text-[color:var(--ds-text-secondary)]">{inst.ticker.split(' ')[0]}</span>
              <span className="text-[color:var(--ds-text-primary)]">{fmtPrice(q.mid)}</span>
              <span style={{ color: up ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)' }}>
                {fmtSignedPct(q.changePct)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
