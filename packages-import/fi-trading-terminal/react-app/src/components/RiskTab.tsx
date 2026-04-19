import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { RISK_POSITIONS, BONDS } from '@/data/tradingData';

const BD = '1px solid var(--bn-border)';

// Gradient low→high: soft blue → cyan → copper → deeper copper → coral → brick.
// Hex literals (not CSS vars) because usage concatenates alpha: `color + '1a'`.
const HEAT_COLORS = ['#6ba4e8','#7db4e3','#c97b3f','#a85f26','#e56464','#d04f4f'];
const heatLevel = (oas:number) => oas<20?0:oas<50?1:oas<100?2:oas<150?3:oas<250?4:5;
const DV01_DATA = RISK_POSITIONS.map(p=>({name:p.book,dv01:p.dv01,pnl:p.pnl}));
const SCENARIO_DATA = [
  {scenario:'-100bp',credit:+284,rates:+742,total:+1026},
  {scenario:'-50bp', credit:+142,rates:+371,total:+513},
  {scenario:'-25bp', credit:+71, rates:+185,total:+256},
  {scenario:'Base',  credit:0,   rates:0,   total:0},
  {scenario:'+25bp', credit:-70, rates:-183,total:-253},
  {scenario:'+50bp', credit:-138,rates:-364,total:-502},
  {scenario:'+100bp',credit:-272,rates:-720,total:-992},
];
const VAR_DATA = Array.from({length:30},(_,i)=>({day:`D-${30-i}`,var:-(Math.random()*180+120).toFixed(0)*1}));

const TT = (props:any) => {
  if(!props.active||!props.payload?.length) return null;
  return <div style={{background:'var(--bn-bg2)',border:BD,borderRadius:3,padding:'6px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11}}>
    <div style={{color:'var(--bn-t1)',marginBottom:3}}>{props.label}</div>
    {props.payload.map((p:any,i:number)=><div key={i} style={{color:p.color||'var(--bn-t0)'}}>{p.name}: {p.value}</div>)}
  </div>;
};

export function RiskTab() {
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'var(--bn-bg)'}}>
      {/* KPI strip */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',borderBottom:BD,flexShrink:0}}>
        {[
          {label:'Portfolio DV01',val:'$18,420',sub:'per bp',         color:'var(--bn-blue)'},
          {label:'Total MV',      val:'$54.2M', sub:'MTD +$1.4M',    color:'var(--bn-blue)'},
          {label:'VaR 95% 1D',    val:'-$248K', sub:'within limit',  color:'var(--bn-amber)'},
          {label:'OAS Duration',  val:'4.82 yrs',sub:'mod duration', color:'var(--bn-cyan)'},
          {label:'Spread PnL MTD',val:'+$142K', sub:'vs bench +38K', color:'var(--bn-green)'},
          {label:'Credit Delta',  val:'$8,240', sub:'IG/HY blended', color:'var(--bn-purple)'},
        ].map((k,i)=>(
          <div key={k.label} style={{background:'var(--bn-bg1)',padding:'10px 14px',borderRight:i<5?BD:'none'}}>
            <div style={{fontSize:11,color:'var(--bn-t1)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em'}}>{k.label}</div>
            <div style={{fontSize:18,fontWeight:600,color:k.color,fontFamily:'JetBrains Mono,monospace'}}>{k.val}</div>
            <div style={{fontSize:9,color:'var(--bn-t2)',marginTop:2,fontFamily:'JetBrains Mono,monospace'}}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{flex:1,overflow:'hidden',display:'flex'}}>
        {/* Book risk table */}
        <div style={{width:320,flexShrink:0,background:'var(--bn-bg1)',borderRight:BD,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>Book Risk Summary</div>
          <div style={{flex:1,overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--bn-bg2)',position:'sticky',top:0}}>
                  {['BOOK','MV','DV01','OAS','P&L'].map(h=>(
                    <th key={h} style={{fontSize:11,color:'var(--bn-t1)',padding:'5px 10px',borderBottom:BD,textAlign:h==='BOOK'?'left':'right',fontWeight:400,letterSpacing:'0.04em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RISK_POSITIONS.map(p=>(
                  <tr key={p.book} style={{borderBottom:'1px solid rgba(43,49,57,0.5)',cursor:'pointer'}}>
                    <td style={{padding:'6px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'var(--bn-cyan)'}}>{p.book}</td>
                    <td style={{padding:'6px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'var(--bn-t0)',textAlign:'right'}}>{p.mv}</td>
                    <td style={{padding:'6px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'var(--bn-blue)',textAlign:'right'}}>{p.dv01.toLocaleString()}</td>
                    <td style={{padding:'6px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:p.oas>100?'var(--bn-amber)':'var(--bn-green)',textAlign:'right'}}>{p.oas>0?`+${p.oas}`:p.oas}</td>
                    <td style={{padding:'6px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:p.pnl>=0?'var(--bn-green)':'var(--bn-red)',textAlign:'right'}}>{p.pnl>=0?'+':''}{p.pnl}K</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* OAS heatmap */}
          <div style={{borderTop:BD}}>
            <div style={{padding:'5px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>OAS Heatmap</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,padding:8}}>
              {BONDS.slice(0,16).map(b=>{
                const lvl=heatLevel(b.oas);
                return (
                  <div key={b.id} style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',borderRadius:3,padding:'5px 2px',background:HEAT_COLORS[lvl]+'1a',border:`1px solid ${HEAT_COLORS[lvl]}30`}}>
                    <div style={{fontSize:9,fontWeight:700,color:HEAT_COLORS[lvl],fontFamily:'JetBrains Mono,monospace'}}>{b.ticker}</div>
                    <div style={{fontSize:9,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace'}}>{b.oas>0?`+${b.oas}`:b.oas}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{flex:1,display:'flex',borderBottom:BD}}>
            {/* DV01 chart */}
            <div style={{flex:1,background:'var(--bn-bg1)',borderRight:BD,display:'flex',flexDirection:'column'}}>
              <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>DV01 by Book</div>
              <div style={{flex:1}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={DV01_DATA} margin={{top:12,right:16,bottom:8,left:8}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
                    <XAxis dataKey="name" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>`$${(v/1000).toFixed(0)}K`}/>
                    <Tooltip content={<TT/>}/>
                    <Bar dataKey="dv01" name="DV01" radius={[2,2,0,0]}>
                      {DV01_DATA.map((_,i)=><Cell key={i} fill={['#6ba4e8','#e56464','#6ba4e8','#7db4e3','#a48ad4'][i%5]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Scenario chart */}
            <div style={{flex:1,background:'var(--bn-bg1)',display:'flex',flexDirection:'column'}}>
              <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>Rate Scenario P&L ($K)</div>
              <div style={{flex:1}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={SCENARIO_DATA} margin={{top:12,right:16,bottom:8,left:8}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
                    <XAxis dataKey="scenario" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<TT/>}/>
                    <Bar dataKey="total" name="Total P&L" radius={[2,2,0,0]}>
                      {SCENARIO_DATA.map((d,i)=><Cell key={i} fill={d.total>=0?'#6ba4e8':'#e56464'}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          {/* VaR chart */}
          <div style={{flex:0,flexBasis:180,background:'var(--bn-bg1)',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>VaR Trend 30D</div>
            <div style={{flex:1}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={VAR_DATA} margin={{top:8,right:16,bottom:4,left:8}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
                  <XAxis dataKey="day" tick={false} axisLine={false}/>
                  <YAxis tick={{fill:'var(--bn-t2)',fontSize:8,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>`$${Math.abs(v)}K`}/>
                  <Tooltip content={<TT/>}/>
                  <Line type="monotone" dataKey="var" name="VaR 95%" stroke="#c97b3f" strokeWidth={1.5} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Risk limits */}
        <div style={{width:280,flexShrink:0,background:'var(--bn-bg1)',borderLeft:BD,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>Risk Limits</div>
          <div style={{flex:1,overflowY:'auto'}}>
            {[
              {label:'DV01 Limit',    used:18420,limit:25000,unit:'$'},
              {label:'VaR 95% 1D',   used:248,  limit:500,  unit:'$K'},
              {label:'IG OAS Dur',   used:4.82, limit:6.0,  unit:'yr'},
              {label:'HY Exposure',  used:7.2,  limit:15.0, unit:'$M'},
              {label:'Single Issuer',used:10.2, limit:20.0, unit:'$M'},
            ].map(l=>{
              const pct=(l.used/l.limit)*100;
              const color=pct>85?'var(--bn-red)':pct>65?'var(--bn-amber)':'var(--bn-green)';
              return (
                <div key={l.label} style={{padding:'10px 14px',borderBottom:'1px solid rgba(43,49,57,0.5)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                    <span style={{fontSize:11,color:'var(--bn-t1)',fontFamily:'JetBrains Mono,monospace'}}>{l.label}</span>
                    <span style={{fontSize:11,color,fontFamily:'JetBrains Mono,monospace'}}>{pct.toFixed(0)}%</span>
                  </div>
                  <div style={{height:5,borderRadius:2,background:'var(--bn-bg2)',overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:2}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                    <span style={{fontSize:9,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace'}}>{l.unit}{l.used.toLocaleString()}</span>
                    <span style={{fontSize:9,color:'#3d4555',fontFamily:'JetBrains Mono,monospace'}}>/ {l.unit}{l.limit.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
