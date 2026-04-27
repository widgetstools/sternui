/**
 * BehaviourFields — per-transport "behaviour" knobs.
 *
 * Two transports get inputs here:
 *   - STOMP: reconnect initial delay (full backoff is tracked but
 *            unimplemented — stompjs's static `reconnectDelay`).
 *   - REST:  no behaviour knobs today.
 *
 * Conflate-by-key + throttle from v1 are dropped — the new container
 * relies on AG-Grid's `applyTransactionAsync` batching, which already
 * coalesces per-frame.
 */

import { Input, Label } from '@marketsui/ui';
import type { ProviderConfig, StompProviderConfig } from '@marketsui/shared-types';

export interface BehaviourFieldsProps {
  cfg: ProviderConfig;
  onChange(next: Partial<ProviderConfig>): void;
}

export function BehaviourFields({ cfg, onChange }: BehaviourFieldsProps) {
  if (cfg.providerType === 'stomp') {
    return <StompBehaviour cfg={cfg as StompProviderConfig} onChange={onChange as (n: Partial<StompProviderConfig>) => void} />;
  }
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
      No behaviour settings for {cfg.providerType.toUpperCase()} providers.
    </section>
  );
}

function StompBehaviour({ cfg, onChange }: { cfg: StompProviderConfig; onChange(next: Partial<StompProviderConfig>): void }) {
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-3.5 max-w-md">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reconnect</h3>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Initial Delay (ms)</Label>
        <Input
          type="number"
          className="h-8 text-sm"
          min={0}
          max={60_000}
          step={500}
          value={cfg.reconnect?.initialDelayMs ?? 5000}
          onChange={(e) => onChange({
            reconnect: { ...(cfg.reconnect ?? {}), initialDelayMs: Number(e.target.value) || 0 },
          })}
        />
        <p className="text-[11px] text-muted-foreground">
          Static delay between reconnect attempts. Full exponential backoff + jitter +
          max-attempts are reserved in the schema; not yet implemented.
        </p>
      </div>
    </section>
  );
}
