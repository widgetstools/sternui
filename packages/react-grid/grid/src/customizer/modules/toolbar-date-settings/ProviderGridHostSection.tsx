import { useMemo, type ReactElement } from 'react';
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@starui/ui';
import { CalendarIcon, Pencil, RefreshCw, RotateCw } from 'lucide-react';
import type { DataProviderConfig } from '@starui/shared-types';
import { SettingsRow as Row, SubLabel } from '../../ui/SettingsPanel';
import { useProviderGridHost } from '../../providerGridHost/ProviderGridHostContext';

function isoToDate(iso: string | null): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function dateToIso(date: Date | undefined): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ProviderSelectRow({
  label,
  testId,
  value,
  providers,
  onChange,
  disabled,
}: {
  label: string;
  testId: string;
  value: string | null;
  providers: readonly DataProviderConfig[];
  onChange(id: string | null): void;
  disabled?: boolean;
}): ReactElement {
  return (
    <Row
      label={label}
      hint="Saved DataProvider config attached to this grid instance."
      data-testid={testId}
      control={(
        <Select
          value={value ?? '__none__'}
          onValueChange={(v) => onChange(v === '__none__' ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 min-w-[220px] text-xs" data-testid={testId}>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs text-muted-foreground">— None —</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.providerId} value={p.providerId!} className="text-xs">
                {p.name}
                <span className="ml-2 text-[10px] uppercase text-muted-foreground">{p.providerType}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

export function ProviderGridHostSection(): ReactElement | null {
  const host = useProviderGridHost();
  const activeId = host?.mode === 'live' ? host.liveProviderId : host?.historicalProviderId;

  const asOfDate = host?.asOfDate ?? null;
  const selectedDate = useMemo(() => isoToDate(asOfDate), [asOfDate]);

  if (!host?.available) {
    return (
      <div className="border-b border-[color:var(--ds-border-primary)] p-3">
        <SubLabel>DATA PROVIDER</SubLabel>
        <p className="text-[11px] text-[color:var(--ds-text-secondary)]">
          Provider selection and refresh controls are available when the grid
          is hosted by MarketsGridContainer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 border-b border-[color:var(--ds-border-primary)] p-3" data-testid="provider-grid-host-section">
      <SubLabel>DATA PROVIDER</SubLabel>
      <p className="mb-3 text-[11px] text-[color:var(--ds-text-secondary)]">
        Grid-level provider selection persists across profile switches. Changes
        apply immediately — no profile Save required.
      </p>

      <ProviderSelectRow
        label="LIVE"
        testId="provider-live-select"
        value={host.liveProviderId}
        providers={host.liveProviders}
        onChange={host.onLiveChange}
      />

      <ProviderSelectRow
        label="HISTORICAL"
        testId="provider-hist-select"
        value={host.historicalProviderId}
        providers={host.historicalProviders}
        onChange={host.onHistoricalChange}
        disabled={host.historicalProviders.length === 0 && host.historicalProviderId === null}
      />

      <Row
        label="MODE"
        hint="Switch between live streaming and historical snapshot providers."
        data-testid="provider-mode-toggle"
        control={(
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={host.mode === 'live' ? 'default' : 'outline'}
              className="h-8 px-3 text-xs"
              onClick={() => host.onModeChange('live')}
              disabled={!host.liveProviderId}
            >
              Live
            </Button>
            <Button
              type="button"
              size="sm"
              variant={host.mode === 'historical' ? 'default' : 'outline'}
              className="h-8 px-3 text-xs"
              onClick={() => host.onModeChange('historical')}
              disabled={!host.historicalProviderId}
            >
              Hist
            </Button>
          </div>
        )}
      />

      {host.mode === 'historical' && host.historicalProviderId ? (
        <Row
          label="AS OF"
          hint="Historical snapshot date (ISO YYYY-MM-DD)."
          data-testid="provider-asof-date"
          control={(
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 justify-start font-mono text-xs">
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {asOfDate ?? <span className="text-muted-foreground">Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => host.onAsOfDateChange(dateToIso(d))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          )}
        />
      ) : null}

      <Row
        label="ACTIONS"
        hint="Refresh replays hub cache; Reload reconnects upstream."
        data-testid="provider-actions"
        control={(
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              onClick={host.onRefreshView}
              data-testid="provider-refresh-view"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh view
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              onClick={host.onReloadFromSource}
              data-testid="provider-reload-from-source"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Reload
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => activeId && host.onEditProvider(activeId)}
              disabled={!activeId}
              title="Edit selected provider"
              data-testid="provider-edit-selected"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      />
    </div>
  );
}
