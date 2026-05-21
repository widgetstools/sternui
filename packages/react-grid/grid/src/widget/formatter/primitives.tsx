/**
 * Formatter primitives — shadcn controls + Tailwind layout (`--ds-*` tokens).
 * Keyframes / OpenFin drag: `formatter.css` only.
 */
import * as React from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { Button, ButtonGroup } from '@starui/ui';
import { cn, Tooltip } from '@starui/grid/customizer';

// ─── Shared token strings (palette-aware) ─────────────────────────

export const formatterMenuActiveClass =
  'bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]';

const chipActiveClass =
  'data-[on=true]:border-[color:var(--ds-primary)] data-[on=true]:bg-[color:var(--ds-primary)] data-[on=true]:text-[color:var(--ds-primary-foreground)]';

export const formatterMenuClass =
  'fx-menu [&_[role=menuitem]]:text-[11px] [&_[role=menuitem]]:leading-[1.2] [&_[role=menuitem]]:py-[5px]';

const toolbarBodyClass =
  'inline-flex items-center gap-1.5 min-w-0 flex-nowrap [&_button]:border-transparent [&_button]:bg-transparent [&_button:hover:not(:disabled):not([data-on=true])]:border-[color:color-mix(in_srgb,var(--ds-border-primary)_70%,transparent)] [&_button:hover:not(:disabled):not([data-on=true])]:bg-[color:color-mix(in_srgb,var(--ds-surface-tertiary)_55%,transparent)] [&_button[data-on=true]]:border-[color:var(--ds-primary)] [&_button[data-on=true]]:bg-[color:var(--ds-primary)] [&_button[data-on=true]]:text-[color:var(--ds-primary-foreground)]';

/** Pop-out trigger (hosted on toolbar trailing edge). */
export const formatterPopoutClass = [
  'absolute top-1/2 -translate-y-1/2 right-3 z-[3] w-7 h-7 inline-flex items-center justify-center',
  'rounded-[3px] border border-[color:var(--ds-border-primary)] bg-[var(--ds-surface-primary)]',
  'text-muted-foreground cursor-pointer transition-[color,border-color,background] duration-[120ms]',
  'hover:text-[color:var(--ds-primary)] hover:border-[color:var(--ds-primary-ring)] hover:bg-[color:var(--ds-primary-soft)]',
  'before:content-[""] before:absolute before:left-[-11px] before:top-[3px] before:bottom-[3px] before:w-px before:bg-[color:var(--ds-border-primary)] before:pointer-events-none',
  '[&_svg]:block [&_svg]:shrink-0',
].join(' ');

const colDotClass =
  'w-1.5 h-1.5 rounded-full shrink-0 bg-[color:var(--ds-primary)] shadow-[0_0_6px_var(--ds-primary)] animate-[fxLivePulse_1.6s_ease-in-out_infinite] [[data-disabled=true]_&]:bg-[color:var(--ds-text-faint)] [[data-disabled=true]_&]:shadow-none [[data-disabled=true]_&]:animate-none';

export const formatterColToolbarClass =
  'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[3px] border-0 bg-[color:color-mix(in_srgb,var(--ds-surface-tertiary)_35%,transparent)] font-mono text-[11px] text-foreground max-w-[200px] overflow-hidden whitespace-nowrap text-ellipsis';

export const formatterColPanelClass =
  'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[3px] bg-[var(--ds-surface-ground)] border border-[color:var(--ds-border-primary)] font-mono text-[11px] text-foreground flex-1 min-w-0 max-w-none overflow-hidden whitespace-nowrap text-ellipsis';

export const formatterColEditableToolbarClass =
  'group cursor-text pr-2 border-0 hover:bg-[color:color-mix(in_srgb,var(--ds-primary-soft)_55%,var(--ds-surface-tertiary))] disabled:cursor-not-allowed';

export const formatterColEditablePanelClass =
  'group cursor-text pr-2 border border-[color:var(--ds-border-primary)] transition-[border-color,background] duration-[120ms] hover:border-[color:var(--ds-primary-ring)] hover:bg-[color:color-mix(in_srgb,var(--ds-surface-ground)_60%,var(--ds-primary-soft))] disabled:cursor-not-allowed';

export const formatterColEditIconClass =
  'text-[color:var(--ds-text-faint)] opacity-50 shrink-0 transition-[color,opacity] duration-[120ms] group-hover:opacity-100 group-hover:text-[color:var(--ds-primary)] group-disabled:opacity-50';

// ─── Types ─────────────────────────────────────────────────────────

export type Orientation = 'horizontal' | 'vertical';
export type FormatterSurface = 'toolbar' | 'panel';

export function pillClasses(variant: 'icon' | 'text' | 'narrow' = 'icon'): string {
  return [
    'inline-flex items-center justify-center whitespace-nowrap shrink-0',
    'h-7 rounded-[3px] border-[1.5px] border-input bg-transparent',
    'text-foreground text-[11px] leading-none gap-1 font-medium cursor-pointer',
    'transition-colors disabled:opacity-[0.38] disabled:cursor-not-allowed',
    variant === 'icon' && 'min-w-7 px-1.5',
    variant === 'text' && 'min-w-[30px] px-2 font-mono text-[10px] tracking-[0.04em]',
    variant === 'narrow' && 'min-w-[18px] px-[3px]',
    'hover:bg-transparent hover:text-foreground hover:border-foreground/60',
    chipActiveClass,
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

export function SplitPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <ButtonGroup className={className}>{children}</ButtonGroup>;
}

export function Hair({ toolbar }: { toolbar?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block shrink-0 bg-[color:var(--ds-border-primary)]',
        toolbar ? 'w-px h-4 mx-1.5' : 'w-px h-3.5 mx-1',
      )}
    />
  );
}

export interface ModuleProps {
  index: string;
  label: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}

export function Module({ index, label, children, className, testId }: ModuleProps) {
  return (
    <div
      className={cn('flex items-center gap-1.5 min-h-7', className)}
      data-module-index={index}
      data-testid={testId}
      aria-label={label}
    >
      <div className="fx-module__body inline-flex items-center flex-nowrap gap-1.5 shrink-0">
        {children}
      </div>
    </div>
  );
}

export function ToolbarGroup({
  label,
  children,
  variant = 'default',
  testId,
  className,
  trail,
}: {
  label: string;
  children: React.ReactNode;
  variant?: 'default' | 'destruct';
  testId?: string;
  className?: string;
  trail?: boolean;
}) {
  const isScope = testId === 'fmt-group-scope';
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 min-h-7 pr-1.5 shrink-0 max-w-full min-w-0',
        'not-first:pl-3 not-first:ml-1 not-first:border-l not-first:border-[color:var(--ds-border-primary)]',
        trail && 'ml-auto shrink-0 grow-0',
        className,
      )}
      data-testid={testId}
      role="group"
      aria-label={label}
    >
      <span
        className={cn(
          'font-mono text-[9px] font-semibold tracking-[0.14em] uppercase text-[color:var(--ds-text-faint)]',
          'leading-none whitespace-nowrap select-none pr-0.5 shrink-0',
          variant === 'destruct' &&
            'text-[color:color-mix(in_srgb,var(--ds-accent-negative)_72%,var(--ds-text-faint))]',
        )}
        aria-hidden
      >
        {label}
      </span>
      <div
        className={cn(
          'fx-toolbar-group__body',
          toolbarBodyClass,
          isScope && 'min-w-0 flex-[0_1_auto]',
        )}
      >
        {children}
      </div>
    </div>
  );
}

const panelGroupShellClass =
  'fx-panel-group rounded-[5px] border border-[color:color-mix(in_srgb,var(--ds-border-primary)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-surface-ground)_72%,var(--ds-surface-primary))] overflow-hidden';

const panelGroupLabelClass =
  'fx-panel-group-label block m-0 px-3 pt-2 pb-1.5 font-mono text-[9px] font-semibold tracking-[0.14em] uppercase text-[color:var(--ds-text-faint)] leading-none border-b border-[color:color-mix(in_srgb,var(--ds-border-primary)_70%,transparent)] select-none';

export function PanelGroup({
  label,
  children,
  variant = 'default',
  testId,
  className,
  sectionIndex,
  inHeader,
  inFooter,
}: {
  label: string;
  children: React.ReactNode;
  variant?: 'default' | 'destruct';
  testId?: string;
  className?: string;
  sectionIndex?: string;
  inHeader?: boolean;
  inFooter?: boolean;
}) {
  return (
    <section
      className={cn(
        inHeader
          ? [
              'rounded-[5px] border border-[color:color-mix(in_srgb,var(--ds-border-primary)_85%,transparent)]',
              'bg-[color:color-mix(in_srgb,var(--ds-surface-ground)_72%,var(--ds-surface-primary))]',
              '[&_.fx-panel-group-label]:px-2.5 [&_.fx-panel-group-label]:pt-1.5 [&_.fx-panel-group-label]:pb-1',
              '[&_.fx-panel-group-body]:px-2.5 [&_.fx-panel-group-body]:pt-2 [&_.fx-panel-group-body]:pb-2.5',
            ].join(' ')
          : panelGroupShellClass,
        variant === 'destruct' &&
          'border-[color:color-mix(in_srgb,var(--ds-accent-negative)_28%,var(--ds-border-primary))] bg-[color:color-mix(in_srgb,var(--ds-accent-negative)_4%,var(--ds-surface-ground))]',
        inFooter &&
          'flex-1 min-w-0 border-0 bg-transparent [&_.fx-panel-group-label]:p-0 [&_.fx-panel-group-label]:pb-2 [&_.fx-panel-group-label]:border-0 [&_.fx-panel-group-body]:flex [&_.fx-panel-group-body]:flex-wrap [&_.fx-panel-group-body]:items-center [&_.fx-panel-group-body]:gap-2 [&_.fx-panel-group-body]:p-0',
        className,
      )}
      data-testid={testId}
      data-section-index={sectionIndex}
      aria-label={label}
    >
      <h3
        className={cn(
          panelGroupLabelClass,
          variant === 'destruct' &&
            'text-[color:color-mix(in_srgb,var(--ds-accent-negative)_72%,var(--ds-text-faint))]',
        )}
      >
        {label}
      </h3>
      <div className="fx-panel-group-body p-2.5 px-3 pb-3 [&_.fx-eyebrow]:hidden [&_.fx-module__body]:gap-2">
        {children}
      </div>
    </section>
  );
}

export function ColumnLabel({
  colLabel,
  disabled,
  testId,
  surface = 'toolbar',
}: {
  colLabel: string;
  disabled?: boolean;
  testId?: string;
  surface?: FormatterSurface;
}) {
  return (
    <span
      className={surface === 'panel' ? formatterColPanelClass : formatterColToolbarClass}
      data-disabled={disabled ? 'true' : undefined}
      data-testid={testId}
    >
      <span className={colDotClass} aria-hidden />
      <span className="truncate">{colLabel}</span>
    </span>
  );
}

export function ScopeToggle({
  target,
  onToggle,
  testId,
  surface = 'panel',
}: {
  target: 'cell' | 'header';
  onToggle: () => void;
  testId?: string;
  surface?: FormatterSurface;
}) {
  const base =
    'group inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[3px] font-mono text-[9px] font-semibold tracking-[0.18em] uppercase text-[color:var(--ds-primary)] cursor-pointer transition-all duration-[120ms] whitespace-nowrap';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={target === 'header'}
      aria-label={`Edit ${target === 'cell' ? 'cell' : 'header'} (click to switch)`}
      data-testid={testId}
      data-target={target}
      className={cn(
        base,
        surface === 'toolbar'
          ? 'border-0 bg-[color:color-mix(in_srgb,var(--ds-surface-tertiary)_35%,transparent)] hover:bg-[color:var(--ds-primary-soft)]'
          : 'bg-transparent border border-[color:var(--ds-border-primary)] hover:border-[color:var(--ds-primary-ring)] hover:bg-[color:var(--ds-primary-soft)]',
      )}
      onClick={onToggle}
      onMouseDown={(e) => e.preventDefault()}
      title={`Click to edit ${target === 'cell' ? 'header' : 'cell'}`}
    >
      <span>{target.toUpperCase()}</span>
      <ArrowLeftRight
        size={9}
        strokeWidth={2}
        className="opacity-50 transition-[transform,opacity] duration-200 group-hover:opacity-100 group-hover:rotate-180"
        aria-hidden
      />
    </button>
  );
}

export interface SegmentedToggleOption<T extends string> {
  value: T;
  icon: React.ReactNode;
  tooltip: string;
  ariaLabel?: string;
  testId?: string;
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
}: {
  value: T;
  options: [SegmentedToggleOption<T>, SegmentedToggleOption<T>];
  onChange: (next: T) => void;
  ariaLabel: string;
  variant?: 'target' | 'scope';
  testId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={testId}
      className="inline-flex items-stretch h-7 p-0.5 shrink-0 isolate rounded-[3px] border border-[color:var(--ds-border-primary)] bg-[color:color-mix(in_srgb,var(--ds-surface-tertiary)_40%,transparent)]"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const btn = (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.ariaLabel ?? opt.tooltip}
            data-on={isActive ? 'true' : undefined}
            data-testid={opt.testId}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isActive) onChange(opt.value);
            }}
            className={cn(
              'inline-flex items-center justify-center w-[26px] h-full p-0 appearance-none cursor-pointer select-none rounded-[3px]',
              'border border-transparent bg-transparent text-muted-foreground',
              'transition-[color,background,border-color] duration-[120ms] hover:text-foreground',
              chipActiveClass,
              'focus-visible:outline focus-visible:outline-1 focus-visible:outline-[color:var(--ds-primary)] focus-visible:outline-offset-1',
            )}
          >
            {opt.icon}
          </button>
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

export function PreviewReadout({
  value,
  testId,
}: {
  value: string;
  testId?: string;
}) {
  return (
    <Tooltip content="Live preview — current format against a sample value">
      <span
        className="inline-flex items-center gap-2 h-7 px-2.5 rounded-[3px] max-w-[240px] overflow-hidden whitespace-nowrap text-ellipsis font-mono text-[11px] tabular-nums bg-[color:var(--ds-overlay-warning-soft)] border border-[color:var(--ds-overlay-warning-ring)] text-[color:var(--ds-accent-warning)]"
        data-testid={testId}
      >
        <span className="text-[8px] font-semibold tracking-[0.22em] uppercase opacity-70 shrink-0">
          Preview
        </span>
        <span className="truncate font-medium">{value || '—'}</span>
      </span>
    </Tooltip>
  );
}

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
    <div
      className="fx-titlebar-host h-8 flex items-center justify-between gap-2 px-3 border-b border-[color:var(--ds-border-primary)] bg-[var(--ds-surface-ground)] shrink-0 font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ds-text-faint)] overflow-hidden [&>span]:flex-1 [&>span]:min-w-0 [&>span]:truncate"
      data-testid={testId}
    >
      <span>{text}</span>
      <button
        type="button"
        className="fx-titlebar-close bg-transparent border-0 text-muted-foreground cursor-pointer w-[22px] h-[22px] inline-flex items-center justify-center rounded-[3px] transition-all duration-[120ms] hover:bg-[color:color-mix(in_srgb,var(--ds-accent-negative)_18%,transparent)] hover:text-[color:var(--ds-accent-negative)]"
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
