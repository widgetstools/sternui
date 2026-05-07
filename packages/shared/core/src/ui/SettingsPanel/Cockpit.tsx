import type { CSSProperties, ReactNode } from 'react';

/**
 * Cockpit Terminal atoms. Reusable voices composed by every editor:
 *
 *   - <Caps>   tracked-out small caps label (11px +0.1em uppercase).
 *   - <Mono>   IBM Plex Mono numeric / identifier.
 *   - <SharpBtn>  sharp-corner rectangular button, uppercase label.
 *   - <TGroup> / <TBtn> / <TDivider>  toolbar primitives.
 *   - <Band>   numbered section header (`01 EXPRESSION ───────`).
 *   - <MetaCell>  cell in the 4-column meta strip.
 *   - <Stepper>  narrow numeric input inside a TGroup.
 *
 * Every visual dimension is sourced from `v2-sheet-styles.ts` tokens so
 * the look stays single-sourced.
 */

// ─── Typography voices ────────────────────────────────────────────

export interface CapsProps {
  children: ReactNode;
  size?: number;
  color?: string;
  letterSpacing?: string;
  style?: CSSProperties;
}

export function Caps({ children, size = 11, color, letterSpacing = '0.1em', style }: CapsProps) {
  return (
    <span
      className="gc-caps"
      style={{
        fontSize: size,
        letterSpacing,
        color: color ?? 'var(--ck-t2)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export interface MonoProps {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function Mono({ children, size = 12, color, style }: MonoProps) {
  return (
    <span
      className="gc-mono"
      style={{
        fontSize: size,
        color: color ?? 'var(--ck-t0)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────

export type SharpBtnVariant = 'default' | 'action' | 'ghost' | 'danger';

export interface SharpBtnProps {
  children: ReactNode;
  variant?: SharpBtnVariant;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  style?: CSSProperties;
  'data-testid'?: string;
  type?: 'button' | 'submit';
}

export function SharpBtn({
  children,
  variant = 'default',
  disabled,
  onClick,
  title,
  style,
  type = 'button',
  ...rest
}: SharpBtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="gc-sharp-btn"
      data-variant={variant}
      data-testid={rest['data-testid']}
      style={style}
    >
      {children}
    </button>
  );
}

// ─── Toolbar primitives ──────────────────────────────────────────

export interface TGroupProps {
  children: ReactNode;
  wide?: boolean;
  style?: CSSProperties;
}

export function TGroup({ children, wide, style }: TGroupProps) {
  return (
    <div className={wide ? 'gc-tgroup gc-tgroup-wide' : 'gc-tgroup'} style={style}>
      {children}
    </div>
  );
}

export interface TBtnProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  width?: number;
  disabled?: boolean;
  'data-testid'?: string;
}

export function TBtn({ active, onClick, children, title, width, disabled, ...rest }: TBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={active ? 'true' : undefined}
      className="gc-tbtn"
      data-testid={rest['data-testid']}
      style={width ? { width } : undefined}
    >
      {children}
    </button>
  );
}

export function TDivider() {
  return <span className="gc-tbtn-divider" aria-hidden />;
}

// ─── Numbered band header ────────────────────────────────────────

export interface BandProps {
  /** "01", "02", … Rendered as the mono prefix before the title. */
  index?: string;
  title: string;
  trailing?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
}

export function Band({ index, title, trailing, children, flush }: BandProps) {
  return (
    <section className="gc-band" style={flush ? { padding: 0 } : undefined}>
      <header className="gc-band-header" style={flush ? { padding: '16px 24px 12px' } : undefined}>
        {index && <span className="gc-band-index">{index}</span>}
        <span className="gc-band-title">{title}</span>
        <span className="gc-band-rule" />
        {trailing}
      </header>
      {children}
    </section>
  );
}

// ─── Meta cell (4-column strip) ──────────────────────────────────

export interface MetaCellProps {
  label: string;
  value: ReactNode;
}

export function MetaCell({ label, value }: MetaCellProps) {
  return (
    <div className="gc-meta-cell">
      <Caps size={10}>{label}</Caps>
      <div>{value}</div>
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────

export interface StepperProps {
  value: string;
  onChange: (v: string) => void;
  width?: number;
  mono?: boolean;
  'data-testid'?: string;
}

export function Stepper({ value, onChange, width = 44, mono = true, ...rest }: StepperProps) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={rest['data-testid']}
      style={{
        width,
        height: 26,
        border: 'none',
        background: 'transparent',
        color: 'var(--ck-t0)',
        fontFamily: mono ? 'var(--ck-font-mono)' : 'var(--ck-font-sans)',
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'center',
        outline: 'none',
        padding: 0,
      }}
    />
  );
}
