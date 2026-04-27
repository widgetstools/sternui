/**
 * DataProviderSelector — pick a saved DataProvider to attach to a widget.
 *
 * Sits on top of `dataProviderConfigService.listVisible(userId, …)`,
 * which merges public rows (stored under `userId='system'`) with the
 * caller's private rows. Each item shows a scope badge so users can
 * tell at a glance whether a provider is shared or theirs alone.
 *
 * Modes
 * -----
 *   • `dropdown` (default) — compact `<Select>` for embedding in a
 *     toolbar / settings row.
 *   • `list` — tall vertical card list with the same affordances;
 *     used inside the MarketsGrid customizer's Data section.
 *
 * Edit affordance
 * ---------------
 * The picker is read-only on click (selection only). When the user
 * needs to author/edit a provider, the parent surface is responsible
 * for opening the configurator (e.g. a "Manage…" button next to the
 * picker that mounts `<DataProviderEditor />` in a drawer/modal).
 * Keeping authoring out of this component keeps it usable as a plain
 * input in any settings context.
 */

import React, { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  ScrollArea,
  Button,
} from '@marketsui/ui';
import { Database, Plus, Pencil, RefreshCw, Loader2 } from 'lucide-react';
import type { DataProviderConfig, ProviderConfig } from '@marketsui/shared-types';
import { useVisibleDataProviders } from '../provider-editor/hooks/useDataProviderQueries.js';

/** userId='system' is the stored sentinel for public providers. */
const PUBLIC_USER_ID = 'system';

export interface DataProviderSelectorProps {
  /** Authenticated user id ('system' = public-only browsing). */
  userId: string;
  /**
   * Restrict the picker to a specific provider transport. Most widgets
   * want a single subtype (MarketsGrid's primary slot is `'stomp'`,
   * its historical slot is typically `'rest'`).
   */
  subtype?: ProviderConfig['providerType'];
  /** Selected providerId. `null` = nothing selected (empty placeholder). */
  value: string | null;
  onChange: (providerId: string | null) => void;
  /** Display style. */
  mode?: 'dropdown' | 'list';
  /** Disable the picker (e.g. when a parent flag is off). */
  disabled?: boolean;
  /** Hide the "Create new" affordance. Default: shown when `onCreate` is set. */
  hideCreate?: boolean;
  /** Click handler for the "Create new" button. When omitted, button hides. */
  onCreate?: () => void;
  /** Click handler for the "Edit" button next to the selected row. */
  onEdit?: (provider: DataProviderConfig) => void;
  /** Aria-label / placeholder text. */
  placeholder?: string;
  className?: string;
}

export const DataProviderSelector: React.FC<DataProviderSelectorProps> = ({
  userId,
  subtype,
  value,
  onChange,
  mode = 'dropdown',
  disabled = false,
  hideCreate = false,
  onCreate,
  onEdit,
  placeholder = 'Select a data provider…',
  className,
}) => {
  const { data: providers = [], isLoading, isFetching, refetch } = useVisibleDataProviders(userId, subtype);

  // Sort: public first, then by name asc — keeps the list scannable when
  // a user has many private providers.
  const sorted = useMemo(() => {
    const copy = providers.slice();
    copy.sort((a, b) => {
      const aPublic = a.userId === PUBLIC_USER_ID || a.public === true;
      const bPublic = b.userId === PUBLIC_USER_ID || b.public === true;
      if (aPublic !== bPublic) return aPublic ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [providers]);

  const selected = useMemo(
    () => sorted.find((p) => p.providerId === value) ?? null,
    [sorted, value],
  );

  const showCreate = !hideCreate && Boolean(onCreate);

  if (mode === 'dropdown') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <Select
          value={value ?? '__none__'}
          onValueChange={(v) => onChange(v === '__none__' ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 text-sm flex-1 min-w-0">
            <SelectValue placeholder={placeholder}>
              {selected ? <SelectedDisplay provider={selected} /> : placeholder}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {isLoading && (
              <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </div>
            )}
            {!isLoading && sorted.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No {subtype ? `${subtype.toUpperCase()} ` : ''}providers found.
              </div>
            )}
            <SelectItem value="__none__" className="text-muted-foreground">
              <span className="text-xs">— None —</span>
            </SelectItem>
            {sorted.map((p) => (
              <SelectItem key={p.providerId} value={p.providerId!}>
                <ProviderRow provider={p} compact />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && onEdit && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onEdit(selected)}
            disabled={disabled}
            title="Edit selected provider"
            className="h-8 w-8 p-0 shrink-0"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {showCreate && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCreate}
            disabled={disabled}
            className="h-8 shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New
          </Button>
        )}
      </div>
    );
  }

  // ── list mode ──────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col rounded-md border border-border bg-card ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="h-3.5 w-3.5" />
          <span>
            {sorted.length} {subtype ? `${subtype.toUpperCase()} ` : ''}provider{sorted.length === 1 ? '' : 's'} visible
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={disabled || isFetching}
            className="h-7 w-7 p-0"
            title="Refresh"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          {showCreate && (
            <Button type="button" size="sm" variant="outline" onClick={onCreate} disabled={disabled} className="h-7">
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="max-h-72">
        <div className="p-1">
          {isLoading && (
            <div className="px-3 py-4 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          )}
          {!isLoading && sorted.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No {subtype ? `${subtype.toUpperCase()} ` : ''}providers configured.
              {showCreate && (
                <div className="mt-2">
                  <Button type="button" size="sm" variant="outline" onClick={onCreate}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create your first
                  </Button>
                </div>
              )}
            </div>
          )}
          {sorted.map((p) => {
            const isSel = p.providerId === value;
            return (
              <button
                type="button"
                key={p.providerId}
                onClick={() => !disabled && onChange(p.providerId!)}
                disabled={disabled}
                className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-sm transition-colors ${
                  isSel ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                aria-pressed={isSel}
              >
                <ProviderRow provider={p} />
                {onEdit && isSel && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(p);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onEdit(p);
                      }
                    }}
                    className="ml-auto h-6 w-6 inline-flex items-center justify-center rounded hover:bg-background"
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────────────────

const SelectedDisplay: React.FC<{ provider: DataProviderConfig }> = ({ provider }) => (
  <span className="inline-flex items-center gap-2 truncate">
    <span className="truncate">{provider.name}</span>
    <ScopeBadge provider={provider} />
  </span>
);

const ProviderRow: React.FC<{ provider: DataProviderConfig; compact?: boolean }> = ({ provider, compact }) => (
  <span className="flex items-center gap-2 min-w-0 w-full">
    <span className="truncate flex-1 min-w-0">{provider.name}</span>
    <Badge variant="outline" className="text-[10px] shrink-0 uppercase">
      {provider.providerType}
    </Badge>
    <ScopeBadge provider={provider} />
    {!compact && provider.description && (
      <span className="text-[11px] text-muted-foreground truncate hidden md:inline">
        {provider.description}
      </span>
    )}
  </span>
);

const ScopeBadge: React.FC<{ provider: DataProviderConfig }> = ({ provider }) => {
  const isPublic = provider.userId === PUBLIC_USER_ID || provider.public === true;
  return (
    <Badge
      variant={isPublic ? 'secondary' : 'outline'}
      className="text-[10px] shrink-0"
      title={isPublic ? 'Public — visible to everyone in this app' : 'Private — visible to you only'}
    >
      {isPublic ? 'Public' : 'Private'}
    </Badge>
  );
};
