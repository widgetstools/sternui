import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, ScatterChart, Scatter, PieChart, Pie,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend,
} from 'recharts';
import { BONDS, OAS_DATA } from '@/data/tradingData';

const BD = '1px solid var(--bn-border)';

/* ── Shared tooltip ── */
const TT = (props: any) => {
  if (!props.active || !props.payload?.length) return null;
  return (
    <div style={{ background: 'var(--bn-bg2)', border: BD, borderRadius: 3, padding: '6px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11 }}>
      <div style={{ color: 'var(--bn-t1)', marginBottom: 3 }}>{props.label}</div>
      {props.payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || 'var(--bn-t0)' }}>{p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</div>
      ))}
    </div>
  );
};

/* ── Shared axis style ── */
const AXIS_TICK = { fill: 'var(--bn-t2)', fontSize: 9, fontFamily: 'JetBrains Mono' };

/* ── Data ── */
const SCATTER_DATA = BONDS.map(b => ({ name: b.ticker, x: b.dur, y: b.oas, dv01: b.dv01, rtg: b.rtgClass }));
// Rating gradient: aaa/aa blue → a green → bbb copper → hy red. Hex for recharts SVG.
const RTG_COLOR: Record<string, string> = { aaa: '#6ba4e8', aa: '#7db4e3', a: '#3dbfa0', bbb: '#c97b3f', hy: '#e56464' };

const BUCKET_RANGES: [number, number][] = [[0, 1], [1, 3], [3, 5], [5, 7], [7, 10], [10, 50]];
const BUCKET_LABELS = ['0-1Y', '1-3Y', '3-5Y', '5-7Y', '7-10Y', '10Y+'];
const BUCKET_DATA = BUCKET_RANGES.map(([lo, hi], i) => {
  const bonds = BONDS.filter(b => b.dur >= lo && b.dur < hi);
  const dv01 = bonds.reduce((a, b) => a + b.dv01, 0);
  const avgOas = bonds.length ? Math.round(bonds.reduce((a, b) => a + b.oas, 0) / bonds.length) : 0;
  return { bucket: BUCKET_LABELS[i], bonds: bonds.length, dv01, avgOas };
});
const totalDv01All = BUCKET_DATA.reduce((a, d) => a + d.dv01, 0);

const HIST_OAS = Array.from({ length: 60 }, (_, i) => {
  const d = new Date(2026, 3, 4); d.setDate(d.getDate() - 59 + i);
  return {
    date: `${d.getMonth() + 1}/${d.getDate()}`,
    ig: +(52 + Math.sin(i / 8) * 8 + (Math.random() - .5) * 3).toFixed(1),
    hy: +(340 + Math.sin(i / 6) * 25 + (Math.random() - .5) * 8).toFixed(1),
  };
});

const SECTOR_MAP: Record<string, string> = {};
BONDS.forEach(b => { SECTOR_MAP[b.sector] = b.sector; });
const SECTORS = Object.keys(SECTOR_MAP);
const SECTOR_COLORS = ['#6ba4e8', '#7db4e3', '#a48ad4', '#3dbfa0', '#c97b3f', '#a85f26'];
const SECTOR_PIE = SECTORS.map((s, i) => {
  const bonds = BONDS.filter(b => b.sector === s);
  const mv = bonds.reduce((a, b) => a + parseFloat(b.face), 0);
  return { name: s, value: mv, color: SECTOR_COLORS[i % SECTOR_COLORS.length] };
});

const PNL_DATA = [
  { attr: 'Carry', pnl: 188 },
  { attr: 'Spread', pnl: 142 },
  { attr: 'Rates', pnl: 88 },
  { attr: 'FX', pnl: -22 },
  { attr: 'Costs', pnl: -34 },
];
const pnlTotal = PNL_DATA.reduce((a, d) => a + d.pnl, 0);

// ── 1. OAS vs Duration — Scatter bubble chart ──
export function OasVsDuration() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bn-bg1)', overflow: 'hidden' }}>
      <div style={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 20, bottom: 20, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" />
            <XAxis dataKey="x" name="Duration" type="number" tick={AXIS_TICK} axisLine={false} tickLine={false}
              label={{ value: 'Duration (yrs)', fill: 'var(--bn-t2)', fontSize: 9, position: 'insideBottom', offset: -6 }} />
            <YAxis dataKey="y" name="OAS (bp)" type="number" tick={AXIS_TICK} axisLine={false} tickLine={false}
              tickFormatter={v => `+${v}`} />
            <Tooltip content={<TT />} cursor={{ strokeDasharray: '3 3', stroke: 'var(--bn-border)' }} />
            <Scatter data={SCATTER_DATA} shape={(props: any) => {
              const { cx, cy, payload } = props;
              return <circle cx={cx} cy={cy} r={Math.min(5 + payload.dv01 / 300, 10)} fill={RTG_COLOR[payload.rtg] || '#888'} fillOpacity={0.75} stroke={RTG_COLOR[payload.rtg]} strokeWidth={1} />;
            }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '4px 14px 8px', flexShrink: 0 }}>
        {Object.entries(RTG_COLOR).map(([r, c]) => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
            <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'JetBrains Mono,monospace' }}>{r.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 2. Duration Buckets — Grouped bar chart (DV01 + bond count) ──
export function DurationBuckets() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bn-bg1)', overflow: 'hidden' }}>
      <div style={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={BUCKET_DATA} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis yAxisId="dv01" tick={AXIS_TICK} axisLine={false} tickLine={false} width={40}
              tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
            <YAxis yAxisId="oas" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} width={36}
              tickFormatter={v => `${v}bp`} />
            <Tooltip content={<TT />} />
            <Bar yAxisId="dv01" dataKey="dv01" name="DV01" fill="#6ba4e8" radius={[3, 3, 0, 0]} barSize={18} fillOpacity={0.8} />
            <Bar yAxisId="oas" dataKey="avgOas" name="Avg OAS" fill="#c97b3f" radius={[3, 3, 0, 0]} barSize={14} fillOpacity={0.7} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Summary footer */}
      <div style={{ display: 'flex', gap: 14, padding: '6px 14px', borderTop: BD, flexShrink: 0 }}>
        {[
          { l: 'Total DV01', v: `$${(totalDv01All / 1000).toFixed(1)}K`, c: '#6ba4e8' },
          { l: 'Avg Dur', v: '4.82yr', c: '#7db4e3' },
          { l: 'Bonds', v: String(BUCKET_DATA.reduce((a, d) => a + d.bonds, 0)), c: 'var(--bn-t0)' },
          { l: 'Wt Avg OAS', v: `+${Math.round(BUCKET_DATA.reduce((a, d) => a + d.avgOas * d.bonds, 0) / BUCKET_DATA.reduce((a, d) => a + d.bonds, 0))}bp`, c: '#c97b3f' },
        ].map(s => (
          <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--bn-t2)' }}>{s.l}</span>
            <span className="font-mono-fi font-semibold" style={{ fontSize: 11, color: s.c }}>{s.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 3. Sector Allocation — Donut chart with legend ──
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
  if (percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return <text x={x} y={y} fill="var(--bn-t0)" textAnchor="middle" dominantBaseline="central" fontSize={9} fontFamily="JetBrains Mono,monospace" fontWeight={600}>{(percent * 100).toFixed(0)}%</text>;
};

export function SectorAllocation() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bn-bg1)', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={SECTOR_PIE} dataKey="value" nameKey="name" cx="50%" cy="50%"
              innerRadius="45%" outerRadius="78%" paddingAngle={2}
              label={renderPieLabel} labelLine={false} stroke="var(--bn-bg1)" strokeWidth={2}>
              {SECTOR_PIE.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Pie>
            <Tooltip content={(props: any) => {
              if (!props.active || !props.payload?.length) return null;
              const d = props.payload[0];
              const total = SECTOR_PIE.reduce((a, s) => a + s.value, 0);
              const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';
              return (
                <div style={{ background: 'var(--bn-bg2)', border: BD, borderRadius: 3, padding: '6px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11 }}>
                  <div style={{ color: d.payload.color, fontWeight: 600 }}>{d.name}</div>
                  <div style={{ color: 'var(--bn-t0)' }}>${d.value}MM · {pct}%</div>
                </div>
              );
            }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 14px 8px', flexShrink: 0, justifyContent: 'center' }}>
        {SECTOR_PIE.map(s => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: 'var(--bn-t2)', fontFamily: 'JetBrains Mono,monospace', whiteSpace: 'nowrap' }}>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. Historical OAS — Area chart with gradient ──
export function HistoricalOas() {
  const [period, setPeriod] = useState('3M');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bn-bg1)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 10px', flexShrink: 0 }}>
        {['1M', '3M', '6M', '1Y'].map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{ fontSize: 9, padding: '2px 6px', marginLeft: 3, borderRadius: 2, border: BD, background: period === p ? 'var(--bn-border)' : 'transparent', color: period === p ? 'var(--bn-t0)' : 'var(--bn-t1)', cursor: 'pointer', fontFamily: 'JetBrains Mono,monospace' }}>{p}</button>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={HIST_OAS} margin={{ top: 4, right: 16, bottom: 8, left: 8 }}>
            <defs>
              <linearGradient id="igGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6ba4e8" stopOpacity={0.15} /><stop offset="95%" stopColor="#6ba4e8" stopOpacity={0} /></linearGradient>
              <linearGradient id="hyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--bn-red)" stopOpacity={0.1} /><stop offset="95%" stopColor="var(--bn-red)" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={14} />
            <YAxis yAxisId="ig" tick={AXIS_TICK} axisLine={false} tickLine={false} domain={['auto', 'auto']} width={32} />
            <YAxis yAxisId="hy" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} domain={['auto', 'auto']} width={38} />
            <Tooltip content={<TT />} />
            <Area yAxisId="ig" type="monotone" dataKey="ig" name="CDX IG" stroke="#6ba4e8" strokeWidth={1.5} fill="url(#igGrad)" dot={false} />
            <Area yAxisId="hy" type="monotone" dataKey="hy" name="CDX HY" stroke="var(--bn-red)" strokeWidth={1.5} fill="url(#hyGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 5. OAS Distribution — Horizontal bar chart (sorted) ──
export function OasDistribution() {
  const sorted = [...OAS_DATA].sort((a, b) => b.oas - a.oas);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bn-bg1)', overflow: 'hidden' }}>
      <div style={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sorted} layout="vertical" margin={{ top: 8, right: 40, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false}
              tickFormatter={v => `+${v}bp`} />
            <YAxis type="category" dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} width={56} />
            <Tooltip content={(props: any) => {
              if (!props.active || !props.payload?.length) return null;
              const d = props.payload[0];
              return (
                <div style={{ background: 'var(--bn-bg2)', border: BD, borderRadius: 3, padding: '6px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11 }}>
                  <div style={{ color: 'var(--bn-t1)' }}>{d.payload.name}</div>
                  <div style={{ color: d.payload.color || '#6ba4e8' }}>OAS: +{d.value}bp</div>
                </div>
              );
            }} />
            <Bar dataKey="oas" name="OAS" radius={[0, 3, 3, 0]} barSize={12}>
              {sorted.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.8} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 6. P&L Attribution — Vertical bar chart with total ──
export function PnlAttribution() {
  const chartData = [
    ...PNL_DATA.map(d => ({ ...d, fill: d.pnl >= 0 ? '#6ba4e8' : 'var(--bn-red)' })),
    { attr: 'Total', pnl: pnlTotal, fill: pnlTotal >= 0 ? '#0ecb81' : 'var(--bn-red)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bn-bg1)', overflow: 'hidden' }}>
      <div style={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false} />
            <XAxis dataKey="attr" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40}
              tickFormatter={v => `${v > 0 ? '+' : ''}$${v}K`} />
            <Tooltip content={(props: any) => {
              if (!props.active || !props.payload?.length) return null;
              const d = props.payload[0];
              const isPos = d.value >= 0;
              return (
                <div style={{ background: 'var(--bn-bg2)', border: BD, borderRadius: 3, padding: '6px 10px', fontFamily: 'JetBrains Mono,monospace', fontSize: 11 }}>
                  <div style={{ color: 'var(--bn-t1)' }}>{d.payload.attr}</div>
                  <div style={{ color: isPos ? '#6ba4e8' : 'var(--bn-red)', fontWeight: 600 }}>{isPos ? '+' : ''}${d.value}K</div>
                </div>
              );
            }} />
            <Bar dataKey="pnl" name="P&L" radius={[3, 3, 0, 0]} barSize={28}>
              {chartData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={d.attr === 'Total' ? 1 : 0.75} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Total footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', borderTop: BD, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: 'var(--bn-t2)' }}>NET P&L MTD</span>
        <span className="font-mono-fi font-bold" style={{ fontSize: 18, color: '#0ecb81' }}>+${pnlTotal}K</span>
      </div>
    </div>
  );
}
