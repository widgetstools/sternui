import { useState, useEffect, useMemo } from 'react';
import type { Bond } from '@/data/tradingData';
import { DEALERS } from '@/data/tradingData';

/* ── Types ── */
type QuoteType = 'STREAM' | 'RFQ' | 'IND';

interface Level {
  dealer: string;
  price: number;
  yield: number;
  face: number;
  dv01: number;
  quoteType: QuoteType;
  total: number;
  pct: number;
}

interface RecentTrade {
  side: 'BUY' | 'SELL';
  dealer: string;
  price: number;
  yield: number;
  face: number;
  time: string;
}

/* ── Helpers ── */
const QUOTE_TYPES: QuoteType[] = ['STREAM', 'RFQ', 'IND'];
const pickDealer = () => DEALERS[Math.floor(Math.random() * DEALERS.length)];
const pickQuoteType = (): QuoteType => {
  const r = Math.random();
  return r < 0.55 ? 'STREAM' : r < 0.85 ? 'RFQ' : 'IND';
};

function genLevels(mid: number, bondYtm: number, bondDv01: number, side: 'ask' | 'bid', n = 15): Level[] {
  const levels: Level[] = [];
  let cumFace = 0;
  for (let i = 0; i < n; i++) {
    const offset = side === 'ask' ? (i + 0.5) * 0.025 : -(i + 0.5) * 0.025;
    const price = +(mid + offset).toFixed(3);
    const yieldOffset = side === 'ask' ? -(i + 0.5) * 0.008 : (i + 0.5) * 0.008;
    const yld = +(bondYtm + yieldOffset).toFixed(3);
    const face = +(Math.random() * 4 + 0.5).toFixed(1);
    cumFace += face;
    const dv01 = +(face * bondDv01 * 0.01).toFixed(1);
    levels.push({
      dealer: pickDealer(),
      price,
      yield: yld,
      face,
      dv01,
      quoteType: pickQuoteType(),
      total: +cumFace.toFixed(1),
      pct: 0,
    });
  }
  const maxTotal = levels[levels.length - 1].total;
  return levels.map(l => ({ ...l, pct: (l.total / maxTotal) * 100 }));
}

/* ── Quote type badge ── */
const BADGE_STYLES: Record<QuoteType, { bg: string; color: string }> = {
  STREAM: { bg: 'rgba(14,203,129,0.12)', color: 'var(--bn-green)' },
  RFQ: { bg: 'rgba(30,144,255,0.12)', color: 'var(--bn-blue)' },
  IND: { bg: 'rgba(240,185,11,0.12)', color: 'var(--bn-yellow)' },
};

function QuoteBadge({ type }: { type: QuoteType }) {
  const s = BADGE_STYLES[type];
  return (
    <span
      className="font-mono-fi"
      style={{
        fontSize: 8,
        fontWeight: 600,
        padding: '1px 4px',
        borderRadius: 2,
        background: s.bg,
        color: s.color,
        letterSpacing: '0.03em',
      }}
    >
      {type}
    </span>
  );
}

/* ── Props ── */
interface OrderBookProps {
  bond: Bond;
  onClickPrice?: (p: number) => void;
}

/* ── Component ── */
export function OrderBook({ bond, onClickPrice }: OrderBookProps) {
  const mid = (bond.bid + bond.ask) / 2;
  const [asks, setAsks] = useState<Level[]>(() => genLevels(mid, bond.ytm, bond.dv01, 'ask').reverse());
  const [bids, setBids] = useState<Level[]>(() => genLevels(mid, bond.ytm, bond.dv01, 'bid'));
  const [view, setView] = useState<'both' | 'asks' | 'bids'>('both');
  const [trades, setTrades] = useState<RecentTrade[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      const newMid = mid + (Math.random() - 0.5) * 0.04;
      setAsks(genLevels(newMid, bond.ytm, bond.dv01, 'ask').reverse());
      setBids(genLevels(newMid, bond.ytm, bond.dv01, 'bid'));
      // Generate a trade
      const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
      const price = +(newMid + (side === 'BUY' ? 0.012 : -0.012)).toFixed(3);
      const yld = +(bond.ytm + (side === 'BUY' ? -0.005 : 0.005)).toFixed(3);
      const face = +(Math.random() * 3 + 0.5).toFixed(1);
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setTrades(prev => [{ side, dealer: pickDealer(), price, yield: yld, face, time }, ...prev.slice(0, 14)]);
    }, 1200);
    return () => clearInterval(id);
  }, [mid, bond.ytm, bond.dv01]);

  const spread = asks.length && bids.length ? +(asks[asks.length - 1].price - bids[0].price).toFixed(3) : 0;
  const spreadPct = +(spread / mid * 100).toFixed(4);
  const spreadColor = spread < 0 ? 'var(--bn-red)' : 'var(--bn-green)';
  const midYield = bond.ytm;

  // Aggregate DV01
  const bidDv01 = useMemo(() => bids.reduce((s, l) => s + l.dv01, 0).toFixed(1), [bids]);
  const askDv01 = useMemo(() => asks.reduce((s, l) => s + l.dv01, 0).toFixed(1), [asks]);
  const firmCount = useMemo(() => [...asks, ...bids].filter(l => l.quoteType === 'STREAM').length, [asks, bids]);
  const minSize = useMemo(() => {
    const all = [...asks, ...bids];
    return all.length ? Math.min(...all.map(l => l.face)).toFixed(1) : '0';
  }, [asks, bids]);

  const COL = 'grid ob-grid-cols px-2 py-[2px] cursor-pointer relative transition-colors';

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bn-bg1)' }}>
      {/* ── Instrument context bar ── */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--bn-border)', background: 'rgba(0,188,212,0.04)' }}
      >
        <span className="font-mono-fi font-bold" style={{ fontSize: 12, color: 'var(--bn-cyan)' }}>
          {bond.ticker} {bond.cpn} {bond.mat}
        </span>
        <span className="font-mono-fi" style={{ fontSize: 9, color: 'var(--bn-t2)' }}>
          {bond.issuer}
        </span>
        <span className="font-mono-fi" style={{ fontSize: 9, color: 'var(--bn-t2)' }}>
          CUSIP {bond.cusip}
        </span>
        <span className="font-mono-fi" style={{ fontSize: 9, color: 'var(--bn-t1)' }}>
          {bond.rtg}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono-fi" style={{ fontSize: 9 }}>
            <span style={{ color: 'var(--bn-t2)' }}>OAS </span>
            <span style={{ color: 'var(--bn-amber)', fontWeight: 600 }}>{bond.oas > 0 ? `+${bond.oas}` : bond.oas}</span>
          </span>
          <span className="font-mono-fi" style={{ fontSize: 9 }}>
            <span style={{ color: 'var(--bn-t2)' }}>DUR </span>
            <span style={{ color: '#1e90ff', fontWeight: 600 }}>{bond.dur}</span>
          </span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div
        className="flex items-center justify-between px-3 py-1 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--bn-border)' }}
      >
        <div className="flex items-center gap-1">
          {[
            { v: 'both', icon: '▀▄' },
            { v: 'bids', icon: '▄' },
            { v: 'asks', icon: '▀' },
          ].map(opt => (
            <button
              key={opt.v}
              onClick={() => setView(opt.v as any)}
              className="w-6 h-5 rounded text-xs"
              style={{
                background: view === opt.v ? 'var(--bn-bg3)' : 'transparent',
                color: opt.v === 'asks' ? 'var(--bn-red)' : opt.v === 'bids' ? 'var(--bn-green)' : 'var(--bn-t1)',
              }}
            >
              {opt.icon}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono-fi" style={{ fontSize: 9, color: 'var(--bn-t2)' }}>
            {asks.length + bids.length} levels
          </span>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--bn-green)',
              display: 'inline-block',
            }}
            className="live-dot"
          />
          <span className="font-mono-fi" style={{ fontSize: 8, color: 'var(--bn-green)' }}>LIVE</span>
        </div>
      </div>

      {/* ── Column headers ── */}
      <div
        className="ob-grid-cols px-2 py-1 flex-shrink-0"
        style={{ display: 'grid', background: 'var(--bn-bg2)' }}
      >
        <div className="col-hdr" style={{ textAlign: 'left' }}>Dealer</div>
        <div className="col-hdr" style={{ textAlign: 'right' }}>Price</div>
        <div className="col-hdr" style={{ textAlign: 'right' }}>Yield</div>
        <div className="col-hdr" style={{ textAlign: 'right' }}>Face (MM)</div>
        <div className="col-hdr" style={{ textAlign: 'right' }}>DV01 ($K)</div>
        <div className="col-hdr" style={{ textAlign: 'center' }}>Type</div>
      </div>

      {/* ── Order book levels ── */}
      <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
        {/* Asks header + levels */}
        {(view === 'both' || view === 'asks') && (
          <div className="overflow-y-auto flex flex-col" style={{ flex: 1, minHeight: 0 }}>
            <div style={{ marginTop: 'auto' }}>
              <div
                className="px-2 py-[2px] flex-shrink-0"
                style={{ fontSize: 9, fontWeight: 700, color: 'var(--bn-red)', letterSpacing: '0.06em', fontFamily: 'var(--fi-mono)' }}
              >
                OFFERS (ASK)
              </div>
              {asks.map((a, i) => (
                <div
                  key={i}
                  onClick={() => onClickPrice?.(a.price)}
                  className={`${COL} ob-row-ask hover:bg-[var(--bn-bg3)]`}
                  style={{ '--fill-pct': `${a.pct}%` } as any}
                >
                  <div className="font-mono-fi" style={{ fontSize: 11, color: 'var(--bn-t1)' }}>{a.dealer}</div>
                  <div className="font-mono-fi" style={{ fontSize: 11, color: 'var(--bn-red)', textAlign: 'right' }}>{a.price.toFixed(3)}</div>
                  <div className="font-mono-fi" style={{ fontSize: 11, color: 'var(--bn-t0)', textAlign: 'right' }}>{a.yield.toFixed(3)}</div>
                  <div className="font-mono-fi" style={{ fontSize: 11, color: 'var(--bn-t0)', textAlign: 'right' }}>{a.face.toFixed(1)}</div>
                  <div className="font-mono-fi" style={{ fontSize: 11, color: '#1e90ff', textAlign: 'right' }}>{a.dv01.toFixed(1)}</div>
                  <div style={{ textAlign: 'center' }}><QuoteBadge type={a.quoteType} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Spread bar */}
        {view === 'both' && (
          <div
            className="flex items-center px-3 py-1.5 flex-shrink-0"
            style={{
              background: 'linear-gradient(90deg, rgba(14,203,129,0.08), var(--bn-bg2), rgba(246,70,93,0.08))',
              borderTop: '1px solid var(--bn-border)',
              borderBottom: '1px solid var(--bn-border)',
            }}
          >
            <span className="font-mono-fi font-bold" style={{ fontSize: 14, color: spreadColor }}>
              {mid.toFixed(3)}
            </span>
            <span className="font-mono-fi text-xs ml-3" style={{ color: 'var(--bn-t2)' }}>
              ≈ ${mid.toFixed(3)}
            </span>
            <div className="ml-auto flex items-center gap-4">
              <span className="font-mono-fi" style={{ fontSize: 10 }}>
                <span style={{ color: 'var(--bn-t2)' }}>Spread </span>
                <span style={{ color: 'var(--bn-amber)', fontWeight: 600 }}>{spread.toFixed(3)}</span>
                <span style={{ color: 'var(--bn-t2)' }}> ({spreadPct}%)</span>
              </span>
              <span className="font-mono-fi" style={{ fontSize: 10 }}>
                <span style={{ color: 'var(--bn-t2)' }}>Mid Yld </span>
                <span style={{ color: '#00bcd4', fontWeight: 600 }}>{midYield.toFixed(3)}</span>
              </span>
              <span className="font-mono-fi" style={{ fontSize: 10 }}>
                <span style={{ color: 'var(--bn-t2)' }}>Z-Spd </span>
                <span style={{ color: '#c084fc', fontWeight: 600 }}>{bond.gSpd}</span>
              </span>
              <span style={{ color: spreadColor, fontSize: 12, fontWeight: 700 }}>{spread < 0 ? '↓' : '↑'}</span>
            </div>
          </div>
        )}

        {/* Bids header + levels */}
        {(view === 'both' || view === 'bids') && (
          <div className="overflow-y-auto" style={{ flex: 1, minHeight: 0 }}>
            <div
              className="px-2 py-[2px] flex-shrink-0"
              style={{ fontSize: 9, fontWeight: 700, color: 'var(--bn-green)', letterSpacing: '0.06em', fontFamily: 'var(--fi-mono)' }}
            >
              BIDS
            </div>
            {bids.map((b, i) => (
              <div
                key={i}
                onClick={() => onClickPrice?.(b.price)}
                className={`${COL} ob-row-bid hover:bg-[var(--bn-bg3)]`}
                style={{ '--fill-pct': `${b.pct}%` } as any}
              >
                <div className="font-mono-fi" style={{ fontSize: 11, color: 'var(--bn-t1)' }}>{b.dealer}</div>
                <div className="font-mono-fi" style={{ fontSize: 11, color: 'var(--bn-green)', textAlign: 'right' }}>{b.price.toFixed(3)}</div>
                <div className="font-mono-fi" style={{ fontSize: 11, color: 'var(--bn-t0)', textAlign: 'right' }}>{b.yield.toFixed(3)}</div>
                <div className="font-mono-fi" style={{ fontSize: 11, color: 'var(--bn-t0)', textAlign: 'right' }}>{b.face.toFixed(1)}</div>
                <div className="font-mono-fi" style={{ fontSize: 11, color: '#1e90ff', textAlign: 'right' }}>{b.dv01.toFixed(1)}</div>
                <div style={{ textAlign: 'center' }}><QuoteBadge type={b.quoteType} /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Aggregate DV01 footer ── */}
      <div
        className="flex items-center px-3 py-1.5 flex-shrink-0"
        style={{ borderTop: '1px solid var(--bn-border)', background: 'var(--bn-bg2)' }}
      >
        <div className="flex items-center gap-4">
          <span className="font-mono-fi" style={{ fontSize: 9 }}>
            <span style={{ color: 'var(--bn-t2)' }}>BID DV01 </span>
            <span style={{ color: 'var(--bn-green)', fontWeight: 600 }}>${bidDv01}K</span>
          </span>
          <span className="font-mono-fi" style={{ fontSize: 9 }}>
            <span style={{ color: 'var(--bn-t2)' }}>ASK DV01 </span>
            <span style={{ color: 'var(--bn-red)', fontWeight: 600 }}>${askDv01}K</span>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <span className="font-mono-fi" style={{ fontSize: 9 }}>
            <span style={{ color: 'var(--bn-t2)' }}>MIN SIZE </span>
            <span style={{ color: 'var(--bn-t1)', fontWeight: 600 }}>{minSize}MM</span>
          </span>
          <span className="font-mono-fi" style={{ fontSize: 9 }}>
            <span style={{ color: 'var(--bn-t2)' }}>FIRM </span>
            <span style={{ color: 'var(--bn-green)', fontWeight: 600 }}>{firmCount}</span>
          </span>
          <span className="font-mono-fi" style={{ fontSize: 9 }}>
            <span style={{ color: 'var(--bn-t2)' }}>SETTLE </span>
            <span style={{ color: 'var(--bn-t1)', fontWeight: 600 }}>T+1</span>
          </span>
        </div>
      </div>

      {/* ── Recent trades ── */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{ borderTop: '1px solid var(--bn-border)', maxHeight: 160, overflow: 'hidden' }}
      >
        <div className="ob-trades-cols px-2 py-1 flex-shrink-0" style={{ display: 'grid', background: 'var(--bn-bg2)' }}>
          <div className="col-hdr" style={{ textAlign: 'left' }}>Side</div>
          <div className="col-hdr" style={{ textAlign: 'left' }}>Cpty</div>
          <div className="col-hdr" style={{ textAlign: 'right' }}>Price</div>
          <div className="col-hdr" style={{ textAlign: 'right' }}>Yield</div>
          <div className="col-hdr" style={{ textAlign: 'right' }}>Face</div>
          <div className="col-hdr" style={{ textAlign: 'right' }}>Time</div>
        </div>
        <div className="overflow-y-auto flex-1">
          {trades.map((t, i) => (
            <div key={i} className="ob-trades-cols px-2 py-[2px]" style={{ display: 'grid' }}>
              <div
                className="font-mono-fi"
                style={{ fontSize: 10, fontWeight: 700, color: t.side === 'BUY' ? 'var(--bn-green)' : 'var(--bn-red)' }}
              >
                {t.side}
              </div>
              <div className="font-mono-fi" style={{ fontSize: 10, color: 'var(--bn-t1)' }}>{t.dealer}</div>
              <div className="font-mono-fi" style={{ fontSize: 10, color: 'var(--bn-t0)', textAlign: 'right' }}>{t.price.toFixed(3)}</div>
              <div className="font-mono-fi" style={{ fontSize: 10, color: 'var(--bn-t0)', textAlign: 'right' }}>{t.yield.toFixed(3)}</div>
              <div className="font-mono-fi" style={{ fontSize: 10, color: 'var(--bn-t0)', textAlign: 'right' }}>{t.face.toFixed(1)}</div>
              <div className="font-mono-fi" style={{ fontSize: 10, color: 'var(--bn-t2)', textAlign: 'right' }}>{t.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
