/**
 * RestBehaviourTab — REST-specific runtime knobs.
 *
 * REST is snapshot-only — the provider issues one fetch per `start()`
 * and immediately marks the snapshot complete; there's no persistent
 * connection to reconnect, so the STOMP `Reconnect policy` card is
 * inapplicable here.
 *
 * What stays relevant:
 *   • Conflate by key + throttle — applied by the worker's
 *     bufferedDispatch on every row emission. For REST these matter
 *     when the same provider is re-`restart()`-ed back-to-back (e.g.
 *     historical-mode date-picker drags) and consumers want trailing-
 *     edge coalescing rather than full snapshot replay each time.
 */

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@marketsui/ui';
import { Input, Label, Switch } from '@marketsui/ui';
import type { RestProviderConfig } from '@marketsui/shared-types';

interface RestBehaviourTabProps {
  config: RestProviderConfig;
  onChange: (field: string, value: unknown) => void;
}

export const RestBehaviourTab: React.FC<RestBehaviourTabProps> = ({ config, onChange }) => {
  const conflateEnabled = Boolean(config.conflateByKey);
  const throttleMs = config.throttleMs ?? 0;

  const setConflateByKey = (next: string | undefined): void =>
    onChange('conflateByKey', next || undefined);

  const setThrottleMs = (next: number): void =>
    onChange('throttleMs', next > 0 ? next : undefined);

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Conflate updates by key</CardTitle>
          <CardDescription className="text-xs">
            Within a throttle window, a second update for the same row
            replaces the first. For REST this is meaningful when the
            provider is re-fetched repeatedly (historical mode, polling
            via consumer-side restarts) and you want only the latest
            value per row to reach subscribers.
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
                Defaults to the row-identity column.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Throttle update fanout</CardTitle>
          <CardDescription className="text-xs">
            Coalesce row updates into trailing-edge bursts. <strong>0</strong> = off
            (immediate fanout). 50–200ms is the typical range when a grid
            consumer is sensitive to update jitter.
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
              Conflate is enabled but throttle is 0 — conflation only takes
              effect within a throttle window. Set throttle to something
              non-zero (try 100ms) for conflation to kick in.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
