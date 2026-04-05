import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import type { Bond, RfqRequest, RfqQuote } from '@/data/tradingData';
import { BONDS, DEALERS } from '@/data/tradingData';
import { Badge } from '@/components/ui/badge';
import { X, CheckCircle, Clock, Zap, Search, Trash2 } from 'lucide-react';

const RFQ_TTL = 30; // seconds before quotes go stale

let rfqCounter = 1;

function makeQuote(bond: Bond, side: 'Buy' | 'Sell', dealer: string): RfqQuote {
  const spread = 0.04 + Math.random() * 0.08;
  const mid = (bond.bid + bond.ask) / 2;
  const bid = +(mid - spread / 2 + (Math.random() - 0.5) * 0.02).toFixed(3);
  const ask = +(mid + spread / 2 + (Math.random() - 0.5) * 0.02).toFixed(3);
  return { dealer, bid, ask, bidSize: `$${(Math.floor(Math.random()*8+2))}MM`, askSize: `$${(Math.floor(Math.random()*8+2))}MM`, ts: Date.now(), status: 'live' };
}

/* ── Countdown ring: depleting arc with seconds in center ── */
function CountdownRing({ createdAt, ttl = RFQ_TTL }: { createdAt: number; ttl?: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, ttl - (Date.now() - createdAt) / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, ttl - (Date.now() - createdAt) / 1000);
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [createdAt, ttl]);

  const pct = remaining / ttl;
  const R = 11;
  const C = 2 * Math.PI * R;
  const dash = pct * C;
  const color = remaining > 15 ? 'var(--fi-blue)' : remaining > 7 ? 'var(--fi-amber)' : 'var(--fi-red)';
  const secs = Math.ceil(remaining);

  return (
    <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
      <svg viewBox="0 0 28 28" width={28} height={28}>
        <circle cx="14" cy="14" r={R} fill="none" stroke="var(--fi-bg3)" strokeWidth="2.5" />
        <circle cx="14" cy="14" r={R} fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
          transform="rotate(-90 14 14)"
          style={{ transition: 'stroke-dasharray 0.15s linear, stroke 0.3s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, color,
      }}>
        {secs > 0 ? secs : '—'}
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  live:  { bg: 'rgba(61,158,255,0.1)',  color: 'var(--fi-blue)',  border: 'rgba(61,158,255,0.25)' },
  done:  { bg: 'rgba(45,212,191,0.12)', color: 'var(--fi-green)', border: 'rgba(45,212,191,0.25)' },
  stale: { bg: 'rgba(74,82,117,0.2)',   color: 'var(--fi-t2)',    border: 'rgba(74,82,117,0.25)' },
};

const thStyle: React.CSSProperties = {
  fontSize: 9, color: 'var(--fi-t1)', textTransform: 'uppercase', letterSpacing: '0.04em',
  fontWeight: 600, padding: '6px 8px', textAlign: 'left', whiteSpace: 'nowrap',
  background: 'var(--fi-bg2)', borderBottom: '1px solid var(--fi-border)',
};
const thStyleRight: React.CSSProperties = { ...thStyle, textAlign: 'right' };
const cellBase: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '6px 8px',
  borderBottom: '1px solid var(--fi-border)', whiteSpace: 'nowrap',
};

/* ── HTML table sub-component for RFQ quote ladder ── */
function RfqQuoteGrid({ quotes, bestBid, bestAsk, rfqId, rfqStatus, onHitLift }: {
  quotes: RfqQuote[]; bestBid: number; bestAsk: number; rfqId: string; rfqStatus: string;
  onHitLift: (rfqId: string, dealer: string, action: 'hit' | 'lift') => void;
}) {
  const sorted = useMemo(() => [...quotes].sort((a, b) => b.bid - a.bid), [quotes]);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thStyle}>DEALER</th>
          <th style={thStyleRight}>BID</th>
          <th style={thStyleRight}>BID SIZE</th>
          <th style={thStyleRight}>ASK</th>
          <th style={thStyleRight}>ASK SIZE</th>
          <th style={thStyleRight}>SPREAD</th>
          <th style={thStyle}>STATUS</th>
          <th style={thStyle}>ACTION</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(q => {
          const isStale = q.status === 'stale';
          const isDone = q.status === 'done';
          const rowOpacity = isStale || isDone ? 0.5 : 1;
          const isBestBid = q.bid === bestBid;
          const isBestAsk = q.ask === bestAsk;
          const spread = ((q.ask - q.bid) * 100).toFixed(1);
          const ss = STATUS_STYLES[q.status] || STATUS_STYLES['live'];
          return (
            <tr key={q.dealer} style={{ opacity: rowOpacity }}>
              <td style={{ ...cellBase, fontWeight: 700, color: 'var(--fi-cyan)' }}>{q.dealer}</td>
              <td style={{ ...cellBase, textAlign: 'right', fontWeight: isBestBid ? 700 : 400, color: isBestBid ? 'var(--fi-blue)' : '#5a7090' }}>
                {q.bid.toFixed(3)}
                {isBestBid && <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: 'var(--fi-blue)' }}>▲BEST</span>}
              </td>
              <td style={{ ...cellBase, textAlign: 'right', color: 'var(--fi-t1)' }}>{q.bidSize}</td>
              <td style={{ ...cellBase, textAlign: 'right', fontWeight: isBestAsk ? 700 : 400, color: isBestAsk ? 'var(--fi-red)' : '#7a4050' }}>
                {q.ask.toFixed(3)}
                {isBestAsk && <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, color: 'var(--fi-red)' }}>▼BEST</span>}
              </td>
              <td style={{ ...cellBase, textAlign: 'right', color: 'var(--fi-t1)' }}>{q.askSize}</td>
              <td style={{ ...cellBase, textAlign: 'right', color: 'var(--fi-amber)' }}>{spread}¢</td>
              <td style={cellBase}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, padding: '1px 6px', borderRadius: 2, background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                  {q.status.toUpperCase()}
                </span>
              </td>
              <td style={cellBase}>
                {isDone ? (
                  <CheckCircle size={14} style={{ color: 'var(--fi-green)' }} />
                ) : !isStale && rfqStatus !== 'done' ? (
                  <div className="flex gap-1.5">
                    <button onClick={() => onHitLift(rfqId, q.dealer, 'hit')}
                      className="font-mono-fi px-2.5 py-1 rounded-sm font-bold"
                      style={{ fontSize: 11, background: 'rgba(61,158,255,0.15)', color: 'var(--fi-blue)', border: '1px solid rgba(61,158,255,0.35)' }}>
                      HIT
                    </button>
                    <button onClick={() => onHitLift(rfqId, q.dealer, 'lift')}
                      className="font-mono-fi px-2.5 py-1 rounded-sm font-bold"
                      style={{ fontSize: 11, background: 'rgba(0,229,160,0.15)', color: 'var(--fi-green)', border: '1px solid rgba(0,229,160,0.35)' }}>
                      LIFT
                    </button>
                  </div>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface RfqPanelProps {
  selectedBond: Bond | null;
  requests: RfqRequest[];
  setRequests: React.Dispatch<React.SetStateAction<RfqRequest[]>>;
  onClose?: () => void;
}

export function RfqPanel({ selectedBond, requests, setRequests, onClose }: RfqPanelProps) {
  const [rfqSide, setRfqSide] = useState<'Buy' | 'Sell'>('Buy');
  const [rfqSize, setRfqSize] = useState('5');
  const [selected, setSelected] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Instrument search
  const [instrSearch, setInstrSearch] = useState('');
  const [instrOpen, setInstrOpen] = useState(false);
  const [localBond, setLocalBond] = useState<Bond | null>(selectedBond);
  const instrRef = useRef<HTMLDivElement>(null);

  // Sync from parent when blotter selection changes
  useEffect(() => {
    if (selectedBond) {
      setLocalBond(selectedBond);
      setInstrSearch('');
      setInstrOpen(false);
    }
  }, [selectedBond?.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (instrRef.current && !instrRef.current.contains(e.target as Node)) setInstrOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const instrResults = instrSearch.length > 0
    ? BONDS.filter(b => {
        const q = instrSearch.toLowerCase();
        return b.ticker.toLowerCase().includes(q)
          || b.issuer.toLowerCase().includes(q)
          || b.cusip.toLowerCase().includes(q)
          || `${b.cpn}`.includes(q)
          || b.mat.includes(q);
      }).slice(0, 8)
    : [];

  const pickBond = (b: Bond) => { setLocalBond(b); setInstrSearch(''); setInstrOpen(false); };

  // Use localBond for RFQ (user can override the blotter selection)
  const activeBond = localBond || selectedBond;

  // Simulate quote arrivals after RFQ is sent
  useEffect(() => {
    const ids = setInterval(() => {
      setRequests(prev => prev.map(r => {
        if (r.status !== 'pending') return r;
        const elapsed = Date.now() - r.createdAt;
        if (elapsed < 800) return r;
        // Add new quotes over time
        if (r.quotes.length < 6 && Math.random() < 0.6) {
          const remaining = DEALERS.filter(d => !r.quotes.find(q => q.dealer === d));
          if (remaining.length === 0) return { ...r, status: 'quoted' };
          const dealer = remaining[Math.floor(Math.random() * remaining.length)];
          const bond = activeBond || { bid: 100, ask: 100.25 } as Bond;
          const quote = makeQuote(bond, r.side, dealer);
          return { ...r, quotes: [...r.quotes, quote], status: r.quotes.length >= 4 ? 'quoted' : 'pending' };
        }
        if (r.quotes.length >= 4) return { ...r, status: 'quoted' };
        return r;
      }));
    }, 600);
    return () => clearInterval(ids);
  }, [activeBond]);

  // Stale quotes + auto-expire RFQs at TTL
  useEffect(() => {
    const id = setInterval(() => {
      setRequests(prev => prev.map(r => {
        const elapsed = (Date.now() - r.createdAt) / 1000;
        // Auto-cancel expired RFQs
        if ((r.status === 'pending' || r.status === 'quoted') && elapsed >= RFQ_TTL) {
          return { ...r, status: 'cancelled', quotes: r.quotes.map(q => ({ ...q, status: 'stale' as const })) };
        }
        return {
          ...r,
          quotes: r.quotes.map(q => ({
            ...q,
            status: q.status === 'live' && (Date.now() - q.ts) > RFQ_TTL * 1000 ? 'stale' : q.status,
          })),
        };
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const sendRfq = useCallback(() => {
    if (!activeBond) return;
    const id = `RFQ-${String(rfqCounter++).padStart(4, '0')}`;
    const newReq: RfqRequest = {
      id, bond: `${activeBond.ticker} ${activeBond.cpn} ${activeBond.mat}`,
      size: `$${rfqSize}MM`, side: rfqSide, status: 'pending',
      quotes: [], createdAt: Date.now(),
    };
    setRequests(prev => [newReq, ...prev]);
    setActiveId(id);
  }, [activeBond, rfqSide, rfqSize, setRequests]);

  const [executedTrade, setExecutedTrade] = useState<{rfqId:string; dealer:string; action:'hit'|'lift'; price:number; side:string; size:string; bond:string} | null>(null);

  const hitLift = useCallback((rfqId: string, dealer: string, action: 'hit' | 'lift') => {
    const req = requests.find(r => r.id === rfqId);
    if (!req) return;
    const quote = req.quotes.find(q => q.dealer === dealer);
    if (!quote) return;

    const execPrice = action === 'hit' ? quote.bid : quote.ask;
    const execSide = action === 'hit' ? 'Sold' : 'Bought';
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;

    // Mark done — keep only the executed dealer's quote, drop the rest
    setRequests(prev => prev.map(r => {
      if (r.id !== rfqId) return r;
      return {
        ...r, status: 'done',
        quotes: r.quotes
          .filter(q => q.dealer === dealer)
          .map(q => ({ ...q, status: 'done' as const })),
      };
    }));

    const trade = { rfqId, dealer, action, price: execPrice, side: execSide, size: req.size, bond: req.bond };
    setExecutedTrade(trade);

    toast.success(`${execSide} ${req.size} ${req.bond} @ ${execPrice.toFixed(3)}`, {
      description: `${action === 'hit' ? 'Hit bid' : 'Lifted offer'} · ${dealer} · ${timeStr}`,
      duration: 5000,
    });

    // After showing the fill confirmation, reset the workbench for the next RFQ
    // Instrument stays selected — traders often do multiple trades on the same bond
    setTimeout(() => {
      setExecutedTrade(null);
      setActiveId('');
      setRfqSize('5');
    }, 3000);
  }, [requests, setRequests]);

  const cancelRfq = useCallback((rfqId: string) => {
    setRequests(prev => prev.map(r => r.id === rfqId ? { ...r, status: 'cancelled' } : r));
  }, [setRequests]);

  const removeRfq = useCallback((rfqId: string) => {
    setRequests(prev => prev.filter(r => r.id !== rfqId));
    if (activeId === rfqId) setActiveId(null);
  }, [setRequests, activeId]);

  const clearHistory = useCallback(() => {
    setRequests(prev => prev.filter(r => r.status === 'pending' || r.status === 'quoted'));
    setActiveId(null);
  }, [setRequests]);

  const activeReq = requests.find(r => r.id === activeId) || requests[0] || null;
  const bestBid = activeReq ? Math.max(...activeReq.quotes.map(q => q.bid)) : 0;
  const bestAsk = activeReq ? Math.min(...activeReq.quotes.map(q => q.ask)) : 9999;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--fi-bg1)' }}>
      {/* Live count + close button toolbar */}
      <div className="flex items-center justify-end px-3 h-8 border-b flex-shrink-0" style={{ borderColor: 'var(--fi-border)' }}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono-fi" style={{ fontSize: 9, background: 'rgba(61,158,255,0.08)', color: 'var(--fi-blue)', borderColor: 'rgba(61,158,255,0.2)' }}>
            {requests.filter(r => r.status === 'pending' || r.status === 'quoted').length} live
          </Badge>
          {onClose && <button onClick={onClose} style={{ color: 'var(--fi-t2)' }}><X size={14} /></button>}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-px" style={{ background: 'var(--fi-border)' }}>
        {/* Left: RFQ ticket */}
        <div className="flex flex-col flex-shrink-0" style={{ width: 220, minWidth: 180, background: 'var(--fi-bg2)' }}>
          <div className="flex items-center px-3 h-7 border-b" style={{ borderColor: 'var(--fi-border)', background: 'rgba(61,158,255,0.06)' }}>
            <Zap size={10} style={{ color: 'var(--fi-blue)', marginRight: 6 }} />
            <span className="col-hdr" style={{ color: 'var(--fi-blue)' }}>New RFQ</span>
          </div>
          <div className="flex flex-col gap-2 p-3">
            {/* Instrument search */}
            <div ref={instrRef} style={{position:'relative'}}>
              <div className="col-hdr mb-1">Instrument</div>
              {/* Selected bond display / search input */}
              {activeBond && !instrOpen ? (
                <div className="font-mono-fi px-2 py-1.5 rounded-sm border cursor-pointer flex items-center justify-between"
                  onClick={() => { setInstrOpen(true); setInstrSearch(''); }}
                  style={{ fontSize:11, background: 'rgba(0,188,212,0.06)', borderColor: 'rgba(0,188,212,0.25)', color: 'var(--fi-cyan)' }}>
                  <span style={{ fontWeight: 700 }}>{activeBond.ticker} {activeBond.cpn} {activeBond.mat}</span>
                  <Search size={10} style={{color:'var(--fi-t2)',flexShrink:0}}/>
                </div>
              ) : (
                <div className="relative">
                  <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2" style={{color:'var(--fi-t2)'}}/>
                  <input
                    autoFocus
                    value={instrSearch}
                    onChange={e => { setInstrSearch(e.target.value); setInstrOpen(true); }}
                    onFocus={() => setInstrOpen(true)}
                    placeholder="CUSIP, ticker, issuer…"
                    className="font-mono-fi w-full pl-7 pr-2 py-1.5 rounded-sm border"
                    style={{ fontSize:11, background: 'var(--fi-bg3)', borderColor: 'var(--fi-blue)', color: 'var(--fi-t0)', outline:'none' }}
                  />
                </div>
              )}
              {/* Dropdown results */}
              {instrOpen && instrResults.length > 0 && (
                <div className="absolute left-0 right-0 z-50 rounded-sm border overflow-hidden"
                  style={{top:'100%',marginTop:2,background:'var(--fi-bg2)',borderColor:'var(--fi-border2)',maxHeight:200,overflowY:'auto'}}>
                  {instrResults.map(b => (
                    <div key={b.id} onClick={() => pickBond(b)}
                      className="flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors"
                      style={{borderBottom:'1px solid var(--fi-border)',fontSize:9,fontFamily:'JetBrains Mono,monospace'}}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--fi-bg3)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <div>
                        <span style={{color:'var(--fi-cyan)',fontWeight:700}}>{b.ticker}</span>
                        <span style={{color:'var(--fi-t1)',marginLeft:4}}>{b.cpn} {b.mat}</span>
                      </div>
                      <span style={{color:'var(--fi-t2)'}}>{b.cusip}</span>
                    </div>
                  ))}
                </div>
              )}
              {instrOpen && instrSearch.length > 0 && instrResults.length === 0 && (
                <div className="absolute left-0 right-0 z-50 rounded-sm border px-2 py-2 font-mono-fi"
                  style={{top:'100%',marginTop:2,background:'var(--fi-bg2)',borderColor:'var(--fi-border2)',fontSize:9,color:'var(--fi-t2)'}}>
                  No matches
                </div>
              )}
            </div>
            {activeBond && !instrOpen && (
              <div className="grid grid-cols-2 gap-1 text-right">
                <div className="font-mono-fi px-2 py-1.5 rounded-sm" style={{ fontSize: 10, fontWeight: 600, background: 'rgba(61,158,255,0.08)', color: 'var(--fi-blue)', border: '1px solid rgba(61,158,255,0.15)' }}>
                  <span style={{ fontSize: 8, color: 'var(--fi-t2)', display: 'block', marginBottom: 1 }}>BID</span>{activeBond.bid.toFixed(3)}
                </div>
                <div className="font-mono-fi px-2 py-1.5 rounded-sm" style={{ fontSize: 10, fontWeight: 600, background: 'rgba(255,61,94,0.08)', color: 'var(--fi-red)', border: '1px solid rgba(255,61,94,0.15)' }}>
                  <span style={{ fontSize: 8, color: 'var(--fi-t2)', display: 'block', marginBottom: 1 }}>ASK</span>{activeBond.ask.toFixed(3)}
                </div>
              </div>
            )}
            {/* Side */}
            <div>
              <div className="col-hdr mb-1">Side</div>
              <div className="grid grid-cols-2 gap-1">
                {(['Buy','Sell'] as const).map(s => (
                  <button key={s} onClick={() => setRfqSide(s)}
                    className="font-mono-fi py-1.5 rounded-sm border font-bold tracking-wider"
                    style={{ fontSize:11, background: rfqSide === s ? (s === 'Buy' ? 'rgba(0,229,160,0.15)' : 'rgba(255,61,94,0.15)') : 'transparent', borderColor: rfqSide === s ? (s === 'Buy' ? 'rgba(0,229,160,0.4)' : 'rgba(255,61,94,0.4)') : 'var(--fi-border2)', color: rfqSide === s ? (s === 'Buy' ? 'var(--fi-green)' : 'var(--fi-red)') : 'var(--fi-t2)' }}>
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {/* Size */}
            <div>
              <div className="col-hdr mb-1">Size (MM)</div>
              <div className="grid grid-cols-4 gap-1 mb-1">
                {['2','5','10','15'].map(v => (
                  <button key={v} onClick={() => setRfqSize(v)} className="font-mono-fi py-1 rounded-sm border"
                    style={{ fontSize: 9, background: rfqSize === v ? 'rgba(61,158,255,0.12)' : 'var(--fi-bg3)', borderColor: rfqSize === v ? 'var(--fi-blue)' : 'var(--fi-border2)', color: rfqSize === v ? 'var(--fi-blue)' : 'var(--fi-t1)' }}>
                    {v}
                  </button>
                ))}
              </div>
              <input type="number" value={rfqSize} onChange={e => setRfqSize(e.target.value)}
                className="font-mono-fi w-full px-2 py-1.5 rounded-sm border"
                style={{ fontSize:11, background: 'var(--fi-bg3)', borderColor: 'var(--fi-border2)', color: 'var(--fi-t0)', outline: 'none' }} />
            </div>
            {/* Dealers */}
            <div>
              <div className="col-hdr mb-1">Dealers (all)</div>
              <div className="flex flex-wrap gap-1">
                {DEALERS.map(d => (
                  <span key={d} className="font-mono-fi px-1.5 py-0.5 rounded-sm" style={{ fontSize:9, background: 'rgba(61,158,255,0.08)', color: 'var(--fi-blue)', border: '1px solid rgba(61,158,255,0.2)' }}>{d}</span>
                ))}
              </div>
            </div>
            {/* Send */}
            <button onClick={sendRfq} disabled={!activeBond}
              className="w-full py-2 rounded-sm font-mono-fi font-bold tracking-widest flex items-center justify-center gap-1.5 mt-1"
              style={{ fontSize: 11, background: activeBond ? 'var(--fi-blue)' : 'var(--fi-bg3)', color: activeBond ? 'var(--bn-cta-text)' : 'var(--fi-t3)', cursor: activeBond ? 'pointer' : 'not-allowed' }}>
              <Zap size={12} /> SEND RFQ
            </button>
          </div>

          {/* RFQ history list */}
          <div className="border-t flex-1 overflow-y-auto" style={{ borderColor: 'var(--fi-border)' }}>
            <div className="flex items-center justify-between px-3 h-7 border-b" style={{ borderColor: 'var(--fi-border)' }}>
              <span className="col-hdr">RFQ History</span>
              {requests.some(r => r.status === 'done' || r.status === 'cancelled') && (
                <button onClick={clearHistory} className="font-mono-fi flex items-center gap-1"
                  style={{ fontSize: 8, color: 'var(--fi-t3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--fi-red)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--fi-t3)')}>
                  <Trash2 size={9} /> CLEAR
                </button>
              )}
            </div>
            {requests.map(r => (
              <div key={r.id} onClick={() => setActiveId(r.id)}
                className="group px-3 py-2 border-b cursor-pointer relative"
                style={{ borderColor: 'var(--fi-border)', background: activeId === r.id ? 'var(--fi-bg3)' : 'transparent' }}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-fi font-bold" style={{ fontSize: 9, color: 'var(--fi-cyan)' }}>{r.id}</span>
                    <span className="font-mono-fi" style={{ fontSize: 9, color: r.side === 'Buy' ? 'var(--fi-green)' : 'var(--fi-red)', fontWeight: 600 }}>{r.side.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono-fi px-1.5 py-0 rounded-sm" style={{ fontSize:9, background: r.status === 'pending' ? 'rgba(61,158,255,0.1)' : r.status === 'quoted' ? 'rgba(245,166,35,0.1)' : r.status === 'done' ? 'rgba(0,229,160,0.1)' : 'rgba(255,61,94,0.1)', color: r.status === 'pending' ? 'var(--fi-blue)' : r.status === 'quoted' ? 'var(--fi-amber)' : r.status === 'done' ? 'var(--fi-green)' : 'var(--fi-red)', border: `1px solid ${r.status === 'pending' ? 'rgba(61,158,255,0.25)' : r.status === 'quoted' ? 'rgba(245,166,35,0.25)' : r.status === 'done' ? 'rgba(0,229,160,0.25)' : 'rgba(255,61,94,0.25)'}` }}>
                      {r.status.toUpperCase()}
                    </span>
                    {(r.status === 'done' || r.status === 'cancelled') && (
                      <button onClick={e => { e.stopPropagation(); removeRfq(r.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--fi-t3)', lineHeight: 0 }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--fi-red)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--fi-t3)')}>
                        <X size={11} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="font-mono-fi" style={{ fontSize: 9, color: 'var(--fi-t1)' }}>{r.bond}</div>
                <div className="flex items-center justify-between">
                  <span className="font-mono-fi" style={{ fontSize:9, color: 'var(--fi-t2)' }}>{r.size} · {r.quotes.length} quotes</span>
                  {(r.status === 'pending' || r.status === 'quoted') && <CountdownRing createdAt={r.createdAt} ttl={RFQ_TTL} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Quote ladder for selected RFQ */}
        <div className="flex flex-col flex-1 overflow-hidden" style={{ background: 'var(--fi-bg1)' }}>
          {activeReq ? (
            <>
              <div className="flex items-center justify-between px-3 h-8 border-b flex-shrink-0" style={{ borderColor: 'var(--fi-border)' }}>
                <div className="flex items-center gap-3">
                  <span className="ph-title">{activeReq.id}</span>
                  <span className="font-mono-fi font-bold" style={{ fontSize: 11, color: 'var(--fi-cyan)' }}>{activeReq.bond}</span>
                  <span className="font-mono-fi" style={{ fontSize:11, color: activeReq.side === 'Buy' ? 'var(--fi-green)' : 'var(--fi-red)', fontWeight: 700 }}>{activeReq.side.toUpperCase()}</span>
                  <span className="font-mono-fi" style={{ fontSize:11, color: 'var(--fi-t1)' }}>{activeReq.size}</span>
                </div>
                {(activeReq.status === 'pending' || activeReq.status === 'quoted') && (
                  <div className="flex items-center gap-2">
                    <CountdownRing createdAt={activeReq.createdAt} />
                    {activeReq.status === 'pending' && (
                      <span className="font-mono-fi" style={{ fontSize: 9, color: 'var(--fi-amber)' }}>Awaiting quotes…</span>
                    )}
                    <button onClick={() => cancelRfq(activeReq.id)} className="font-mono-fi px-2 py-0.5 rounded-sm border" style={{ fontSize: 9, background: 'rgba(255,61,94,0.08)', borderColor: 'rgba(255,61,94,0.3)', color: 'var(--fi-red)' }}>Cancel</button>
                  </div>
                )}
              </div>

              {/* Best quote banner */}
              {activeReq.quotes.length > 0 && activeReq.status !== 'done' && (
                <div className="flex items-center gap-6 px-4 py-2 border-b flex-shrink-0" style={{ background: 'var(--fi-bg2)', borderColor: 'var(--fi-border)' }}>
                  <div>
                    <div className="col-hdr mb-0.5">Best Bid</div>
                    <div className="font-mono-fi font-bold" style={{ fontSize:13, color: 'var(--fi-blue)' }}>{bestBid.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="col-hdr mb-0.5">Best Ask</div>
                    <div className="font-mono-fi font-bold" style={{ fontSize:13, color: 'var(--fi-red)' }}>{bestAsk.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="col-hdr mb-0.5">Spread</div>
                    <div className="font-mono-fi font-bold" style={{ fontSize:13, color: 'var(--fi-amber)' }}>{((bestAsk - bestBid) * 100).toFixed(1)}¢</div>
                  </div>
                  <div>
                    <div className="col-hdr mb-0.5">Quotes</div>
                    <div className="font-mono-fi font-bold" style={{ fontSize:13, color: 'var(--fi-green)' }}>{activeReq.quotes.length}</div>
                  </div>
                </div>
              )}

              {/* Quote table */}
              <div className="flex-1 overflow-hidden">
                {activeReq.quotes.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="font-mono-fi mb-2" style={{ fontSize: 24, color: 'var(--fi-border2)' }}>⋯</div>
                      <div className="font-mono-fi" style={{ fontSize:11, color: 'var(--fi-t3)' }}>Quotes incoming from dealers…</div>
                    </div>
                  </div>
                ) : (
                  <RfqQuoteGrid
                    quotes={activeReq.quotes}
                    bestBid={bestBid}
                    bestAsk={bestAsk}
                    rfqId={activeReq.id}
                    rfqStatus={activeReq.status}
                    onHitLift={hitLift}
                  />
                )}
              </div>

              {activeReq.status === 'done' && executedTrade && executedTrade.rfqId === activeReq.id && (
                <div className="flex items-center gap-3 px-4 py-2.5 border-t flex-shrink-0" style={{ borderColor: 'var(--fi-border)', background: 'rgba(45,212,191,0.06)' }}>
                  <CheckCircle size={14} style={{ color: 'var(--fi-green)' }} />
                  <div>
                    <span className="font-mono-fi font-bold" style={{ fontSize:11, color: 'var(--fi-green)' }}>
                      {executedTrade.side} {executedTrade.size} @ {executedTrade.price.toFixed(3)}
                    </span>
                    <span className="font-mono-fi" style={{ fontSize:9, color: 'var(--fi-t1)', marginLeft: 8 }}>
                      {executedTrade.action === 'hit' ? 'Hit bid' : 'Lifted offer'} · {executedTrade.dealer}
                    </span>
                  </div>
                </div>
              )}
              {activeReq.status === 'done' && (!executedTrade || executedTrade.rfqId !== activeReq.id) && (
                <div className="flex items-center gap-3 px-4 py-2 border-t flex-shrink-0" style={{ borderColor: 'var(--fi-border)', background: 'rgba(45,212,191,0.05)' }}>
                  <CheckCircle size={14} style={{ color: 'var(--fi-green)' }} />
                  <span className="font-mono-fi font-bold" style={{ fontSize:11, color: 'var(--fi-green)' }}>RFQ COMPLETE</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="font-mono-fi" style={{ fontSize: 32, color: 'var(--fi-border2)' }}>⟳</div>
              <div className="font-mono-fi" style={{ fontSize: 11, color: 'var(--fi-t3)' }}>Select a bond from the blotter, then send an RFQ</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
