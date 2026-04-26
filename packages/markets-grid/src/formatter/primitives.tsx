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
import { cn, Tooltip } from '@marketsui/core';

export type Orientation = 'horizontal' | 'vertical';

// ─── Pill — generic toggleable button ─────────────────────────────

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
  const btn = (
    <button
      type="button"
      disabled={disabled}
      data-testid={rest['data-testid']}
      aria-label={rest['aria-label'] ?? tooltip}
      aria-pressed={typeof active === 'boolean' ? active : undefined}
      data-on={active ? 'true' : undefined}
      className={cn(
        'fx-pill',
        variant === 'text' && 'fx-pill--text',
        variant === 'narrow' && 'fx-pill--narrow',
        className,
      )}
      onMouseDown={(e) => {
        // Mousedown-driven so popovers / focus traps don't eat the click;
        // `onClick` would race the active-element change inside Radix
        // popovers. Mirrors the legacy TBtn behaviour exactly.
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && onClick) onClick();
      }}
    >
      {children}
    </button>
  );
  if (tooltip) return <Tooltip content={tooltip}>{btn}</Tooltip>;
  return btn;
}

// ─── SplitPill — primary action + chevron menu trigger ────────────

export function SplitPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('fx-split', className)}>{children}</div>;
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

// ─── Scope toggle — CELL ⇄ HEADER ─────────────────────────────────

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
    <button
      type="button"
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
    </button>
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
      <button
        type="button"
        className="fx-titlebar__close"
        onClick={onClose}
        aria-label="Close"
        data-testid="fmt-panel-close"
        title="Close"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

// ─── Menu — shared popover content surface (used by currency
//     menu, font-size menu, tick-precision menu). ─────────────────

export function Menu({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('fx-menu', className)}>{children}</div>;
}

export function MenuItem({
  glyph,
  name,
  sample,
  active,
  onClick,
  testId,
}: {
  glyph?: React.ReactNode;
  name: React.ReactNode;
  sample?: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="fx-menu__item"
      data-active={active ? 'true' : undefined}
      data-testid={testId}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      {glyph !== undefined && <span className="fx-menu__glyph">{glyph}</span>}
      <span className="fx-menu__name">{name}</span>
      {sample !== undefined && <span className="fx-menu__sample">{sample}</span>}
    </button>
  );
}

export function MenuSep() {
  return <div className="fx-menu__sep" />;
}
