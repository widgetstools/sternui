/**
 * Visual style preview — Figma Design-panel reference (2026-04-16 refinement).
 *
 * Renders the production-target Pattern D next to the earlier A/B/C mocks so
 * the user can confirm D matches their Figma reference screenshots before we
 * refactor the real panels.
 *
 * Pattern D is modeled directly on the two Figma screenshots the user shared:
 *   1. The "Rectangle → Position / Layout / Appearance / Fill / Stroke /
 *      Effects / Export" inspector — hairline separators between stacked
 *      subsections, small subsection labels, label-free paired inputs with
 *      inline icon prefixes, grouped toggle pills, teal Save accent.
 *   2. The "Custom / Libraries" color picker — 240×240 saturation square +
 *      hue slider + alpha slider + hex field + recent-swatches strip.
 *
 * Reachable at `?panel=preview`. The settings-sheet we ship will compose the
 * same primitives (FigmaPanelSection, IconInput, PillToggleGroup,
 * ColorPicker) from packages/core-v2/src/ui/.
 *
 * No functional state — this is purely a visual mock. Delete after shipping.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Trash2, Save, ChevronDown, Plus, Minus, Eye, EyeOff,
  Pipette, X as XIcon,
  Hash, DollarSign, Percent as PercentIcon, Calendar,
  MoveHorizontal, MoveVertical, RotateCw, FlipHorizontal, FlipVertical,
} from 'lucide-react';

// ─── Shared sample content (same rule across all four patterns) ──────

const SAMPLE_RULE = {
  name: 'High Yield Highlight',
  scope: 'Cell (specific columns)',
  targets: ['Yield', 'Spread'],
  expression: '[yield] > 5 AND [spread] > 100',
  priority: 0,
  style: { bold: true, bg: '#346680' },
  dirty: true,
};

const TEAL = '#2dd4bf';
const TEAL_MUTED = 'rgba(45, 212, 191, 0.14)';
const TEAL_BORDER = 'rgba(45, 212, 191, 0.36)';

// Figma-ish neutrals tuned to the reference screenshot (background is
// ~#1e1e1e, subtle borders, primary text near pure white).
const BG = '#1e1e1e';
const BG_INPUT = '#2a2a2a';
const BG_HOVER = '#2e2e2e';
const BORDER = '#3a3a3a';
const BORDER_SOFT = '#2b2b2b';
const TEXT = '#e4e4e4';
const TEXT_MUTED = '#9a9a9a';
const TEXT_DIM = '#6b6b6b';

// ═════════════════════════════════════════════════════════════════════
//  Pattern D — Figma property-inspector (ship spec)
// ═════════════════════════════════════════════════════════════════════

/**
 * Section container with a hairline top border + collapsible title row.
 * Matches the "Position / Layout / Appearance / Fill / Stroke" rhythm in
 * the reference screenshot.
 */
function FigmaPanelSection({
  title,
  collapsed,
  onToggle,
  actions,
  children,
}: {
  title: string;
  collapsed?: boolean;
  onToggle?: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: `1px solid ${BORDER_SOFT}` }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 8px',
      }}>
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', padding: 0,
            color: TEXT, fontSize: 13, fontWeight: 600, cursor: onToggle ? 'pointer' : 'default',
            letterSpacing: '0.01em',
          }}
        >
          {title}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: TEXT_MUTED }}>
          {actions}
        </div>
      </div>
      {!collapsed && <div style={{ padding: '0 16px 14px' }}>{children}</div>}
    </div>
  );
}

/**
 * Tiny grey subsection label ("Alignment", "Dimensions", "Position").
 */
function SubLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 11, color: TEXT_MUTED, margin: '10px 0 6px',
      fontWeight: 400, letterSpacing: '0.01em',
      ...style,
    }}>{children}</div>
  );
}

/**
 * The signature Figma field — left icon prefix + numeric/hex value, no
 * outer label, fills its grid cell. `suffix` renders right-aligned inside
 * the input (e.g. "%").
 */
function IconInput({
  icon,
  value,
  onChange,
  placeholder,
  suffix,
  style,
  monospace,
}: {
  icon?: React.ReactNode;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  style?: React.CSSProperties;
  monospace?: boolean;
}) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', flex: 1, minWidth: 0,
      height: 30, borderRadius: 5, background: BG_INPUT,
      border: `1px solid transparent`,
      padding: '0 8px', gap: 6,
      fontFamily: monospace ? 'JetBrains Mono, monospace' : 'Inter, system-ui, sans-serif',
      ...style,
    }}>
      {icon && <span style={{ color: TEXT_DIM, display: 'inline-flex' }}>{icon}</span>}
      <input
        // Native in the mock only — production uses shadcn Input.
        defaultValue={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.currentTarget.value)}
        style={{
          flex: 1, minWidth: 0,
          background: 'transparent', border: 'none', outline: 'none',
          color: TEXT, fontSize: 12,
          fontFamily: 'inherit',
        }}
      />
      {suffix && <span style={{ color: TEXT_DIM, fontSize: 11 }}>{suffix}</span>}
    </div>
  );
}

/**
 * Horizontal pill container that holds 2–3 flat icon buttons with thin
 * vertical dividers — the "Alignment" + "Rotation mirror" cluster in the
 * reference screenshot.
 */
function PillToggleGroup({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'stretch',
      background: BG_INPUT, borderRadius: 5, padding: 2,
      flex: 1, minWidth: 0,
    }}>
      {children}
    </div>
  );
}

function PillToggleBtn({
  active,
  onClick,
  children,
  title,
  first,
  last,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  title?: string;
  first?: boolean;
  last?: boolean;
}) {
  void first; void last;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      aria-pressed={active ? 'true' : 'false'}
      title={title}
      style={{
        flex: 1, height: 26, minWidth: 30,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 4,
        background: active ? '#3a3a3a' : 'transparent',
        color: active ? TEXT : TEXT_MUTED,
        border: 'none', cursor: 'pointer', padding: 0,
      }}
    >{children}</button>
  );
}

/**
 * Two-column row helper for paired fields like W/H, X/Y — with an optional
 * right-side "link" toggle.
 */
function PairRow({ left, right, trailing }: { left: React.ReactNode; right: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      {left}
      {right}
      {trailing}
    </div>
  );
}

/**
 * Small ghost icon action (the "eye", "minus", "plus" at the end of rows).
 */
function GhostIcon({
  onClick,
  title,
  children,
}: {
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        width: 26, height: 26, borderRadius: 4,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: TEXT_MUTED, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{children}</button>
  );
}

// ─── Figma-style Color Picker (swatch + popover with sat square) ─────

const PRESETS_TOP = ['#d9d9d9', '#1e1e1e', '#000000'];

function FigmaColorPicker({
  value = '#d9d9d9',
  alpha = 100,
  onChange,
  onClear,
}: {
  value?: string;
  alpha?: number;
  onChange?: (v: string) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hex = (value ?? '').replace('#', '').toUpperCase();

  return (
    <div ref={rootRef} style={{
      position: 'relative',
      display: 'flex', alignItems: 'center', gap: 8,
      flex: 1, minWidth: 0,
      height: 30, borderRadius: 5, background: BG_INPUT,
      padding: '0 4px 0 6px',
    }}>
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        style={{
          width: 18, height: 18, borderRadius: 3, padding: 0,
          border: `1px solid ${BORDER}`,
          background: value,
          cursor: 'pointer', flexShrink: 0,
        }}
        aria-label="Pick color"
      />
      <span style={{
        flex: 1, fontSize: 12, color: TEXT,
        fontFamily: 'Inter, system-ui, sans-serif',
        letterSpacing: 0,
      }}>{hex}</span>
      <span style={{ fontSize: 12, color: TEXT_MUTED, minWidth: 26, textAlign: 'right' }}>{alpha}</span>
      <span style={{ fontSize: 11, color: TEXT_DIM, marginRight: 2 }}>%</span>
      <GhostIcon title="Hide" onClick={() => {}}><Eye size={15} /></GhostIcon>
      {onClear && (
        <GhostIcon title="Remove fill" onClick={onClear}><Minus size={15} /></GhostIcon>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 1000,
          width: 272, background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          {/* Tabs header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px 0',
          }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={{
                padding: '6px 10px', borderRadius: 4, border: 'none',
                background: '#3a3a3a', color: TEXT, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>Custom</button>
              <button style={{
                padding: '6px 10px', borderRadius: 4, border: 'none',
                background: 'transparent', color: TEXT_MUTED, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              }}>Libraries</button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <GhostIcon title="Add"><Plus size={14} /></GhostIcon>
              <GhostIcon title="Close" onClick={() => setOpen(false)}><XIcon size={14} /></GhostIcon>
            </div>
          </div>

          {/* Fill-type row (solid / dots / bars / image / video) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '8px 12px',
            borderBottom: `1px solid ${BORDER_SOFT}`,
          }}>
            {[0,1,2,3,4].map((i) => (
              <button key={i} style={{
                width: 28, height: 24, borderRadius: 4, border: 'none',
                background: i === 0 ? '#3a3a3a' : 'transparent',
                color: i === 0 ? TEXT : TEXT_MUTED,
                cursor: 'pointer', padding: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {i === 0 && <div style={{ width: 12, height: 12, border: `1.5px solid currentColor`, borderRadius: 1 }} />}
                {i === 1 && <div style={{ width: 14, height: 14, backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '4px 4px' }} />}
                {i === 2 && <div style={{ width: 14, height: 14, backgroundImage: 'linear-gradient(to bottom, currentColor 2px, transparent 2px)', backgroundSize: '4px 4px' }} />}
                {i === 3 && <div style={{ width: 14, height: 12, border: `1.5px solid currentColor`, borderRadius: 1, position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 2, background: 'currentColor', opacity: 0.4 }} />
                </div>}
                {i === 4 && <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '7px solid currentColor' }} />}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <GhostIcon title="Blend"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg></GhostIcon>
            <GhostIcon title="More"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="9" r="7"/><path d="m14 14 5 5"/></svg></GhostIcon>
          </div>

          {/* Saturation square */}
          <div style={{ padding: 12 }}>
            <div style={{
              position: 'relative', width: '100%', aspectRatio: '1 / 1',
              borderRadius: 3,
              background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, #ff0000)`,
            }}>
              <div style={{
                position: 'absolute', left: '8%', top: '10%',
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid #fff', background: 'transparent',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              }} />
            </div>

            {/* Hue + alpha sliders */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <Pipette size={16} color={TEXT_MUTED} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  position: 'relative', height: 10, borderRadius: 999,
                  background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                }}>
                  <div style={{
                    position: 'absolute', left: '0%', top: -3,
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid #fff', background: '#ff0000',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
                  }} />
                </div>
                <div style={{
                  position: 'relative', height: 10, borderRadius: 999,
                  backgroundImage: `linear-gradient(to right, transparent, ${value}),
                    linear-gradient(45deg, #666 25%, transparent 25%),
                    linear-gradient(-45deg, #666 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #666 75%),
                    linear-gradient(-45deg, transparent 75%, #666 75%)`,
                  backgroundSize: '100% 100%, 8px 8px, 8px 8px, 8px 8px, 8px 8px',
                  backgroundPosition: '0 0, 0 0, 0 4px, 4px -4px, -4px 0px',
                }}>
                  <div style={{
                    position: 'absolute', right: 0, top: -3,
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid #fff', background: value,
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
                  }} />
                </div>
              </div>
            </div>

            {/* Hex + alpha numeric row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <button style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 8px', borderRadius: 4, border: `1px solid ${BORDER}`,
                background: BG_INPUT, color: TEXT, fontSize: 12, cursor: 'pointer',
              }}>Hex <ChevronDown size={12} /></button>
              <input
                defaultValue={hex}
                style={{
                  flex: 1, height: 30, padding: '0 10px',
                  background: BG_INPUT, border: `1px solid ${BORDER}`, borderRadius: 4,
                  color: TEXT, fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif',
                  outline: 'none', letterSpacing: 0,
                }}
              />
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                height: 30, padding: '0 10px',
                background: BG_INPUT, border: `1px solid ${BORDER}`, borderRadius: 4,
                color: TEXT, fontSize: 12, gap: 4, minWidth: 70,
              }}>
                <input defaultValue={alpha} style={{
                  width: 32, background: 'transparent', border: 'none', outline: 'none',
                  color: TEXT, fontSize: 12, textAlign: 'right',
                }} />
                <span style={{ color: TEXT_DIM }}>%</span>
              </div>
            </div>
          </div>

          {/* Recent swatches strip */}
          <div style={{ borderTop: `1px solid ${BORDER_SOFT}`, padding: '8px 12px 12px' }}>
            <button style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '6px 8px', borderRadius: 4,
              background: BG_INPUT, border: `1px solid ${BORDER}`,
              color: TEXT, fontSize: 12, cursor: 'pointer', marginBottom: 8,
            }}>
              On this page <ChevronDown size={14} />
            </button>
            <div style={{ display: 'flex', gap: 6 }}>
              {PRESETS_TOP.map((c) => (
                <button key={c}
                  onClick={() => { onChange?.(c); }}
                  style={{
                    width: 24, height: 24, borderRadius: 3,
                    background: c, border: `1px solid ${BORDER}`, cursor: 'pointer', padding: 0,
                  }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pattern D body ──────────────────────────────────────────────────

function PatternD() {
  const [rule, setRule] = useState({
    name: SAMPLE_RULE.name,
    bold: true, italic: false, underline: false, strike: false,
    align: 'left' as 'left' | 'center' | 'right' | 'justify',
    color: '#e4e4e4',
    bg: '#D9D9D9',
    bgAlpha: 100,
  });
  const [dirty, setDirty] = useState(true);

  const set = <K extends keyof typeof rule>(k: K, v: (typeof rule)[K]) => {
    setRule((r) => ({ ...r, [k]: v }));
    setDirty(true);
  };

  return (
    <Column label="D — Ship spec (Figma-authentic)" wide>
      <div style={{
        background: BG, color: TEXT,
        fontFamily: "'Inter', system-ui, sans-serif",
        height: '100%', overflow: 'auto',
      }}>
        {/* Top chrome — matches the "Design / Prototype" header in the reference */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: TEAL, color: '#0b0e11',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 12,
            }}>A</div>
            <ChevronDown size={14} color={TEXT_MUTED} />
          </div>
          <button
            disabled={!dirty}
            onClick={() => setDirty(false)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 6,
              background: dirty ? TEAL : '#3a3a3a',
              color: dirty ? '#0b0e11' : TEXT_MUTED,
              border: 'none', fontSize: 12, fontWeight: 600,
              cursor: dirty ? 'pointer' : 'not-allowed',
            }}>
            <Save size={14} /> Save
          </button>
        </div>

        {/* Design / Prototype tabs + zoom */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px 12px',
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{
              padding: '6px 12px', borderRadius: 5, border: 'none',
              background: '#3a3a3a', color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Rule</button>
            <button style={{
              padding: '6px 12px', borderRadius: 5, border: 'none',
              background: 'transparent', color: TEXT_MUTED, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>Preview</button>
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            P:0 <ChevronDown size={12} />
          </div>
        </div>

        {/* Object title row — like "Rectangle" in the reference */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 12px',
          borderTop: `1px solid ${BORDER_SOFT}`,
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>
            {rule.name}
          </div>
          <div style={{ display: 'flex', gap: 6, color: TEXT_MUTED }}>
            {dirty && <span style={{
              width: 8, height: 8, borderRadius: '50%', background: TEAL,
              boxShadow: '0 0 0 3px rgba(45,212,191,0.16)',
              alignSelf: 'center', marginRight: 6,
            }} title="Unsaved" />}
            <GhostIcon title="Duplicate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="10" height="10" rx="1"/><path d="M5 15V5h10"/></svg></GhostIcon>
            <GhostIcon title="Delete"><Trash2 size={14} /></GhostIcon>
          </div>
        </div>

        {/* ── Rule ── */}
        <FigmaPanelSection title="Rule">
          <SubLabel>Name</SubLabel>
          <IconInput value={rule.name} onChange={(v) => set('name', v)} />

          <SubLabel>Scope</SubLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <PillToggleGroup>
              <PillToggleBtn active>Cell</PillToggleBtn>
              <PillToggleBtn>Row</PillToggleBtn>
            </PillToggleGroup>
          </div>

          <SubLabel>Columns</SubLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {SAMPLE_RULE.targets.map((t) => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', borderRadius: 4,
                background: BG_INPUT, fontSize: 12, color: TEXT,
              }}>{t} <XIcon size={11} color={TEXT_DIM} style={{ cursor: 'pointer' }} /></span>
            ))}
            <button style={{
              padding: '4px 8px', borderRadius: 4,
              background: 'transparent', border: `1px dashed ${BORDER}`,
              color: TEXT_MUTED, fontSize: 12, cursor: 'pointer',
            }}>+ column</button>
          </div>

          <SubLabel>Expression</SubLabel>
          <textarea
            defaultValue={SAMPLE_RULE.expression}
            onChange={() => setDirty(true)}
            style={{
              width: '100%', boxSizing: 'border-box',
              minHeight: 64, padding: '8px 10px',
              background: BG_INPUT, border: '1px solid transparent', borderRadius: 5,
              color: TEXT, fontSize: 12, lineHeight: 1.5,
              fontFamily: 'JetBrains Mono, monospace',
              outline: 'none', resize: 'vertical',
            }}
          />

          <SubLabel>Priority</SubLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <IconInput icon={<Hash size={12} />} value="0" style={{ flex: '0 0 120px' }} />
          </div>
        </FigmaPanelSection>

        {/* ── Appearance (shared StyleEditor) ── */}
        <FigmaPanelSection title="Appearance" actions={
          <>
            <GhostIcon title="Show/hide"><Eye size={15} /></GhostIcon>
            <GhostIcon title="Paint style"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20"/></svg></GhostIcon>
          </>
        }>
          <SubLabel>Text style</SubLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <PillToggleGroup>
              <PillToggleBtn active={rule.bold} onClick={() => set('bold', !rule.bold)} title="Bold"><Bold size={14} /></PillToggleBtn>
              <PillToggleBtn active={rule.italic} onClick={() => set('italic', !rule.italic)} title="Italic"><Italic size={14} /></PillToggleBtn>
              <PillToggleBtn active={rule.underline} onClick={() => set('underline', !rule.underline)} title="Underline"><Underline size={14} /></PillToggleBtn>
              <PillToggleBtn active={rule.strike} onClick={() => set('strike', !rule.strike)} title="Strikethrough"><Strikethrough size={14} /></PillToggleBtn>
            </PillToggleGroup>
            <PillToggleGroup>
              <PillToggleBtn active={rule.align === 'left'} onClick={() => set('align', 'left')} title="Align left"><AlignLeft size={14} /></PillToggleBtn>
              <PillToggleBtn active={rule.align === 'center'} onClick={() => set('align', 'center')} title="Center"><AlignCenter size={14} /></PillToggleBtn>
              <PillToggleBtn active={rule.align === 'right'} onClick={() => set('align', 'right')} title="Align right"><AlignRight size={14} /></PillToggleBtn>
              <PillToggleBtn active={rule.align === 'justify'} onClick={() => set('align', 'justify')} title="Justify"><AlignJustify size={14} /></PillToggleBtn>
            </PillToggleGroup>
          </div>

          <PairRow
            left={
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <SubLabel style={{ margin: '10px 0 4px' }}>Size</SubLabel>
                <IconInput icon={<span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: 'Inter' }}>Aa</span>} value="12" suffix="px" />
              </div>
            }
            right={
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <SubLabel style={{ margin: '10px 0 4px' }}>Weight</SubLabel>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1,
                  height: 30, borderRadius: 5, background: BG_INPUT, padding: '0 10px',
                }}>
                  <span style={{ flex: 1, fontSize: 12, color: TEXT }}>Normal</span>
                  <ChevronDown size={12} color={TEXT_DIM} />
                </div>
              </div>
            }
          />
        </FigmaPanelSection>

        {/* ── Fill ── */}
        <FigmaPanelSection title="Fill" actions={
          <>
            <GhostIcon title="Paint style"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg></GhostIcon>
            <GhostIcon title="Add fill"><Plus size={15} /></GhostIcon>
          </>
        }>
          <FigmaColorPicker value={rule.bg} alpha={rule.bgAlpha} onChange={(v) => set('bg', v)} onClear={() => set('bg', '')} />
        </FigmaPanelSection>

        {/* ── Stroke (collapsed) ── */}
        <FigmaPanelSection title="Stroke" collapsed actions={<GhostIcon title="Add stroke"><Plus size={15} /></GhostIcon>}/>

        {/* ── Value format ── */}
        <FigmaPanelSection title="Value format" actions={<GhostIcon title="Info"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v4h1"/></svg></GhostIcon>}>
          <SubLabel>Preset · by data type</SubLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            <PillToggleGroup>
              <PillToggleBtn title="Number"><Hash size={14} /></PillToggleBtn>
              <PillToggleBtn active title="Currency"><DollarSign size={14} /></PillToggleBtn>
              <PillToggleBtn title="Percent"><PercentIcon size={14} /></PillToggleBtn>
              <PillToggleBtn title="Date"><Calendar size={14} /></PillToggleBtn>
            </PillToggleGroup>
          </div>
          <SubLabel>Custom format</SubLabel>
          <IconInput monospace value="$#,##0.00;(#,##0.00)" />
        </FigmaPanelSection>
      </div>
    </Column>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  Pattern A — original Figma-inspired first draft (kept for reference)
// ═════════════════════════════════════════════════════════════════════

function PatternA() {
  return (
    <Column label="A — v1 Figma draft (superseded)">
      <style>{`
        .pa-section-title {
          font-size: 9px; font-weight: 600; letter-spacing: 0.08em;
          text-transform: uppercase; color: #7a8494;
          padding: 0 0 6px; margin: 16px 0 8px;
          border-bottom: 1px solid #313944;
        }
        .pa-card {
          background: #161a1e; border: 1px solid #313944; border-radius: 6px;
          padding: 10px; margin-bottom: 8px; font-family: 'Geist', system-ui;
        }
        .pa-card-header {
          display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
          padding-bottom: 8px; border-bottom: 1px solid #313944;
        }
        .pa-card-title { font-size: 11px; font-weight: 500; color: #eaecef; flex: 1; }
        .pa-row { display: flex; align-items: center; height: 24px; padding: 2px 0; font-size: 11px; }
        .pa-row-label { width: 78px; font-size: 11px; color: #a0a8b4; flex-shrink: 0; }
        .pa-row-control { flex: 1; display: flex; align-items: center; gap: 4px; min-width: 0; }
        .pa-input {
          height: 22px; padding: 2px 6px; font-size: 10px;
          font-family: 'JetBrains Mono', monospace;
          background: #0b0e11; border: 1px solid #313944; border-radius: 3px;
          color: #eaecef; outline: none; flex: 1; min-width: 0;
        }
        .pa-chip { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 3px; background: #1e2329; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #eaecef; }
        .pa-save { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; font-size: 10px; font-weight: 500; background: ${TEAL}; color: #0b0e11; border: none; border-radius: 3px; cursor: pointer; }
        .pa-dirty-dot { width: 6px; height: 6px; border-radius: 50%; background: ${TEAL}; display: inline-block; }
      `}</style>

      <div className="pa-section-title">Styling Rules (1)</div>
      <div className="pa-card">
        <div className="pa-card-header">
          <span className="pa-dirty-dot" />
          <div className="pa-card-title">{SAMPLE_RULE.name}</div>
          <button className="pa-save"><Save size={10} /> Save</button>
          <button style={{ background: 'transparent', border: 'none', color: '#7a8494', cursor: 'pointer' }}>
            <Trash2 size={12} />
          </button>
        </div>
        <div className="pa-row"><div className="pa-row-label">Name</div><div className="pa-row-control"><input className="pa-input" defaultValue={SAMPLE_RULE.name} /></div></div>
        <div className="pa-row"><div className="pa-row-label">Scope</div><div className="pa-row-control"><select className="pa-input" defaultValue={SAMPLE_RULE.scope}><option>Cell (specific columns)</option><option>Entire Row</option></select></div></div>
        <div className="pa-row"><div className="pa-row-label">Columns</div><div className="pa-row-control">{SAMPLE_RULE.targets.map((t) => (<span key={t} className="pa-chip">{t} ×</span>))}</div></div>
      </div>
    </Column>
  );
}

function PatternB() {
  return <Column label="B — Binance dense (alt)"><div style={{ fontSize: 11, color: TEXT_MUTED, padding: 20 }}>Omitted to focus on D. See git history.</div></Column>;
}

function PatternC() {
  return <Column label="C — shadcn default (alt)"><div style={{ fontSize: 11, color: TEXT_MUTED, padding: 20 }}>Omitted to focus on D. See git history.</div></Column>;
}

// ─── Shell ────────────────────────────────────────────────────────────

function Column({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div style={{
      flex: wide ? 2 : 1,
      minWidth: wide ? 360 : 240,
      maxWidth: wide ? 440 : 320,
      background: BG, color: TEXT,
      borderRight: `1px solid ${BORDER_SOFT}`,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: TEAL,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        padding: '10px 16px', borderBottom: `1px solid ${BORDER_SOFT}`,
        flexShrink: 0,
      }}>{label}</div>
      <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
    </div>
  );
}

export function PanelStylePreview() {
  return (
    <div style={{
      display: 'flex', height: '100vh',
      background: '#0b0e11', color: TEXT,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <PatternD />
      <PatternA />
      <PatternB />
      <PatternC />
    </div>
  );
}
