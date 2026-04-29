/**
 * Conditional Styling settings panel — v4 rewrite.
 *
 * Same three v2 antipatterns removed as phases 3b and 3c, plus a
 * couple of smaller ones specific to this panel:
 *
 *  1. File-level `dirtyRegistry = new Set<string>()` +
 *     `window.dispatchEvent('gc-dirty-change')` broadcast bus →
 *     `useDirty('conditional-styling:<ruleId>')` against the per-platform
 *     `DirtyBus`. Same fix as 3b / 3c.
 *  2. Local `useGridColumns()` hook with hand-rolled `tick` state and
 *     raw `api.addEventListener` → the platform `useGridColumns()` hook
 *     (fingerprint-cached, ApiHub-wired, auto-disposed). The platform
 *     hook exposes `cellDataType` natively too, so the local one-off
 *     shape bridge goes with it.
 *  3. `useDraftModuleItem({ store, … })` + `useModuleState(store, id)`
 *     compat shims → `useModuleDraft` + the 1-arg `useModuleState(id)`.
 *  4. `new ExpressionEngine()` at module-load, side-stepping the
 *     platform's shared engine. Switched to
 *     `useGridPlatform().resources.expression()` so the panel's
 *     validation matches the engine that actually evaluates the rules
 *     downstream.
 *  5. `<RuleRow>` subscribed to the whole `conditional-styling` module
 *     state on every render just to read a committed snapshot it then
 *     `void`-ed out and never used. Dropped — row re-render cost falls
 *     from "whenever any keystroke edits any rule" to "only when the
 *     rule prop changes".
 *
 * All `cs-*` testIds preserved.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { FormatColorPicker, FormatPopover } from '../../ui/format-editor';
import type { EditorPaneProps, ListPaneProps } from '../../platform/types';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useModuleState } from '../../hooks/useModuleState';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useDirty } from '../../hooks/useDirty';
import { useGridColumns } from '../../hooks/useGridColumns';
import {
  Band,
  Caps,
  IconInput,
  LedBar,
  Mono,
  ObjectTitleRow,
  PillToggleBtn,
  PillToggleGroup,
  SharpBtn,
  SubLabel,
  TitleInput,
} from '../../ui/SettingsPanel';
import { Switch } from '../../ui/shadcn';
import { StyleEditor } from '../../ui/StyleEditor';
import type {
  ConditionalRule,
  ConditionalStylingState,
  IndicatorPosition,
  IndicatorTarget,
  RuleIndicator,
} from './state';
import { INDICATOR_ICONS, findIndicatorIcon } from './indicatorIcons';
import { fromStyleEditorValue, toStyleEditorValue } from './styleBridge';
import { RuleEditorHeader } from './editor/RuleEditorHeader';
import { RuleMetaStrip } from './editor/RuleMetaStrip';
import { ExpressionBand } from './editor/ExpressionBand';
import { TargetColumnsBand } from './editor/TargetColumnsBand';
import { FlashBand } from './editor/FlashBand';
import { ValueFormatterBand } from './editor/ValueFormatterBand';

const MODULE_ID = 'conditional-styling';

function generateId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Dirty LED for the list rail ───────────────────────────────────────

function DirtyListLed({ ruleId }: { ruleId: string }) {
  const { isDirty } = useDirty(`${MODULE_ID}:${ruleId}`);
  if (!isDirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── List pane ─────────────────────────────────────────────────────────

export function ConditionalStylingList({ selectedId, onSelect }: ListPaneProps) {
  const [state, setState] = useModuleState<ConditionalStylingState>(MODULE_ID);

  const addRule = useCallback(() => {
    const newRule: ConditionalRule = {
      id: generateId(),
      name: 'New Rule',
      enabled: true,
      priority: state.rules.length,
      scope: { type: 'row' },
      expression: 'true',
      style: { light: {}, dark: {} },
    };
    setState((prev) => ({ ...prev, rules: [...prev.rules, newRule] }));
    onSelect(newRule.id);
  }, [state.rules.length, setState, onSelect]);

  useEffect(() => {
    if (!selectedId && state.rules.length > 0) {
      onSelect(state.rules[0].id);
    }
  }, [selectedId, state.rules, onSelect]);

  return (
    <>
      <div className="gc-popout-list-header">
        <Caps size={11}>Rules</Caps>
        <Mono color="var(--ck-t3)" size={11}>
          {String(state.rules.length).padStart(2, '0')}
        </Mono>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={addRule}
          title="Add rule"
          data-testid="cs-add-rule-btn"
          style={{
            width: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--ck-green-bg)',
            color: 'var(--ck-green)',
            border: '1px solid var(--ck-green-dim)',
            borderRadius: 2,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>
      <ul className="gc-popout-list-items" data-testid="cs-rules-list">
        {state.rules.map((r) => (
          <RuleRow
            key={r.id}
            rule={r}
            active={r.id === selectedId}
            onSelect={() => onSelect(r.id)}
          />
        ))}
      </ul>
    </>
  );
}

/** One row in the list rail. Memoised on `rule` + `active` — dirty status
 *  comes from the DirtyBus via `<DirtyListLed>` which subscribes
 *  independently, so this component only re-renders when its own props
 *  change. v2 wired `useModuleState` at this level and read a committed
 *  snapshot it never used, which re-rendered every row on every edit. */
const RuleRow = memo(function RuleRow({
  rule,
  active,
  onSelect,
}: {
  rule: ConditionalRule;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="gc-popout-list-item"
        aria-selected={active}
        data-muted={rule.enabled ? 'false' : 'true'}
        onClick={onSelect}
        data-testid={`cs-rule-card-${rule.id}`}
      >
        <span style={{ width: 2, display: 'inline-flex' }}>
          <DirtyListLed ruleId={rule.id} />
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {rule.name}
        </span>
      </button>
    </li>
  );
});

// ─── Editor pane ───────────────────────────────────────────────────────

export function ConditionalStylingEditor({ selectedId }: EditorPaneProps) {
  const [state, setState] = useModuleState<ConditionalStylingState>(MODULE_ID);

  if (!selectedId) {
    return (
      <div style={{ padding: '32px 24px' }}>
        <Caps size={10} style={{ marginBottom: 8, display: 'block' }}>
          No rule selected
        </Caps>
        <div style={{ fontSize: 12, color: 'var(--ck-t2)' }}>
          Select a rule from the list, or press <Mono size={11}>+</Mono> to add one.
        </div>
      </div>
    );
  }

  if (!state.rules.some((r) => r.id === selectedId)) return null;

  const removeRule = (ruleId: string) => {
    setState((prev) => ({ ...prev, rules: prev.rules.filter((r) => r.id !== ruleId) }));
  };

  return <RuleEditor ruleId={selectedId} onDelete={() => removeRule(selectedId)} />;
}

// ─── RuleEditor — orchestrator (sub-bands live in ./editor/) ──────────

const RuleEditor = memo(function RuleEditor({
  ruleId,
  onDelete,
}: {
  ruleId: string;
  onDelete: () => void;
}) {
  const platform = useGridPlatform();
  const engine = platform.resources.expression();
  const columns = useGridColumns();

  // Stable ref so the Monaco completion provider isn't re-registered on
  // every render. The editor re-reads via its latest-value ref.
  const columnsProvider = useCallback(
    () => columns.map((c) => ({ colId: c.colId, headerName: c.headerName })),
    [columns],
  );
  const cellDataTypeForColumn = useCallback(
    (colId: string) => columns.find((c) => c.colId === colId)?.cellDataType,
    [columns],
  );

  const { draft, setDraft, dirty, save, missing } = useModuleDraft<
    ConditionalStylingState,
    ConditionalRule
  >({
    moduleId: MODULE_ID,
    itemId: ruleId,
    selectItem: (state) => state.rules.find((r) => r.id === ruleId),
    commitItem: (next) => (state) => ({
      ...state,
      rules: state.rules.map((r) => (r.id === ruleId ? next : r)),
    }),
  });

  if (missing || !draft) return null;

  const validation = engine.validate(draft.expression);
  // Placeholder — the real "applied" count would come from a grid
  // side-channel that watches rule matches. Preserved from v2 so the
  // meta strip layout is visually identical.
  const appliedCount = draft.enabled ? 132 : 0;

  return (
    <div
      data-testid="cs-rule-editor"
      data-rule-testid={`cs-rule-editor-${ruleId}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <RuleEditorHeader
        ruleId={ruleId}
        name={draft.name}
        dirty={dirty}
        onNameChange={(name) => setDraft({ name })}
        onSave={save}
        onDelete={onDelete}
      />

      <div className="gc-editor-scroll">
        <RuleMetaStrip
          ruleId={ruleId}
          enabled={draft.enabled}
          scopeType={draft.scope.type}
          priority={draft.priority}
          flash={draft.flash}
          appliedCount={appliedCount}
          setDraft={setDraft}
        />

        <ExpressionBand
          ruleId={ruleId}
          expression={draft.expression}
          validation={validation}
          columnsProvider={columnsProvider}
          onExpressionChange={(v) => setDraft({ expression: v })}
        />

        {draft.scope.type === 'cell' && (
          <TargetColumnsBand
            columns={draft.scope.columns ?? []}
            onColumnsChange={(cols) =>
              setDraft({ scope: { type: 'cell', columns: cols } })
            }
          />
        )}

        {/* Shared StyleEditor.
            `format` dropped: the rule value-formatter now lives in its
            own Band below — the legacy FormatSection never persisted
            into conditional-styling state (styleBridge ignored it), so
            removing it is a behaviour fix, not a regression. */}
        <StyleEditor
          value={toStyleEditorValue(draft.style)}
          onChange={(patch) => {
            const merged = { ...toStyleEditorValue(draft.style), ...patch };
            setDraft({ style: fromStyleEditorValue(draft.style, merged) });
          }}
          sections={['text', 'color', 'border']}
          dataType="number"
          data-testid={`cs-rule-style-editor-${ruleId}`}
        />

        <FlashBand
          ruleId={ruleId}
          flash={draft.flash}
          scopeType={draft.scope.type}
          setDraft={setDraft}
        />

        {/* INDICATOR — small top-right badge drawn on every matching cell
            (and matching headers) as a `::before` SVG. Opt-in per rule. */}
        <Band index="08" title="INDICATOR">
          <IndicatorPicker
            value={draft.indicator}
            onChange={(next) => setDraft({ indicator: next })}
            ruleId={ruleId}
          />
        </Band>

        <ValueFormatterBand
          ruleId={ruleId}
          scope={draft.scope}
          valueFormatter={draft.valueFormatter}
          cellDataTypeForColumn={cellDataTypeForColumn}
          setDraft={setDraft}
        />

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
});

// ─── IndicatorPicker ───────────────────────────────────────────────────
//
// Curated icon grid + colour-picker trigger + "no indicator" clear pill.
// Renders the live lucide icon at button size so the user can see exactly
// what's about to paint on every matching cell.

const INDICATOR_GROUP_LABELS: Record<string, string> = {
  direction: 'Direction',
  alert: 'Alert',
  status: 'Status',
  lifecycle: 'Lifecycle',
  favorite: 'Favorite',
  classification: 'Classification',
};

/** Render the inline SVG for an indicator icon def directly. Avoids
 *  pulling every possible lucide-react component into the bundle just
 *  to preview the curated list — we already own the icon bodies. */
function IndicatorIconPreview({
  iconKey,
  color = 'currentColor',
  size = 14,
}: {
  iconKey: string;
  color?: string;
  size?: number;
}) {
  const def = findIndicatorIcon(iconKey);
  if (!def) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: def.body.replaceAll('currentColor', color) }}
    />
  );
}

function IndicatorPicker({
  value,
  onChange,
  ruleId,
}: {
  value: RuleIndicator | undefined;
  onChange: (next: RuleIndicator | undefined) => void;
  ruleId: string;
}) {
  const groups = useMemo(() => {
    const grouped: Record<string, Array<(typeof INDICATOR_ICONS)[number]>> = {};
    for (const i of INDICATOR_ICONS) {
      (grouped[i.group] ??= []).push(i);
    }
    return grouped;
  }, []);

  const color = value?.color || '#f59e0b';
  const currentTarget: IndicatorTarget = value?.target ?? 'cells+headers';
  const currentPosition: IndicatorPosition = value?.position ?? 'top-right';

  const patch = (next: Partial<RuleIndicator>) => {
    if (!value?.icon) return;
    onChange({ ...value, ...next });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Top bar: current selection + clear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          aria-label="Current indicator"
          style={{
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--ck-border-hi)',
            borderRadius: 2,
            background: 'var(--ck-bg)',
          }}
        >
          {value?.icon ? (
            <IndicatorIconPreview iconKey={value.icon} color={color} size={14} />
          ) : (
            <Caps size={9} color="var(--ck-t3)">
              NONE
            </Caps>
          )}
        </span>
        <Caps size={10} color="var(--ck-t2)">
          {value?.icon ? findIndicatorIcon(value.icon)?.label ?? value.icon : 'No indicator'}
        </Caps>

        <span style={{ flex: 1 }} />

        {value?.icon && (
          <FormatPopover
            width={240}
            trigger={
              <button
                type="button"
                title="Indicator colour"
                data-testid={`cs-rule-indicator-color-${ruleId}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 8px 2px 2px',
                  background: 'var(--ck-bg, var(--bn-bg))',
                  border: '1px solid var(--ck-border-hi, var(--bn-border))',
                  borderRadius: 2,
                  height: 28,
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    background: color,
                    border: '1px solid var(--ck-border-hi, var(--bn-border))',
                    borderRadius: 2,
                    display: 'inline-block',
                  }}
                />
                <Caps size={9} color="var(--ck-t2)">
                  {color.startsWith('#') ? color.toUpperCase() : 'COLOR'}
                </Caps>
              </button>
            }
          >
            <FormatColorPicker
              value={color}
              onChange={(c) => {
                if (c) onChange({ ...(value as RuleIndicator), color: c });
              }}
              allowClear={false}
            />
          </FormatPopover>
        )}

        <button
          type="button"
          onClick={() => onChange(undefined)}
          disabled={!value?.icon}
          style={{
            height: 28,
            padding: '0 10px',
            background: 'transparent',
            border: '1px solid var(--ck-border-hi)',
            borderRadius: 2,
            color: value?.icon ? 'var(--ck-red, var(--bn-red))' : 'var(--ck-t3)',
            cursor: value?.icon ? 'pointer' : 'default',
            fontFamily: 'var(--ck-font-sans)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: value?.icon ? 1 : 0.5,
          }}
          data-testid={`cs-rule-indicator-clear-${ruleId}`}
        >
          CLEAR
        </button>
      </div>

      {/* Target + Position — only meaningful when an icon is picked */}
      {value?.icon && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SubLabel>TARGET</SubLabel>
            <PillToggleGroup>
              {(
                [
                  ['cells', 'CELLS'],
                  ['headers', 'HEADERS'],
                  ['cells+headers', 'BOTH'],
                ] as ReadonlyArray<[IndicatorTarget, string]>
              ).map(([v, label]) => (
                <PillToggleBtn
                  key={v}
                  active={currentTarget === v}
                  onClick={() => patch({ target: v })}
                  style={{
                    height: 24,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '0 10px',
                    minWidth: 56,
                  }}
                  data-testid={`cs-rule-indicator-target-${v}-${ruleId}`}
                >
                  {label}
                </PillToggleBtn>
              ))}
            </PillToggleGroup>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SubLabel>POSITION</SubLabel>
            <PillToggleGroup>
              {(
                [
                  ['top-left', 'TL'],
                  ['top-right', 'TR'],
                ] as ReadonlyArray<[IndicatorPosition, string]>
              ).map(([v, label]) => (
                <PillToggleBtn
                  key={v}
                  active={currentPosition === v}
                  onClick={() => patch({ position: v })}
                  title={v === 'top-left' ? 'Top left' : 'Top right'}
                  style={{
                    height: 24,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '0 10px',
                    minWidth: 36,
                  }}
                  data-testid={`cs-rule-indicator-position-${v}-${ruleId}`}
                >
                  {label}
                </PillToggleBtn>
              ))}
            </PillToggleGroup>
          </div>
        </div>
      )}

      {/* Grouped icon grid */}
      {Object.entries(groups).map(([group, icons]) => (
        <div key={group}>
          <SubLabel>{INDICATOR_GROUP_LABELS[group] ?? group}</SubLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(28px, 1fr))',
              gap: 4,
              marginTop: 4,
            }}
          >
            {icons.map((i) => {
              const active = value?.icon === i.key;
              return (
                <button
                  key={i.key}
                  type="button"
                  title={i.label}
                  aria-label={i.label}
                  onClick={() =>
                    onChange({
                      icon: i.key,
                      target: value?.target ?? 'cells+headers',
                      position: value?.position ?? 'top-right',
                      ...(value?.color ? { color: value.color } : {}),
                    })
                  }
                  style={{
                    width: '100%',
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: active ? 'var(--ck-green-bg)' : 'var(--ck-bg)',
                    border: `1px solid ${active ? 'var(--ck-green)' : 'var(--ck-border-hi)'}`,
                    borderRadius: 2,
                    cursor: 'pointer',
                    color: active ? 'var(--ck-green)' : 'var(--ck-t1)',
                    padding: 0,
                    transition: 'background 120ms, border-color 120ms',
                  }}
                  data-testid={`cs-rule-indicator-icon-${i.key}-${ruleId}`}
                >
                  <IndicatorIconPreview
                    iconKey={i.key}
                    color={active ? color : 'currentColor'}
                    size={14}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <Caps size={9} color="var(--ck-t3)">
        Shown as a 12×12 badge on the top-right of every cell (and column header) currently matching this rule.
      </Caps>
    </div>
  );
}

// ─── Legacy flat composition ───────────────────────────────────────────

export function ConditionalStylingPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div
      data-testid="cs-panel"
      style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}
    >
      <aside
        style={{
          borderRight: '1px solid var(--ck-border)',
          overflowY: 'auto',
          background: 'var(--ck-surface)',
        }}
      >
        <ConditionalStylingList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section style={{ overflowY: 'auto' }}>
        <ConditionalStylingEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
