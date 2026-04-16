import { useState, useCallback, useRef, useEffect, type CSSProperties } from 'react';
import { FormatColorPicker } from './FormatColorPicker';
import type { BorderSide, BorderStyle, SideSpec } from './types';
import { EDGE_ORDER } from './types';

/**
 * Border editor matching the border-editor-v4 reference design.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │ BORDERS            [eye] [x] │  header
 *   ├──────────────────────────────┤
 *   │     ┌─────────────┐         │
 *   │ [T] │    Cell     │   [R]   │  interactive cell preview
 *   │     └─────────────┘         │
 *   │          [B]          [L]   │
 *   ├──────────────────────────────┤
 *   │ [All][Top][Rgt][Bot][Lft]   │  mode pills
 *   ├──────────────────────────────┤
 *   │ [swatch][style ▼]  [−2+]   │  controls row
 *   ├──────────────────────────────┤
 *   │ T•2  R•1  B•0  L•1         │  footer summary
 *   └──────────────────────────────┘
 *   (color picker appears below when swatch is clicked)
 */

const SIDE_LABEL: Record<BorderSide, string> = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' };
const ALL_STYLES: BorderStyle[] = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'none'];

export function BorderSidesEditor({
  sides,
  onChange,
}: {
  sides: Record<BorderSide, SideSpec>;
  onChange: (next: Record<BorderSide, SideSpec>) => void;
}) {
  const [mode, setMode] = useState<'all' | BorderSide>('all');
  const [popup, setPopup] = useState<'color' | 'style' | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const active = mode === 'all' ? sides.top : sides[mode];

  const upd = useCallback(
    (k: keyof SideSpec, v: SideSpec[keyof SideSpec]) => {
      const next = { ...sides };
      const targets: BorderSide[] = mode === 'all' ? [...EDGE_ORDER] : [mode];
      for (const s of targets) next[s] = { ...next[s], [k]: v };
      onChange(next);
    },
    [mode, sides, onChange],
  );

  const clearAll = () => {
    const next = { ...sides };
    for (const s of EDGE_ORDER) next[s] = { ...next[s], visible: false };
    onChange(next);
  };

  // Close popups when clicking outside the panel
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPopup(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={panelRef} style={{ width: '100%', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '6px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--gc-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Borders
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => upd('visible', !active.visible)}
            title={active.visible ? 'Hide' : 'Show'}
            style={{ ...pillBtn, background: active.visible ? 'rgba(45,212,191,0.10)' : 'rgba(248,113,113,0.08)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {active.visible ? (
                <>
                  <path d="M2.06 12S5 5 12 5s9.94 7 9.94 7-2.94 7-9.94 7S2.06 12 2.06 12z" stroke="var(--gc-positive)" />
                  <circle cx="12" cy="12" r="3" stroke="var(--gc-positive)" fill="var(--gc-positive)" fillOpacity=".2" />
                </>
              ) : (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.4 18.4 0 0 1 5.06-5.94" stroke="var(--gc-negative)" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" stroke="var(--gc-negative)" />
                  <line x1="2" y1="2" x2="22" y2="22" stroke="var(--gc-negative)" />
                </>
              )}
            </svg>
          </button>
          <button onClick={clearAll} title="Clear all borders" style={{ ...pillBtn, background: 'rgba(248,113,113,0.08)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" stroke="var(--gc-negative)" />
              <line x1="18" y1="6" x2="6" y2="18" stroke="var(--gc-negative)" />
            </svg>
          </button>
        </div>
      </div>

      {/* Interactive Cell Preview */}
      <div style={{ padding: '8px 0 6px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 160, height: 64 }}>
          <div
            style={{
              position: 'absolute',
              inset: 18,
              background: 'var(--gc-bg)',
              borderRadius: 'var(--gc-radius-sm, 4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderTop: borderCSS(sides.top),
              borderRight: borderCSS(sides.right),
              borderBottom: borderCSS(sides.bottom),
              borderLeft: borderCSS(sides.left),
              transition: 'border 0.2s ease',
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--gc-text-dim)', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Cell
            </span>
          </div>
          {[
            { side: 'top' as BorderSide, style: { top: 0, left: 18, right: 18, height: 18, cursor: 'n-resize' } },
            { side: 'bottom' as BorderSide, style: { bottom: 0, left: 18, right: 18, height: 18, cursor: 's-resize' } },
            { side: 'left' as BorderSide, style: { top: 18, left: 0, bottom: 18, width: 18, cursor: 'w-resize' } },
            { side: 'right' as BorderSide, style: { top: 18, right: 0, bottom: 18, width: 18, cursor: 'e-resize' } },
          ].map(({ side, style: st }) => (
            <button
              key={side}
              onClick={() => setMode(mode === side ? 'all' : side)}
              style={{
                position: 'absolute',
                ...st,
                border: 'none',
                padding: 0,
                background: mode === side ? 'rgba(45,212,191,0.20)' : 'transparent',
                borderRadius: 'var(--gc-radius-sm, 4px)',
                transition: 'background 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              } as CSSProperties}
            >
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  color: mode === side ? 'var(--gc-positive)' : 'var(--gc-text-dim)',
                  textTransform: 'uppercase',
                  opacity: mode === side ? 1 : 0.6,
                }}
              >
                {side[0].toUpperCase()}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Mode pills */}
      <div style={{ padding: '0 0 8px', display: 'flex', gap: 3 }}>
        {(['all', ...EDGE_ORDER] as const).map((s) => (
          <button
            key={s}
            onClick={() => setMode(s as 'all' | BorderSide)}
            style={{
              flex: 1,
              height: 24,
              borderRadius: 'var(--gc-radius, 5px)',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: mode === s ? 600 : 400,
              letterSpacing: '0.02em',
              background: mode === s ? 'rgba(45,212,191,0.10)' : 'rgba(255,255,255,0.04)',
              color: mode === s ? 'var(--gc-positive)' : 'var(--gc-text-dim)',
              border: mode === s ? '1px solid rgba(45,212,191,0.20)' : '1px solid transparent',
              transition: 'all 0.15s',
              textTransform: 'capitalize',
              fontFamily: 'var(--gc-font)',
            }}
          >
            {s === 'all' ? 'All' : SIDE_LABEL[s as BorderSide]}
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--gc-border)' }} />

      {/* Controls row */}
      <div style={{ padding: '8px 0 10px', display: 'flex', gap: 5, alignItems: 'center' }}>
        {/* Color swatch */}
        <button
          onClick={() => setPopup(popup === 'color' ? null : 'color')}
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--gc-radius-xl, 6px)',
            padding: 0,
            cursor: 'pointer',
            background: active.color,
            border: popup === 'color' ? '2px solid var(--gc-positive)' : '2px solid var(--gc-border2)',
            boxShadow: `inset 0 0 0 2px rgba(255,255,255,0.12), 0 0 0 ${popup === 'color' ? '3px rgba(45,212,191,0.20)' : '0 transparent'}`,
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
          title="Color"
        />

        {/* Style dropdown */}
        <div style={{ position: 'relative', flex: 1 }}>
          <button
            onClick={() => setPopup(popup === 'style' ? null : 'style')}
            style={{
              width: '100%',
              height: 28,
              borderRadius: 'var(--gc-radius-xl, 6px)',
              border: popup === 'style' ? '1px solid rgba(45,212,191,0.20)' : '1px solid var(--gc-border)',
              background: 'var(--gc-bg)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px',
              color: 'var(--gc-text)',
              fontSize: 11,
              fontWeight: 500,
              fontFamily: 'var(--gc-font)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--gc-text-muted)' }}>
                <StyleLine s={active.style} />
              </span>
              <span style={{ textTransform: 'capitalize' }}>{active.style}</span>
            </div>
            <svg
              width="10"
              height="6"
              viewBox="0 0 10 6"
              style={{ transition: 'transform 0.2s', transform: popup === 'style' ? 'rotate(180deg)' : 'none' }}
            >
              <path d="M1 1l4 4 4-4" stroke="var(--gc-text-dim)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            </svg>
          </button>
          {popup === 'style' && (
            <div
              style={{
                position: 'absolute',
                top: 32,
                left: 0,
                right: 0,
                background: 'var(--gc-surface-active)',
                border: '1px solid var(--gc-border2)',
                borderRadius: 8,
                boxShadow: '0 16px 48px rgba(0,0,0,0.45), 0 0 1px rgba(255,255,255,0.05) inset',
                zIndex: 100,
                padding: 3,
              }}
            >
              {ALL_STYLES.map((st) => (
                <button
                  key={st}
                  onClick={() => {
                    upd('style', st);
                    setPopup(null);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 8px',
                    border: 'none',
                    borderRadius: 5,
                    background: active.style === st ? 'rgba(45,212,191,0.10)' : 'transparent',
                    cursor: 'pointer',
                    color: active.style === st ? 'var(--gc-positive)' : 'var(--gc-text)',
                    fontSize: 11,
                    fontWeight: active.style === st ? 600 : 400,
                    textTransform: 'capitalize',
                    fontFamily: 'var(--gc-font)',
                  }}
                >
                  <StyleLine s={st} />
                  {st}
                  {active.style === st && (
                    <svg width="10" height="10" viewBox="0 0 24 24" style={{ marginLeft: 'auto' }}>
                      <path d="M5 12l5 5L20 7" stroke="var(--gc-positive)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Width stepper */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 28,
            borderRadius: 'var(--gc-radius-xl, 6px)',
            border: '1px solid var(--gc-border)',
            background: 'var(--gc-bg)',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <button onClick={() => upd('width', Math.max(0, active.width - 1))} style={stepBtn}>
            <svg width="10" height="2" viewBox="0 0 10 2">
              <line x1="1" y1="1" x2="9" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <input
            type="number"
            min={0}
            max={20}
            value={active.width}
            onChange={(e) => upd('width', Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))}
            style={{
              width: 26,
              height: 28,
              border: 'none',
              borderLeft: '1px solid var(--gc-border)',
              borderRight: '1px solid var(--gc-border)',
              background: 'transparent',
              color: 'var(--gc-text)',
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              outline: 'none',
              fontFamily: 'var(--gc-font-mono)',
            }}
          />
          <button onClick={() => upd('width', Math.min(20, active.width + 1))} style={stepBtn}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Color picker popup — rendered BELOW the panel, same-portal, not nested */}
      {popup === 'color' && (
        <div
          style={{
            background: 'var(--gc-surface-active)',
            border: '1px solid var(--gc-border2)',
            borderRadius: 10,
            boxShadow: '0 16px 48px rgba(0,0,0,0.45), 0 0 1px rgba(255,255,255,0.05) inset',
            padding: 10,
            marginBottom: 4,
          }}
        >
          <FormatColorPicker value={active.color} onChange={(c) => upd('color', c)} />
        </div>
      )}

      {/* Footer summary */}
      <div
        style={{
          display: 'flex',
          borderTop: '1px solid var(--gc-border)',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '0 0 var(--gc-radius-xl, 10px) var(--gc-radius-xl, 10px)',
          overflow: 'hidden',
        }}
      >
        {EDGE_ORDER.map((s, i) => {
          const b = sides[s];
          const sel = mode === s;
          return (
            <button
              key={s}
              onClick={() => setMode(s)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '7px 0',
                border: 'none',
                borderRight: i < 3 ? '1px solid var(--gc-border)' : 'none',
                background: sel ? 'rgba(45,212,191,0.10)' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s',
                fontFamily: 'var(--gc-font)',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: sel ? 'var(--gc-positive)' : 'var(--gc-text)' }}>
                {s.charAt(0).toUpperCase()}
              </span>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: b.visible ? b.color : 'transparent',
                  border: b.visible ? '1px solid rgba(255,255,255,0.1)' : '1.5px dashed var(--gc-text-dim)',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'var(--gc-font-mono)',
                  color: sel ? 'var(--gc-positive)' : 'var(--gc-text-muted)',
                }}
              >
                {b.visible ? b.width : '–'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function borderCSS(spec: SideSpec): string {
  if (!spec.visible || spec.width <= 0) return '1px dashed var(--gc-border)';
  return `${Math.min(spec.width, 5)}px ${spec.style} ${spec.color}`;
}

/** SVG visual of a border style line (solid / dashed / dotted / etc.) */
function StyleLine({ s, w = 24 }: { s: BorderStyle; w?: number }) {
  const y = 6;
  const p = { stroke: 'currentColor', strokeLinecap: 'round' as const };
  return (
    <svg width={w} height={12} viewBox={`0 0 ${w} 12`}>
      {s === 'solid' && <line x1="1" y1={y} x2={w - 1} y2={y} {...p} strokeWidth="2" />}
      {s === 'dashed' && <line x1="1" y1={y} x2={w - 1} y2={y} {...p} strokeWidth="2" strokeDasharray="4 3" />}
      {s === 'dotted' && <line x1="1" y1={y} x2={w - 1} y2={y} {...p} strokeWidth="2" strokeDasharray="1.5 3" />}
      {s === 'double' && (
        <>
          <line x1="1" y1={3} x2={w - 1} y2={3} {...p} strokeWidth="1.2" />
          <line x1="1" y1={9} x2={w - 1} y2={9} {...p} strokeWidth="1.2" />
        </>
      )}
      {s === 'groove' && <line x1="1" y1={y} x2={w - 1} y2={y} {...p} strokeWidth="3" opacity=".4" />}
      {s === 'ridge' && (
        <>
          <line x1="1" y1={y} x2={w - 1} y2={y} {...p} strokeWidth="3" opacity=".25" />
          <line x1="1" y1={y} x2={w - 1} y2={y} {...p} strokeWidth="1" />
        </>
      )}
      {s === 'none' && (
        <>
          <line x1="1" y1={y} x2={w - 1} y2={y} stroke="currentColor" strokeWidth="1" opacity=".15" />
          <line x1={4} y1={2} x2={w - 4} y2={10} stroke="currentColor" strokeWidth="1.2" opacity=".3" />
        </>
      )}
    </svg>
  );
}

const pillBtn: CSSProperties = {
  width: 26,
  height: 24,
  borderRadius: 'var(--gc-radius-xl, 6px)',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const stepBtn: CSSProperties = {
  width: 24,
  height: 28,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--gc-text-dim)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
