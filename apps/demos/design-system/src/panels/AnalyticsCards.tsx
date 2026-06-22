import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@starui/ui';
import type { TerminalState } from '../data/types';
import { fmtMoney, fmtSignedPct, fmtYield } from '../data/formatters';

export interface AnalyticsCardsProps {
  state: TerminalState;
}

export function AnalyticsCards({ state }: AnalyticsCardsProps) {
  const quotes = Object.values(state.quotes);
  const avgYield = quotes.reduce((s, q) => s + q.ytm, 0) / (quotes.length || 1);
  const totalDv01 = state.positions.reduce((s, p) => s + p.dv01, 0);
  const totalPnl = state.positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const tickerFor = (id: string) => state.instruments.find((i) => i.id === id)?.ticker.split(' ')[0] ?? id;

  const cards = [
    { title: 'Avg yield', value: fmtYield(avgYield), desc: `${quotes.length} instruments` },
    { title: 'Total DV01', value: `$${Math.round(totalDv01).toLocaleString('en-US')}`, desc: 'Portfolio risk' },
    { title: 'Unrealized P&L', value: fmtMoney(totalPnl), desc: 'Mark-to-market', color: totalPnl >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)' },
    { title: 'Top mover', value: best ? `${tickerFor(best.id)} ${fmtSignedPct(best.changePct)}` : '—', desc: `Worst: ${worst ? tickerFor(worst.id) : '—'}` },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="analytics-cards">
      {cards.map((c) => (
        <Card key={c.title} className="bg-[color:var(--ds-surface-primary)]">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-[12px] font-medium text-[color:var(--ds-text-secondary)]">{c.title}</CardTitle>
            <CardDescription className="text-[11px]">{c.desc}</CardDescription>
          </CardHeader>
          <CardContent className="font-[var(--ds-font-mono)] text-[20px]" style={{ color: c.color ?? 'var(--ds-text-primary)' }}>
            {c.value}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
