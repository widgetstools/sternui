import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { ColDef, GridApi, GridReadyEvent, ICellRendererParams } from 'ag-grid-community';
import { fiGridTheme } from '@/lib/agGridTheme';
import { MARKET_INDICES, YC_CHART_DATA } from '@/data/tradingData';
import { ChangeValueRenderer, YtdValueRenderer } from '@/lib/cell-renderers';

ModuleRegistry.registerModules([AllEnterpriseModule]);

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
  {time:'10:00',event:'ISM Services PMI',actual:'—',prev:'53.5',exp:'53.2',impact:'Med'},
  {time:'14:00',event:'FOMC Minutes',actual:'—',prev:'—',exp:'—',impact:'High'},
  {time:'Tmrw',event:'Non-Farm Payrolls',actual:'—',prev:'275K',exp:'240K',impact:'High'},
];
const impactColor=(i:string)=>i==='High'?'var(--bn-red)':i==='Med'?'var(--bn-amber)':'var(--bn-green)';

type MarketIndex = typeof MARKET_INDICES[0];

export function MarketIndices() {
  const gridApiRef = useRef<GridApi<MarketIndex>|null>(null);
  const [rowData,setRowData]=useState<MarketIndex[]>(()=>MARKET_INDICES.map(idx=>({...idx})));

  useEffect(()=>{
    const id=setInterval(()=>{
      setRowData(prev=>{
        const updates:MarketIndex[]=[];
        const next=prev.map(idx=>{
          if(Math.random()<0.3){
            const delta=(Math.random()-.5)*0.08;
            const updated={...idx,val:+(idx.val+delta).toFixed(2),chg:+(idx.chg+delta).toFixed(2)};
            updates.push(updated);
            return updated;
          }
          return idx;
        });
        if(gridApiRef.current&&updates.length) gridApiRef.current.applyTransactionAsync({update:updates});
        return next;
      });
    },1800);
    return()=>clearInterval(id);
  },[]);

  const getRowId = useCallback((p:{data:MarketIndex})=>p.data.name,[]);

  const colDefs = useMemo<ColDef<MarketIndex>[]>(()=>[
    {field:'name', headerName:'INDEX', flex:1},
    {field:'val',  headerName:'LAST',  width:90, type:'numericColumn', valueFormatter:p=>p.value?.toFixed(2)},
    {field:'chg',  headerName:'CHG',   width:80, type:'numericColumn', cellRenderer:ChangeValueRenderer},
    {field:'ytd',  headerName:'YTD',   width:80, type:'numericColumn', cellRenderer:YtdValueRenderer},
  ],[]);

  const defaultColDef = useMemo<ColDef>(()=>({
    suppressMovable:true,
    cellStyle:{fontFamily:'JetBrains Mono,monospace',fontSize:11},
  }),[]);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--bn-bg1)',overflow:'hidden'}}>
      <div style={{flex:1,overflow:'hidden'}}>
        <AgGridReact<MarketIndex>
          theme={fiGridTheme}
          rowData={rowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          headerHeight={28}
          rowHeight={26}
          domLayout='autoHeight'
          onGridReady={(e:GridReadyEvent)=>{gridApiRef.current=e.api;}}
        />
      </div>
    </div>
  );
}

export function EconomicCalendar() {
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--bn-bg1)',overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
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
  );
}

export function IntradayChart() {
  const [selected,setSelected]=useState('UST 10Y');
  const series=INTRADAY[selected]||INTRADAY['UST 10Y'];
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--bn-bg1)',overflow:'hidden'}}>
      {/* Instrument selector toolbar (no title — dock header has it) */}
      <div style={{display:'flex',justifyContent:'flex-end',padding:'4px 10px',flexShrink:0}}>
        {Object.keys(INTRADAY).map(k=>(
          <button key={k} onClick={()=>setSelected(k)} style={{fontSize:9,padding:'2px 8px',marginLeft:3,borderRadius:2,border:BD,background:selected===k?'var(--bn-border)':'transparent',color:selected===k?'var(--bn-t0)':'var(--bn-t1)',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{k}</button>
        ))}
      </div>
      <div style={{flex:1}}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{top:4,right:16,bottom:8,left:8}}>
            <defs><linearGradient id="ig" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6ba4e8" stopOpacity={0.15}/><stop offset="95%" stopColor="#6ba4e8" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
            <XAxis dataKey="t" tick={{fill:'var(--bn-t2)',fontSize:8,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} interval={15}/>
            <YAxis domain={['auto','auto']} tick={{fill:'var(--bn-t2)',fontSize:8,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>v.toFixed(2)} width={38}/>
            <Tooltip content={<TT/>}/>
            <Area type="monotone" dataKey="v" name={selected} stroke="#6ba4e8" strokeWidth={1.8} fill="url(#ig)" dot={false} activeDot={{r:3}}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function YieldCurvePanel() {
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',background:'var(--bn-bg1)',overflow:'hidden'}}>
      <div style={{flex:1}}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={YC_CHART_DATA} margin={{top:12,right:16,bottom:8,left:8}}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--bn-bg2)" vertical={false}/>
            <XAxis dataKey="tenor" tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false}/>
            <YAxis domain={['auto','auto']} tick={{fill:'var(--bn-t2)',fontSize:9,fontFamily:'JetBrains Mono'}} axisLine={false} tickLine={false} tickFormatter={v=>v.toFixed(2)} width={36}/>
            <Tooltip content={<TT/>}/>
            <Line type="monotone" dataKey="today" name="Today" stroke="#6ba4e8" strokeWidth={2} dot={{r:2.5,fill:'#6ba4e8'}}/>
            <Line type="monotone" dataKey="week" name="-1 Week" stroke="var(--bn-border)" strokeWidth={1.2} strokeDasharray="4 4" dot={false}/>
            <Line type="monotone" dataKey="month" name="-1 Month" stroke="var(--bn-bg2)" strokeWidth={1} strokeDasharray="2 4" dot={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
