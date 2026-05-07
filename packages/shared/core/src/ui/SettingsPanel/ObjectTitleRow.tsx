import type { ReactNode } from 'react';

/**
 * Editor identity row — Binance-style.
 *
 * Renders a title input (or title node) on the left and a cluster of
 * actions on the right. Generous padding to match the reference screens;
 * 56px tall footprint keeps the header distinct from the meta strip
 * beneath.
 */

export interface ObjectTitleRowProps {
  title: ReactNode;
  /** Optional prefix slot — we no longer render an id chip, but keep
   *  the slot so panels can render status badges here if they want. */
  id?: string;
  /** Deprecated — dirty state is shown via the Save button state now. */
  dirty?: boolean;
  actions?: ReactNode;
  'data-testid'?: string;
}

export function ObjectTitleRow({ title, actions, ...rest }: ObjectTitleRowProps) {
  return (
    <div
      data-testid={rest['data-testid']}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '20px 24px 12px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{title}</div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
