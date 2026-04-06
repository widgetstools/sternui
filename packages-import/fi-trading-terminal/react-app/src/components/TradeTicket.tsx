import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { Bond } from '@/data/tradingData';

interface TradeTicketProps { bond: Bond; onSendRfq: () => void; clickedPrice?: number; }

type OrderType = 'Limit' | 'Market' | 'Stop-Limit';

export function TradeTicket({ bond, clickedPrice }: TradeTicketProps) {
  const [side, setSide] = useState<'BUY'|'SELL'>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('Limit');
  const [price, setPrice] = useState(bond.bid.toFixed(3));
  const [stopPrice, setStopPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [pct, setPct] = useState(0);
  const [tif, setTif] = useState<'GTC'|'IOC'|'FOK'|'DAY'>('GTC');
  const [submitting, setSubmitting] = useState(false);

  // Sync price when bond changes or user clicks a price in order book
  useEffect(() => {
    setPrice(side === 'BUY' ? bond.bid.toFixed(3) : bond.ask.toFixed(3));
  }, [bond.id, side]);

  useEffect(() => {
    if (clickedPrice !== undefined) setPrice(clickedPrice.toFixed(3));
  }, [clickedPrice]);

  const mid = (bond.bid + bond.ask) / 2;
  const total = amount && +price ? (+amount * +price).toFixed(2) : '';

  const handlePct = (p: number) => {
    setPct(p);
    if (+price > 0) setAmount((mid * p / 100 / +price).toFixed(5));
  };

  const canSubmit = +amount > 0 && (orderType === 'Market' || +price > 0) && (orderType !== 'Stop-Limit' || +stopPrice > 0);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    setSubmitting(true);
    // Simulate order submission
    setTimeout(() => {
      setSubmitting(false);
      const orderId = `o${Date.now()}`;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      toast.success(`Order ${side === 'BUY' ? 'Buy' : 'Sell'} ${amount}MM ${bond.ticker} ${bond.cpn} ${bond.mat}`, {
        description: `${orderType} @ ${orderType === 'Market' ? 'MKT' : price} · ${tif} · ID: ${orderId.slice(-6)} · ${timeStr}`,
        duration: 4000,
      });
      // Reset form
      setAmount('');
      setPct(0);
    }, 600);
  }, [canSubmit, side, amount, bond, orderType, price, tif]);

  return (
    <div className="flex flex-col h-full" style={{background:'var(--bn-bg1)'}}>
      {/* Security header */}
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0" style={{borderColor:'var(--bn-border)', background:'rgba(0,188,212,0.04)'}}>
        <span className="font-mono-fi font-bold" style={{fontSize:12,color:'var(--bn-cyan)'}}>{bond.ticker} {bond.cpn} {bond.mat}</span>
        <span className="font-mono-fi font-semibold" style={{fontSize:11,color:'var(--bn-t0)'}}>{mid.toFixed(3)}</span>
      </div>
      {/* Bid / Ask strip */}
      <div className="grid grid-cols-2 gap-px flex-shrink-0" style={{background:'var(--bn-border)'}}>
        <div className="font-mono-fi text-center py-1.5" style={{fontSize:10,fontWeight:600,background:'var(--tt-bid-strip)',color:'var(--bn-blue)'}}>
          <span style={{fontSize:8,color:'var(--bn-t2)',display:'block'}}>BID</span>{bond.bid.toFixed(3)}
        </div>
        <div className="font-mono-fi text-center py-1.5" style={{fontSize:10,fontWeight:600,background:'var(--tt-ask-strip)',color:'var(--bn-red)'}}>
          <span style={{fontSize:8,color:'var(--bn-t2)',display:'block'}}>ASK</span>{bond.ask.toFixed(3)}
        </div>
      </div>

      {/* Buy / Sell toggle */}
      <div className="grid grid-cols-2 border-b flex-shrink-0" style={{borderColor:'var(--bn-border)'}}>
        <button onClick={() => setSide('BUY')}
          className="py-2 text-xs font-bold tracking-wider transition-colors"
          style={{color: side==='BUY'?'var(--bn-green)':'var(--bn-t2)', background: side==='BUY'?'rgba(14,203,129,0.08)':'transparent', borderBottom: side==='BUY'?'2px solid var(--bn-green)':'2px solid transparent'}}>
          BUY
        </button>
        <button onClick={() => setSide('SELL')}
          className="py-2 text-xs font-bold tracking-wider transition-colors"
          style={{color: side==='SELL'?'var(--bn-red)':'var(--bn-t2)', background: side==='SELL'?'rgba(246,70,93,0.08)':'transparent', borderBottom: side==='SELL'?'2px solid var(--bn-red)':'2px solid transparent'}}>
          SELL
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2.5 flex flex-col gap-2">
        {/* Order type tabs */}
        <div className="flex gap-3 mb-1">
          {(['Limit','Market','Stop-Limit'] as const).map(t => (
            <button key={t} onClick={() => setOrderType(t)}
              className="order-type-tab"
              style={{fontSize:11,color: orderType===t ? 'var(--bn-yellow)':'var(--bn-t2)', borderBottomColor: orderType===t ? 'var(--bn-yellow)':'transparent'}}>
              {t}
            </button>
          ))}
        </div>

        {/* Stop price — only for Stop-Limit */}
        {orderType === 'Stop-Limit' && (
          <div>
            <label style={{fontSize:9,color:'var(--bn-t2)',display:'block',marginBottom:2}}>Stop Price</label>
            <div className="relative">
              <input className="price-input pr-14" placeholder="Trigger at…" value={stopPrice} onChange={e => setStopPrice(e.target.value)}/>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{color:'var(--bn-t2)'}}>USD</span>
            </div>
          </div>
        )}

        {/* Limit price — hidden for Market orders */}
        {orderType !== 'Market' ? (
          <div>
            <label style={{fontSize:9,color:'var(--bn-t2)',display:'block',marginBottom:2}}>
              {orderType === 'Stop-Limit' ? 'Limit Price' : 'Price'}
            </label>
            <div className="relative">
              <input className="price-input pr-14" placeholder="Price" value={price} onChange={e => setPrice(e.target.value)}/>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{color:'var(--bn-t2)'}}>USD</span>
            </div>
          </div>
        ) : (
          <div style={{padding:'6px 10px',borderRadius:3,background:'var(--bn-bg2)',fontSize:11,color:'var(--bn-t1)',fontFamily:'JetBrains Mono,monospace'}}>
            Market · Best available price
          </div>
        )}

        {/* Amount */}
        <div>
          <label style={{fontSize:9,color:'var(--bn-t2)',display:'block',marginBottom:2}}>Notional</label>
          <div className="relative">
            <input className="price-input pr-14" placeholder="Face amount" value={amount} onChange={e => setAmount(e.target.value)}/>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{color:'var(--bn-t2)'}}>MM</span>
          </div>
        </div>

        {/* Percentage quick-fill */}
        <div className="flex gap-1">
          {[25,50,75,100].map(p => (
            <button key={p} onClick={() => handlePct(p)}
              className="flex-1 py-1 rounded text-xs font-medium border transition-colors"
              style={{background: pct===p ? 'var(--bn-bg3)':'transparent', borderColor:'var(--bn-border2)', color: pct===p ? (side==='BUY'?'var(--bn-green)':'var(--bn-red)'):'var(--bn-t2)'}}>
              {p}%
            </button>
          ))}
        </div>

        {/* Time in Force */}
        <div>
          <label style={{fontSize:9,color:'var(--bn-t2)',display:'block',marginBottom:2}}>Time in Force</label>
          <div className="flex gap-1">
            {(['GTC','IOC','FOK','DAY'] as const).map(t => (
              <button key={t} onClick={() => setTif(t)}
                className="flex-1 py-1 rounded text-xs font-medium border transition-colors font-mono-fi"
                style={{fontSize:9,background: tif===t ? 'var(--bn-bg3)':'transparent', borderColor:'var(--bn-border2)', color: tif===t ? 'var(--bn-t0)':'var(--bn-t2)'}}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Total (read-only) */}
        {orderType !== 'Market' && total && (
          <div className="flex justify-between font-mono-fi" style={{fontSize:11,color:'var(--bn-t1)',padding:'4px 0'}}>
            <span>Est. Total</span>
            <span style={{color:'var(--bn-t0)'}}>${Number(total).toLocaleString()} USD</span>
          </div>
        )}

        {/* Order summary */}
        <div style={{padding:'6px 8px',borderRadius:3,background:'var(--bn-bg2)',fontSize:9,color:'var(--bn-t2)',fontFamily:'JetBrains Mono,monospace',lineHeight:1.6, borderLeft:`3px solid ${side === 'BUY' ? 'var(--bn-green)' : 'var(--bn-red)'}`}}>
          <span style={{color: side === 'BUY' ? 'var(--bn-green)' : 'var(--bn-red)', fontWeight: 700}}>{side}</span> {amount || '—'}MM {bond.ticker} {bond.cpn} {bond.mat}<br/>
          {orderType}{orderType !== 'Market' ? ` @ ${price}` : ''}{orderType === 'Stop-Limit' ? ` stop ${stopPrice || '—'}` : ''} · {tif}
        </div>
      </div>

      {/* Submit CTA */}
      <div className="px-3 pb-3 flex-shrink-0">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className={side==='BUY' ? 'btn-buy' : 'btn-sell'}
          style={{opacity: canSubmit && !submitting ? 1 : 0.4, cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed', fontSize:11}}>
          {submitting ? 'Submitting…' : side === 'BUY' ? `Buy ${bond.ticker}` : `Sell ${bond.ticker}`}
        </button>
      </div>
    </div>
  );
}
