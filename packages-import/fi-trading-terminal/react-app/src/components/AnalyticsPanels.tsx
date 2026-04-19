import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { OAS_DATA, SPREADS, INITIAL_TRADES, SENSITIVITY } from '@/data/tradingData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/* ── Position Summary ── */
export function PositionSummary() {
  const cards = [
    { label:'Market Value',   value:'$47.2M',  sub:'+$1.4M today',   color:'var(--fi-blue)'  },
    { label:'Unrealized P&L', value:'+$284K',  sub:'+0.61% MTD',     color:'var(--fi-green)' },
    { label:'Total DV01',     value:'$18,420', sub:'per basis point', color:'var(--fi-cyan)' },
    { label:'Mod Duration',   value:'4.82',    sub:'yrs weighted',    color:'var(--fi-blue)'  },
  ];
  const details = [
    { label:'Wt Avg YTM', value:'5.14%', color:'var(--fi-t0)' },
    { label:'Wt Avg OAS', value:'+58 bp', color:'var(--fi-green)' },
    { label:'Convexity',  value:'0.84',  color:'var(--fi-t0)' },
    { label:'Ann. Income',value:'$243.8K', color:'var(--fi-cyan)' },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-8 border-b flex-shrink-0" style={{ background:'var(--fi-bg1)', borderColor:'var(--fi-border)' }}>
        <span className="font-mono-fi font-semibold tracking-widest uppercase" style={{ fontSize:9, color:'var(--fi-t2)' }}>Position Summary</span>
        <div className="flex gap-1">
          {['MTD','YTD'].map((v,i) => (
            <button key={v} className="font-mono-fi px-1.5 py-0.5 rounded-sm border text-xs" style={{ fontSize:9, background: i===0 ? 'rgba(61,158,255,0.1)':'transparent', borderColor: i===0 ? 'var(--fi-blue)':'var(--fi-border2)', color: i===0 ? 'var(--fi-blue)':'var(--fi-t2)' }}>{v}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px flex-shrink-0" style={{ background:'var(--fi-border)' }}>
        {cards.map(c => (
          <div key={c.label} className="flex flex-col gap-0.5 p-2" style={{ background:'var(--fi-bg2)' }}>
            <span className="font-mono-fi uppercase tracking-widest" style={{ fontSize:9, color:'var(--fi-t2)' }}>{c.label}</span>
            <span className="font-mono-fi font-medium" style={{ fontSize:13, color:c.color }}>{c.value}</span>
            <span className="font-mono-fi" style={{ fontSize:9, color:'var(--fi-t2)' }}>{c.sub}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 flex flex-col justify-center gap-1 px-3 py-1 border-t" style={{ borderColor:'var(--fi-border)' }}>
        {details.map(d => (
          <div key={d.label} className="flex items-center justify-between">
            <span className="font-mono-fi" style={{ fontSize:9, color:'var(--fi-t2)' }}>{d.label}</span>
            <span className="font-mono-fi" style={{ fontSize:9, color:d.color }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── OAS Distribution ── */
export function OasDistribution() {
  const max = Math.max(...OAS_DATA.map(d => d.oas)) || 1;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-8 border-b flex-shrink-0" style={{ background:'var(--fi-bg1)', borderColor:'var(--fi-border)' }}>
        <span className="font-mono-fi font-semibold tracking-widest uppercase" style={{ fontSize:9, color:'var(--fi-t2)' }}>OAS Distribution</span>
        <div className="flex gap-1">
          {['bp','%ile'].map((v,i) => (
            <button key={v} className="font-mono-fi px-1.5 py-0.5 rounded-sm border" style={{ fontSize:9, background: i===0 ? 'rgba(61,158,255,0.1)':'transparent', borderColor: i===0 ? 'var(--fi-blue)':'var(--fi-border2)', color: i===0 ? 'var(--fi-blue)':'var(--fi-t2)' }}>{v}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {OAS_DATA.map(d => (
          <div key={d.name} className="flex items-center gap-2 px-3 py-1">
            <span className="font-mono-fi w-16 flex-shrink-0" style={{ fontSize:9, color:'var(--fi-t1)' }}>{d.name.split(' ')[0]}</span>
            <div className="flex-1 h-1.5 rounded-sm overflow-hidden" style={{ background:'var(--fi-bg3)' }}>
              <div className="h-full rounded-sm" style={{ width: `${d.oas === 0 ? 1 : (d.oas/max)*100}%`, background:d.color }} />
            </div>
            <span className="font-mono-fi w-10 text-right flex-shrink-0" style={{ fontSize:9, color:d.color }}>
              {d.oas === 0 ? '0' : `+${d.oas}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Spread Monitor ── */
export function SpreadMonitor() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b flex-shrink-0" style={{ borderColor:'var(--fi-border)' }}>
        {['Spread Monitor','Curve Trades','Alerts'].map((t,i) => (
          <button key={t} className="font-mono-fi px-3 py-1.5 border-b-2 text-xs uppercase tracking-wider"
            style={{ fontSize:9, color: i===0 ? 'var(--fi-blue)':'var(--fi-t2)', borderBottomColor: i===0 ? 'var(--fi-blue)':'transparent', background:'transparent' }}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {SPREADS.map(s => (
          <div key={s.label} className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor:'var(--fi-border)' }}>
            <span className="font-mono-fi" style={{ fontSize:11, color:'var(--fi-t1)' }}>{s.label}</span>
            <span className="font-mono-fi" style={{ fontSize:11, color:'var(--fi-t0)' }}>{s.value}</span>
            <span className="font-mono-fi" style={{ fontSize:9, color: s.up ? 'var(--fi-green)':'var(--fi-red)' }}>{s.change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Recent Trades ── */
export function RecentTrades() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b flex-shrink-0" style={{ borderColor:'var(--fi-border)' }}>
        {['Recent Trades','Runs','Axes'].map((t,i) => (
          <button key={t} className="font-mono-fi px-3 py-1.5 border-b-2 text-xs uppercase tracking-wider"
            style={{ fontSize:9, color: i===0 ? 'var(--fi-blue)':'var(--fi-t2)', borderBottomColor: i===0 ? 'var(--fi-blue)':'transparent', background:'transparent' }}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background:'var(--fi-bg2)' }}>
              {['TIME','BOND','SIDE','SIZE','PX','YTM'].map(h => (
                <th key={h} className="font-mono-fi text-left px-2 py-1 border-b" style={{ fontSize:9, color:'var(--fi-t2)', letterSpacing:'0.05em', borderColor:'var(--fi-border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INITIAL_TRADES.map((t, i) => (
              <tr key={i} className="border-b hover:bg-[var(--fi-bg3)]" style={{ borderColor:'var(--fi-border)' }}>
                <td className="font-mono-fi px-2 py-1" style={{ fontSize:9, color:'var(--fi-t2)' }}>{t.time}</td>
                <td className="font-mono-fi px-2 py-1" style={{ fontSize:9, color:'var(--fi-cyan)' }}>{t.bond}</td>
                <td className="font-mono-fi px-2 py-1">
                  <span className="font-bold" style={{ fontSize:9, color: t.side==='B' ? 'var(--fi-green)':'var(--fi-red)' }}>
                    {t.side==='B' ? 'BUY':'SELL'}
                  </span>
                </td>
                <td className="font-mono-fi px-2 py-1" style={{ fontSize:9, color:'var(--fi-t1)' }}>{t.size}</td>
                <td className="font-mono-fi px-2 py-1" style={{ fontSize:9, color: t.side==='B' ? 'var(--fi-blue)':'var(--fi-red)' }}>{t.price.toFixed(3)}</td>
                <td className="font-mono-fi px-2 py-1" style={{ fontSize:9, color:'var(--fi-t1)' }}>{t.ytm.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Rate Sensitivity ── */
export function RateSensitivity() {
  const max = 100;
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b flex-shrink-0" style={{ borderColor:'var(--fi-border)' }}>
        {['Rate Sensitivity','Scenario'].map((t,i) => (
          <button key={t} className="font-mono-fi px-3 py-1.5 border-b-2 text-xs uppercase tracking-wider"
            style={{ fontSize:9, color: i===0 ? 'var(--fi-blue)':'var(--fi-t2)', borderBottomColor: i===0 ? 'var(--fi-blue)':'transparent', background:'transparent' }}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {SENSITIVITY.map(s => (
          <div key={s.label} className="flex items-center gap-2 px-3 py-1">
            <span className="font-mono-fi w-12 flex-shrink-0" style={{ fontSize:9, color:'var(--fi-t1)' }}>{s.label}</span>
            <div className="flex-1 h-1.5 rounded-sm overflow-hidden" style={{ background:'var(--fi-bg3)' }}>
              <div className="h-full rounded-sm" style={{ width:`${s.pct}%`, background: s.positive ? 'var(--fi-green)':'var(--fi-red)', opacity:.75 }} />
            </div>
            <span className="font-mono-fi w-16 text-right flex-shrink-0" style={{ fontSize:9, color: s.positive ? 'var(--fi-green)':'var(--fi-red)' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
