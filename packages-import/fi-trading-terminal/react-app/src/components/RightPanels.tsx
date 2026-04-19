import { UST_LADDER, WATCHLIST, type Bond } from '@/data/tradingData';
import { AlertCircle } from 'lucide-react';

export function WatchlistPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b flex-shrink-0" style={{borderColor:'var(--fi-border)'}}>
        {['Watchlist','Axes','Alerts'].map((t,i)=>(
          <button key={t} className="inner-tab tab-label flex items-center gap-1" style={{color:i===0?'var(--fi-blue)':'var(--fi-t2)',borderBottomColor:i===0?'var(--fi-blue)':'transparent'}}>
            {t}{t==='Alerts'&&<span className="px-1 rounded-sm" style={{fontSize:9,background:'var(--bn-warning-soft)',color:'var(--fi-amber)',border:'1px solid var(--bn-warning-ring)'}}>3</span>}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {WATCHLIST.map((w,i)=>(
          <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b cursor-pointer hover:bg-[var(--fi-bg3)]" style={{borderColor:'var(--fi-border)'}}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:w.alert?'var(--fi-amber)':'transparent',border:w.alert?'none':'1px solid var(--fi-border2)'}}/>
            <span className="font-mono-fi flex-1 truncate" style={{fontSize:11,color:'var(--fi-cyan)'}}>{w.label}</span>
            <span className="font-mono-fi" style={{fontSize:11,color:'var(--fi-t0)'}}>{w.ytm.toFixed(2)}</span>
            <span className="font-mono-fi w-10 text-right" style={{fontSize:9,color:w.change>=0?'var(--fi-green)':'var(--fi-red)'}}>{w.change>=0?'+':''}{w.change.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BondLadderPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-8 border-b flex-shrink-0" style={{background:'var(--fi-bg1)',borderColor:'var(--fi-border)'}}>
        <div>
          <span className="ph-title">Bond Ladder</span>
          <span className="font-mono-fi ml-2" style={{fontSize:9,color:'var(--fi-t2)'}}>UST · Aaa · Gov</span>
        </div>
        <div className="flex gap-1">
          {['Par','YTM','DV01'].map((v,i)=>(
            <button key={v} className="pact" style={{background:i===0?'rgba(61,158,255,0.1)':'transparent',borderColor:i===0?'var(--fi-blue)':'var(--fi-border2)',color:i===0?'var(--fi-blue)':'var(--fi-t2)'}}>{v}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{background:'var(--fi-bg2)',position:'sticky',top:0,zIndex:1}}>
              {['CPN','MATURITY','BID','ASK','YTM','SPD','AMT','AXES'].map(h=>(
                <th key={h} className={`col-hdr px-2 py-1.5 border-b ${h==='CPN'||h==='MATURITY'?'text-left':'text-right'}`} style={{borderColor:'var(--fi-border)'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {UST_LADDER.map((r,i)=>(
              <tr key={i} className="border-b hover:bg-[var(--fi-bg3)] cursor-pointer" style={{borderColor:'var(--fi-border)'}}>
                <td className="font-mono-fi px-2 py-1 text-left" style={{fontSize:11}}>
                  <span className="inline-block h-1 rounded-sm mr-1 align-middle" style={{width:r.pct*0.32,background:'rgba(61,158,255,0.5)'}}/>
                  {r.cpn.toFixed(3)}%
                </td>
                <td className="font-mono-fi px-2 py-1 text-left" style={{fontSize:11,color:'var(--fi-t1)'}}>{r.maturity}</td>
                <td className="font-mono-fi px-2 py-1 text-right" style={{fontSize:11,color:'var(--fi-blue)'}}>{r.bid.toFixed(3)}</td>
                <td className="font-mono-fi px-2 py-1 text-right" style={{fontSize:11,color:'var(--fi-red)'}}>{r.ask.toFixed(3)}</td>
                <td className="font-mono-fi px-2 py-1 text-right" style={{fontSize:11}}>{r.ytm.toFixed(3)}</td>
                <td className="font-mono-fi px-2 py-1 text-right" style={{fontSize:11,color:'var(--fi-t2)'}}>+{r.spread}</td>
                <td className="font-mono-fi px-2 py-1 text-right" style={{fontSize:11,color:'var(--fi-t1)'}}>{r.amtOut}</td>
                <td className="font-mono-fi px-2 py-1 text-right" style={{fontSize:9,color:'var(--fi-t3)'}}>{r.axes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface OrderTicketProps { selectedBond: Bond|null; onSendRfq: ()=>void; }

export function OrderTicket({ selectedBond, onSendRfq }: OrderTicketProps) {
  return (
    <div className="flex flex-col" style={{borderTop:`1px solid var(--fi-border)`}}>
      <div className="flex items-center justify-between px-3 h-8 border-b" style={{background:'var(--fi-bg1)',borderColor:'var(--fi-border)'}}>
        <span className="ph-title">Order Ticket</span>
        {selectedBond && <span className="font-mono-fi" style={{fontSize:9,color:'var(--fi-cyan)'}}>{selectedBond.ticker} {selectedBond.cpn} {selectedBond.mat}</span>}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          <button className="font-mono-fi py-1.5 rounded-sm border font-bold tracking-widest" style={{fontSize:11,background:'rgba(0,229,160,0.1)',borderColor:'rgba(0,229,160,0.3)',color:'var(--fi-green)'}}>BUY</button>
          <button className="font-mono-fi py-1.5 rounded-sm border font-bold tracking-widest" style={{fontSize:11,background:'transparent',borderColor:'var(--fi-border2)',color:'var(--fi-t2)'}}>SELL</button>
        </div>
        {[
          {label:'Instrument',val:selectedBond?`${selectedBond.ticker} ${selectedBond.cpn}`:'—'},
          {label:'Price',     val:selectedBond?selectedBond.bid.toFixed(3):'—'},
          {label:'YTM',       val:selectedBond?selectedBond.ytm.toFixed(3)+'%':'—'},
          {label:'DV01/MM',   val:selectedBond?(selectedBond.dv01/1).toLocaleString():'—'},
        ].map(f=>(
          <div key={f.label} className="flex items-center justify-between border-b py-1" style={{borderColor:'var(--fi-border)'}}>
            <span className="font-mono-fi" style={{fontSize:9,color:'var(--fi-t2)'}}>{f.label}</span>
            <span className="font-mono-fi" style={{fontSize:9,color:f.val==='—'?'var(--fi-t3)':'var(--fi-t0)'}}>{f.val}</span>
          </div>
        ))}
        <button onClick={onSendRfq} className="font-mono-fi py-1.5 rounded-sm border mt-1 tracking-widest uppercase font-bold"
          style={{fontSize:11,background:selectedBond?'rgba(61,158,255,0.12)':'var(--fi-bg3)',borderColor:selectedBond?'rgba(61,158,255,0.35)':'var(--fi-border2)',color:selectedBond?'var(--fi-blue)':'var(--fi-t3)',cursor:selectedBond?'pointer':'not-allowed'}}>
          {selectedBond ? '⚡ SEND RFQ' : 'SELECT BOND'}
        </button>
      </div>
    </div>
  );
}
