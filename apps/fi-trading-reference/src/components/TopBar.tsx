import { useState, useEffect, useCallback } from 'react';
import { TICKER_STRIP, type Bond } from '@/data/tradingData';
import { Sun, Moon, Save, RotateCcw, Check } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

const NAV_TABS = ['Prices','Trade','Risk','Market','Research','Orders','Analytics','Design System'];

interface TopBarProps {
  activeTab: string;
  onTabChange: (t: string) => void;
  selectedBond: Bond | null;
  onNewOrder?: () => void;
  onOpenRfq?: () => void;
  onSaveLayout?: () => void;
  onResetLayout?: () => void;
}

export function TopBar({ activeTab, onTabChange, selectedBond, onNewOrder, onOpenRfq, onSaveLayout, onResetLayout }: TopBarProps) {
  const { isDark, toggleTheme } = useTheme();
  const [time, setTime] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);

  const handleSave = useCallback(() => {
    onSaveLayout?.();
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 800);
  }, [onSaveLayout]);
  useEffect(() => {
    const f = () => setTime(new Date().toLocaleTimeString('en-US',{hour12:false,timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' ET');
    f(); const id = setInterval(f, 1000); return () => clearInterval(id);
  }, []);

  const bond = selectedBond || { ticker:'UST', cpn:4.625, mat:'06/26', bid:100.072, ask:100.197 } as Bond;
  const mid = ((bond.bid + bond.ask) / 2);
  const change24h = +(Math.random()*0.4-0.2).toFixed(2);
  const pctChg = +(change24h/mid*100).toFixed(2);

  return (
    <div data-nav className="flex-shrink-0" style={{background:'var(--bn-bg1)',borderBottom:'1px solid var(--bn-border)'}}>
      {/* ── Main nav bar ── */}
      <div className="flex items-center h-11 px-4 gap-0" style={{borderBottom:'1px solid var(--bn-border)'}}>
        {/* Logo */}
        <div className="flex items-center gap-2 mr-6 flex-shrink-0">
          <svg width="22" height="22" viewBox="0 0 64 64">
            <polygon points="11,18 19,14 19,33 11,33" fill="#a5c3e1"/>
            <polygon points="11,33 19,33 19,52 11,52" fill="#4ba5c3"/>
            <polygon points="21,30 29,26 29,52 21,52" fill="#ff870f"/>
            <polygon points="31,26 39,30 39,52 31,52" fill="#ff0f0f"/>
            <polygon points="41,14 49,18 49,33 41,33" fill="#a5c3e1"/>
            <polygon points="41,33 49,33 49,52 41,52" fill="#4ba5c3"/>
            <rect x="11" y="52" width="38" height="2" fill="#2d4b69"/>
          </svg>
          <span className="font-bold text-sm tracking-wide" style={{color:'var(--bn-t0)'}}>MarketsUI <span style={{color:'var(--bn-blue)'}}>FI</span></span>
        </div>

        {/* Nav tabs */}
        {NAV_TABS.map(t => (
          <button key={t} onClick={() => onTabChange(t)}
            className={`bn-tab ${activeTab === t ? 'active' : ''}`}>
            {t}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2.5">
          {(onNewOrder || onOpenRfq) && (
            <>
              {onNewOrder && (
                <button onClick={onNewOrder}
                  className="flex items-center gap-1.5 font-mono-fi font-semibold flex-shrink-0 transition-colors"
                  style={{fontSize:11,padding:'4px 12px',borderRadius:3,background:'var(--bn-bg3)',color:'var(--bn-t0)',cursor:'pointer',border:'1px solid var(--bn-border2)',whiteSpace:'nowrap'}}>
                  + New Order
                </button>
              )}
              {onOpenRfq && (
                <button onClick={onOpenRfq}
                  className="flex items-center gap-1.5 font-mono-fi font-semibold flex-shrink-0 transition-colors"
                  style={{fontSize:11,padding:'4px 12px',borderRadius:3,background:'var(--bn-bg3)',color:'var(--bn-t0)',cursor:'pointer',border:'1px solid var(--bn-border2)',whiteSpace:'nowrap'}}>
                  RFQ
                </button>
              )}
              <div style={{width:1,height:14,background:'var(--bn-border)',flexShrink:0}}/>
            </>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full live-dot" style={{background:'var(--bn-green)'}}/>
            <span className="font-mono-fi" style={{color:'var(--bn-green)',fontSize:11}}>LIVE</span>
          </div>
          <div style={{width:1,height:14,background:'var(--bn-border)',flexShrink:0}}/>
          <span className="font-mono-fi" style={{color:'var(--bn-t1)',fontSize:11}}>{time}</span>
          <div style={{width:1,height:14,background:'var(--bn-border)',flexShrink:0}}/>
          {onSaveLayout && (
            <button onClick={handleSave}
              className="flex items-center justify-center w-7 h-7 rounded"
              style={{
                background: saveFlash ? 'rgba(45,212,191,0.25)' : 'var(--bn-bg3)',
                color: saveFlash ? 'var(--bn-green)' : 'var(--bn-t1)',
                transform: saveFlash ? 'scale(0.9)' : 'scale(1)',
                transition: 'all 0.15s ease',
              }}
              title="Save layout"
              aria-label="Save layout">
              {saveFlash ? <Check size={13} strokeWidth={2.5} /> : <Save size={13} />}
            </button>
          )}
          {onResetLayout && (
            <button onClick={onResetLayout}
              className="flex items-center justify-center w-7 h-7 rounded transition-colors"
              style={{ background: 'var(--bn-bg3)', color: 'var(--bn-t1)' }}
              title="Reset layout to default"
              aria-label="Reset layout">
              <RotateCcw size={13} />
            </button>
          )}
          <button onClick={toggleTheme}
            className="flex items-center justify-center w-7 h-7 rounded transition-colors"
            style={{ background: 'var(--bn-bg3)', color: 'var(--bn-t1)' }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
      </div>

      {/* ── Instrument stats strip ── */}
      {activeTab === 'Trade' || activeTab === 'Prices' ? (
        <div className="flex items-center" style={{height:36, borderBottom:'1px solid var(--bn-border)', padding:'0 16px', gap:16}}>
          {/* All stats in a uniform row — same label/value pattern */}
          {[
            {label:'Security',  val:`${bond.ticker} ${bond.cpn.toFixed(3)} ${bond.mat}`, color:'var(--bn-cyan)', w:130},
            {label:'Mid',       val:mid.toFixed(3),  color:pctChg>=0?'var(--bn-green)':'var(--bn-red)', w:72},
            {label:'Bid',       val:bond.bid.toFixed(3), color:'var(--bn-t0)', w:72},
            {label:'Ask',       val:bond.ask.toFixed(3), color:'var(--bn-t0)', w:72},
            {label:'Chg',       val:`${pctChg>=0?'+':''}${change24h.toFixed(2)} (${pctChg>=0?'+':''}${pctChg.toFixed(2)}%)`, color:pctChg>=0?'var(--bn-green)':'var(--bn-red)', w:120},
            {label:'High',      val:(mid+1.2).toFixed(3), color:'var(--bn-t0)', w:72},
            {label:'Low',       val:(mid-2.1).toFixed(3), color:'var(--bn-t0)', w:72},
            {label:'Vol',       val:`$${(Math.random()*2+3).toFixed(2)}B`, color:'var(--bn-t0)', w:62},
            {label:'OAS',       val:bond.oas>0?`+${bond.oas}bp`:'—', color:bond.oas>80?'var(--bn-amber)':'var(--bn-green)', w:52},
            {label:'Dur',       val:`${bond.dur?.toFixed(2)??'—'}yr`, color:'var(--bn-t0)', w:56},
            {label:'DV01',      val:`$${bond.dv01?.toLocaleString()??'—'}`, color:'var(--bn-t0)', w:52},
          ].map((s,i,arr) => (
            <div key={s.label} className="flex items-center flex-shrink-0" style={{width:s.w, gap:5, paddingRight: i < arr.length-1 ? 12 : 0, borderRight: i < arr.length-1 ? '1px solid var(--bn-border)' : 'none'}}>
              <span style={{fontSize:9,color:'var(--bn-t2)',whiteSpace:'nowrap',flexShrink:0}}>{s.label}</span>
              <span className="font-mono-fi font-semibold" style={{fontSize:11,color:s.color,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'}}>{s.val}</span>
            </div>
          ))}

          {/* Ticker strip */}
          <div style={{width:1,height:18,background:'var(--bn-border)',flexShrink:0}}/>
          <div className="flex items-center overflow-hidden" style={{gap:4,marginLeft:'auto'}}>
            {TICKER_STRIP.slice(0,8).map((t,i) => (
              <div key={i} className="flex items-center"
                style={{padding:'3px 7px',borderRadius:3,gap:5,background:'var(--bn-bg2)',flexShrink:0}}>
                <span style={{fontSize:9,color:'var(--bn-t2)',whiteSpace:'nowrap'}}>{t.label}</span>
                <span className="font-mono-fi font-semibold" style={{fontSize:11,color:'var(--bn-t0)',whiteSpace:'nowrap'}}>{t.value}</span>
                <span className="font-mono-fi" style={{fontSize:9,color:t.up?'var(--bn-green)':'var(--bn-red)',whiteSpace:'nowrap'}}>{t.change}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── Ticker strip only (non-trade tabs) ── */
        <div className="flex items-stretch overflow-hidden" style={{height:38, borderBottom:'1px solid var(--bn-border)'}}>
          {TICKER_STRIP.map((t,i) => (
            <div key={i} className="flex items-center gap-2 px-3"
              style={{borderRight:'1px solid var(--bn-border)'}}>
              <span style={{fontSize:11,color:'var(--bn-t2)',whiteSpace:'nowrap'}}>{t.label}</span>
              <span className="font-mono-fi font-semibold" style={{fontSize:11,color:'var(--bn-t0)',whiteSpace:'nowrap'}}>{t.value}</span>
              <span className="font-mono-fi" style={{fontSize:11,color:t.up?'var(--bn-green)':'var(--bn-red)',whiteSpace:'nowrap'}}>{t.change}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
