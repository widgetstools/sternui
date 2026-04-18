/**
 * Cockpit settings-panel primitive kit. One compact module (replaces the
 * 15-file `SettingsPanel/` tree from v2) — each primitive is tiny and
 * composes cleanly with the rest.
 *
 * All consume `--ck-*` tokens scoped to `.gc-sheet` (see
 * `../../css/cockpit.ts`). Dark / light is driven by `[data-theme]`.
 *
 * Design bias: every primitive renders with one wrapping element, no
 * nested Contexts, no `memo`. Thin enough that react DevTools stays
 * readable and unit-testing is trivial.
 */

import React, { type ChangeEvent, type CSSProperties, type ReactNode } from 'react';

// ─── Typography ─────────────────────────────────────────────────────────────

export function Caps({ children, size = 10, color, style }: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span style={{
      fontSize: size,
      fontWeight: 600,
      letterSpacing: 0.12,
      textTransform: 'uppercase',
      color: color ?? 'var(--ck-t2)',
      ...style,
    }}>{children}</span>
  );
}

export function Mono({ children, color, size, style }: {
  children: ReactNode;
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span style={{
      fontFamily: 'var(--ck-font-mono)',
      fontSize: size ?? 11,
      color: color ?? 'var(--ck-t0)',
      ...style,
    }}>{children}</span>
  );
}

// ─── Band — numbered section header ─────────────────────────────────────────

export function Band({ index, title, actions, children }: {
  index: string;
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="gc-band" style={{ margin: '16px 0 0' }}>
      <header style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '8px 0 6px',
        borderBottom: '1px solid var(--ck-border)',
      }}>
        <Mono color="var(--ck-green)" size={10}>{index}</Mono>
        <Caps size={11} color="var(--ck-t0)">{title}</Caps>
        <span style={{ flex: 1 }} />
        {actions}
      </header>
      <div style={{ padding: '8px 0 14px' }}>{children}</div>
    </section>
  );
}

// ─── Row — label + optional hint + control ─────────────────────────────────

export function Row({ label, hint, control, testId }: {
  label: string;
  hint?: string;
  control: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr',
        alignItems: 'center',
        columnGap: 20,
        padding: '8px 0',
        borderBottom: '1px solid color-mix(in srgb, var(--ck-border) 50%, transparent)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Caps size={10}>{label}</Caps>
        {hint && <span style={{ fontSize: 10, color: 'var(--ck-t3)' }}>{hint}</span>}
      </div>
      <div>{control}</div>
    </div>
  );
}

// ─── Sharp button (4 variants) ──────────────────────────────────────────────

export type BtnVariant = 'default' | 'action' | 'ghost' | 'danger';

const BTN_COLORS: Record<BtnVariant, { bg: string; fg: string; border: string }> = {
  default: {
    bg: 'var(--ck-card)',
    fg: 'var(--ck-t0)',
    border: 'var(--ck-border-hi)',
  },
  action: {
    bg: 'var(--ck-green)',
    fg: '#0b0e11',
    border: 'var(--ck-green)',
  },
  ghost: {
    bg: 'transparent',
    fg: 'var(--ck-t1)',
    border: 'var(--ck-border)',
  },
  danger: {
    bg: 'transparent',
    fg: 'var(--ck-red)',
    border: 'var(--ck-red)',
  },
};

export function SharpBtn({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  type = 'button',
  testId,
  style,
  className,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: BtnVariant;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  testId?: string;
  style?: CSSProperties;
  className?: string;
}) {
  const c = BTN_COLORS[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={className}
      style={{
        height: 26,
        padding: '0 10px',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 2,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.08,
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontFamily: 'var(--ck-font-sans)',
        ...style,
      }}
    >{children}</button>
  );
}

// ─── Icon input — input pill with left icon + right suffix ──────────────────

export function IconInput({
  value,
  onCommit,
  onChange,
  suffix,
  icon,
  numeric,
  placeholder,
  testId,
  style,
}: {
  value: string;
  onCommit?: (raw: string) => void;
  onChange?: (raw: string) => void;
  suffix?: ReactNode;
  icon?: ReactNode;
  numeric?: boolean;
  placeholder?: string;
  testId?: string;
  style?: CSSProperties;
}) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => { setLocal(value); }, [value]);

  const commit = () => {
    if (local !== value) onCommit?.(local);
  };

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      height: 30,
      padding: '0 10px',
      background: 'var(--ck-bg)',
      border: '1px solid var(--ck-border-hi)',
      borderRadius: 3,
      ...style,
    }}>
      {icon && <span style={{ display: 'inline-flex', color: 'var(--ck-t2)' }}>{icon}</span>}
      <input
        type={numeric ? 'number' : 'text'}
        value={local}
        onChange={(e) => { setLocal(e.target.value); onChange?.(e.target.value); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        placeholder={placeholder}
        data-testid={testId}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--ck-t0)',
          fontFamily: numeric ? 'var(--ck-font-mono)' : 'var(--ck-font-sans)',
          fontSize: 11,
          padding: 0,
        }}
      />
      {suffix && <Mono color="var(--ck-t3)" size={10}>{suffix}</Mono>}
    </div>
  );
}

// ─── Stepper — up/down buttons wrapping a numeric input ────────────────────

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  testId,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  testId?: string;
}) {
  const clamp = (n: number) => {
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    return n;
  };
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      height: 28,
      border: '1px solid var(--ck-border-hi)',
      borderRadius: 2,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        style={stepperBtn}
        aria-label="Decrement"
      >−</button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        data-testid={testId}
        style={{
          width: 50,
          height: '100%',
          background: 'var(--ck-bg)',
          border: 'none',
          outline: 'none',
          textAlign: 'center',
          color: 'var(--ck-t0)',
          fontFamily: 'var(--ck-font-mono)',
          fontSize: 11,
        }}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        style={stepperBtn}
        aria-label="Increment"
      >+</button>
    </div>
  );
}

const stepperBtn: CSSProperties = {
  width: 22,
  height: '100%',
  background: 'var(--ck-card)',
  border: 'none',
  color: 'var(--ck-t1)',
  cursor: 'pointer',
  fontFamily: 'var(--ck-font-mono)',
  fontSize: 12,
};

// ─── Pill toggle group ─────────────────────────────────────────────────────

export function PillGroup({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'inline-flex', gap: 0, ...style }}>{children}</div>
  );
}

export function PillBtn({
  active,
  onClick,
  children,
  disabled,
  title,
  testId,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      style={{
        height: 26,
        padding: '0 10px',
        background: active ? 'var(--ck-green-bg)' : 'transparent',
        border: '1px solid',
        borderColor: active ? 'var(--ck-green)' : 'var(--ck-border)',
        color: active ? 'var(--ck-green)' : 'var(--ck-t1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.06,
        textTransform: 'uppercase',
        opacity: disabled ? 0.4 : 1,
        marginLeft: -1,
      }}
    >{children}</button>
  );
}

// ─── Indicators ─────────────────────────────────────────────────────────────

export function DirtyDot({ on, title = 'Unsaved' }: { on?: boolean; title?: string }) {
  if (!on) return null;
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: 'var(--ck-amber)',
        boxShadow: 'var(--ck-led-amber-glow)',
        animation: 'gc-pulse 1.2s infinite',
      }}
    />
  );
}

export function Led({ on, color = 'amber', title }: {
  on?: boolean;
  color?: 'amber' | 'green';
  title?: string;
}) {
  if (!on) return null;
  const c = color === 'green' ? 'var(--ck-green)' : 'var(--ck-amber)';
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: 14,
        height: 3,
        background: c,
        boxShadow: color === 'green' ? 'var(--ck-led-green-glow)' : 'var(--ck-led-amber-glow)',
      }}
    />
  );
}

// ─── Toolbar button (for formatting toolbar) ───────────────────────────────

export function TBtn({
  children,
  active,
  disabled,
  onClick,
  title,
  testId,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      style={{
        width: 28,
        height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'var(--ck-green-bg)' : 'transparent',
        color: active ? 'var(--ck-green)' : 'var(--ck-t1)',
        border: 'none',
        borderRadius: 3,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
      }}
    >{children}</button>
  );
}

export function TGroup({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 1,
      padding: 3,
      background: 'color-mix(in srgb, var(--ck-card) 50%, transparent)',
      borderRadius: 4,
      ...style,
    }}>{children}</div>
  );
}

export function TDivider() {
  return (
    <span style={{
      display: 'inline-block',
      width: 1,
      height: 20,
      background: 'var(--ck-border)',
      margin: '0 4px',
    }} />
  );
}

// ─── Ghost icon button ─────────────────────────────────────────────────────

export function GhostIcon({
  children,
  onClick,
  title,
  testId,
  style,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  testId?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={testId}
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
        borderRadius: 3,
        padding: 0,
        ...style,
      }}
    >{children}</button>
  );
}

// ─── Inline rename input ────────────────────────────────────────────────────

export function TitleInput({
  value,
  onCommit,
  placeholder,
  testId,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => { setLocal(value); }, [value]);
  return (
    <input
      type="text"
      value={local}
      placeholder={placeholder}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onCommit(local); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') { setLocal(value); (e.currentTarget as HTMLInputElement).blur(); }
      }}
      data-testid={testId}
      style={{
        fontSize: 18,
        fontWeight: 600,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: 'var(--ck-t0)',
        padding: 0,
        width: '100%',
        fontFamily: 'var(--ck-font-sans)',
      }}
    />
  );
}

// ─── Meta cell (for the meta strip above an editor) ────────────────────────

export function MetaCell({ label, value, testId }: {
  label: string;
  value: ReactNode;
  testId?: string;
}) {
  return (
    <div data-testid={testId} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: '0 14px',
      borderRight: '1px solid var(--ck-border)',
    }}>
      <Caps size={9} color="var(--ck-t3)">{label}</Caps>
      <Mono color="var(--ck-t0)" size={12}>{value}</Mono>
    </div>
  );
}

// ─── Item card (for rule/group cards in master-detail editors) ─────────────

export function ItemCard({
  title,
  dirty,
  onSave,
  onDiscard,
  onDelete,
  children,
  testId,
}: {
  title: ReactNode;
  dirty?: boolean;
  onSave?: () => void;
  onDiscard?: () => void;
  onDelete?: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        border: '1px solid var(--ck-border)',
        borderRadius: 3,
        background: 'var(--ck-surface)',
        marginBottom: 10,
      }}
    >
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderBottom: '1px solid var(--ck-border)',
      }}>
        <DirtyDot on={dirty} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ck-t0)' }}>{title}</span>
        {onSave && (
          <SharpBtn
            variant={dirty ? 'action' : 'ghost'}
            disabled={!dirty}
            onClick={onSave}
            title="Save this card"
          >Save</SharpBtn>
        )}
        {onDiscard && <SharpBtn variant="ghost" onClick={onDiscard} disabled={!dirty}>Discard</SharpBtn>}
        {onDelete && <SharpBtn variant="danger" onClick={onDelete}>Delete</SharpBtn>}
      </header>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

// ─── Sub-tab strip ─────────────────────────────────────────────────────────

export interface TabItem {
  id: string;
  label: string;
}

export function TabStrip({ items, value, onChange }: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{
      display: 'inline-flex',
      gap: 0,
      borderBottom: '1px solid var(--ck-border)',
    }}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${active ? 'var(--ck-green)' : 'transparent'}`,
              color: active ? 'var(--ck-t0)' : 'var(--ck-t2)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              letterSpacing: 0.1,
              textTransform: 'uppercase',
              marginBottom: -1,
            }}
          >{item.label}</button>
        );
      })}
    </div>
  );
}
