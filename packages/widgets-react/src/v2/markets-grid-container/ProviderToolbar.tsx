/**
 * ProviderToolbar — top strip the user reveals via Shift+Ctrl+P.
 *
 * Layout:
 *   [Live: <picker> ▾]  [Hist: <picker> ▾]  ( ○ Live  ● Hist )
 *   [📅 date-picker, only when historical mode + historicalId set]
 *   [↻ Refresh]  [✏ Edit selected]
 *
 * All inputs are shadcn primitives — no native controls, dark/light
 * via design-system tokens. The toolbar mounts inline above the grid
 * and is `flex-shrink-0` so it never gives up space when the grid
 * is hungry.
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button } from '@marketsui/ui';
import { RefreshCw, Pencil } from 'lucide-react';
import type { DataProviderConfig } from '@marketsui/shared-types';
import { DatePicker } from './DatePicker.js';

export type ProviderMode = 'live' | 'historical';

export interface ProviderToolbarProps {
  liveProviders: readonly DataProviderConfig[];
  historicalProviders: readonly DataProviderConfig[];
  liveProviderId: string | null;
  historicalProviderId: string | null;
  mode: ProviderMode;
  asOfDate: string | null;

  onLiveChange(id: string | null): void;
  onHistoricalChange(id: string | null): void;
  onModeChange(mode: ProviderMode): void;
  onAsOfDateChange(date: string | null): void;
  onRefresh(): void;
  onEdit(providerId: string): void;
}

export function ProviderToolbar(props: ProviderToolbarProps) {
  const {
    liveProviders, historicalProviders,
    liveProviderId, historicalProviderId,
    mode, asOfDate,
    onLiveChange, onHistoricalChange, onModeChange, onAsOfDateChange, onRefresh, onEdit,
  } = props;

  const activeId = mode === 'live' ? liveProviderId : historicalProviderId;

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-card/50 flex-shrink-0">
      {/* Live picker */}
      <ProviderPicker
        label="Live"
        value={liveProviderId}
        providers={liveProviders}
        onChange={onLiveChange}
      />

      {/* Historical picker */}
      <ProviderPicker
        label="Hist"
        value={historicalProviderId}
        providers={historicalProviders}
        onChange={onHistoricalChange}
        disabled={historicalProviders.length === 0 && historicalProviderId === null}
      />

      {/* Mode toggle — only enabled if a historical provider is set */}
      <div className="flex items-center gap-1 text-xs">
        <Button
          size="sm"
          variant={mode === 'live' ? 'default' : 'outline'}
          className="h-7 px-2 text-xs"
          onClick={() => onModeChange('live')}
          disabled={!liveProviderId}
        >
          Live
        </Button>
        <Button
          size="sm"
          variant={mode === 'historical' ? 'default' : 'outline'}
          className="h-7 px-2 text-xs"
          onClick={() => onModeChange('historical')}
          disabled={!historicalProviderId}
        >
          Hist
        </Button>
      </div>

      {/* Date picker — historical mode only */}
      {mode === 'historical' && historicalProviderId && (
        <DatePicker value={asOfDate} onChange={onAsOfDateChange} placeholder="As of…" />
      )}

      <div className="flex-1" />

      {/* Refresh */}
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRefresh} title="Refresh active provider">
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>

      {/* Edit selected */}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => activeId && onEdit(activeId)}
        disabled={!activeId}
        title="Edit selected provider"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

interface ProviderPickerProps {
  label: string;
  value: string | null;
  providers: readonly DataProviderConfig[];
  onChange(id: string | null): void;
  disabled?: boolean;
}

function ProviderPicker({ label, value, providers, onChange, disabled }: ProviderPickerProps) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground font-medium">{label}:</span>
      <Select
        value={value ?? '__none__'}
        onValueChange={(v) => onChange(v === '__none__' ? null : v)}
        disabled={disabled}
      >
        <SelectTrigger className="h-7 text-xs min-w-[180px]">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__" className="text-muted-foreground text-xs">— None —</SelectItem>
          {providers.map((p) => (
            <SelectItem key={p.providerId} value={p.providerId!} className="text-xs">
              {p.name}
              <span className="ml-2 text-[10px] text-muted-foreground uppercase">{p.providerType}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
