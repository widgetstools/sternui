import type { ReactNode } from 'react';

/**
 * Cockpit sub-tab strip — horizontal tabs with phosphor-green underline
 * for the active item. Used for in-editor view switches like Rule /
 * Preview. The top-level module tabs live in the SettingsSheet shell,
 * not here.
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 20px',
        borderBottom: '1px solid var(--ck-border, #2d3339)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => !item.disabled && onChange(item.value)}
              disabled={item.disabled}
              aria-pressed={active ? 'true' : 'false'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderBottom: active ? '2px solid var(--ck-green, #6ee7b7)' : '2px solid transparent',
                background: 'transparent',
                color: active
                  ? 'var(--ck-t0, #e5e7ea)'
                  : item.disabled
                    ? 'var(--ck-t3, #4a5360)'
                    : 'var(--ck-t1, #9ba3ad)',
                fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                letterSpacing: '0.02em',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                border: 'none',
                marginBottom: -1,
              }}
            >
              {item.label}
              {item.badge !== undefined && (
                <span
                  className="gc-mono"
                  style={{
                    fontSize: 10,
                    color: 'var(--ck-t3, #4a5360)',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {trailing && (
        <div
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--ck-t2, #6b7480)',
          }}
        >
          {trailing}
        </div>
      )}
    </div>
  );
}
