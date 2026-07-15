import { useEffect, useMemo, useRef } from 'react';
import type { ColDef } from 'ag-grid-community';
import type { LabRow } from '../../data/types';
import { cellText, toAltFieldColumns } from './altFieldColumns';

export type CanvasStressGridProps = {
  rowData: LabRow[];
  columnDefs: ColDef<LabRow>[];
  /** Banner explaining Bryntum license vs this open stand-in. */
  showBryntumNote?: boolean;
};

const ROW_H = 28;
const HEADER_H = 32;

/**
 * Lightweight canvas virtualizer — open stand-in for Bryntum-class paint
 * (Bryntum Grid requires a commercial npm token / license).
 */
export function CanvasStressGrid({
  rowData,
  columnDefs,
  showBryntumNote = false,
}: CanvasStressGridProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef({ top: 0, left: 0 });
  const fields = useMemo(() => toAltFieldColumns(columnDefs), [columnDefs]);
  const totalWidth = useMemo(
    () => fields.reduce((n, f) => n + Math.max(72, f.width), 0),
    [fields],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#1b2330';
      ctx.fillRect(0, 0, w, h);

      const { top, left } = scrollRef.current;
      const startRow = Math.max(0, Math.floor(top / ROW_H));
      const visibleRows = Math.ceil(h / ROW_H) + 2;
      const endRow = Math.min(rowData.length, startRow + visibleRows);

      // Header
      ctx.fillStyle = '#243044';
      ctx.fillRect(0, 0, w, HEADER_H);
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#d7dee8';
      let x = -left;
      for (const f of fields) {
        const colW = Math.max(72, f.width);
        if (x + colW > 0 && x < w) {
          ctx.fillText(f.title, x + 8, 20);
          ctx.strokeStyle = '#2f3b4f';
          ctx.beginPath();
          ctx.moveTo(x + colW, 0);
          ctx.lineTo(x + colW, HEADER_H);
          ctx.stroke();
        }
        x += colW;
      }

      ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      for (let r = startRow; r < endRow; r++) {
        const y = HEADER_H + r * ROW_H - top;
        if (r % 2 === 1) {
          ctx.fillStyle = '#222b3a';
          ctx.fillRect(0, y, w, ROW_H);
        }
        ctx.fillStyle = '#e8eef6';
        let cx = -left;
        const row = rowData[r];
        for (const f of fields) {
          const colW = Math.max(72, f.width);
          if (cx + colW > 0 && cx < w) {
            const text = cellText(row, f.field);
            ctx.fillText(text.slice(0, 32), cx + 8, y + 18);
          }
          cx += colW;
        }
        ctx.strokeStyle = '#2a3548';
        ctx.beginPath();
        ctx.moveTo(0, y + ROW_H);
        ctx.lineTo(w, y + ROW_H);
        ctx.stroke();
      }
    };

    const onScroll = () => {
      scrollRef.current = { top: wrap.scrollTop, left: wrap.scrollLeft };
      paint();
    };
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrap);
    wrap.addEventListener('scroll', onScroll, { passive: true });
    paint();
    return () => {
      ro.disconnect();
      wrap.removeEventListener('scroll', onScroll);
    };
  }, [fields, rowData]);

  const bodyH = rowData.length * ROW_H + HEADER_H;

  return (
    <div className="flex h-full min-h-0 w-full flex-col" data-testid="canvas-stress-grid">
      {showBryntumNote && (
        <div className="shrink-0 border-b border-[#2f3b4f] bg-[#243044] px-3 py-1.5 text-[11px] text-[#c5d0de]">
          <strong className="text-[#e8eef6]">Bryntum Grid</strong> needs a commercial npm
          token. Showing an open <strong className="text-[#e8eef6]">canvas virtualizer</strong>{' '}
          stand-in for scroll paint comparison.
        </div>
      )}
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-auto">
        <div style={{ width: totalWidth, height: bodyH, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            className="pointer-events-none sticky left-0 top-0"
            style={{ position: 'sticky', left: 0, top: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
