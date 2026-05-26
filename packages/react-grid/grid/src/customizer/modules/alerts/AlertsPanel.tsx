/**
 * Alerts customizer panel — list + per-rule editor + module settings band.
 *
 * Mounted three ways:
 *   - SettingsSheet auto-picks `SettingsPanel` (this file's `AlertsPanel`).
 *   - Master-detail layouts may instead use `ListPane` + `EditorPane` directly.
 *   - The settings band is reused inside the toolbar bell popover so users
 *     can mute / re-enable alerts without opening the full sheet.
 *
 * All form controls are shadcn primitives from `@starui/ui` — no native
 * `<input>`, `<select>`, or `<button>` (per CLAUDE.md UI stack rules).
 */

import { useCallback, useMemo, useState } from 'react';
import { Bell, Copy, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Slider,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@starui/ui';
import type { EditorPaneProps, ListPaneProps } from '@starui/engine';
import {
  DEFAULT_ALERTS_SETTINGS,
  type AlertChannel,
  type AlertRule,
  type AlertSeverity,
  type AlertsSettings,
  type AlertsState,
  type EvaluationMode,
  type RelativeChangeDirection,
  type RelativeChangeMode,
} from '@starui/engine';
import { useModuleState } from '../../hooks/useModuleState';
import { useGridColumns } from '../../hooks/useGridColumns';
import {
  Band,
  CockpitList,
  CockpitListItem,
  PillToggleBtn,
  PillToggleGroup,
  SubLabel,
} from '../../ui/SettingsPanel';

const MODULE_ID = 'alerts';

// ─── Helpers ───────────────────────────────────────────────────────────────

function newRuleId(): string {
  return `alert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function defaultRule(): AlertRule {
  return {
    id: newRuleId(),
    name: 'New alert',
    enabled: true,
    priority: 0,
    severity: 'warning',
    trigger: { kind: 'dataChange', expression: '' },
    message: '{rule} fired on {rowId}',
    channels: ['toast', 'badge', 'openfin'],
  };
}

function cloneRule(source: AlertRule, existingNames: ReadonlyArray<string>): AlertRule {
  const names = new Set(existingNames);
  const base = `${source.name} (copy)`;
  let candidate = base;
  let i = 2;
  while (names.has(candidate)) {
    candidate = `${base} ${i}`;
    i += 1;
  }
  return {
    ...JSON.parse(JSON.stringify(source)),
    id: newRuleId(),
    name: candidate,
  } as AlertRule;
}

function isOpenFinHost(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as unknown as { fin?: unknown }).fin);
}

// ─── Settings band (module-level controls) ─────────────────────────────────

interface AlertsSettingsBandProps {
  settings: AlertsSettings;
  onChange: (updater: (prev: AlertsSettings) => AlertsSettings) => void;
}

export function AlertsSettingsBand({ settings, onChange }: AlertsSettingsBandProps) {
  const openFinDetected = isOpenFinHost();
  const setEvalMode = (mode: EvaluationMode) =>
    onChange((prev) => ({ ...prev, evaluationMode: mode }));

  return (
    <div className="ds-alerts-settings-band">
      <Band title="Alerts">
        <div className="flex items-center justify-between gap-3 py-1">
          <SubLabel>Enable alerts</SubLabel>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(v) => onChange((prev) => ({ ...prev, enabled: v }))}
            aria-label="Enable alerts"
            data-testid="alerts-enabled-switch"
          />
        </div>
      </Band>

      <Band title="Frequency">
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <SubLabel>Evaluation mode</SubLabel>
            <RadioGroup
              value={settings.evaluationMode}
              onValueChange={(v) => setEvalMode(v as EvaluationMode)}
              className="flex flex-row gap-3"
            >
              <Label className="flex items-center gap-1.5 text-xs">
                <RadioGroupItem value="realtime" data-testid="alerts-mode-realtime" />
                Realtime
              </Label>
              <Label className="flex items-center gap-1.5 text-xs">
                <RadioGroupItem value="throttled" data-testid="alerts-mode-throttled" />
                Throttled
              </Label>
              <Label className="flex items-center gap-1.5 text-xs">
                <RadioGroupItem value="paused" data-testid="alerts-mode-paused" />
                Paused
              </Label>
            </RadioGroup>
          </div>

          <SliderRow
            label="Default debounce (ms)"
            min={0}
            max={10_000}
            step={100}
            value={settings.defaultDebounceMs}
            onChange={(v) => onChange((prev) => ({ ...prev, defaultDebounceMs: v }))}
            testIdPrefix="alerts-debounce"
          />

          <SliderRow
            label="Max notifications / sec"
            min={1}
            max={50}
            step={1}
            value={settings.maxNotificationsPerSecond}
            onChange={(v) =>
              onChange((prev) => ({ ...prev, maxNotificationsPerSecond: v }))
            }
            testIdPrefix="alerts-rate"
          />
        </div>
      </Band>

      <Band title="Channels">
        <div className="space-y-2">
          <ChannelToggle
            label="Show toasts"
            checked={settings.enabledChannels.toast}
            onChange={(v) =>
              onChange((prev) => ({
                ...prev,
                enabledChannels: { ...prev.enabledChannels, toast: v },
              }))
            }
            testId="alerts-channel-toast"
          />
          <ChannelToggle
            label="Show toolbar badge"
            checked={settings.enabledChannels.badge}
            onChange={(v) =>
              onChange((prev) => ({
                ...prev,
                enabledChannels: { ...prev.enabledChannels, badge: v },
              }))
            }
            testId="alerts-channel-badge"
          />
          <ChannelToggle
            label={
              openFinDetected
                ? 'OpenFin notification centre'
                : 'OpenFin notification centre (host not detected)'
            }
            checked={settings.enabledChannels.openfin}
            onChange={(v) =>
              onChange((prev) => ({
                ...prev,
                enabledChannels: { ...prev.enabledChannels, openfin: v },
              }))
            }
            disabled={!openFinDetected}
            testId="alerts-channel-openfin"
          />
        </div>
      </Band>

      <Band title="History">
        <div className="flex items-center justify-between gap-3 py-1">
          <SubLabel>Keep last N notifications</SubLabel>
          <Input
            type="number"
            min={1}
            max={5000}
            value={settings.historyLimit}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next >= 1) {
                onChange((prev) => ({ ...prev, historyLimit: Math.min(next, 5000) }));
              }
            }}
            className="w-24 text-right"
            data-testid="alerts-history-limit"
          />
        </div>
      </Band>
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  testIdPrefix,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <SubLabel>{label}</SubLabel>
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(Math.min(Math.max(next, min), max));
          }}
          className="w-24 text-right"
          data-testid={`${testIdPrefix}-input`}
        />
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(arr) => {
          const next = arr[0];
          if (Number.isFinite(next)) onChange(next);
        }}
        data-testid={`${testIdPrefix}-slider`}
      />
    </div>
  );
}

function ChannelToggle({
  label,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <SubLabel>{label}</SubLabel>
      <Switch
        checked={checked && !disabled}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
      />
    </div>
  );
}

// ─── List pane ─────────────────────────────────────────────────────────────

export function AlertsList({ selectedId, onSelect }: ListPaneProps) {
  const [state, setState] = useModuleState<AlertsState>(MODULE_ID);

  const addRule = useCallback(() => {
    const rule = defaultRule();
    setState((prev) => ({ ...prev, rules: [...prev.rules, rule] }));
    onSelect(rule.id);
  }, [setState, onSelect]);

  const cloneSelected = useCallback(
    (sourceId: string) => {
      setState((prev) => {
        const src = prev.rules.find((r) => r.id === sourceId);
        if (!src) return prev;
        const clone = cloneRule(src, prev.rules.map((r) => r.name));
        return { ...prev, rules: [...prev.rules, clone] };
      });
    },
    [setState],
  );

  const deleteRule = useCallback(
    (id: string) => {
      setState((prev) => ({ ...prev, rules: prev.rules.filter((r) => r.id !== id) }));
      if (selectedId === id) onSelect(null);
    },
    [setState, selectedId, onSelect],
  );

  return (
    <div className="ds-alerts-list flex h-full flex-col gap-2 p-2">
      <div className="flex items-center justify-between">
        <SubLabel>Alert rules</SubLabel>
        <Button
          variant="ghost"
          size="icon"
          onClick={addRule}
          aria-label="Add rule"
          data-testid="alerts-add-rule"
        >
          <Plus size={14} />
        </Button>
      </div>
      <CockpitList>
        {state.rules.length === 0 ? (
          <div className="px-2 py-3 text-xs text-[color:var(--ds-text-muted)]">
            No rules yet — click <Plus className="inline" size={10} /> to create one.
          </div>
        ) : (
          state.rules.map((rule) => (
            <CockpitListItem
              key={rule.id}
              value={rule.id}
              active={rule.id === selectedId}
              onSelect={() => onSelect(rule.id)}
              data-testid={`alerts-rule-row-${rule.id}`}
            >
              <div className="flex w-full items-center gap-2">
                <Bell
                  size={12}
                  className={rule.enabled ? '' : 'opacity-40'}
                  aria-hidden
                />
                <span className="flex-1 truncate text-xs">{rule.name}</span>
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {rule.trigger.kind === 'dataChange'
                    ? 'data'
                    : rule.trigger.kind === 'relativeChange'
                      ? 'Δ'
                      : 'row'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    cloneSelected(rule.id);
                  }}
                  aria-label="Clone rule"
                  data-testid={`alerts-clone-${rule.id}`}
                >
                  <Copy size={11} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRule(rule.id);
                  }}
                  aria-label="Delete rule"
                  data-testid={`alerts-delete-${rule.id}`}
                >
                  <Trash2 size={11} />
                </Button>
              </div>
            </CockpitListItem>
          ))
        )}
      </CockpitList>
    </div>
  );
}

// ─── Editor pane ───────────────────────────────────────────────────────────

const SEVERITIES: AlertSeverity[] = ['info', 'success', 'warning', 'critical'];

export function AlertsEditor({ selectedId }: EditorPaneProps) {
  const [state, setState] = useModuleState<AlertsState>(MODULE_ID);
  const columns = useGridColumns();
  const columnIds = useMemo(
    () => columns.map((c) => c.colId).filter((id): id is string => !!id),
    [columns],
  );

  const rule = useMemo(
    () => (selectedId ? state.rules.find((r) => r.id === selectedId) : undefined),
    [state.rules, selectedId],
  );

  const updateRule = useCallback(
    (mut: (prev: AlertRule) => AlertRule) => {
      if (!selectedId) return;
      setState((prev) => ({
        ...prev,
        rules: prev.rules.map((r) => (r.id === selectedId ? mut(r) : r)),
      }));
    },
    [selectedId, setState],
  );

  if (!rule) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-[color:var(--ds-text-muted)]">
        Select a rule to edit, or create a new one.
      </div>
    );
  }

  return (
    <ScrollArea className="ds-alerts-editor h-full">
      <div className="space-y-4 p-3">
        <Band title="Identity">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="w-20 text-xs">Name</Label>
              <Input
                value={rule.name}
                onChange={(e) =>
                  updateRule((prev) => ({ ...prev, name: e.target.value }))
                }
                data-testid="alerts-rule-name"
              />
            </div>
            <div className="flex items-center justify-between">
              <SubLabel>Enabled</SubLabel>
              <Switch
                checked={rule.enabled}
                onCheckedChange={(v) => updateRule((prev) => ({ ...prev, enabled: v }))}
                data-testid="alerts-rule-enabled"
              />
            </div>
          </div>
        </Band>

        <Band title="Severity">
          <PillToggleGroup>
            {SEVERITIES.map((s) => (
              <PillToggleBtn
                key={s}
                active={rule.severity === s}
                onClick={() => updateRule((prev) => ({ ...prev, severity: s }))}
                data-testid={`alerts-severity-${s}`}
                title={s}
              >
                {s}
              </PillToggleBtn>
            ))}
          </PillToggleGroup>
        </Band>

        <Band title="Trigger">
          <Tabs
            value={rule.trigger.kind}
            onValueChange={(kind) => {
              if (kind === rule.trigger.kind) return;
              if (kind === 'dataChange') {
                updateRule((prev) => ({
                  ...prev,
                  trigger: { kind: 'dataChange', expression: '' },
                }));
              } else if (kind === 'relativeChange') {
                updateRule((prev) => ({
                  ...prev,
                  trigger: {
                    kind: 'relativeChange',
                    column: columnIds[0] ?? '',
                    mode: 'ANY_CHANGE',
                    direction: 'both',
                  },
                }));
              } else {
                updateRule((prev) => ({
                  ...prev,
                  trigger: { kind: 'rowChange', event: 'ROW_ADDED' },
                }));
              }
            }}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dataChange" data-testid="alerts-trigger-dataChange">
                Expression
              </TabsTrigger>
              <TabsTrigger
                value="relativeChange"
                data-testid="alerts-trigger-relativeChange"
              >
                Delta
              </TabsTrigger>
              <TabsTrigger value="rowChange" data-testid="alerts-trigger-rowChange">
                Row
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dataChange" className="space-y-2 pt-3">
              <div className="flex flex-col gap-1">
                <SubLabel>Boolean expression</SubLabel>
                <Input
                  value={rule.trigger.kind === 'dataChange' ? rule.trigger.expression : ''}
                  placeholder="[bid] > 100"
                  onChange={(e) =>
                    updateRule((prev) => {
                      if (prev.trigger.kind !== 'dataChange') return prev;
                      return {
                        ...prev,
                        trigger: { ...prev.trigger, expression: e.target.value },
                      };
                    })
                  }
                  data-testid="alerts-expression-input"
                />
              </div>
              <ColumnPicker
                label="Restrict to column (optional)"
                value={rule.trigger.kind === 'dataChange' ? rule.trigger.column ?? '' : ''}
                onChange={(v) =>
                  updateRule((prev) => {
                    if (prev.trigger.kind !== 'dataChange') return prev;
                    const next: typeof prev.trigger = { ...prev.trigger };
                    if (v) next.column = v;
                    else delete next.column;
                    return { ...prev, trigger: next };
                  })
                }
                allowEmpty
                columnIds={columnIds}
                testId="alerts-datachange-column"
              />
            </TabsContent>

            <TabsContent value="relativeChange" className="space-y-2 pt-3">
              {rule.trigger.kind === 'relativeChange' ? (
                <RelativeChangeBody
                  trigger={rule.trigger}
                  columnIds={columnIds}
                  onChange={(next) =>
                    updateRule((prev) => ({ ...prev, trigger: next }))
                  }
                />
              ) : null}
            </TabsContent>

            <TabsContent value="rowChange" className="space-y-2 pt-3">
              {rule.trigger.kind === 'rowChange' ? (
                <RadioGroup
                  value={rule.trigger.event}
                  onValueChange={(v) =>
                    updateRule((prev) => {
                      if (prev.trigger.kind !== 'rowChange') return prev;
                      return {
                        ...prev,
                        trigger: {
                          ...prev.trigger,
                          event: v as 'ROW_ADDED' | 'ROW_REMOVED',
                        },
                      };
                    })
                  }
                  className="flex flex-row gap-3"
                >
                  <Label className="flex items-center gap-1.5 text-xs">
                    <RadioGroupItem value="ROW_ADDED" data-testid="alerts-row-added" />
                    Row added
                  </Label>
                  <Label className="flex items-center gap-1.5 text-xs">
                    <RadioGroupItem
                      value="ROW_REMOVED"
                      data-testid="alerts-row-removed"
                    />
                    Row removed
                  </Label>
                </RadioGroup>
              ) : null}
            </TabsContent>
          </Tabs>
        </Band>

        <Band title="Message">
          <div className="space-y-1.5">
            <SubLabel>Template — placeholders: {'{rule} {rowId} {column} {value} {prev}'}</SubLabel>
            <Input
              value={rule.message}
              onChange={(e) =>
                updateRule((prev) => ({ ...prev, message: e.target.value }))
              }
              data-testid="alerts-message-input"
            />
          </div>
        </Band>

        <Band title="Channels">
          <div className="space-y-1">
            {(['toast', 'badge', 'openfin'] as const).map((channel) => (
              <div key={channel} className="flex items-center justify-between gap-3">
                <SubLabel>
                  {channel === 'toast'
                    ? 'Toast'
                    : channel === 'badge'
                      ? 'Toolbar badge'
                      : 'OpenFin notification centre'}
                </SubLabel>
                <Switch
                  checked={rule.channels.includes(channel)}
                  onCheckedChange={(v) =>
                    updateRule((prev) => {
                      const set = new Set<AlertChannel>(prev.channels);
                      if (v) set.add(channel);
                      else set.delete(channel);
                      return { ...prev, channels: Array.from(set) };
                    })
                  }
                  data-testid={`alerts-rule-channel-${channel}`}
                />
              </div>
            ))}
          </div>
        </Band>

        <Band title="Debounce">
          <SliderRow
            label="Per-rule debounce (ms, 0 = use default)"
            min={0}
            max={30_000}
            step={250}
            value={rule.debounceMs ?? 0}
            onChange={(v) =>
              updateRule((prev) => ({
                ...prev,
                ...(v > 0 ? { debounceMs: v } : { debounceMs: undefined }),
              }))
            }
            testIdPrefix={`alerts-rule-debounce-${rule.id}`}
          />
        </Band>
      </div>
    </ScrollArea>
  );
}

function RelativeChangeBody({
  trigger,
  columnIds,
  onChange,
}: {
  trigger: Extract<AlertRule['trigger'], { kind: 'relativeChange' }>;
  columnIds: string[];
  onChange: (next: Extract<AlertRule['trigger'], { kind: 'relativeChange' }>) => void;
}) {
  return (
    <div className="space-y-2">
      <ColumnPicker
        label="Column"
        value={trigger.column}
        onChange={(v) => onChange({ ...trigger, column: v })}
        columnIds={columnIds}
        testId="alerts-relative-column"
      />
      <div className="flex flex-col gap-1">
        <SubLabel>Mode</SubLabel>
        <Select
          value={trigger.mode}
          onValueChange={(v) => onChange({ ...trigger, mode: v as RelativeChangeMode })}
        >
          <SelectTrigger data-testid="alerts-relative-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PERCENT_CHANGE">Percent change</SelectItem>
            <SelectItem value="ABSOLUTE_CHANGE">Absolute change</SelectItem>
            <SelectItem value="ANY_CHANGE">Any change</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {trigger.mode !== 'ANY_CHANGE' && (
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs">Threshold</Label>
          <Input
            type="number"
            min={0}
            step={trigger.mode === 'PERCENT_CHANGE' ? 0.1 : 0.01}
            value={trigger.threshold ?? 0}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next >= 0) {
                onChange({ ...trigger, threshold: next });
              }
            }}
            data-testid="alerts-relative-threshold"
          />
          {trigger.mode === 'PERCENT_CHANGE' && <span className="text-xs">%</span>}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <SubLabel>Direction</SubLabel>
        <RadioGroup
          value={trigger.direction ?? 'both'}
          onValueChange={(v) =>
            onChange({ ...trigger, direction: v as RelativeChangeDirection })
          }
          className="flex flex-row gap-3"
        >
          <Label className="flex items-center gap-1.5 text-xs">
            <RadioGroupItem value="both" data-testid="alerts-relative-direction-both" />
            Either
          </Label>
          <Label className="flex items-center gap-1.5 text-xs">
            <RadioGroupItem value="up" data-testid="alerts-relative-direction-up" />
            Up only
          </Label>
          <Label className="flex items-center gap-1.5 text-xs">
            <RadioGroupItem value="down" data-testid="alerts-relative-direction-down" />
            Down only
          </Label>
        </RadioGroup>
      </div>
    </div>
  );
}

function ColumnPicker({
  label,
  value,
  onChange,
  columnIds,
  allowEmpty = false,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  columnIds: string[];
  allowEmpty?: boolean;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <SubLabel>{label}</SubLabel>
      <Select
        value={value || (allowEmpty ? '__none__' : '')}
        onValueChange={(v) => onChange(v === '__none__' ? '' : v)}
      >
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder="Pick a column" />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value="__none__">Any column</SelectItem>}
          {columnIds.map((id) => (
            <SelectItem key={id} value={id}>
              {id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Combined panel (settings + list + editor) ─────────────────────────────

export function AlertsPanel() {
  const [state, setState] = useModuleState<AlertsState>(MODULE_ID);
  const [selectedId, setSelectedId] = useState<string | null>(state.rules[0]?.id ?? null);

  const onSettingsChange = useCallback(
    (updater: (prev: AlertsSettings) => AlertsSettings) =>
      setState((prev) => ({ ...prev, settings: updater(prev.settings ?? { ...DEFAULT_ALERTS_SETTINGS }) })),
    [setState],
  );

  return (
    <div className="ds-alerts-panel flex h-full flex-col">
      <AlertsSettingsBand settings={state.settings} onChange={onSettingsChange} />
      <Separator />
      <div className="flex min-h-0 flex-1">
        <div className="w-64 shrink-0 border-r border-[color:var(--ds-border-default)]">
          <AlertsList
            gridId=""
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <div className="min-w-0 flex-1">
          <AlertsEditor gridId="" selectedId={selectedId} />
        </div>
      </div>
    </div>
  );
}
