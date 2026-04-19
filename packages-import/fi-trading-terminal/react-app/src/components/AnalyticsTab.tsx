import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, ScatterChart, Scatter, Cell, ReferenceLine } from 'recharts';
import { BONDS, OAS_DATA, YC_CHART_DATA } from '@/data/tradingData';

const BD = '1px solid var(--bn-border)';
const TT=(props:any)=>{
  if(!props.active||!props.payload?.length)return null;
  return <div style={{background:'var(--bn-bg2)',border:BD,borderRadius:3,padding:'6px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11}}>
    <div style={{color:'var(--bn-t1)',marginBottom:3}}>{props.label}</div>
    {props.payload.map((p:any,i:number)=><div key={i} style={{color:p.color||'var(--bn-t0)'}}>{p.name}: {p.value}</div>)}
  </div>;
};

const DURATION_BUCKETS=[{label:'0-1Y',count:3,dv01:305},{label:'1-3Y',count:4,dv01:1010},{label:'3-5Y',count:5,dv01:2180},{label:'5-7Y',count:3,dv01:1890},{label:'7-10Y',count:2,dv01:2040},{label:'10Y+',count:3,dv01:2995}];
const SCATTER_DATA=BONDS.map(b=>({name:b.ticker,x:b.dur,y:b.oas,dv01:b.dv01,rtg:b.rtgClass}));
// Rating gradient: aaa/aa blue → a green → bbb copper → hy red.
// Hex literals so recharts SVG fills render reliably.
const RTG_COLOR:Record<string,string>={aaa:'#6ba4e8',aa:'#7db4e3',a:'#3dbfa0',bbb:'#c97b3f',hy:'#e56464'};
const HIST_OAS=Array.from({length:60},(_,i)=>{const d=new Date(2026,3,4);d.setDate(d.getDate()-59+i);return{date:`${d.getMonth()+1}/${d.getDate()}`,ig:+(52+Math.sin(i/8)*8+(Math.random()-.5)*3).toFixed(1),hy:+(340+Math.sin(i/6)*25+(Math.random()-.5)*8).toFixed(1)};});
const SECTOR_ALLOC=[{sector:'Government',pct:27.3,mv:14.8},{sector:'Technology',pct:22.1,mv:12.0},{sector:'Financials',pct:21.7,mv:11.8},{sector:'Healthcare',pct:10.3,mv:5.6},{sector:'Consumer',pct:9.8,mv:5.3},{sector:'Telecom',pct:8.8,mv:4.7}];
const SECTOR_COLORS=['#6ba4e8','#7db4e3','#a48ad4','#3dbfa0','#c97b3f','#a85f26'];

const panel=(extra?:React.CSSProperties):React.CSSProperties=>({background:'var(--bn-bg1)',display:'flex',flexDirection:'column',overflow:'hidden',...extra});

export function AnalyticsTab() {
  const [oasPeriod,setOasPeriod]=useState('3M');
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'var(--bn-bg)'}}>
      <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gridTemplateRows:'1fr 1fr',overflow:'hidden'}}>

        {/* OAS vs Duration scatter */}
        <div style={{...panel(),borderRight:BD,borderBottom:BD}}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)',flexShrink:0}}>OAS vs Duration</div>
          <div style={{flex:1}}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{top:16,right:20,bottom:16,left:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)"/>
                <XAxis dataKey="x" name="Duration" type="number" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} label={{value:'Duration (yrs)',fill:'var(--bn-t2)',fontSize:9,position:'insideBottom',offset:-4}}/>
                <YAxis dataKey="y" name="OAS" type="number" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>`+${v}`}/>
                <Tooltip content={<TT/>} cursor={{strokeDasharray:'3 3',stroke:'var(--bn-border)'}}/>
                <Scatter data={SCATTER_DATA} shape={(props:any)=>{
                  const{cx,cy,payload}=props;
                  return<circle cx={cx} cy={cy} r={Math.min(5+payload.dv01/300,10)} fill={RTG_COLOR[payload.rtg]||'#888'} fillOpacity={0.75} stroke={RTG_COLOR[payload.rtg]} strokeWidth={1}/>;
                }}/>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:'flex',gap:10,padding:'4px 14px 8px',flexShrink:0}}>
            {Object.entries(RTG_COLOR).map(([r,c])=>(
              <div key={r} style={{display:'flex',alignItems:'center',gap:4}}>
                <div style={{width:7,height:7,borderRadius:'50%',background:c}}/>
                <span style={{fontSize:9,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace'}}>{r.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Duration buckets */}
        <div style={{...panel(),borderRight:BD,borderBottom:BD}}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)',flexShrink:0}}>Duration Buckets</div>
          <div style={{flex:1}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={DURATION_BUCKETS} margin={{top:16,right:16,bottom:8,left:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
                <XAxis dataKey="label" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false}/>
                <YAxis yAxisId="l" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false}/>
                <YAxis yAxisId="r" orientation="right" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}K`}/>
                <Tooltip content={<TT/>}/>
                <Bar yAxisId="l" dataKey="count" name="# Bonds" fill="#6ba4e8" fillOpacity={0.7} radius={[2,2,0,0]}/>
                <Bar yAxisId="r" dataKey="dv01" name="DV01" fill="#7db4e3" fillOpacity={0.5} radius={[2,2,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sector allocation */}
        <div style={{...panel(),borderBottom:BD}}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)',flexShrink:0}}>Sector Allocation</div>
          <div style={{flex:1,overflowY:'auto',padding:'8px 14px',display:'flex',flexDirection:'column',gap:8}}>
            {SECTOR_ALLOC.map((s,i)=>(
              <div key={s.sector}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:11,color:SECTOR_COLORS[i],fontFamily:'JetBrains Mono,monospace'}}>{s.sector}</span>
                  <span style={{fontSize:11,color:'var(--bn-t0)',fontFamily:'JetBrains Mono,monospace'}}>{s.pct}% · ${s.mv}M</span>
                </div>
                <div style={{height:5,borderRadius:2,background:'var(--bn-bg2)',overflow:'hidden'}}>
                  <div style={{height:'100%',width:`${s.pct*3.66}%`,background:SECTOR_COLORS[i],opacity:.8,borderRadius:2}}/>
                </div>
              </div>
            ))}
          </div>
          <div style={{borderTop:BD,padding:10,display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,flexShrink:0}}>
            {[{l:'IG %',v:'85.2%',c:'var(--bn-green)'},{l:'HY %',v:'14.8%',c:'var(--bn-amber)'},{l:'Avg Dur',v:'4.82yr',c:'var(--bn-blue)'},{l:'Avg YTM',v:'4.38%',c:'var(--bn-cyan)'}].map(s=>(
              <div key={s.l} style={{padding:'6px 8px',borderRadius:3,background:'var(--bn-bg2)'}}>
                <div style={{fontSize:9,color:'var(--bn-t1)',textTransform:'uppercase',letterSpacing:'0.04em'}}>{s.l}</div>
                <div style={{fontSize:13,fontWeight:600,color:s.c,fontFamily:'JetBrains Mono,monospace'}}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Historical OAS */}
        <div style={{...panel(),borderRight:BD}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 14px',borderBottom:BD,flexShrink:0}}>
            <span style={{fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>CDX IG vs HY — Historical</span>
            <div style={{display:'flex',gap:3}}>
              {['1M','3M','6M','1Y'].map(p=>(
                <button key={p} onClick={()=>setOasPeriod(p)} style={{fontSize:9,padding:'2px 6px',borderRadius:2,border:BD,background:oasPeriod===p?'var(--bn-border)':'transparent',color:oasPeriod===p?'var(--bn-t0)':'var(--bn-t1)',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{p}</button>
              ))}
            </div>
          </div>
          <div style={{flex:1}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={HIST_OAS} margin={{top:12,right:16,bottom:8,left:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
                <XAxis dataKey="date" tick={{fill:'var(--bn-t2)',fontSize:8,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} interval={14}/>
                <YAxis yAxisId="ig" tick={{fill:'var(--bn-t2)',fontSize:8,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} domain={['auto','auto']} width={32}/>
                <YAxis yAxisId="hy" orientation="right" tick={{fill:'var(--bn-t2)',fontSize:8,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} domain={['auto','auto']} width={38}/>
                <Tooltip content={<TT/>}/>
                <Line yAxisId="ig" type="monotone" dataKey="ig" name="CDX IG" stroke="#6ba4e8" strokeWidth={1.5} dot={false}/>
                <Line yAxisId="hy" type="monotone" dataKey="hy" name="CDX HY" stroke="#f6465d" strokeWidth={1.5} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* OAS distribution */}
        <div style={{...panel(),borderRight:BD}}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)',flexShrink:0}}>OAS Distribution</div>
          <div style={{flex:1}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={OAS_DATA} layout="vertical" margin={{top:8,right:52,bottom:8,left:72}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" horizontal={false}/>
                <XAxis type="number" tick={{fill:'var(--bn-t2)',fontSize:8,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>`+${v}bp`}/>
                <YAxis dataKey="name" type="category" tick={{fill:'var(--bn-t1)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} width={68}/>
                <Tooltip content={<TT/>} formatter={(v:any)=>[`+${v}bp`,'OAS']}/>
                <Bar dataKey="oas" name="OAS" radius={[0,2,2,0]}>
                  {OAS_DATA.map((d,i)=><Cell key={i} fill={d.color} fillOpacity={0.8}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* P&L Attribution */}
        <div style={panel()}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)',flexShrink:0}}>P&L Attribution — MTD</div>
          <div style={{flex:1}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{attr:'Carry',pnl:+188},{attr:'Spread Δ',pnl:+142},{attr:'Rate Δ',pnl:+88},{attr:'FX',pnl:-22},{attr:'Costs',pnl:-34},{attr:'Total',pnl:+362}]} margin={{top:12,right:16,bottom:8,left:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
                <XAxis dataKey="attr" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}K`}/>
                <Tooltip content={<TT/>} formatter={(v:any)=>[`$${v}K`,'P&L']}/>
                <ReferenceLine y={0} stroke="var(--bn-border)" strokeWidth={1}/>
                <Bar dataKey="pnl" name="P&L ($K)" radius={[2,2,0,0]}>
                  {[+188,+142,+88,-22,-34,+362].map((v,i)=><Cell key={i} fill={v>=0?'#6ba4e8':'var(--bn-red)'} fillOpacity={i===5?1:0.75}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
