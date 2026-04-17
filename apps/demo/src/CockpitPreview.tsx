import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  GripHorizontal,
  Hash,
  Italic,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Save,
  Strikethrough,
  Trash2,
  Underline,
  X,
} from 'lucide-react';

/**
 * Cockpit Terminal — floating popout revision.
 *
 * A flush-right drawer forced us into 500px and broke the style editor
 * into vertical bands. Lifted into a centred floating popout, the
 * customiser gets breathing room (960 × 640) so each band can lay its
 * controls horizontally again — much closer to the FormattingToolbar
 * density the user asked to marry.
 *
 * Popout chrome:
 *   ▸ Dimmed full-screen backdrop (alpha 0.5) — click to dismiss.
 *   ▸ Draggable title strip at top with grip glyph + traffic-light X.
 *   ▸ Subtle 24px outer shadow + 1px phosphor-dim inner rim so the
 *     window reads as floating, not pasted.
 *   ▸ Maximize toggle (top-right) for traders on smaller laptops.
 *
 * Internal layout (three columns):
 *   ┌ 60px ──┬ 220px ────────┬ 1fr ───────────────────────────┐
 *   │ MODULE │ ITEMS (rules) │ EDITOR                         │
 *   │ NAV    │ list, scrolls │ meta + bands, scrolls          │
 *   │ icons  │               │                                │
 *   └────────┴───────────────┴────────────────────────────────┘
 *
 * Why 3 columns instead of the drawer's 2:
 *   - Module tabs live as a thin left rail so the top bar stays clean
 *     for the window chrome (title, profile, dirty count, close).
 *   - The editor column gets ~680px, wide enough for the FormattingToolbar
 *     marriage: STYLE + ALIGN + SIZE + WEIGHT all on one row.
 *   - Colour, border, format still get their own rows but each row uses
 *     the horizontal width instead of stacking two fields vertically.
 *
 * Fixed vs scroll: header (window chrome + tabs) + footer are fixed.
 * Items list + editor scroll independently (min-height: 0 on the grid
 * body + overflow-y: auto on each column).
 */

const tokens: Record<string, string> = {
  '--ck-bg':           '#111417',
  '--ck-surface':      '#1a1d21',
  '--ck-card':         '#22262b',
  '--ck-card-hi':      '#2a2e34',
  '--ck-border':       '#2d3339',
  '--ck-border-hi':    '#3a4149',
  '--ck-t0':           '#e5e7ea',
  '--ck-t1':           '#9ba3ad',
  '--ck-t2':           '#6b7480',
  '--ck-t3':           '#4a5360',
  '--ck-green':        '#6ee7b7',
  '--ck-green-dim':    '#2d6a5a',
  '--ck-green-bg':     'rgba(110,231,183,0.10)',
  '--ck-amber':        '#ffb020',
  '--ck-amber-bg':     'rgba(255,176,32,0.08)',
  '--ck-red':          '#f87171',
  '--ck-font-sans':    '"IBM Plex Sans", "Inter", -apple-system, sans-serif',
  '--ck-font-mono':    '"IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace',
};

// ─── Atoms ──────────────────────────────────────────────────────────────────

function Caps({
  children,
  size = 10,
  color,
  letterSpacing = '0.08em',
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  letterSpacing?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        fontSize: size,
        fontWeight: 600,
        letterSpacing,
        textTransform: 'uppercase',
        color: color ?? 'var(--ck-t2)',
        fontFamily: 'var(--ck-font-sans)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function LedBar({ on = true, amber = false, height = 10 }: { on?: boolean; amber?: boolean; height?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: 2,
        height,
        background: on ? (amber ? 'var(--ck-amber)' : 'var(--ck-green)') : 'var(--ck-border-hi)',
        boxShadow: on
          ? amber
            ? '0 0 5px rgba(255,176,32,0.55)'
            : '0 0 5px rgba(110,231,183,0.6)'
          : 'none',
        flexShrink: 0,
        display: 'inline-block',
      }}
    />
  );
}

function Mono({ children, color, size = 11 }: { children: ReactNode; color?: string; size?: number }) {
  return (
    <span
      style={{
        fontFamily: 'var(--ck-font-mono)',
        fontSize: size,
        color: color ?? 'var(--ck-t0)',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </span>
  );
}

function TBtn({
  active,
  onClick,
  children,
  title,
  width = 28,
  disabled,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  width?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={active ? 'true' : undefined}
      style={{
        width,
        height: 26,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'var(--ck-green-bg)' : 'transparent',
        border: 'none',
        color: active ? 'var(--ck-green)' : 'var(--ck-t1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        borderRadius: 2,
        opacity: disabled ? 0.45 : 1,
        transition: 'background 120ms, color 120ms',
      }}
    >
      {children}
    </button>
  );
}

function TGroup({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        padding: '2px 4px',
        background: 'var(--ck-bg)',
        border: '1px solid var(--ck-border)',
        borderRadius: 2,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function TDivider() {
  return <span style={{ width: 1, height: 20, background: 'var(--ck-border-hi)', margin: '0 4px' }} />;
}

function SharpBtn({
  children,
  variant = 'default',
  disabled,
  onClick,
  style,
  title,
}: {
  children: ReactNode;
  variant?: 'default' | 'action' | 'ghost' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  title?: string;
}) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    height: 24,
    padding: '0 10px',
    border: '1px solid transparent',
    borderRadius: 2,
    fontFamily: 'var(--ck-font-sans)',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.04em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  };
  if (variant === 'action') {
    Object.assign(base, {
      background: 'var(--ck-green)',
      color: '#0a0f13',
      fontWeight: 600,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
    });
  } else if (variant === 'ghost') {
    Object.assign(base, {
      background: 'transparent',
      color: 'var(--ck-t1)',
      borderColor: 'var(--ck-border)',
    });
  } else if (variant === 'danger') {
    Object.assign(base, {
      background: 'transparent',
      color: 'var(--ck-red)',
      borderColor: 'var(--ck-border)',
    });
  } else {
    Object.assign(base, {
      background: 'var(--ck-card-hi)',
      color: 'var(--ck-t0)',
      borderColor: 'var(--ck-border)',
    });
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={{ ...base, ...style }}>
      {children}
    </button>
  );
}

function Stepper({
  value,
  onChange,
  width = 36,
  mono = true,
}: {
  value: string;
  onChange: (v: string) => void;
  width?: number;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width,
        height: 26,
        border: 'none',
        background: 'transparent',
        color: 'var(--ck-t0)',
        fontFamily: mono ? 'var(--ck-font-mono)' : 'var(--ck-font-sans)',
        fontSize: 11,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center',
        outline: 'none',
        padding: 0,
      }}
    />
  );
}

function Band({
  index,
  title,
  trailing,
  children,
}: {
  index: string;
  title: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section style={{ padding: '14px 20px 4px' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 10,
          userSelect: 'none',
        }}
      >
        <Mono color="var(--ck-t3)" size={10}>
          {index}
        </Mono>
        <Caps size={10} color="var(--ck-t1)">
          {title}
        </Caps>
        <span style={{ flex: 1, height: 1, background: 'var(--ck-border)' }} />
        {trailing}
      </header>
      {children}
    </section>
  );
}

// ─── Data ───────────────────────────────────────────────────────────────────

type RuleSample = {
  id: string;
  name: string;
  priority: number;
  scope: string;
  expression: string;
  dirty: boolean;
  enabled: boolean;
};

const initialRules: RuleSample[] = [
  { id: 'r_01', name: 'High Yield Highlight', priority: 10, scope: 'ROW',      expression: '[yield] >= 7.25',      dirty: true,  enabled: true },
  { id: 'r_02', name: 'Below Par Warning',    priority: 20, scope: 'CELL · 3', expression: '[price] < 100',        dirty: false, enabled: true },
  { id: 'r_03', name: 'Maturity < 2y',        priority: 30, scope: 'ROW',      expression: '[maturityYears] < 2',  dirty: false, enabled: false },
  { id: 'r_04', name: 'Distressed Spread',    priority: 40, scope: 'CELL · 1', expression: '[spread] > 600',       dirty: false, enabled: true },
  { id: 'r_05', name: 'Callable Soon',        priority: 50, scope: 'ROW',      expression: '[callDate] < TODAY()', dirty: false, enabled: true },
  { id: 'r_06', name: 'BBB Downgrade Watch',  priority: 60, scope: 'CELL · 2', expression: '[rating] = "BBB"',     dirty: false, enabled: false },
  { id: 'r_07', name: 'Illiquid Bonds',       priority: 70, scope: 'ROW',      expression: '[volume] < 1000000',   dirty: true,  enabled: true },
  { id: 'r_08', name: 'New Issue Premium',    priority: 80, scope: 'CELL · 4', expression: '[ageD] < 30',          dirty: false, enabled: true },
];

const moduleNav = [
  { id: 'cs', label: 'Conditional', code: '01' },
  { id: 'cg', label: 'Groups',      code: '02' },
  { id: 'cc', label: 'Calculated',  code: '03' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function CockpitPreview() {
  const [activeTab, setActiveTab] = useState('cs');
  const [rules, setRules] = useState<RuleSample[]>(initialRules);
  const [selectedId, setSelectedId] = useState('r_01');
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [strike, setStrike] = useState(false);
  const [align, setAlign] = useState<'L' | 'C' | 'R' | 'J'>('R');
  const [fontSize, setFontSize] = useState('13');
  const [weight, setWeight] = useState('600');
  const [fg, setFg] = useState('#6EE7B7');
  const [bg, setBg] = useState('');
  const [excelFmt, setExcelFmt] = useState('[Red]$#,##0.00;[Green]-$#,##0.00');
  const [maximized, setMaximized] = useState(false);

  const selected = rules.find((r) => r.id === selectedId) ?? rules[0];
  const dirtyCount = rules.filter((r) => r.dirty).length;

  const popoutStyle: CSSProperties = maximized
    ? { width: '94vw', height: '90vh', maxWidth: 'none', maxHeight: 'none' }
    : { width: 960, height: 640, maxWidth: '96vw', maxHeight: '94vh' };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0c0e',
        position: 'relative',
        fontFamily: '"IBM Plex Sans", sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Faux app canvas underneath */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 22px)',
            opacity: 0.6,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 10,
            color: '#2b2f34',
            letterSpacing: '0.2em',
          }}
        >
          WF.MARKETS.TERMINAL · BOND BLOTTER
        </div>
      </div>

      {/* Dimmed backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(5,7,9,0.62)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* ─── Floating popout ─────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          ...popoutStyle,
          ...(tokens as CSSProperties),
          background: 'var(--ck-bg)',
          border: '1px solid var(--ck-border-hi)',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--ck-t0)',
          fontSize: 12,
          lineHeight: 1.4,
          boxShadow:
            '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(110,231,183,0.04), inset 0 1px 0 rgba(255,255,255,0.02)',
          overflow: 'hidden',
        }}
      >
        {/* ── FIXED HEADER ────────────────────────────────────────── */}
        <header style={{ flexShrink: 0 }}>
          {/* Title bar — draggable */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              height: 32,
              padding: '0 12px',
              borderBottom: '1px solid var(--ck-border)',
              background: 'var(--ck-surface)',
              cursor: 'move',
              userSelect: 'none',
            }}
          >
            <GripHorizontal size={14} color="var(--ck-t3)" />
            <Mono color="var(--ck-green)" size={11}>
              ●
            </Mono>
            <span
              style={{
                fontFamily: 'var(--ck-font-sans)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--ck-t0)',
                letterSpacing: '0.02em',
              }}
            >
              GRID CUSTOMIZER
            </span>
            <span
              style={{
                fontFamily: 'var(--ck-font-mono)',
                fontSize: 10,
                color: 'var(--ck-t3)',
                letterSpacing: '0.06em',
              }}
            >
              v2.3.0
            </span>
            <span style={{ flex: 1 }} />
            <Mono color="var(--ck-t2)" size={10}>
              PROFILE=<span style={{ color: 'var(--ck-t0)' }}>DEMO-BULLET</span>
            </Mono>
            <Mono color="var(--ck-t2)" size={10}>
              DIRTY=<span style={{ color: dirtyCount > 0 ? 'var(--ck-amber)' : 'var(--ck-t1)' }}>{String(dirtyCount).padStart(2, '0')}</span>
            </Mono>
            <div style={{ display: 'inline-flex', gap: 2, marginLeft: 8 }}>
              <button
                type="button"
                onClick={() => setMaximized((v) => !v)}
                title={maximized ? 'Restore' : 'Maximize'}
                style={{
                  width: 22,
                  height: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--ck-t2)',
                  cursor: 'pointer',
                  borderRadius: 2,
                }}
              >
                {maximized ? <Minimize2 size={11} strokeWidth={2} /> : <Maximize2 size={11} strokeWidth={2} />}
              </button>
              <button
                type="button"
                title="Close"
                style={{
                  width: 22,
                  height: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--ck-t1)',
                  cursor: 'pointer',
                  borderRadius: 2,
                }}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          </div>
        </header>

        {/* ── BODY ── 3-column grid ─────────────────────────────────── */}
        <main
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: '62px 220px 1fr',
            borderBottom: '1px solid var(--ck-border)',
          }}
        >
          {/* Col 1 — module nav */}
          <nav
            style={{
              borderRight: '1px solid var(--ck-border)',
              background: 'var(--ck-surface)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              paddingTop: 10,
              gap: 2,
            }}
          >
            {moduleNav.map((m) => {
              const active = activeTab === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveTab(m.id)}
                  title={m.label}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    height: 60,
                    width: '100%',
                    background: active ? 'var(--ck-card)' : 'transparent',
                    border: 'none',
                    borderLeft: active ? '2px solid var(--ck-green)' : '2px solid transparent',
                    color: active ? 'var(--ck-t0)' : 'var(--ck-t1)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <Mono color={active ? 'var(--ck-green)' : 'var(--ck-t3)'} size={10}>
                    {m.code}
                  </Mono>
                  <Caps size={9} color={active ? 'var(--ck-t0)' : 'var(--ck-t1)'}>
                    {m.label}
                  </Caps>
                </button>
              );
            })}
          </nav>

          {/* Col 2 — items list */}
          <aside
            style={{
              borderRight: '1px solid var(--ck-border)',
              background: 'var(--ck-surface)',
              overflowY: 'auto',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '10px 12px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                position: 'sticky',
                top: 0,
                background: 'var(--ck-surface)',
                borderBottom: '1px solid var(--ck-border)',
                zIndex: 1,
              }}
            >
              <Caps size={9}>RULES</Caps>
              <Mono color="var(--ck-t3)" size={10}>
                {String(rules.length).padStart(2, '0')}
              </Mono>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() =>
                  setRules((rs) => {
                    const id = `r_${String(rs.length + 1).padStart(2, '0')}`;
                    setSelectedId(id);
                    return [...rs, { id, name: 'New Rule', priority: (rs.at(-1)?.priority ?? 0) + 10, scope: 'ROW', expression: 'true', dirty: true, enabled: true }];
                  })
                }
                title="Add rule"
                style={{
                  width: 22,
                  height: 22,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--ck-green-bg)',
                  color: 'var(--ck-green)',
                  border: '1px solid var(--ck-green-dim)',
                  borderRadius: 2,
                  cursor: 'pointer',
                }}
              >
                <Plus size={11} strokeWidth={2.5} />
              </button>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
              {rules.map((r) => {
                const active = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '9px 12px 9px 10px',
                        background: active ? 'var(--ck-card)' : 'transparent',
                        border: 'none',
                        borderLeft: active ? '2px solid var(--ck-green)' : '2px solid transparent',
                        color: r.enabled ? 'var(--ck-t0)' : 'var(--ck-t2)',
                        fontFamily: 'var(--ck-font-sans)',
                        fontSize: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ width: 2, display: 'inline-flex' }}>
                        {r.dirty && <LedBar amber height={12} />}
                      </span>
                      <Mono color="var(--ck-t3)" size={10}>
                        {r.id.toUpperCase()}
                      </Mono>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}
                      </span>
                      <Mono color="var(--ck-t3)" size={10}>
                        {String(r.priority).padStart(2, '0')}
                      </Mono>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Col 3 — editor */}
          <section style={{ overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Identity strip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 20px 10px',
              }}
            >
              <Mono color="var(--ck-t3)" size={11}>
                {selected.id.toUpperCase()}
              </Mono>
              <input
                value={selected.name}
                onChange={(e) =>
                  setRules((rs) => rs.map((r) => (r.id === selected.id ? { ...r, name: e.target.value, dirty: true } : r)))
                }
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 28,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ck-t0)',
                  fontFamily: 'var(--ck-font-sans)',
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  outline: 'none',
                  padding: 0,
                }}
              />
              <SharpBtn variant={selected.dirty ? 'action' : 'ghost'} disabled={!selected.dirty}>
                <Save size={11} strokeWidth={2} /> SAVE
              </SharpBtn>
              <SharpBtn variant="danger">
                <Trash2 size={11} strokeWidth={2} /> DELETE
              </SharpBtn>
            </div>

            {/* Meta grid — 4 cols */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 0,
                padding: '10px 20px 14px',
                borderBottom: '1px solid var(--ck-border)',
                background: 'var(--ck-surface)',
              }}
            >
              <MetaCell
                label="STATUS"
                value={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <LedBar on={selected.enabled} height={10} />
                    <Mono size={11} color={selected.enabled ? 'var(--ck-green)' : 'var(--ck-t2)'}>
                      {selected.enabled ? 'ACTIVE' : 'MUTED'}
                    </Mono>
                  </span>
                }
              />
              <MetaCell label="SCOPE" value={<Mono>{selected.scope}</Mono>} />
              <MetaCell label="PRI" value={<Mono>{String(selected.priority).padStart(2, '0')}</Mono>} />
              <MetaCell label="APPLIED" value={<Mono color="var(--ck-amber)">132 rows</Mono>} />
            </div>

            {/* 01 EXPRESSION */}
            <Band index="01" title="EXPRESSION">
              <textarea
                defaultValue={selected.expression}
                rows={2}
                style={{
                  width: '100%',
                  fontFamily: 'var(--ck-font-mono)',
                  fontSize: 12,
                  background: 'var(--ck-bg)',
                  border: '1px solid var(--ck-border)',
                  color: 'var(--ck-t0)',
                  padding: '8px 10px',
                  borderRadius: 2,
                  outline: 'none',
                  resize: 'vertical',
                  lineHeight: 1.5,
                }}
              />
              <div
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  color: 'var(--ck-t3)',
                  fontFamily: 'var(--ck-font-sans)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                TYPE [ FOR COLUMNS · ⌘↵ TO SAVE · USE{' '}
                <code style={{ fontFamily: 'var(--ck-font-mono)', color: 'var(--ck-t1)', textTransform: 'none' }}>data.field</code> FOR RAW
              </div>
            </Band>

            {/* 02 TYPE — horizontal toolbar now that we have the width */}
            <Band index="02" title="TYPE">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                  padding: '6px 8px',
                  background: 'var(--ck-card)',
                  border: '1px solid var(--ck-border)',
                  borderRadius: 2,
                }}
              >
                <TGroup>
                  <TBtn active={bold} onClick={() => setBold((v) => !v)} title="Bold">
                    <Bold size={12} strokeWidth={2.25} />
                  </TBtn>
                  <TBtn active={italic} onClick={() => setItalic((v) => !v)} title="Italic">
                    <Italic size={12} strokeWidth={2.25} />
                  </TBtn>
                  <TBtn active={underline} onClick={() => setUnderline((v) => !v)} title="Underline">
                    <Underline size={12} strokeWidth={2.25} />
                  </TBtn>
                  <TBtn active={strike} onClick={() => setStrike((v) => !v)} title="Strike">
                    <Strikethrough size={12} strokeWidth={2.25} />
                  </TBtn>
                </TGroup>
                <TGroup>
                  <TBtn active={align === 'L'} onClick={() => setAlign('L')} title="Left">
                    <AlignLeft size={12} strokeWidth={2.25} />
                  </TBtn>
                  <TBtn active={align === 'C'} onClick={() => setAlign('C')} title="Center">
                    <AlignCenter size={12} strokeWidth={2.25} />
                  </TBtn>
                  <TBtn active={align === 'R'} onClick={() => setAlign('R')} title="Right">
                    <AlignRight size={12} strokeWidth={2.25} />
                  </TBtn>
                  <TBtn active={align === 'J'} onClick={() => setAlign('J')} title="Justify">
                    <AlignJustify size={12} strokeWidth={2.25} />
                  </TBtn>
                </TGroup>
                <TDivider />
                <TGroup>
                  <Caps size={9} style={{ paddingLeft: 4 }}>
                    SZ
                  </Caps>
                  <Stepper value={fontSize} onChange={setFontSize} />
                  <Caps size={9} color="var(--ck-t3)" style={{ paddingRight: 4 }}>
                    PX
                  </Caps>
                </TGroup>
                <TGroup>
                  <Caps size={9} style={{ paddingLeft: 4 }}>
                    WT
                  </Caps>
                  <Stepper value={weight} onChange={setWeight} />
                </TGroup>
              </div>
            </Band>

            {/* 03 COLOUR — two rows, each full-width */}
            <Band index="03" title="COLOUR">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <FieldShell label="TEXT">
                  <ColorField value={fg} onChange={setFg} onClear={() => setFg('')} alpha={100} />
                </FieldShell>
                <FieldShell label="FILL">
                  <ColorField value={bg} onChange={setBg} onClear={() => setBg('')} placeholder="NONE" alpha={100} />
                </FieldShell>
              </div>
            </Band>

            {/* 04 BORDER */}
            <Band index="04" title="BORDER">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '6px 8px',
                  background: 'var(--ck-card)',
                  border: '1px solid var(--ck-border)',
                  borderRadius: 2,
                }}
              >
                <Caps size={9} style={{ paddingLeft: 4 }}>
                  EDGES
                </Caps>
                <TGroup>
                  <TBtn active={false} title="Top" width={26}>
                    <span style={{ width: 10, height: 10, borderTop: '2px solid currentColor' }} />
                  </TBtn>
                  <TBtn active title="Right" width={26}>
                    <span style={{ width: 10, height: 10, borderRight: '2px solid currentColor' }} />
                  </TBtn>
                  <TBtn active={false} title="Bottom" width={26}>
                    <span style={{ width: 10, height: 10, borderBottom: '2px solid currentColor' }} />
                  </TBtn>
                  <TBtn active={false} title="Left" width={26}>
                    <span style={{ width: 10, height: 10, borderLeft: '2px solid currentColor' }} />
                  </TBtn>
                </TGroup>
                <TDivider />
                <Caps size={9}>WIDTH</Caps>
                <TGroup>
                  <Stepper value="1" onChange={() => {}} width={28} />
                  <Caps size={9} color="var(--ck-t3)" style={{ paddingRight: 4 }}>
                    PX
                  </Caps>
                </TGroup>
                <Caps size={9}>COLOR</Caps>
                <TGroup>
                  <span style={{ width: 14, height: 14, background: '#f87171', border: '1px solid var(--ck-border-hi)' }} />
                  <Mono size={11} color="var(--ck-t0)">
                    #F87171
                  </Mono>
                </TGroup>
                <TDivider />
                <Caps size={9}>STYLE</Caps>
                <TGroup>
                  {['SOLID', 'DASH', 'DOT'].map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      style={{
                        height: 24,
                        padding: '0 8px',
                        background: i === 0 ? 'var(--ck-green-bg)' : 'transparent',
                        border: 'none',
                        color: i === 0 ? 'var(--ck-green)' : 'var(--ck-t1)',
                        fontFamily: 'var(--ck-font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        borderRadius: 2,
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </TGroup>
              </div>
            </Band>

            {/* 05 FORMAT */}
            <Band index="05" title="FORMAT">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '6px 8px',
                  background: 'var(--ck-card)',
                  border: '1px solid var(--ck-border)',
                  borderRadius: 2,
                }}
              >
                <Caps size={9} style={{ paddingLeft: 4 }}>
                  PRESET
                </Caps>
                <TGroup>
                  {['NUM', '$', '%', 'DATE', 'DURATION'].map((p, i) => (
                    <button
                      key={p}
                      type="button"
                      style={{
                        height: 24,
                        padding: '0 10px',
                        background: i === 1 ? 'var(--ck-green-bg)' : 'transparent',
                        border: 'none',
                        color: i === 1 ? 'var(--ck-green)' : 'var(--ck-t1)',
                        fontFamily: 'var(--ck-font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.06em',
                        cursor: 'pointer',
                        borderRadius: 2,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </TGroup>
                <TDivider />
                <Caps size={9}>EXCEL</Caps>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flex: 1,
                    minWidth: 220,
                    height: 26,
                    padding: '0 8px',
                    background: 'var(--ck-bg)',
                    border: '1px solid var(--ck-border)',
                    borderRadius: 2,
                  }}
                >
                  <Hash size={11} strokeWidth={2} color="var(--ck-t3)" />
                  <input
                    value={excelFmt}
                    onChange={(e) => setExcelFmt(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--ck-amber)',
                      fontFamily: 'var(--ck-font-mono)',
                      fontSize: 11,
                      outline: 'none',
                      padding: 0,
                      letterSpacing: '0.02em',
                    }}
                  />
                </div>
              </div>
            </Band>

            {/* 06 PREVIEW */}
            <Band index="06" title="PREVIEW">
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--ck-card)',
                  border: '1px solid var(--ck-border)',
                  borderRadius: 2,
                  fontFamily: 'var(--ck-font-mono)',
                  fontSize: 11,
                  color: 'var(--ck-t2)',
                  display: 'flex',
                  gap: 24,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <span style={{ color: 'var(--ck-t3)' }}>WHEN </span>
                  <span style={{ color: 'var(--ck-amber)' }}>{selected.expression}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--ck-t3)' }}>APPLY </span>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '3px 12px',
                      background: bg || 'transparent',
                      color: fg || 'var(--ck-t0)',
                      fontWeight: bold ? 700 : Number(weight),
                      fontStyle: italic ? 'italic' : 'normal',
                      textDecoration: underline ? 'underline' : strike ? 'line-through' : 'none',
                      fontSize: Number(fontSize),
                      border: '1px solid #f87171',
                    }}
                  >
                    $7.2500
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--ck-t3)' }}>FORMAT </span>
                  <span style={{ color: 'var(--ck-amber)' }}>{excelFmt}</span>
                </div>
              </div>
            </Band>
            <div style={{ height: 20 }} />
          </section>
        </main>

        {/* ── FIXED FOOTER ────────────────────────────────────────── */}
        <footer
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            height: 32,
            padding: '0 14px',
            background: 'var(--ck-surface)',
            fontFamily: 'var(--ck-font-mono)',
            fontSize: 10,
            color: 'var(--ck-t2)',
            letterSpacing: '0.06em',
          }}
        >
          <span>SAVE EACH RULE INDIVIDUALLY</span>
          <span style={{ color: 'var(--ck-t3)' }}>·</span>
          <span>⌘ S = SAVE CARD · ⌘ ⏎ = SAVE ALL · ⌫ = DELETE · ESC = CLOSE</span>
          <span style={{ flex: 1 }} />
          <SharpBtn variant="ghost" style={{ height: 22, fontSize: 10, padding: '0 10px' }}>
            DISCARD
          </SharpBtn>
          <SharpBtn variant="action" style={{ height: 22, fontSize: 10, padding: '0 14px' }}>
            DONE
          </SharpBtn>
        </footer>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function MetaCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Caps size={9}>{label}</Caps>
      <div>{value}</div>
    </div>
  );
}

function FieldShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Caps size={9}>{label}</Caps>
      {children}
    </div>
  );
}

function ColorField({
  value,
  alpha = 100,
  onChange,
  onClear,
  placeholder,
}: {
  value: string;
  alpha?: number;
  onChange: (v: string) => void;
  onClear?: () => void;
  placeholder?: string;
}) {
  const has = Boolean(value);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        minWidth: 0,
        height: 28,
        padding: '0 8px',
        background: 'var(--ck-bg)',
        border: '1px solid var(--ck-border)',
        borderRadius: 2,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 14,
          height: 14,
          background: has
            ? value
            : 'conic-gradient(var(--ck-t3) 0 25%, var(--ck-border) 0 50%, var(--ck-t3) 0 75%, var(--ck-border) 0) 0 0 / 6px 6px',
          border: '1px solid var(--ck-border-hi)',
        }}
      />
      <input
        value={has ? value : ''}
        placeholder={placeholder ?? 'NONE'}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          color: has ? 'var(--ck-t0)' : 'var(--ck-t2)',
          fontFamily: 'var(--ck-font-mono)',
          fontSize: 11,
          outline: 'none',
          padding: 0,
          letterSpacing: '0.02em',
        }}
      />
      <Mono size={11} color="var(--ck-t1)">
        {has ? `${alpha}%` : ''}
      </Mono>
      {has && onClear && (
        <button
          type="button"
          onClick={onClear}
          style={{
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: 'var(--ck-t2)',
            cursor: 'pointer',
            padding: 0,
            borderRadius: 2,
          }}
          title="Clear"
        >
          <Minus size={11} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
