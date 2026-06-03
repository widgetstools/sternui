/**
 * BehaviourFields — per-transport "behaviour" knobs.
 *
 * STOMP gets:
 *   - Reconnect initial delay (full backoff is tracked but unimplemented
 *     — stompjs's static `reconnectDelay`).
 *   - Realtime conflation + trailing-edge throttle (`conflateByKey` /
 *     `throttleMs`) — coalesce live deltas in the worker before fanning
 *     out. These are also settable in code on the provider config.
 *   - Snapshot chunk size (`snapshotChunkSize`) — rows per worker→main
 *     postMessage during the snapshot flush.
 * Other transports: no behaviour knobs today.
 */

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@starui/ui';
import type { ProviderConfig, StompProviderConfig } from '@starui/shared-types';

export interface BehaviourFieldsProps {
  cfg: ProviderConfig;
  onChange(next: Partial<ProviderConfig>): void;
}

/** Sentinel for "no conflation column" — Radix Select forbids empty-string values. */
const CONFLATE_NONE = '__none__';

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

/** Column names available for conflation, from column defs then inferred fields. */
function conflateFieldOptions(cfg: StompProviderConfig): string[] {
  const fromCols = (cfg.columnDefinitions ?? []).map((c) => c.field);
  if (fromCols.length > 0) return [...new Set(fromCols)];
  return [...new Set((cfg.inferredFields ?? []).map((f) => f.path))];
}

function StompBehaviour({ cfg, onChange }: { cfg: StompProviderConfig; onChange(next: Partial<StompProviderConfig>): void }) {
  const fieldOptions = conflateFieldOptions(cfg);
  return (
    <section className="rounded-lg border border-border bg-muted/30 p-4 space-y-5 max-w-md">
      {/* Reconnect */}
      <div className="space-y-3.5">
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
      </div>

      {/* Realtime updates — conflation + throttle */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Realtime updates</h3>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Throttle (ms)</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            min={0}
            max={10_000}
            step={50}
            value={cfg.throttleMs ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              onChange({ throttleMs: v > 0 ? v : undefined });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Coalesce live deltas into a trailing-edge burst every N ms. 0 = immediate
            (no batching). Conflation below only applies when this is set.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Conflate by key</Label>
          <Select
            value={cfg.conflateByKey ?? CONFLATE_NONE}
            onValueChange={(v) => onChange({ conflateByKey: v === CONFLATE_NONE ? undefined : v })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="(use key column)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CONFLATE_NONE}>(use key column)</SelectItem>
              {fieldOptions.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Within each throttle window, collapse repeated updates for the same key to
            the latest. Defaults to the provider's key column when left unset.
          </p>
        </div>
      </div>

      {/* Snapshot */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Snapshot</h3>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Chunk size (rows)</Label>
          <Input
            type="number"
            className="h-8 text-sm"
            min={1}
            max={100_000}
            step={100}
            value={cfg.snapshotChunkSize ?? 500}
            onChange={(e) => {
              const v = Math.floor(Number(e.target.value) || 0);
              onChange({ snapshotChunkSize: v > 0 ? v : undefined });
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Rows per worker→client frame when flushing the snapshot. Smaller chunks keep
            each main-thread message under the long-task budget. Default 500.
          </p>
        </div>
      </div>
    </section>
  );
}
