import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@starui/ui';

/** Popover / select panel class — compact 12px typography matching the toolbar row. */
export const EDITING_TOOLBAR_POPOVER = 'ds-editing-toolbar-popover';

export interface EditingToolbarApplyButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  'data-testid'?: string;
}

/** Icon-only apply control (check mark) for editing toolbar segments. */
export function EditingToolbarApplyButton({
  className,
  disabled,
  ...props
}: EditingToolbarApplyButtonProps) {
  return (
    <button
      type="button"
      className={cn('ds-editing-toolbar__apply', className)}
      disabled={disabled}
      aria-label="Apply"
      title="Apply"
      {...props}
    >
      <Check size={14} strokeWidth={2.5} aria-hidden />
    </button>
  );
}

export interface EditingToolbarIconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  title?: string;
}

/** Compact square icon button aligned to toolbar control height (28px). */
export function EditingToolbarIconButton({
  className,
  children,
  title,
  ...props
}: EditingToolbarIconButtonProps) {
  return (
    <button
      type="button"
      className={cn('ds-editing-toolbar__icon-btn', className)}
      title={title ?? props['aria-label']}
      {...props}
    >
      {children}
    </button>
  );
}

export function EditingToolbarOpGroup({ children }: { children: ReactNode }) {
  return (
    <div className="ds-editing-toolbar__op-group" role="group">
      {children}
    </div>
  );
}

export interface EditingToolbarOpButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  'data-testid'?: string;
}

/** Segmented operation button inside an op group. */
export function EditingToolbarOpButton({
  className,
  disabled,
  ...props
}: EditingToolbarOpButtonProps) {
  return (
    <button
      type="button"
      className={cn('ds-editing-toolbar__op-btn', className)}
      disabled={disabled}
      {...props}
    />
  );
}

/** Shared compact control classes for inputs and select triggers. */
export const EDITING_TOOLBAR_CONTROL =
  'ds-editing-toolbar__control h-6 min-h-6 px-2 text-xs shadow-none';
