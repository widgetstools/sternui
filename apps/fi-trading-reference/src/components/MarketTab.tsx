import { useState, useEffect } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { MARKET_INDICES, YC_CHART_DATA } from '@/data/tradingData';

const BD = '1px solid var(--bn-border)';
const TT = (props:any) => {
  if(!props.active||!props.payload?.length) return null;
  return <div style={{background:'var(--bn-bg2)',border:BD,borderRadius:3,padding:'6px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11}}>
    <div style={{color:'var(--bn-t1)',marginBottom:3}}>{props.label}</div>
    {props.payload.map((p:any,i:number)=><div key={i} style={{color:p.color||'var(--bn-t0)'}}>{p.name}: {Number(p.value).toFixed(2)}</div>)}
  </div>;
};

function makeIntraday(base:number,n=80){
  let v=base;return Array.from({length:n},(_,i)=>({t:`${9+Math.floor(i*6.5/n)}:${String(Math.floor((i*6.5/n%1)*60)).padStart(2,'0')}`,v:+(v+=(Math.random()-.5)*0.08,v).toFixed(3)}));
}
const INTRADAY:Record<string,any[]>={'UST 10Y':makeIntraday(4.27),'CDX IG':makeIntraday(52.9),'CDX HY':makeIntraday(339.6),'SOFR':makeIntraday(5.33)};

const ECON_EVENTS=[
  {time:'08:30',event:'Initial Jobless Claims',actual:'212K',prev:'215K',exp:'214K',impact:'Low'},
  {time:'10:00',event:'ISM Services PMI',      actual:'—',   prev:'53.5', exp:'53.2',impact:'Med'},
  {time:'14:00',event:'FOMC Minutes',          actual:'—',   prev:'—',    exp:'—',   impact:'High'},
  {time:'Tmrw', event:'Non-Farm Payrolls',     actual:'—',   prev:'275K', exp:'240K',impact:'High'},
];
const impactColor=(i:string)=>i==='High'?'var(--bn-red)':i==='Med'?'var(--bn-amber)':'var(--bn-green)';

export function MarketTab() {
  const [selected,setSelected]=useState('UST 10Y');
  const [indices,setIndices]=useState(MARKET_INDICES);
  const [blinkMap,setBlinkMap]=useState<Record<string,boolean>>({});

  useEffect(()=>{
    const id=setInterval(()=>{
      setIndices(prev=>prev.map(idx=>{
        if(Math.random()<0.3){
          const delta=(Math.random()-.5)*0.08;
          setBlinkMap(b=>({...b,[idx.name]:delta>0}));
          setTimeout(()=>setBlinkMap(b=>{const n={...b};delete n[idx.name];return n;}),600);
          return{...idx,val:+(idx.val+delta).toFixed(2),chg:+(idx.chg+delta).toFixed(2)};
        }
        return idx;
      }));
    },1800);
    return()=>clearInterval(id);
  },[]);

  const series=INTRADAY[selected]||INTRADAY['UST 10Y'];

  return (
    <div style={{display:'flex',height:'100%',overflow:'hidden',background:'var(--bn-bg)'}}>
      {/* Left */}
      <div style={{width:380,flexShrink:0,background:'var(--bn-bg1)',borderRight:BD,display:'flex',flexDirection:'column'}}>
        <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>Market Indices</div>
        <div style={{flex:1,overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'var(--bn-bg2)',position:'sticky',top:0}}>
                {['INDEX','LAST','CHG','YTD'].map(h=>(
                  <th key={h} style={{fontSize:11,color:'var(--bn-t1)',padding:'5px 10px',borderBottom:BD,textAlign:h==='INDEX'?'left':'right',fontWeight:400,letterSpacing:'0.04em'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indices.map(idx=>{
                const up=idx.chg>=0;
                return (
                  <tr key={idx.name} style={{borderBottom:'1px solid rgba(43,49,57,0.5)',cursor:'pointer'}} onClick={()=>setSelected(idx.name)}>
                    <td style={{padding:'6px 10px',fontSize:11,color:selected===idx.name?'var(--bn-blue)':'var(--bn-t0)',fontFamily:'JetBrains Mono,monospace'}}>{idx.name}</td>
                    <td style={{padding:'6px 10px',fontSize:11,fontFamily:'JetBrains Mono,monospace',color:'var(--bn-t0)',textAlign:'right'}}>{idx.val.toFixed(2)}</td>
                    <td style={{padding:'6px 10px',fontSize:11,fontFamily:'JetBrains Mono,monospace',color:up?'var(--bn-green)':'var(--bn-red)',textAlign:'right'}}>{up?'+':''}{idx.chg.toFixed(2)}</td>
                    <td style={{padding:'6px 10px',fontSize:11,fontFamily:'JetBrains Mono,monospace',color:idx.ytd.startsWith('+')?'var(--bn-green)':'var(--bn-red)',textAlign:'right'}}>{idx.ytd}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{borderTop:BD,flexShrink:0}}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>Economic Calendar</div>
          {ECON_EVENTS.map((e,i)=>(
            <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'7px 14px',borderBottom:'1px solid rgba(43,49,57,0.5)'}}>
              <span style={{fontSize:9,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace',flexShrink:0,width:36}}>{e.time}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:'var(--bn-t0)',fontFamily:'JetBrains Mono,monospace'}}>{e.event}</div>
                <div style={{display:'flex',gap:8,marginTop:2}}>
                  {[['Act',e.actual,'var(--bn-green)'],['Exp',e.exp,'var(--bn-t1)'],['Prev',e.prev,'var(--bn-t1)']].map(([l,v,c])=>(
                    <span key={l as string} style={{fontSize:9,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace'}}>{l}: <span style={{color:c as string}}>{v}</span></span>
                  ))}
                </div>
              </div>
              <span style={{fontSize:9,fontFamily:'JetBrains Mono,monospace',padding:'1px 5px',borderRadius:2,background:impactColor(e.impact)+'20',color:impactColor(e.impact),border:`1px solid ${impactColor(e.impact)}40`,flexShrink:0}}>{e.impact}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right charts */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {/* Intraday */}
        <div style={{flex:1.2,background:'var(--bn-bg1)',borderBottom:BD,display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 14px',borderBottom:BD}}>
            <span style={{fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>{selected} — Intraday</span>
            <div style={{display:'flex',gap:4}}>
              {Object.keys(INTRADAY).map(k=>(
                <button key={k} onClick={()=>setSelected(k)} style={{fontSize:9,padding:'2px 8px',borderRadius:2,border:BD,background:selected===k?'var(--bn-border)':'transparent',color:selected===k?'var(--bn-t0)':'var(--bn-t1)',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{k}</button>
              ))}
            </div>
          </div>
          <div style={{flex:1}}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{top:12,right:16,bottom:8,left:8}}>
                <defs>
                  <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
                <XAxis dataKey="t" tick={{fill:'var(--bn-t2)',fontSize:8,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} interval={15}/>
                <YAxis domain={['auto','auto']} tick={{fill:'var(--bn-t2)',fontSize:8,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>v.toFixed(2)} width={38}/>
                <Tooltip content={<TT/>}/>
                <Area type="monotone" dataKey="v" name={selected} stroke="#3b82f6" strokeWidth={1.8} fill="url(#ig)" dot={false} activeDot={{r:3}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Yield curve */}
        <div style={{flex:1,background:'var(--bn-bg1)',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>UST Par Yield Curve — Multi-Period</div>
          <div style={{flex:1}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={YC_CHART_DATA} margin={{top:12,right:16,bottom:8,left:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
                <XAxis dataKey="tenor" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false}/>
                <YAxis domain={['auto','auto']} tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>v.toFixed(2)} width={36}/>
                <Tooltip content={<TT/>}/>
                <Line type="monotone" dataKey="today" name="Today"   stroke="#3b82f6" strokeWidth={2} dot={{r:2.5,fill:'#3b82f6'}}/>
                <Line type="monotone" dataKey="week"  name="-1 Week" stroke="var(--bn-border)" strokeWidth={1.2} strokeDasharray="4 4" dot={false}/>
                <Line type="monotone" dataKey="month" name="-1 Month"stroke="var(--bn-bg2)" strokeWidth={1} strokeDasharray="2 4" dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
