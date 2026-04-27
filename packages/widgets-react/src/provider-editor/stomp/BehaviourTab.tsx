/**
 * BehaviourTab — STOMP provider runtime knobs.
 *
 *   • Conflate by key — upsert-style coalescing of row updates
 *     keyed by a column. Two updates for the same key value within
 *     a window collapse into the latest.
 *   • Throttle (ms) — fanout window. 0 / off = immediate. Together
 *     with conflate, this caps how many flushes per second hit the
 *     subscriber port.
 *   • Reconnect — initial delay (in ms). The other reconnect knobs
 *     (maxDelay, jitter, maxAttempts) are reserved in the schema
 *     pending the full exp-backoff implementation; the form
 *     surfaces them as read-only chips so users see they're
 *     coming.
 *
 * The conflate / throttle defaults reflect "no buffering" — this
 * matches today's behaviour for a freshly-created provider.
 */

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@marketsui/ui';
import { Input, Label, Switch, Badge } from '@marketsui/ui';
import type { StompProviderConfig } from '@marketsui/shared-types';

interface BehaviourTabProps {
  config: StompProviderConfig;
  onChange: (field: string, value: unknown) => void;
}

export const BehaviourTab: React.FC<BehaviourTabProps> = ({ config, onChange }) => {
  const conflateEnabled = Boolean(config.conflateByKey);
  const throttleMs = config.throttleMs ?? 0;

  const setConflateByKey = (next: string | undefined): void =>
    onChange('conflateByKey', next || undefined);

  const setThrottleMs = (next: number): void =>
    onChange('throttleMs', next > 0 ? next : undefined);

  const setReconnectInitialDelayMs = (next: number): void => {
    const reconnect = { ...(config.reconnect ?? {}), initialDelayMs: next > 0 ? next : undefined };
    onChange('reconnect', reconnect);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Conflate by key */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Conflate updates by key</CardTitle>
          <CardDescription className="text-xs">
            Within a throttle window, a second update for the same row replaces
            the first. Maps cleanly onto AG-Grid's <code>applyTransaction(&#123; update &#125;)</code> upsert
            semantics. Off by default — every update is delivered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              id="conflate-enabled"
              checked={conflateEnabled}
              onCheckedChange={(next: boolean) => setConflateByKey(next ? config.keyColumn || '' : undefined)}
            />
            <Label htmlFor="conflate-enabled" className="text-xs cursor-pointer">
              {conflateEnabled ? 'Enabled' : 'Disabled'}
            </Label>
          </div>
          {conflateEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="conflate-key" className="text-xs font-medium text-muted-foreground">
                Conflate by column
              </Label>
              <Input
                id="conflate-key"
                value={config.conflateByKey ?? ''}
                onChange={(e) => setConflateByKey(e.target.value)}
                placeholder={config.keyColumn || 'e.g. orderId'}
                className="h-8 text-sm font-mono max-w-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Defaults to the row-identity column. Override only if you want
                multiple rows-per-id coalescing (rare).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Throttle window */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Throttle update fanout</CardTitle>
          <CardDescription className="text-xs">
            Coalesce row updates into trailing-edge bursts. <strong>0</strong> = off
            (immediate fanout). <strong>50–200ms</strong> is a comfortable range for
            high-frequency streams driving a grid; tune higher if the grid feels
            jittery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="throttle-ms" className="text-xs font-medium text-muted-foreground">
              Window (ms)
            </Label>
            <Input
              id="throttle-ms"
              type="number"
              min={0}
              max={5000}
              step={10}
              value={throttleMs}
              onChange={(e) => setThrottleMs(Number(e.target.value) || 0)}
              className="h-8 text-sm"
            />
          </div>
          {!throttleMs && conflateEnabled && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              Conflate is enabled but throttle is 0 — conflation only takes effect
              within a throttle window. Set throttle to something non-zero
              (try 100ms) for conflation to kick in.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reconnect */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Reconnect policy</CardTitle>
          <CardDescription className="text-xs">
            On dropped WebSocket, how long to wait before reconnecting. Today
            only the initial delay is honoured (becomes stompjs's static
            <code> reconnectDelay</code>); full exponential backoff + jitter +
            max-attempts is on the runtime roadmap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="reconnect-initial" className="text-xs font-medium text-muted-foreground">
              Initial delay (ms)
            </Label>
            <Input
              id="reconnect-initial"
              type="number"
              min={0}
              max={60_000}
              step={500}
              value={config.reconnect?.initialDelayMs ?? 5000}
              onChange={(e) => setReconnectInitialDelayMs(Number(e.target.value) || 0)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge variant="outline" className="text-[10px]">Coming: maxDelayMs</Badge>
            <Badge variant="outline" className="text-[10px]">Coming: jitter</Badge>
            <Badge variant="outline" className="text-[10px]">Coming: maxAttempts</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
