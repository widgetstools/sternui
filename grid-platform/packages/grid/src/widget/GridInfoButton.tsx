/**
 * GridInfoButton — small ⓘ button that surfaces the grid identity
 * tuple (path, instanceId, gridId, appId, userId) in a popover for
 * support and debugging.
 *
 * View-only. Replaces the legacy hover-to-reveal overlay that used to
 * live in the host shell. Colors come from design-system CSS variables
 * so dark/light theme switching is automatic.
 */

import type { ReactElement } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@stargrid/grid/customizer';
import { Info } from 'lucide-react';

export interface GridInfoButtonProps {
  readonly componentName: string | undefined;
  readonly gridId: string;
  readonly instanceId: string | undefined;
  readonly appId: string | undefined;
  readonly userId: string | undefined;
}

export function GridInfoButton({
  componentName,
  gridId,
  instanceId,
  appId,
  userId,
}: GridInfoButtonProps): ReactElement {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const resolvedInstanceId = instanceId ?? gridId;
  return (
    <>
      <span className="ds-primary-divider" aria-hidden />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="ds-primary-action"
            title="Grid info"
            aria-label="Grid info"
            data-testid="grid-info-btn"
          >
            <Info size={14} strokeWidth={2} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[360px] p-0 text-xs"
          data-ds-settings
        >
          {componentName && (
            <div
              className="px-3 py-2 border-b text-[13px] font-semibold"
              style={{
                color: 'var(--ds-text-primary)',
                borderColor: 'var(--ds-border-primary)',
              }}
            >
              {componentName}
            </div>
          )}
          <div className="px-3 py-2 flex flex-col gap-1.5">
            <InfoRow label="path"        value={path}                mono />
            <InfoRow label="instanceId"  value={resolvedInstanceId}  mono />
            <InfoRow label="gridId"      value={gridId}              mono />
            <InfoRow label="appId"       value={appId ?? '—'} />
            <InfoRow label="userId"      value={userId ?? '—'} />
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span
        className="shrink-0"
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: 'var(--ds-text-faint)',
          width: 80,
        }}
      >
        {label}
      </span>
      <span
        className="min-w-0 truncate"
        title={value}
        style={{
          color: 'var(--ds-text-primary)',
          fontFamily: mono
            ? "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace"
            : 'inherit',
          fontSize: 12,
        }}
      >
        {value}
      </span>
    </div>
  );
}
