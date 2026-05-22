/**
 * Shared primitives for the formatter surfaces.
 *
 * Both `<FormattingToolbar />` (horizontal) and
 * `<FormattingPropertiesPanel />` (vertical) compose modules out of
 * these atoms — the same primitive renders in both contexts and the
 * `.fx-shell--horizontal` / `.fx-shell--vertical` parent class handles
 * the layout switch via the stylesheet. No layout branching in JS.
 */
import * as React from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { Button } from '@starui/ui';
import { cn, Tooltip } from '@starui/grid/customizer';

export type Orientation = 'horizontal' | 'vertical';

// ─── Pill — generic toggleable button ─────────────────────────────
//
// `pillClasses(variant)` is the shared Tailwind class chain for toolbar
// pills. `Pill` and `PillButton` both resolve through it → design-system
// tokens → `@starui/design-system`.

export function pillClasses(variant: 'icon' | 'text' | 'narrow' = 'icon'): string {
  // Note: matches what Pill / PillButton emit. Keep in sync.
  return [
    // shadcn `<Button size="sm">` baseline equivalent.
    'inline-flex items-center justify-center whitespace-nowrap shrink-0',
    'h-7 rounded-[3px] border border-transparent bg-transparent shadow-none',
    'text-foreground text-[11px] leading-none gap-1 font-medium cursor-pointer',
    'transition-colors disabled:opacity-[0.38] disabled:cursor-not-allowed',
    // Per-variant min-width + padding + (text variant: mono font).
    variant === 'icon' && 'min-w-7 px-1.5',
    variant === 'text' && 'min-w-[30px] px-2 font-mono text-[10px] tracking-[0.04em]',
    variant === 'narrow' && 'min-w-[18px] px-[3px]',
    // Rest hover — subtle fill, no box chrome.
    'hover:bg-accent/40 hover:text-foreground hover:border-transparent',
    // Active — brand-primary fill (matches every other active CTA).
    'data-[on=true]:bg-primary data-[on=true]:text-primary-foreground data-[on=true]:border-primary',
    'data-[on=true]:hover:bg-primary data-[on=true]:hover:border-primary',
    // Focus ring — 1px brand outline.
    'focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary focus-visible:outline-offset-1 focus-visible:ring-0',
  ].filter(Boolean).join(' ');
}

export interface PillProps {
  active?: boolean;
  disabled?: boolean;
  tooltip?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  variant?: 'icon' | 'text' | 'narrow';
  'data-testid'?: string;
  'aria-label'?: string;
}

export function Pill({
  active,
  disabled,
  tooltip,
  onClick,
  className,
  children,
  variant = 'icon',
  ...rest
}: PillProps) {
  // Toolbar pill — shadcn `<Button variant="ghost" size="sm">` styled
  // entirely via Tailwind utilities that resolve through the
  // `@starui/design-system` token tree (no `.fx-*` CSS dependency).
  //   • size="sm" → `h-[28px]` (matches the formatter's pill rhythm)
  //   • Rest = borderless; active = primary fill on `data-on="true"`
  //   • Hover = subtle `bg-accent/40` only
  //
  // No tailwind/formatter.css cascade fight (the previous wrapper hit
  // `--fx-pill-h` via formatter.css but `h-auto` from Tailwind utility
  // layer shadowed it; outcome was 15px-tall pills).
  const btn = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      data-testid={rest['data-testid']}
      aria-label={rest['aria-label'] ?? tooltip}
      aria-pressed={typeof active === 'boolean' ? active : undefined}
      data-on={active ? 'true' : undefined}
      className={cn(pillClasses(variant), className)}
      onMouseDown={(e) => {
        // Mousedown-driven so popovers / focus traps don't eat the click.
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && onClick) onClick();
      }}
    >
      {children}
    </Button>
  );
  if (tooltip) return <Tooltip content={tooltip}>{btn}</Tooltip>;
  return btn;
}

/** shadcn `Button` with toolbar pill styling — for triggers, menus, and
 *  popovers that need `forwardRef` + mousedown-driven interaction. */
export const PillButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button> & { pillVariant?: 'icon' | 'text' | 'narrow' }
>(function PillButton(
  { pillVariant = 'icon', className, onMouseDown, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      className={cn(pillClasses(pillVariant), className)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMouseDown?.(e);
      }}
      {...props}
    />
  );
});

// ─── SplitPill — primary action + chevron menu trigger ────────────
//
// Split controls sit side-by-side with a hairline gap — no joined
// border chrome (ButtonGroup's shared outline read as extra enclosure).

export function SplitPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {children}
    </div>
  );
}

// ─── Hairline divider between sub-groups inside a module ──────────

export function Hair() {
  return <span aria-hidden className="fx-hair" />;
}

// ─── Module — eyebrow + body. One component, two layouts. ─────────

export interface ModuleProps {
  /** Two-digit index — `'01'` … `'05'`. */
  index: string;
  /** Display label, ALL-CAPS. */
  label: string;
  /** Module body. */
  children: React.ReactNode;
  /** Optional class hook. */
  className?: string;
  /** Optional data-testid for the module wrapper. */
  testId?: string;
}

export function Module({ index, label, children, className, testId }: ModuleProps) {
  return (
    <div className={cn('fx-module', className)} data-module-index={index} data-testid={testId}>
      <span className="fx-eyebrow">
        <span className="fx-eyebrow__num">{index}</span>
        <span className="fx-eyebrow__sep">·</span>
        <span className="fx-eyebrow__lbl">{label}</span>
      </span>
      <div className="fx-module__body">{children}</div>
    </div>
  );
}

// ─── Divider between modules in horizontal mode ──────────────────

export function ModuleDivider() {
  return <span aria-hidden className="fx-divider" />;
}

// ─── ToolbarGroup — labeled cluster in the horizontal strip ───────

export function ToolbarGroup({
  label,
  children,
  variant = 'default',
  testId,
  className,
}: {
  label: string;
  children: React.ReactNode;
  variant?: 'default' | 'destruct';
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'fx-toolbar-group',
        variant === 'destruct' && 'fx-toolbar-group--destruct',
        className,
      )}
      data-testid={testId}
      role="group"
      aria-label={label}
    >
      <span className="fx-toolbar-group__label" aria-hidden>
        {label}
      </span>
      <div className="fx-toolbar-group__body">{children}</div>
    </div>
  );
}

// ─── PanelGroup — labeled section card in the vertical popout ─────

export function PanelGroup({
  label,
  children,
  variant = 'default',
  testId,
  className,
  sectionIndex,
}: {
  label: string;
  children: React.ReactNode;
  variant?: 'default' | 'destruct';
  testId?: string;
  className?: string;
  /** Legacy hook for e2e — mirrors the old module section indices. */
  sectionIndex?: string;
}) {
  return (
    <section
      className={cn(
        'fx-panel-group',
        variant === 'destruct' && 'fx-panel-group--destruct',
        className,
      )}
      data-testid={testId}
      data-section-index={sectionIndex}
      aria-label={label}
    >
      <h3 className="fx-panel-group__label">{label}</h3>
      <div className="fx-panel-group__body">{children}</div>
    </section>
  );
}

// ─── Column label readout — sunken chip with live dot ────────────

export function ColumnLabel({
  colLabel,
  disabled,
  testId,
}: {
  colLabel: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <span
      className="fx-col"
      data-disabled={disabled ? 'true' : undefined}
      data-testid={testId}
    >
      <span className="fx-col__dot" aria-hidden />
      <span className="fx-col__name">{colLabel}</span>
    </span>
  );
}

// ─── Scope toggle — CELL ⇄ HEADER (legacy single-label form) ──────
//
// Kept for the vertical popped panel and any consumer still using the
// arrow-swap presentation. Horizontal toolbar uses `SegmentedToggle`
// below for a clearer dual-label look.

export function ScopeToggle({
  target,
  onToggle,
  testId,
}: {
  target: 'cell' | 'header';
  onToggle: () => void;
  testId?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      role="switch"
      aria-checked={target === 'header'}
      aria-label={`Edit ${target === 'cell' ? 'cell' : 'header'} (click to switch)`}
      data-testid={testId}
      data-target={target}
      className="fx-scope"
      onClick={onToggle}
      onMouseDown={(e) => e.preventDefault()}
      title={`Click to edit ${target === 'cell' ? 'header' : 'cell'}`}
    >
      <span>{target.toUpperCase()}</span>
      <ArrowLeftRight size={9} strokeWidth={2} className="fx-scope__swap" aria-hidden />
    </Button>
  );
}

// ─── SegmentedToggle — two-icon switch with both options visible ──
//
// Icon-only segmented control. Both options show simultaneously; the
// active option is filled, the inactive option is dim. Each option
// carries its own tooltip so the meaning is one hover away. Used for
// CELLS ⇄ HEADERS and SELECTED ⇄ ALL — same shape, different icons.
// Stays compact (≈64px wide) so it doesn't dominate the toolbar.

export interface SegmentedToggleOption<T extends string> {
  value: T;
  /** Pre-rendered icon node — use a lucide icon at `size={14}`. */
  icon: React.ReactNode;
  /** Hover tooltip — describes what the option means. */
  tooltip: string;
  /** Optional ARIA label override; defaults to the tooltip. */
  ariaLabel?: string;
  testId?: string;
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  variant,
  testId,
}: {
  value: T;
  options: [SegmentedToggleOption<T>, SegmentedToggleOption<T>];
  onChange: (next: T) => void;
  ariaLabel: string;
  /** Cosmetic — drives the data-attribute used by CSS for distinct
   *  hue/weight (still uses the brand primary as the active fill). */
  variant?: 'target' | 'scope';
  testId?: string;
}) {
  // Implementation note — the toolbar tests assert that the active
  // state flips on `fireEvent.mouseDown`, and consumers depend on the
  // mousedown-driven UX to survive popover focus traps (a popover's
  // focus trap can swallow click events but not mousedown). That
  // contract is incompatible with radix ToggleGroup's click-driven
  // `onValueChange`, so this primitive stays a hand-rolled radiogroup
  // of shadcn `Button` chips (`role="radio"`). Visuals flow through
  // `@starui/design-system` tokens via Tailwind utilities.
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-variant={variant}
      data-testid={testId}
      className={cn(
        // Container — 28px tall with 2px inner padding (the active
        // chip floats inside this padding ring). Subtle muted-fill
        // background distinguishes the segmented control from
        // surrounding pills.
        'inline-flex items-stretch h-7 shrink-0 isolate gap-0.5',
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const btn = (
          <Button
            key={opt.value}
            type="button"
            variant="ghost"
            size="sm"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.ariaLabel ?? opt.tooltip}
            data-active={isActive ? 'true' : undefined}
            data-testid={opt.testId}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isActive) onChange(opt.value);
            }}
            className={cn(
              // Option chip — fills the container vertically (h-full
              // = 22px after the container's 2px padding) and a fixed
              // 26px width gives each segment a square clickable area.
              'inline-flex items-center justify-center w-[26px] h-full min-h-0 min-w-[26px] p-0 cursor-pointer select-none',
              'border-none bg-transparent shadow-none rounded-[3px]',
              'transition-colors transition-shadow transition-duration-[120ms]',
              // Rest — muted icon colour.
              'text-muted-foreground',
              // Hover (not active) — strengthen to full ink.
              'hover:bg-transparent hover:text-foreground data-[active=true]:hover:text-primary-foreground',
              // Active — brand-primary fill, primary-foreground glyph,
              // subtle inset highlight for the "lift" feel.
              'data-[active=true]:bg-primary data-[active=true]:text-primary-foreground',
              'data-[active=true]:shadow-[0_1px_0_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.18)]',
              // Focus ring — brand outline, sits 1px outside the chip.
              'focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary focus-visible:outline-offset-1 focus-visible:ring-0',
            )}
          >
            {opt.icon}
          </Button>
        );
        return (
          <Tooltip key={opt.value} content={opt.tooltip}>
            {btn}
          </Tooltip>
        );
      })}
    </div>
  );
}

// ─── Preview readout — phosphor amber, monospace ─────────────────

export function PreviewReadout({
  value,
  testId,
}: {
  value: string;
  testId?: string;
}) {
  return (
    <Tooltip content="Live preview — current format against a sample value">
      <span className="fx-preview" data-testid={testId}>
        <span className="fx-preview__lbl">Preview</span>
        <span className="fx-preview__val">{value || '—'}</span>
      </span>
    </Tooltip>
  );
}

// ─── Title bar — only renders inside the popped panel under
//     OpenFin's frameless mode. ────────────────────────────────────

export function TitleBar({
  text,
  onClose,
  testId,
}: {
  text: string;
  onClose: () => void;
  testId?: string;
}) {
  return (
    <div className="fx-titlebar" data-testid={testId}>
      <span>{text}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="fx-titlebar__close"
        onClick={onClose}
        aria-label="Close"
        data-testid="fmt-panel-close"
        title="Close"
      >
        <X size={14} strokeWidth={2} />
      </Button>
    </div>
  );
}

// Menu / MenuItem / MenuSep primitives removed in PR #47.
// Consumers migrated to shadcn `<DropdownMenu>` / `<DropdownMenuItem>` /
// `<DropdownMenuSeparator>` from `@starui/ui`. The custom primitives
// duplicated radix DropdownMenu's surface + row + separator with no
// behavioural win — radix gives us keyboard nav, focus management,
// escape handling, and ARIA roles for free.
