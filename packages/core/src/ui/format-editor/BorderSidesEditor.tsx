import { useState, useCallback, useRef, useEffect, type CSSProperties } from 'react';
import { FormatColorPicker } from './FormatColorPicker';
import { FormatPopover } from './FormatPopover';
import type { BorderSide, BorderStyle, SideSpec } from './types';
import { EDGE_ORDER } from './types';

/**
 * Border editor — Cockpit Terminal visual language.
 *
 * Layout (same anatomy as the v1 editor, retuned for the cockpit):
 *   ┌──────────────────────────────┐
 *   │ BORDERS                👁  ×  │  tracked-caps header + eye/clear
 *   ├──────────────────────────────┤
 *   │     ┌─────────────┐          │
 *   │ [T] │    CELL     │   [R]   │  interactive cell preview, side
 *   │     └─────────────┘          │  hit-targets use single letters
 *   │          [B]           [L]   │
 *   ├──────────────────────────────┤
 *   │ [ALL][T][R][B][L][NONE]      │  mode pills — letters to save space
 *   ├──────────────────────────────┤
 *   │ [■] [Solid ▼]  [− 1 +]       │  color / style / width
 *   ├──────────────────────────────┤
 *   │ T 1  R 0  B 1  L 0           │  per-side summary in Plex Mono
 *   └──────────────────────────────┘
 *
 * Typography & chrome match the rest of the cockpit — 11px tracked caps
 * for labels, IBM Plex Mono for the width and per-side summary numbers,
 * sharp 2px radii, visible 1px hairline borders against the deep base.
 *
 * Color-token strategy: the editor is rendered from two host contexts —
 * the v1 format-editor popover AND (historically) the v2 style editor.
 * Both hosts expose the same `--gc-*` token set so we lean on those; a
 * nested `--ck-*` fallback pattern lets the editor also pick up the
 * Cockpit variables when rendered inside a `.gc-sheet-v2` scope.
 */

// Compact side labels — single letter per side. Matches the cockpit's
// "prefer Plex Mono + tracked caps" aesthetic and is the user's explicit
// ask ("use letters for the border sides instead of the full name to
// save space").
const SIDE_LETTER: Record<BorderSide, string> = {
  top: 'T',
  right: 'R',
  bottom: 'B',
  left: 'L',
};

const ALL_STYLES: BorderStyle[] = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'none'];

type ModePill = 'all' | BorderSide | 'none';
const MODE_PILLS: ModePill[] = ['all', 'top', 'right', 'bottom', 'left', 'none'];
const MODE_LABEL: Record<ModePill, string> = {
  all: 'ALL',
  top: 'T',
  right: 'R',
  bottom: 'B',
  left: 'L',
  none: 'N',
};

// Single place to resolve both --ck-* and --gc-* tokens so the editor
// renders consistently in either scope. `var(--ck-X, var(--gc-Y, #hex))`
// — Cockpit first, v1 sheet next, hex bail-out last.
const ACCENT = 'var(--ck-green, var(--gc-positive, #2dd4bf))';
const ACCENT_BG = 'var(--ck-green-bg, rgba(45,212,191,0.10))';
const NEGATIVE = 'var(--ck-red, var(--gc-negative, #f87171))';
const NEGATIVE_BG = 'var(--ck-red-bg, rgba(248,113,113,0.08))';
const BG = 'var(--ck-bg, var(--gc-bg, #0b0e11))';
const SURFACE = 'var(--ck-surface, var(--gc-surface, #161a1e))';
const BORDER = 'var(--ck-border, var(--gc-border, #313944))';
const BORDER_HI = 'var(--ck-border-hi, var(--gc-border2, #3e4754))';
const T0 = 'var(--ck-t0, var(--gc-text, #eaecef))';
const T1 = 'var(--ck-t1, var(--gc-text-muted, #a0a8b4))';
const T2 = 'var(--ck-t2, var(--gc-text-dim, #7a8494))';
const T3 = 'var(--ck-t3, var(--gc-text-faint, #4a5568))';
const FONT_SANS = 'var(--ck-font-sans, var(--gc-font, "IBM Plex Sans", "Inter", sans-serif))';
const FONT_MONO = 'var(--ck-font-mono, var(--gc-font-mono, "IBM Plex Mono", monospace))';

export function BorderSidesEditor({
  sides,
  onChange,
}: {
  sides: Record<BorderSide, SideSpec>;
  onChange: (next: Record<BorderSide, SideSpec>) => void;
}) {
  const [mode, setMode] = useState<ModePill>('all');
  const [popup, setPopup] = useState<'style' | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The "active" side whose properties the controls edit. For `all`, show
  // top as the source of truth (onChange broadcasts to every side).
  const activeSide: BorderSide =
    mode === 'all' || mode === 'none' ? 'top' : (mode as BorderSide);
  const active = sides[activeSide];

  const upd = useCallback(
    (k: keyof SideSpec, v: SideSpec[keyof SideSpec]) => {
      const next = { ...sides };
      const targets: BorderSide[] = mode === 'all' || mode === 'none' ? [...EDGE_ORDER] : [mode as BorderSide];
      for (const s of targets) {
        next[s] = { ...next[s], [k]: v };
        // Picking a color or style implies "I want this border"; re-open
        // hidden sides so the edit actually lands. Width stays at 0 only
        // when the user explicitly sets it to 0.
        if (k === 'color' || k === 'style') {
          if (!next[s].visible) next[s].visible = true;
          if (next[s].width <= 0) next[s].width = 1;
        }
      }
      onChange(next);
    },
    [mode, sides, onChange],
  );

  const clearAll = useCallback(() => {
    const next = { ...sides };
    for (const s of EDGE_ORDER) next[s] = { ...next[s], visible: false };
    onChange(next);
    setMode('all');
  }, [sides, onChange]);

  // Close popups when clicking outside the panel
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPopup(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const anyVisible = EDGE_ORDER.some((s) => sides[s].visible && sides[s].width > 0);

  return (
    <div ref={panelRef} style={{ width: '100%', position: 'relative', fontFamily: FONT_SANS }}>
      {/* Header */}
      <div
        style={{
          padding: '2px 0 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: T2,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Borders
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => upd('visible', !active.visible)}
            title={active.visible ? 'Hide active side' : 'Show active side'}
            style={{
              ...iconBtn,
              background: active.visible ? ACCENT_BG : NEGATIVE_BG,
              color: active.visible ? ACCENT : NEGATIVE,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {active.visible ? (
                <>
                  <path d="M2.06 12S5 5 12 5s9.94 7 9.94 7-2.94 7-9.94 7S2.06 12 2.06 12z" stroke="currentColor" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" fill="currentColor" fillOpacity=".2" />
                </>
              ) : (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.4 18.4 0 0 1 5.06-5.94" stroke="currentColor" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" stroke="currentColor" />
                  <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" />
                </>
              )}
            </svg>
          </button>
          <button
            onClick={clearAll}
            title="Clear all borders"
            disabled={!anyVisible}
            style={{
              ...iconBtn,
              background: NEGATIVE_BG,
              color: NEGATIVE,
              opacity: anyVisible ? 1 : 0.35,
              cursor: anyVisible ? 'pointer' : 'default',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" />
              <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* Interactive cell preview */}
      <div
        style={{
          padding: '6px 0',
          display: 'flex',
          justifyContent: 'center',
          borderTop: `1px solid ${BORDER}`,
          borderBottom: `1px solid ${BORDER}`,
          background: SURFACE,
        }}
      >
        <div style={{ position: 'relative', width: 168, height: 64 }}>
          <div
            style={{
              position: 'absolute',
              inset: 18,
              background: BG,
              borderRadius: 2,
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
            <span
              style={{
                fontSize: 9,
                color: T3,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontFamily: FONT_SANS,
              }}
            >
              Cell
            </span>
          </div>
          {(
            [
              { side: 'top', style: { top: 0, left: 18, right: 18, height: 18, cursor: 'n-resize' } },
              { side: 'bottom', style: { bottom: 0, left: 18, right: 18, height: 18, cursor: 's-resize' } },
              { side: 'left', style: { top: 18, left: 0, bottom: 18, width: 18, cursor: 'w-resize' } },
              { side: 'right', style: { top: 18, right: 0, bottom: 18, width: 18, cursor: 'e-resize' } },
            ] as const
          ).map(({ side, style: st }) => {
            const selected = mode === side;
            return (
              <button
                key={side}
                onClick={() => setMode(mode === side ? 'all' : side)}
                title={`Edit ${side}`}
                style={{
                  position: 'absolute',
                  ...st,
                  border: 'none',
                  padding: 0,
                  background: selected ? ACCENT_BG : 'transparent',
                  borderRadius: 2,
                  transition: 'background 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                } as CSSProperties}
              >
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    color: selected ? ACCENT : T2,
                    opacity: selected ? 1 : 0.7,
                  }}
                >
                  {SIDE_LETTER[side]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode pills — letters + ALL / N */}
      <div style={{ padding: '8px 0 4px', display: 'flex', gap: 2 }}>
        {MODE_PILLS.map((m) => {
          const selected = mode === m;
          const isClear = m === 'none';
          return (
            <button
              key={m}
              onClick={() => {
                if (isClear) {
                  clearAll();
                } else {
                  setMode(m);
                }
              }}
              title={
                m === 'all'
                  ? 'All sides'
                  : m === 'none'
                    ? 'Clear all borders'
                    : `Edit ${m}`
              }
              style={{
                flex: 1,
                height: 26,
                borderRadius: 2,
                cursor: 'pointer',
                fontSize: m === 'all' ? 10 : 11,
                fontWeight: selected ? 600 : 500,
                letterSpacing: '0.1em',
                background: selected
                  ? ACCENT_BG
                  : isClear
                    ? 'transparent'
                    : 'transparent',
                color: selected ? ACCENT : isClear ? NEGATIVE : T1,
                border: `1px solid ${selected ? ACCENT : BORDER}`,
                transition: 'all 0.15s',
                textTransform: 'uppercase',
                fontFamily: FONT_SANS,
              }}
            >
              {MODE_LABEL[m]}
            </button>
          );
        })}
      </div>

      {/* Controls row — color / style / width */}
      <div style={{ padding: '8px 0 4px', display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Color swatch */}
        <FormatPopover
          width={240}
          trigger={
            <button
              title="Border color"
              style={{
                width: 28,
                height: 28,
                borderRadius: 2,
                padding: 0,
                cursor: 'pointer',
                background: active.color,
                border: `1px solid ${BORDER_HI}`,
                flexShrink: 0,
                display: 'block',
                overflow: 'hidden',
              }}
            />
          }
        >
          <FormatColorPicker
            value={active.color}
            onChange={(c) => {
              if (c) upd('color', c);
            }}
          />
        </FormatPopover>

        {/* Style dropdown */}
        <div style={{ position: 'relative', flex: 1 }}>
          <button
            onClick={() => setPopup(popup === 'style' ? null : 'style')}
            style={{
              width: '100%',
              height: 28,
              borderRadius: 2,
              border: `1px solid ${popup === 'style' ? ACCENT : BORDER_HI}`,
              background: BG,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px',
              color: T0,
              fontSize: 11,
              fontWeight: 500,
              fontFamily: FONT_SANS,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: T2 }}>
                <StyleLine s={active.style} />
              </span>
              <span style={{ textTransform: 'capitalize' }}>{active.style}</span>
            </span>
            <svg
              width="10"
              height="6"
              viewBox="0 0 10 6"
              style={{
                transition: 'transform 0.2s',
                transform: popup === 'style' ? 'rotate(180deg)' : 'none',
              }}
            >
              <path
                d="M1 1l4 4 4-4"
                stroke={T2}
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {popup === 'style' && (
            <div
              style={{
                position: 'absolute',
                top: 32,
                left: 0,
                right: 0,
                background: SURFACE,
                border: `1px solid ${BORDER_HI}`,
                borderRadius: 2,
                boxShadow:
                  'var(--ck-popout-shadow, 0 16px 40px rgba(0,0,0,0.45))',
                zIndex: 100,
                padding: 3,
              }}
            >
              {ALL_STYLES.map((st) => {
                const sel = active.style === st;
                return (
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
                      borderRadius: 2,
                      background: sel ? ACCENT_BG : 'transparent',
                      cursor: 'pointer',
                      color: sel ? ACCENT : T0,
                      fontSize: 11,
                      fontWeight: sel ? 600 : 400,
                      textTransform: 'capitalize',
                      fontFamily: FONT_SANS,
                    }}
                  >
                    <StyleLine s={st} />
                    {st}
                    {sel && (
                      <svg width="10" height="10" viewBox="0 0 24 24" style={{ marginLeft: 'auto' }}>
                        <path
                          d="M5 12l5 5L20 7"
                          stroke={ACCENT}
                          strokeWidth="2.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Width stepper */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 28,
            borderRadius: 2,
            border: `1px solid ${BORDER_HI}`,
            background: BG,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => upd('width', Math.max(0, active.width - 1))}
            style={stepBtn}
            title="Decrease width"
          >
            <svg width="10" height="2" viewBox="0 0 10 2">
              <line x1="1" y1="1" x2="9" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <input
            type="number"
            min={0}
            max={20}
            value={active.width}
            onChange={(e) =>
              upd('width', Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))
            }
            style={{
              width: 28,
              height: 26,
              border: 'none',
              borderLeft: `1px solid ${BORDER}`,
              borderRight: `1px solid ${BORDER}`,
              background: 'transparent',
              color: T0,
              fontSize: 12,
              fontWeight: 600,
              textAlign: 'center',
              outline: 'none',
              fontFamily: FONT_MONO,
              fontVariantNumeric: 'tabular-nums',
            }}
          />
          <button
            onClick={() => upd('width', Math.min(20, active.width + 1))}
            style={stepBtn}
            title="Increase width"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Per-side summary */}
      <div
        style={{
          display: 'flex',
          marginTop: 6,
          borderTop: `1px solid ${BORDER}`,
          background: SURFACE,
          overflow: 'hidden',
        }}
      >
        {EDGE_ORDER.map((s, i) => {
          const b = sides[s];
          const sel = mode === s;
          const on = b.visible && b.width > 0;
          return (
            <button
              key={s}
              onClick={() => setMode(s)}
              title={`Edit ${s}`}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '7px 0',
                border: 'none',
                borderRight: i < 3 ? `1px solid ${BORDER}` : 'none',
                background: sel ? ACCENT_BG : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s',
                fontFamily: FONT_SANS,
              }}
            >
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  color: sel ? ACCENT : T2,
                }}
              >
                {SIDE_LETTER[s]}
              </span>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 1,
                  background: on ? b.color : 'transparent',
                  border: on ? `1px solid rgba(255,255,255,0.12)` : `1px dashed ${T3}`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: FONT_MONO,
                  color: sel ? ACCENT : on ? T0 : T3,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {on ? b.width : '–'}
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
  if (!spec.visible || spec.width <= 0) return `1px dashed ${BORDER}`;
  return `${Math.min(spec.width, 5)}px ${spec.style} ${spec.color}`;
}

/** SVG visual of a border style line (solid / dashed / dotted / etc.). */
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

const iconBtn: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 2,
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const stepBtn: CSSProperties = {
  width: 22,
  height: 26,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--ck-t2, var(--gc-text-dim, #7a8494))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
