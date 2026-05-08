import { type ReactNode } from 'react';
import { cn } from './utils';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <div className={cn('group relative inline-flex', className)}>
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="rounded bg-foreground px-1.5 py-0.5 text-[9px] text-background whitespace-nowrap shadow">
          {content}
        </div>
      </div>
    </div>
  );
}
