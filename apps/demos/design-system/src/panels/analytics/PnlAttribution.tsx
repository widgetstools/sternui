import type { WidgetProps } from '@widgetstools/react-dock-manager';
import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@starui/ui/chart';
import { useDemoState } from '../../state/DemoStateProvider';

const CHART_CONFIG: ChartConfig = {
  pnl:  { label: 'P&L ($k)', color: 'var(--ds-chart-1)' },
};

interface PnlItem {
  label: string;
  pnl: number;
  isTotal: boolean;
}

function buildAttributionData(
  positions: ReturnType<typeof useDemoState>['store']['state']['positions'],
): PnlItem[] {
  const totalPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalK = Math.round(totalPnl / 1000);
  const carry   = Math.round(totalK * 0.42);
  const spread  = Math.round(totalK * 0.31);
  const rates   = Math.round(totalK * -0.18);
  const fx      = Math.round(totalK * -0.08);
  const costs   = Math.round(totalK * -0.05);
  const total   = carry + spread + rates + fx + costs;
  return [
    { label: 'Carry',  pnl: carry,  isTotal: false },
    { label: 'Spread', pnl: spread, isTotal: false },
    { label: 'Rates',  pnl: rates,  isTotal: false },
    { label: 'FX',     pnl: fx,     isTotal: false },
    { label: 'Costs',  pnl: costs,  isTotal: false },
    { label: 'Total',  pnl: total,  isTotal: true  },
  ];
}

function cellColor(item: PnlItem): string {
  if (item.isTotal) return item.pnl >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)';
  return item.pnl >= 0 ? 'var(--ds-chart-1)' : 'var(--ds-chart-4)';
}

export function PnlAttribution(_props: WidgetProps) {
  const { store } = useDemoState();
  const { positions } = store.state;

  const data = useMemo(() => buildAttributionData(positions), [positions]);
  const netPnl = data.find((d) => d.isTotal)?.pnl ?? 0;
  const fmtK = (n: number) => `${n >= 0 ? '+' : ''}$${n.toLocaleString('en-US')}k`;

  return (
    <div className="flex h-full flex-col" data-testid="panel-pnlAttribution">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        P&amp;L Attribution MTD
      </div>
      <div className="min-h-0 flex-1 p-2">
        <ChartContainer config={CHART_CONFIG} className="h-full w-full">
          <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
            <YAxis tickLine={false} axisLine={false} fontSize={10} width={38} unit="k" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ReferenceLine y={0} stroke="var(--ds-border-primary)" strokeWidth={1} />
            <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false}>
              {data.map((item, idx) => (
                <Cell key={idx} fill={cellColor(item)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
      <div className="shrink-0 border-t border-[color:var(--ds-border-primary)] px-3 py-1.5 flex items-center gap-2 text-[11px]">
        <span className="text-[color:var(--ds-text-muted)]">Net P&amp;L MTD:</span>
        <span
          className="font-[var(--ds-font-mono)] font-semibold"
          style={{ color: netPnl >= 0 ? 'var(--ds-accent-positive)' : 'var(--ds-accent-negative)' }}
        >
          {fmtK(netPnl)}
        </span>
      </div>
    </div>
  );
}
