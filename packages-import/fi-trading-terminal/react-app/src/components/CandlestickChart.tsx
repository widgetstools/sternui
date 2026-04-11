import { useEffect, useRef, useState, useCallback } from 'react';
import type { Bond } from '@/data/tradingData';

interface Candle { t:number; o:number; h:number; l:number; c:number; v:number; }

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function generateCandles(base:number, n=120): Candle[] {
  const candles:Candle[] = [];
  let price = base * 0.96;
  const now = Date.now();
  for (let i = n; i >= 0; i--) {
    const o = price;
    const move = (Math.random() - 0.48) * base * 0.006;
    const c = Math.max(base * 0.85, Math.min(base * 1.15, o + move));
    const range = Math.abs(c - o) * (1 + Math.random());
    const h = Math.max(o, c) + range * Math.random() * 0.5;
    const l = Math.min(o, c) - range * Math.random() * 0.5;
    const v = Math.random() * 500 + 50;
    candles.push({ t: now - i * 24 * 3600000, o, h, l, c, v });
    price = c;
  }
  return candles;
}

function drawChart(canvas: HTMLCanvasElement, candles: Candle[], ma7: number[], ma25: number[], ma99: number[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = (canvas as any).__logicalW || canvas.width;
  const H = (canvas as any).__logicalH || canvas.height;
  const pad = { l:50, r:16, t:28, b:48, vol:60 };
  const chartH = H - pad.t - pad.b - pad.vol;
  ctx.clearRect(0,0,W,H);

  if (!candles.length) return;
  const prices = candles.flatMap(c => [c.h, c.l]);
  const maxP = Math.max(...prices) * 1.001;
  const minP = Math.min(...prices) * 0.999;
  const maxV = Math.max(...candles.map(c=>c.v));
  const n = candles.length;
  const cW = (W - pad.l - pad.r) / n;

  const xOf = (i:number) => pad.l + (i + 0.5) * cW;
  const yOf = (p:number) => pad.t + (1 - (p-minP)/(maxP-minP)) * chartH;
  const yVol = (v:number) => H - pad.b - (v/maxV) * (pad.vol * 0.85);

  // Read CSS variable colors
  const bgColor = getCssVar('--bn-bg1');
  const gridColor = getCssVar('--bn-bg2');
  const labelColor = getCssVar('--bn-t2');
  const greenColor = getCssVar('--bn-green');
  const redColor = getCssVar('--bn-red');
  const yellowColor = getCssVar('--bn-yellow');
  const cyanColor = getCssVar('--bn-cyan');

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0,0,W,H);

  // Grid lines
  ctx.strokeStyle = gridColor; ctx.lineWidth = 0.5;
  for (let i=1; i<5; i++) {
    const y = pad.t + (chartH * i / 5);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W-pad.r, y); ctx.stroke();
    const p = maxP - (maxP-minP)*i/5;
    ctx.fillStyle = labelColor; ctx.font = '9px JetBrains Mono,monospace'; ctx.textAlign='right';
    ctx.fillText(p.toFixed(3), pad.l-4, y+3);
  }
  // Vertical grid every ~15 candles
  for (let i=0; i<n; i+=15) {
    const x = xOf(i);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H-pad.b); ctx.stroke();
    const d = new Date(candles[i].t);
    ctx.fillStyle = labelColor; ctx.textAlign='center';
    ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x, H-pad.b+14);
  }

  // Volume bars
  candles.forEach((c,i) => {
    const x = xOf(i), yv = yVol(c.v);
    ctx.fillStyle = c.c >= c.o ? `${greenColor}4d` : `${redColor}4d`;
    ctx.fillRect(x - cW*0.4, yv, cW*0.8, H - pad.b - yv);
  });

  // MA lines
  const drawMA = (data:number[], color:string) => {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1;
    data.forEach((v,i) => { if (!v) return; i===0||!data[i-1] ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)); });
    ctx.stroke();
  };
  drawMA(ma7,  yellowColor);
  drawMA(ma25, '#d84aff');
  drawMA(ma99, cyanColor);

  // Candles
  candles.forEach((c,i) => {
    const x = xOf(i);
    const bullish = c.c >= c.o;
    const color = bullish ? greenColor : redColor;
    const yO = yOf(c.o), yC = yOf(c.c), yH = yOf(c.h), yL = yOf(c.l);
    // Wick
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, Math.min(yO,yC)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, Math.max(yO,yC)); ctx.lineTo(x, yL); ctx.stroke();
    // Body
    const bodyH = Math.max(1, Math.abs(yC - yO));
    ctx.fillStyle = color;
    if (bullish) { ctx.fillRect(x - cW*0.4, yC, cW*0.8, bodyH); }
    else         { ctx.fillRect(x - cW*0.4, yO, cW*0.8, bodyH); }
  });

  // Last price line
  const last = candles[candles.length-1];
  const lastY = yOf(last.c);
  ctx.setLineDash([3,3]);
  ctx.strokeStyle = last.c >= last.o ? greenColor : redColor; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(pad.l, lastY); ctx.lineTo(W-pad.r-50, lastY); ctx.stroke();
  ctx.setLineDash([]);
  // Price tag
  const tagColor = last.c >= last.o ? greenColor : redColor;
  ctx.fillStyle = tagColor;
  ctx.beginPath(); ctx.roundRect(W-pad.r-48, lastY-9, 48, 18, 2); ctx.fill();
  ctx.fillStyle = getCssVar('--bn-cta-text'); ctx.font = 'bold 9px JetBrains Mono,monospace'; ctx.textAlign='center';
  ctx.fillText(last.c.toFixed(3), W-pad.r-24, lastY+3);

  // MA legend
  ctx.textAlign='left';
  [['MA(7)', yellowColor, ma7],['MA(25)', '#d84aff', ma25],['MA(99)', cyanColor, ma99]].forEach(([label,color,data]:any[], idx) => {
    const v = data[data.length-1];
    ctx.fillStyle = color as string;
    ctx.font = '9px JetBrains Mono,monospace';
    ctx.fillText(`${label}: ${v?.toFixed(3)||''}`, pad.l + idx*100, pad.t-6);
  });
}

function calcMA(candles:Candle[], period:number): number[] {
  return candles.map((_,i) => {
    if (i < period-1) return 0;
    return candles.slice(i-period+1, i+1).reduce((s,c)=>s+c.c,0)/period;
  });
}

interface CandlestickChartProps { bond: Bond; }

export function CandlestickChart({ bond }: CandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [candles, setCandles] = useState<Candle[]>(() => generateCandles(bond.bid, 120));
  const [interval, setIntervalState] = useState('1D');
  const [chartType, setChartType] = useState('Original');

  // Regenerate candles when bond changes
  useEffect(() => {
    setCandles(generateCandles(bond.bid, 120));
  }, [bond.id]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ma7  = calcMA(candles, 7);
    const ma25 = calcMA(candles, 25);
    const ma99 = calcMA(candles, 99);
    drawChart(canvas, candles, ma7, ma25, ma99);
  }, [candles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement!;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
      // drawChart uses canvas.width/height — override for logical size
      (canvas as any).__logicalW = w;
      (canvas as any).__logicalH = h;
      redraw();
    };
    const obs = new ResizeObserver(resize);
    obs.observe(container);
    resize();
    return () => obs.disconnect();
  }, [redraw]);

  // Live candle update
  useEffect(() => {
    const id = setInterval(() => {
      setCandles(prev => {
        const last = { ...prev[prev.length-1] };
        const delta = (Math.random()-0.48) * last.c * 0.001;
        last.c = Math.max(last.l * 0.995, Math.min(last.h * 1.005, last.c + delta));
        last.h = Math.max(last.h, last.c);
        last.l = Math.min(last.l, last.c);
        last.v += Math.random() * 5;
        return [...prev.slice(0,-1), last];
      });
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const INTERVALS = ['Time','m▾','H▾','1D','1W','1M'];
  const INDICATORS = ['VOL ×','MA ×'];
  const CHART_TYPES = ['Original','Trading View','Depth'];

  return (
    <div className="flex flex-col h-full" style={{background:'var(--bn-bg1)'}}>
      {/* Toolbar — compact, wraps on narrow containers */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b flex-shrink-0" style={{borderColor:'var(--bn-border)',minHeight:28}}>
        {INTERVALS.map(iv => (
          <button key={iv} onClick={() => setIntervalState(iv)}
            className="font-mono-fi rounded"
            style={{padding:'2px 6px',fontSize:11,lineHeight:'16px',background: interval===iv ? 'var(--bn-bg3)':'transparent', color: interval===iv ? 'var(--bn-yellow)':'var(--bn-t1)'}}>
            {iv}
          </button>
        ))}
        <div style={{width:1,height:12,background:'var(--bn-border2)',margin:'0 2px',flexShrink:0}}/>
        {INDICATORS.map(ind => (
          <span key={ind} className="font-mono-fi rounded" style={{padding:'2px 5px',fontSize:11,lineHeight:'16px',background:'var(--bn-bg3)',color:'var(--bn-t1)',cursor:'pointer'}}>{ind}</span>
        ))}
        <div style={{flex:'1 1 0',minWidth:4}}/>
        <div className="flex items-center gap-0.5">
          {CHART_TYPES.map(ct => (
            <button key={ct} onClick={() => setChartType(ct)}
              className="font-mono-fi rounded border"
              style={{padding:'2px 6px',fontSize:11,lineHeight:'16px',background:chartType===ct?'var(--bn-bg3)':'transparent',borderColor:chartType===ct?'var(--bn-border2)':'transparent',color:chartType===ct?'var(--bn-t0)':'var(--bn-t1)'}}>
              {ct}
            </button>
          ))}
        </div>
      </div>
      {/* Canvas — fills remaining space -->  */}
      <div className="flex-1 relative" style={{minHeight:0}}>
        <canvas ref={canvasRef} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>
      </div>
    </div>
  );
}
