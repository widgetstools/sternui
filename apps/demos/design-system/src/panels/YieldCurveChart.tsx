import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@starui/ui/chart';
import type { TerminalState } from '../data/types';

const CONFIG = { yield: { label: 'Yield %', color: 'var(--ds-chart-1)' } } satisfies ChartConfig;

export interface YieldCurveChartProps {
  state: TerminalState;
}

export function YieldCurveChart({ state }: YieldCurveChartProps) {
  const data = state.curve.map((p) => ({ tenor: `${p.tenor}y`, yield: p.yield }));
  return (
    <div className="flex h-full flex-col" data-testid="yield-curve">
      <div className="shrink-0 border-b border-[color:var(--ds-border-primary)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Treasury yield curve
      </div>
      <div className="min-h-0 flex-1 p-3">
        <ChartContainer config={CONFIG} className="h-full w-full">
          <LineChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="tenor" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} width={36} domain={['dataMin - 0.3', 'dataMax + 0.3']} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line dataKey="yield" type="monotone" stroke="var(--color-yield)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
      </div>
    </div>
  );
}
