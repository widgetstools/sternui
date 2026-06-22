import { useMemo } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, Progress,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@starui/ui';
import type { TerminalState } from '../data/types';
import { fmtMoney } from '../data/formatters';

export interface RiskPanelsProps {
  state: TerminalState;
}

const LIMITS = [
  { sector: 'Technology', limit: 18 },
  { sector: 'Financials', limit: 14 },
  { sector: 'Healthcare', limit: 12 },
  { sector: 'Energy', limit: 10 },
];

export function RiskPanels({ state }: RiskPanelsProps) {
  const bySector = useMemo(() => {
    const map = new Map<string, { dv01: number; mv: number }>();
    for (const p of state.positions) {
      const inst = state.instruments.find((i) => i.id === p.instrumentId);
      const sector = inst?.sector ?? 'Other';
      const cur = map.get(sector) ?? { dv01: 0, mv: 0 };
      cur.dv01 += p.dv01;
      cur.mv += p.marketValue;
      map.set(sector, cur);
    }
    return [...map.entries()].map(([sector, v]) => ({ sector, ...v })).sort((a, b) => b.dv01 - a.dv01);
  }, [state.positions, state.instruments]);

  const maxDv01 = Math.max(1, ...bySector.map((s) => s.dv01));
  const totalDv01 = bySector.reduce((s, r) => s + r.dv01, 0);
  const var95 = Math.round(totalDv01 * 1.65 * 8);

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="risk-panels">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardHeader className="pb-1.5"><CardTitle className="text-[12px] text-[color:var(--ds-text-secondary)]">VaR (95%, 1d)</CardTitle></CardHeader><CardContent className="font-[var(--ds-font-mono)] text-[20px] text-[color:var(--ds-accent-warning)]">{fmtMoney(var95)}</CardContent></Card>
        <Card><CardHeader className="pb-1.5"><CardTitle className="text-[12px] text-[color:var(--ds-text-secondary)]">Total DV01</CardTitle></CardHeader><CardContent className="font-[var(--ds-font-mono)] text-[20px] text-[color:var(--ds-text-primary)]">${Math.round(totalDv01).toLocaleString('en-US')}</CardContent></Card>
        <Card><CardHeader className="pb-1.5"><CardTitle className="text-[12px] text-[color:var(--ds-text-secondary)]">Positions</CardTitle></CardHeader><CardContent className="font-[var(--ds-font-mono)] text-[20px] text-[color:var(--ds-text-primary)]">{state.positions.length}</CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[13px]">Exposure by sector</CardTitle><CardDescription>DV01 contribution, heat-shaded</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Sector</TableHead><TableHead className="text-right">DV01</TableHead><TableHead className="text-right">Market value</TableHead></TableRow></TableHeader>
            <TableBody>
              {bySector.map((r) => (
                <TableRow key={r.sector} style={{ background: `color-mix(in srgb, var(--ds-overlay-warning-soft) ${Math.round((r.dv01 / maxDv01) * 70)}%, transparent)` }}>
                  <TableCell>{r.sector}</TableCell>
                  <TableCell className="text-right font-[var(--ds-font-mono)]">${Math.round(r.dv01).toLocaleString('en-US')}</TableCell>
                  <TableCell className="text-right font-[var(--ds-font-mono)]">{fmtMoney(r.mv)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[13px]">Limit utilization</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {LIMITS.map((l) => {
            const used = bySector.find((s) => s.sector === l.sector)?.dv01 ?? 0;
            const pct = Math.min(100, Math.round((used / (l.limit * 1000)) * 100));
            return (
              <div key={l.sector} className="flex flex-col gap-1">
                <div className="flex justify-between text-[11px] text-[color:var(--ds-text-secondary)]"><span>{l.sector}</span><span>{pct}%</span></div>
                <Progress value={pct} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
