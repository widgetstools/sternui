import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts';
import { YC_CHART_DATA } from '@/data/tradingData';
import { cn } from '@/lib/utils';

const CURVE_MODES = ['Par', 'Spot', 'Fwd'];
const OVERLAYS = ['Today', '-1W', '-1M'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="font-mono-fi rounded-sm border px-2 py-1.5" style={{ background:'var(--fi-bg3)', borderColor:'var(--fi-border2)', fontSize:9 }}>
      <div className="font-semibold mb-1" style={{ color:'var(--fi-t1)' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {Number(p.value).toFixed(2)}%
        </div>
      ))}
    </div>
  );
};

export function YieldCurveChart() {
  const [curveMode, setCurveMode] = useState('Par');
  const [overlay, setOverlay] = useState('Today');

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-8 border-b flex-shrink-0" style={{ background:'var(--fi-bg1)', borderColor:'var(--fi-border)' }}>
        <span className="font-mono-fi font-semibold tracking-widest uppercase" style={{ fontSize:9, color:'var(--fi-t2)' }}>Treasury Yield Curve</span>
        <div className="flex items-center gap-1">
          {CURVE_MODES.map(m => (
            <button key={m} onClick={() => setCurveMode(m)}
              className="font-mono-fi px-2 py-0.5 rounded-sm border text-xs"
              style={{ fontSize:9, background: curveMode===m ? 'rgba(61,158,255,0.1)':'transparent', borderColor: curveMode===m ? 'var(--fi-blue)':'var(--fi-border2)', color: curveMode===m ? 'var(--fi-blue)':'var(--fi-t2)' }}>
              {m}
            </button>
          ))}
          <div style={{ width:1, height:12, background:'var(--fi-border2)', margin:'0 3px' }} />
          {OVERLAYS.map(o => (
            <button key={o} onClick={() => setOverlay(o)}
              className="font-mono-fi px-2 py-0.5 rounded-sm border text-xs"
              style={{ fontSize:9, background: overlay===o ? 'rgba(61,158,255,0.1)':'transparent', borderColor: overlay===o ? 'var(--fi-blue)':'var(--fi-border2)', color: overlay===o ? 'var(--fi-blue)':'var(--fi-t2)' }}>
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 pt-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 rounded" style={{ background:'var(--fi-blue)' }} />
          <span className="font-mono-fi" style={{ fontSize:9, color:'var(--fi-t2)' }}>Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="var(--fi-border3)" strokeWidth="1.5" strokeDasharray="3,3"/></svg>
          <span className="font-mono-fi" style={{ fontSize:9, color:'var(--fi-t2)' }}>-1 Week</span>
        </div>
      </div>

      <div className="flex-1 px-1 pb-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={YC_CHART_DATA} margin={{ top:8, right:8, bottom:0, left:8 }}>
            <defs>
              <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3d9eff" stopOpacity={0.12}/>
                <stop offset="95%" stopColor="#3d9eff" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--fi-border)" vertical={false} />
            <XAxis dataKey="tenor" tick={{ fill:'var(--fi-t3)', fontSize:8, fontFamily:'JetBrains Mono,monospace' }} axisLine={false} tickLine={false} />
            <YAxis
              domain={['auto','auto']}
              tick={{ fill:'var(--fi-t3)', fontSize:8, fontFamily:'JetBrains Mono,monospace' }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `${v.toFixed(2)}`}
              width={36}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone" dataKey="today" name="Today"
              stroke="var(--fi-blue)" strokeWidth={1.8}
              fill="url(#blueGrad)" dot={{ fill:'var(--fi-blue)', r:2.5, strokeWidth:0 }}
              activeDot={{ r:4, fill:'var(--fi-blue)' }}
            />
            {(overlay === '-1W' || overlay === 'Today') && (
              <Line
                type="monotone" dataKey="week" name="-1 Week"
                stroke="var(--fi-border3,#2e3855)" strokeWidth={1.2} strokeDasharray="4 4"
                dot={false} activeDot={{ r:3 }}
              />
            )}
            {overlay === '-1M' && (
              <Line
                type="monotone" dataKey="month" name="-1 Month"
                stroke="#4a5275" strokeWidth={1.2} strokeDasharray="4 4"
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
