import type { ReactNode } from 'react';
import { Button, cn } from '@starui/ui';
import { DynamicIcon as Icon } from '@starui/config-browser/icons';

type EditorButtonVariant = 'default' | 'primary' | 'danger';

export function EditorButton({
  onClick,
  title,
  icon,
  children,
  variant = 'default',
  disabled,
  className,
}: {
  onClick: () => void;
  title?: string;
  icon?: string;
  children?: ReactNode;
  variant?: EditorButtonVariant;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      variant={variant === 'primary' ? 'default' : 'outline'}
      size="sm"
      className={cn(
        'h-[30px] gap-1.5 px-2 text-xs font-medium font-[var(--de-font)] shadow-none',
        variant === 'primary' && 'bg-[var(--de-accent)] text-[hsl(var(--primary-foreground))] hover:bg-[var(--de-accent)] border-none px-3',
        variant === 'danger' &&
          'border-[color-mix(in_srgb,var(--de-danger,var(--ds-accent-negative))_35%,var(--de-border))] bg-[color-mix(in_srgb,var(--de-danger,var(--ds-accent-negative))_8%,var(--de-bg-surface))] text-[var(--de-danger,var(--ds-accent-negative))] hover:text-[var(--de-danger,var(--ds-accent-negative))]',
        variant === 'default' &&
          'border-[var(--de-border)] bg-[var(--de-bg-surface)] text-[var(--de-text-secondary)] hover:bg-[var(--de-bg-surface)]',
        disabled && 'opacity-40',
        className,
      )}
    >
      {icon ? <Icon icon={icon} className="w-3.5 h-3.5" /> : null}
      {children}
    </Button>
  );
}
