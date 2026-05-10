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
 * Every visual dimension is sourced from the unified design-system tokens
 * (Tailwind utilities from the shared preset).
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
      className="font-semibold uppercase text-muted-foreground"
      style={{
        fontSize: size,
        letterSpacing,
        ...(color ? { color } : {}),
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
      className="font-mono tabular-nums text-foreground"
      style={{
        fontSize: size,
        ...(color ? { color } : {}),
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
      className="inline-flex items-center justify-center gap-1.5 h-7 px-3.5 rounded-sm font-semibold text-xs uppercase tracking-widest cursor-pointer border border-transparent disabled:opacity-45 disabled:cursor-not-allowed"
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
    <div
      className={
        wide
          ? 'inline-flex items-center gap-2.5 flex-wrap p-2.5 bg-card border border-border rounded-sm'
          : 'inline-flex items-center gap-0.5 px-1 py-0.5 bg-background border border-border rounded-sm'
      }
      style={style}
    >
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
      className="min-w-8 h-7 inline-flex items-center justify-center bg-transparent text-secondary px-1.5 rounded-sm hover:text-foreground hover:bg-muted aria-pressed:bg-[var(--ds-overlay-positive-soft)] aria-pressed:text-success disabled:opacity-45 disabled:cursor-not-allowed"
      data-testid={rest['data-testid']}
      style={width ? { width } : undefined}
    >
      {children}
    </button>
  );
}

export function TDivider() {
  return (
    <span
      className="inline-block w-px h-[22px] bg-border mx-1"
      aria-hidden
    />
  );
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
    <section
      className="px-6 pt-4 pb-1"
      style={flush ? { padding: 0 } : undefined}
    >
      <header
        className="flex items-center gap-3 mb-3 select-none"
        style={flush ? { padding: '16px 24px 12px' } : undefined}
      >
        {index && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums tracking-[0.06em]">
            {index}
          </span>
        )}
        <span className="font-semibold text-xs uppercase tracking-widest text-secondary">
          {title}
        </span>
        <span className="flex-1 h-px bg-border" />
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
    <div className="flex flex-col gap-1.5 min-w-0">
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
      className="bg-transparent border-none outline-none text-center tabular-nums text-foreground text-xs font-mono p-0"
      style={{
        width,
        height: 26,
        fontFamily: mono ? 'var(--ds-font-mono)' : 'var(--ds-font-sans)',
        fontSize: 12,
      }}
    />
  );
}
