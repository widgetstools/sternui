import type { ReactNode } from 'react';

/**
 * Sub-tab strip — horizontal tabs with accent underline for the active item.
 * Used for in-editor view switches like Rule / Preview. The top-level module
 * tabs live in the SettingsSheet shell, not here.
 */

export interface TabItem {
  value: string;
  label: ReactNode;
  /** Optional trailing badge (e.g. count). */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabStripProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  trailing?: ReactNode;
  'data-testid'?: string;
}

export function TabStrip({ items, value, onChange, trailing, ...rest }: TabStripProps) {
  return (
    <div
      data-testid={rest['data-testid']}
      className="flex items-center gap-4 px-5 border-b border-border"
    >
      <div className="flex items-stretch">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => !item.disabled && onChange(item.value)}
              disabled={item.disabled}
              aria-pressed={active ? 'true' : 'false'}
              className={[
                'inline-flex items-center gap-1.5 px-3.5 py-2 font-sans text-sm font-medium tracking-[0.02em] bg-transparent border-none cursor-pointer -mb-px transition-colors duration-[120ms]',
                active
                  ? 'text-foreground font-semibold border-b-2 border-primary'
                  : item.disabled
                    ? 'text-muted-foreground cursor-not-allowed border-b-2 border-transparent'
                    : 'text-secondary hover:text-foreground border-b-2 border-transparent',
              ].join(' ')}
              style={{ fontSize: 12 }}
            >
              {item.label}
              {item.badge !== undefined && (
                <span className="font-mono text-muted-foreground tabular-nums text-[10px]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {trailing && (
        <div className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {trailing}
        </div>
      )}
    </div>
  );
}
