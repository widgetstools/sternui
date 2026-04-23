import { useState, useEffect } from 'react';
import { INITIAL_ORDERS } from '@/data/tradingData';

const BD = '1px solid var(--bn-border)';
type Order = typeof INITIAL_ORDERS[0];

const statusBadge=(s:string)=>{
  const m:Record<string,{bg:string,color:string,border:string}>={
    Filled:   {bg:'rgba(45,212,191,0.1)', color:'var(--bn-green)',border:'rgba(45,212,191,0.3)'},
    Partial:  {bg:'var(--bn-warning-soft)',color:'var(--bn-amber)',border:'var(--bn-warning-ring)'},
    Pending:  {bg:'var(--bn-info-soft)',   color:'var(--bn-blue)', border:'var(--bn-info-ring)'},
    Cancelled:{bg:'rgba(248,113,113,0.1)',  color:'var(--bn-red)', border:'rgba(248,113,113,0.3)'},
  };
  const st=m[s]||m.Pending;
  return <span style={{fontSize:9,padding:'1px 6px',borderRadius:2,background:st.bg,color:st.color,border:`1px solid ${st.border}`,fontFamily:'JetBrains Mono,monospace'}}>{s}</span>;
};

export function OrdersTab() {
  const [orders,setOrders]=useState<Order[]>(INITIAL_ORDERS);
  const [filter,setFilter]=useState('All');
  const [selected,setSelected]=useState<Order|null>(null);

  useEffect(()=>{
    const id=setInterval(()=>setOrders(prev=>prev.map(o=>o.status==='Partial'&&Math.random()<0.3?{...o,status:'Filled',filled:o.qty}:o)),5000);
    return()=>clearInterval(id);
  },[]);

  const FILTERS=['All','Filled','Partial','Pending','Cancelled'];
  const filtered=orders.filter(o=>filter==='All'||o.status===filter);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'var(--bn-bg)'}}>
      {/* KPI */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderBottom:BD,flexShrink:0}}>
        {[
          {label:'Orders Today',    val:String(orders.length),color:'var(--bn-blue)'},
          {label:'Filled',          val:String(orders.filter(o=>o.status==='Filled').length),color:'var(--bn-green)'},
          {label:'Pending/Partial', val:String(orders.filter(o=>o.status==='Pending'||o.status==='Partial').length),color:'var(--bn-amber)'},
          {label:'Total Notional',  val:'$67MM',color:'var(--bn-cyan)'},
        ].map((k,i)=>(
          <div key={k.label} style={{background:'var(--bn-bg1)',padding:'10px 14px',borderRight:i<3?BD:'none'}}>
            <div style={{fontSize:11,color:'var(--bn-t1)',marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em'}}>{k.label}</div>
            <div style={{fontSize:18,fontWeight:600,color:k.color,fontFamily:'JetBrains Mono,monospace'}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{flex:1,overflow:'hidden',display:'flex'}}>
        {/* Blotter */}
        <div style={{flex:1,background:'var(--bn-bg1)',borderRight:BD,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 14px',borderBottom:BD,flexShrink:0}}>
            <span style={{fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>Order Blotter</span>
            <div style={{display:'flex',gap:3}}>
              {FILTERS.map(f=>(
                <button key={f} onClick={()=>setFilter(f)} style={{fontSize:9,padding:'2px 8px',borderRadius:2,border:BD,background:filter===f?'var(--bn-border)':'transparent',color:filter===f?'var(--bn-t0)':'var(--bn-t1)',cursor:'pointer',fontFamily:'JetBrains Mono,monospace'}}>{f}</button>
              ))}
            </div>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'var(--bn-bg2)',position:'sticky',top:0,zIndex:1}}>
                  {['TIME','BOND','SIDE','TYPE','QTY','FILLED','PX','YTM','STATUS'].map(h=>(
                    <th key={h} style={{fontSize:11,color:'var(--bn-t1)',padding:'5px 10px',borderBottom:BD,textAlign:h==='BOND'||h==='TIME'?'left':'right',fontWeight:400,letterSpacing:'0.04em'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(o=>(
                  <tr key={o.id} onClick={()=>setSelected(o)} style={{borderBottom:'1px solid rgba(43,49,57,0.5)',cursor:'pointer',background:selected?.id===o.id?'var(--bn-bg2)':'transparent'}}>
                    <td style={{padding:'5px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'var(--bn-t2)'}}>{o.time}</td>
                    <td style={{padding:'5px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'var(--bn-cyan)'}}>{o.bond}</td>
                    <td style={{padding:'5px 10px'}}><span style={{fontSize:9,fontWeight:700,color:o.side==='Buy'?'var(--bn-green)':'var(--bn-red)',fontFamily:'JetBrains Mono,monospace'}}>{o.side.toUpperCase()}</span></td>
                    <td style={{padding:'5px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:9,color:'var(--bn-t1)',textAlign:'right'}}>{o.type}</td>
                    <td style={{padding:'5px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'var(--bn-t0)',textAlign:'right'}}>{o.qty}</td>
                    <td style={{padding:'5px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:o.filled===o.qty?'var(--bn-green)':'var(--bn-amber)',textAlign:'right'}}>{o.filled}</td>
                    <td style={{padding:'5px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'var(--bn-t0)',textAlign:'right'}}>{o.px>0?o.px.toFixed(3):'—'}</td>
                    <td style={{padding:'5px 10px',fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'var(--bn-t1)',textAlign:'right'}}>{o.ytm>0?o.ytm.toFixed(2)+'%':'—'}</td>
                    <td style={{padding:'5px 10px',textAlign:'right'}}>{statusBadge(o.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail */}
        <div style={{width:260,flexShrink:0,background:'var(--bn-bg1)',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'7px 14px',borderBottom:BD,fontSize:11,fontWeight:600,color:'var(--bn-t0)'}}>{selected?'Order Detail':'Select an Order'}</div>
          {selected?(
            <div style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:10}}>
              <div style={{padding:12,borderRadius:3,border:BD,background:'var(--bn-bg2)'}}>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontWeight:700,fontSize:11,color:'var(--bn-cyan)',marginBottom:5}}>{selected.bond}</div>
                {statusBadge(selected.status)}
              </div>
              {[['Order Type',selected.type],['Side',selected.side],['Quantity',selected.qty],['Filled',selected.filled],['Price',selected.px>0?selected.px.toFixed(3):'—'],['YTM',selected.ytm>0?selected.ytm.toFixed(2)+'%':'—'],['Time',selected.time],['Settlement','T+2']].map(([l,v])=>(
                <div key={l} style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingBottom:6,borderBottom:'1px solid rgba(43,49,57,0.5)'}}>
                  <span style={{fontSize:9,color:'var(--bn-t1)',fontFamily:'JetBrains Mono,monospace'}}>{l}</span>
                  <span style={{fontSize:11,color:l==='Side'?(v==='Buy'?'var(--bn-green)':'var(--bn-red)'):'var(--bn-t0)',fontFamily:'JetBrains Mono,monospace'}}>{v}</span>
                </div>
              ))}
              {(selected.status==='Pending'||selected.status==='Partial')&&(
                <button style={{width:'100%',padding:'7px',borderRadius:3,border:'1px solid rgba(248,113,113,0.3)',background:'rgba(248,113,113,0.1)',color:'var(--bn-red)',fontFamily:'JetBrains Mono,monospace',fontWeight:700,fontSize:11,cursor:'pointer',marginTop:4}}>CANCEL ORDER</button>
              )}
            </div>
          ):(
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{fontSize:11,color:'var(--bn-t3)',fontFamily:'JetBrains Mono,monospace'}}>Click a row to view detail</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
