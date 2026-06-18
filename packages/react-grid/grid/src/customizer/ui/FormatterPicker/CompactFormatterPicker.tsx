import { Fragment, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Hash, Info, X } from 'lucide-react';
import { isValidExcelFormat } from '@starui/engine';
import { controls, radius, spacing, typography } from '@starui/design-system/tokens';
import { cn } from '@starui/ui';
import { FormatPopover } from '../format-editor';
import { Caps, IconInput, SubLabel } from '../SettingsPanel';
import { ExcelReferenceList } from './ExcelReferenceList';
import { EXCEL_EXAMPLES } from './excelExamples';
import { CURRENCY_QUICK_INSERT, applyCurrencySymbol } from './currencyQuickInsert';
import { GROUP_LABELS, groupKeyForPreset } from './presetGroups';
import {
  SELECTABLE_TYPES,
  hintText,
  iconForDataType,
  toneColor,
  triggerCaption,
  triggerTitle,
  type SharedBodyProps,
} from './formatterPickerShared';
import type { FormatterPreset } from './presetsForDataType';
import { ChromeButton } from '../ChromeButton';

// Inline data-chip dimension (CURRENT preview, clear, currency-insert) —
// sits one step tighter than controls.xs so chip rows read as data, not
// controls. Local-only — chips don't surface in other modules.
const CHIP_HEIGHT = '22px';

/**
 * Compact (toolbar) presentation of FormatterPicker.
 *
 * Single chip trigger that opens a shadcn popover. The body
 * (CompactFormatterBody) is split into:
 *   • a type selector (re-categorize a mis-inferred column)
 *   • a live preview of the current format
 *   • a tiled preset grid grouped by category, with the trading-desk
 *     conventions tucked behind a "More formats" disclosure so the
 *     everyday set isn't buried
 *   • a collapsible custom-Excel section (currency quick-insert +
 *     custom input + apply/info)
 *
 * Everything applies live; the popover dismisses on Escape / outside
 * click — no per-control "apply & close" inconsistency.
 */
export function CompactFormatterPicker(props: SharedBodyProps) {
  const { value, activePreset, dataType, testId } = props;
  const TriggerIcon = iconForDataType(dataType);
  return (
    <FormatPopover
      width={360}
      trigger={
        <ChromeButton
          type="button"
          title={triggerTitle(value, activePreset)}
          data-testid={testId ? `${testId}-trigger` : undefined}
          className={cn(
            'inline-flex h-7 min-h-7 max-w-[180px] items-center gap-1.5 px-2',
            'rounded-[2px] border border-border/55 bg-transparent text-[11px] font-medium shadow-none',
            'text-foreground/90 hover:bg-accent/45 hover:border-border',
            value ? 'text-primary' : undefined,
          )}
        >
          <TriggerIcon size={12} strokeWidth={1.75} className="shrink-0 opacity-70" />
          <span className="min-w-0 truncate font-sans tabular-nums">
            {triggerCaption(value, activePreset)}
          </span>
          <ChevronDown size={11} strokeWidth={1.75} className="shrink-0 opacity-50" />
        </ChromeButton>
      }
    >
      {() => <CompactFormatterBody {...props} />}
    </FormatPopover>
  );
}

/**
 * The popover body. A real component (not an inline render-prop) so its
 * disclosure state mounts fresh on every popover open — e.g. the custom
 * section auto-expands when the column arrived with a raw Excel format
 * that doesn't match any preset.
 */
function CompactFormatterBody({
  value,
  onChange,
  presets,
  activePreset,
  preview,
  draftExcel,
  setDraftExcel,
  isExcelValid,
  commitExcel,
  pickPreset,
  dataType,
  onSelectType,
  testId,
}: SharedBodyProps) {
  // Split presets into the everyday set and the trading-desk set. Each
  // keeps the catalog's group order (Object insertion order).
  const { common, advanced, hasAdvanced } = useMemo(() => {
    const c: Record<string, FormatterPreset[]> = {};
    const a: Record<string, FormatterPreset[]> = {};
    for (const p of presets) {
      const bucket = p.tier === 'advanced' ? a : c;
      const g = groupKeyForPreset(p);
      (bucket[g] ??= []).push(p);
    }
    return { common: c, advanced: a, hasAdvanced: Object.keys(a).length > 0 };
  }, [presets]);

  const [showAdvanced, setShowAdvanced] = useState(
    // Open advanced up-front if the active preset lives there, so the
    // current selection is visible without hunting for the disclosure.
    () => activePreset?.tier === 'advanced',
  );

  // Currency quick-insert only makes sense for money/number formats —
  // a row of `$ € £ ¥ ₹` above a `yyyy-mm-dd` placeholder is incoherent.
  const showCurrencyRow = dataType === 'currency' || dataType === 'number';

  // Custom Excel is the power-user escape hatch — collapsed by default so
  // presets lead, but auto-opened when the live value is a raw format with
  // no matching preset (otherwise the user couldn't see their own format).
  const [showCustom, setShowCustom] = useState(
    () => !!draftExcel && !activePreset,
  );

  // Excel reference expands inline, in-place — NOT as a second popover
  // stacked on the picker popover (which was fragile: one mis-aimed
  // click collapsed the whole stack).
  const [showReference, setShowReference] = useState(false);

  return (
    <div
      data-testid={testId}
      className="flex-1 min-h-0 flex flex-col gap-2.5 font-sans p-0.5"
    >
      {/* Type selector — re-categorize a mis-inferred column. */}
      {onSelectType ? (
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <SubLabel>TYPE</SubLabel>
          <div className="flex items-center gap-1 flex-wrap">
            {SELECTABLE_TYPES.map((t) => {
              const active = t.type === dataType;
              return (
                <ChromeButton
                  key={t.type}
                  type="button"
                  onClick={() => onSelectType(t.type)}
                  title={`Format as ${t.label.toLowerCase()}`}
                  aria-pressed={active}
                  data-testid={testId ? `${testId}-type-${t.type}` : undefined}
                  style={{
                    height: CHIP_HEIGHT,
                    padding: `0 ${spacing[1.5]}px`,
                    background: active ? 'var(--ds-primary-soft)' : 'transparent',
                    border: `1px solid ${
                      active ? 'var(--ds-primary)' : 'var(--ds-border-primary)'
                    }`,
                    borderRadius: radius.md,
                    color: active ? 'var(--ds-primary)' : 'var(--ds-text-muted)',
                    cursor: 'pointer',
                    fontSize: typography.fontSize.xs,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {t.label}
                </ChromeButton>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Top bar — current / preview / clear (fixed-height shrinker) */}
      <div className="flex items-center gap-2 shrink-0">
        <SubLabel>CURRENT</SubLabel>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing[1],
            // CURRENT/clear/currency chips sit 2px tighter than the
            // controls tier scale — they're inline data chips, not
            // controls. Local CHIP_HEIGHT keeps the trio aligned.
            height: CHIP_HEIGHT,
            padding: `0 ${spacing[2]}px`,
            background: preview
              ? 'var(--ds-primary-soft)'
              : 'var(--ds-surface-ground)',
            border: `1px dashed ${
              preview ? 'var(--ds-border-secondary)' : 'var(--ds-border-primary)'
            }`,
            borderRadius: radius.md,
            color: preview ? 'var(--ds-primary)' : 'var(--ds-text-faint)',
            fontFamily: 'var(--ds-font-mono)',
            fontSize: controls.sm.fontSize,
            fontVariantNumeric: 'tabular-nums',
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={preview || 'No formatter applied'}
        >
          {preview || '—'}
        </span>
        <ChromeButton
          type="button"
          onClick={() => {
            setDraftExcel('');
            onChange(undefined);
          }}
          disabled={!value}
          title="Clear formatter"
          data-testid={testId ? `${testId}-clear` : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: CHIP_HEIGHT,
            height: CHIP_HEIGHT,
            padding: 0,
            background: 'transparent',
            border: '1px solid var(--ds-border-secondary)',
            borderRadius: radius.md,
            color: value ? 'var(--ds-accent-negative)' : 'var(--ds-text-faint)',
            cursor: value ? 'pointer' : 'default',
            opacity: value ? 1 : 0.4,
          }}
        >
          <X size={11} strokeWidth={2} />
        </ChromeButton>
      </div>

      {/* Preset tile grid — the single scrollable region of the popover.
          `flex: 1` + `min-height: 0` lets it grow to fill the popover
          height between the fixed bars above and the custom block below;
          if it still overflows, only THIS section scrolls. */}
      <div
        className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-0.5"
        style={{ scrollbarColor: 'var(--ds-border-primary) transparent', scrollbarWidth: 'thin' }}
      >
        <PresetGroups groups={common} activePreset={activePreset} pickPreset={pickPreset} testId={testId} />

        {hasAdvanced ? (
          <div className="flex flex-col gap-2">
            <ChromeButton
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              aria-expanded={showAdvanced}
              title={showAdvanced ? 'Hide advanced formats' : 'Show advanced formats'}
              data-testid={testId ? `${testId}-advanced-toggle` : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing[1],
                alignSelf: 'flex-start',
                padding: `${spacing[1]}px ${spacing[1.5]}px`,
                background: 'transparent',
                border: 'none',
                color: 'var(--ds-text-muted)',
                cursor: 'pointer',
                fontSize: typography.fontSize.xs,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              <ChevronRight
                size={12}
                strokeWidth={2}
                style={{
                  transform: showAdvanced ? 'rotate(90deg)' : 'none',
                  transition: 'transform 120ms',
                }}
              />
              More formats
            </ChromeButton>
            {showAdvanced ? (
              <PresetGroups groups={advanced} activePreset={activePreset} pickPreset={pickPreset} testId={testId} />
            ) : null}
          </div>
        ) : null}

        {presets.length === 0 ? (
          <Caps size="xs" color="var(--ds-text-faint)">
            No presets for this data type — use the custom format below.
          </Caps>
        ) : null}
      </div>

      <div className="h-px bg-border shrink-0" />

      {/* Custom Excel section — collapsible escape hatch (fixed shrinker) */}
      <div className="flex flex-col gap-1 shrink-0">
        <ChromeButton
          type="button"
          onClick={() => setShowCustom((s) => !s)}
          aria-expanded={showCustom}
          title={showCustom ? 'Hide custom format' : 'Show custom format'}
          data-testid={testId ? `${testId}-custom-toggle` : undefined}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing[1],
            alignSelf: 'flex-start',
            padding: `${spacing[0.5]}px 0`,
            background: 'transparent',
            border: 'none',
            color: 'var(--ds-text-muted)',
            cursor: 'pointer',
          }}
        >
          <ChevronRight
            size={11}
            strokeWidth={2}
            style={{
              transform: showCustom ? 'rotate(90deg)' : 'none',
              transition: 'transform 120ms',
            }}
          />
          <SubLabel>Custom Excel format</SubLabel>
        </ChromeButton>

        {showCustom ? (
          <>
            {/* Currency symbol quick-insert — money/number formats only.
                One click swaps the symbol in the current format, or seeds
                `${symbol}#,##0.00` if the input is empty. */}
            {showCurrencyRow ? (
              <div className="flex items-center gap-1 flex-wrap">
                <Caps size="2xs" color="var(--ds-text-faint)" style={{ paddingRight: spacing[1] }}>
                  SYMBOL
                </Caps>
                {CURRENCY_QUICK_INSERT.map((c) => (
                  <ChromeButton
                    key={c.symbol}
                    type="button"
                    title={`Insert ${c.aria}`}
                    aria-label={`Insert ${c.aria}`}
                    data-testid={testId ? `${testId}-currency-${c.label.toLowerCase()}` : undefined}
                    onClick={() => {
                      const next = applyCurrencySymbol(draftExcel, c.symbol);
                      setDraftExcel(next);
                      commitExcel(next);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: controls.sm.height,
                      height: CHIP_HEIGHT,
                      padding: `0 ${spacing[1.5]}px`,
                      background: 'var(--ds-surface-ground)',
                      border: '1px solid var(--ds-border-primary)',
                      borderRadius: radius.md,
                      color: 'var(--ds-text-primary)',
                      cursor: 'pointer',
                      fontFamily: 'var(--ds-font-mono)',
                      fontSize: controls.sm.fontSize,
                      lineHeight: 1,
                      transition: 'background 100ms, border-color 100ms',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'var(--ds-surface-tertiary)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'var(--ds-surface-ground)';
                    }}
                  >
                    {c.label}
                  </ChromeButton>
                ))}
              </div>
            ) : null}

            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <IconInput
                  icon={<Hash size={12} strokeWidth={2} />}
                  value={draftExcel}
                  onChange={(v) => {
                    setDraftExcel(v);
                    const trimmed = v.trim();
                    if (!trimmed) {
                      if (value?.kind === 'excelFormat') onChange(undefined);
                      return;
                    }
                    if (isValidExcelFormat(trimmed)) {
                      onChange({ kind: 'excelFormat', format: trimmed });
                    }
                  }}
                  onCommit={commitExcel}
                  monospace
                  placeholder={
                    dataType === 'date' || dataType === 'datetime' ? 'yyyy-mm-dd' : '#,##0.00'
                  }
                  error={!isExcelValid}
                  data-testid={testId ? `${testId}-excel` : undefined}
                />
              </div>
              {/* Apply — commits the draft. Stays open (consistent with
               *  preset/currency clicks); dismiss via Escape / outside
               *  click. Disabled when empty or syntactically invalid. */}
              <ApplyButton
                disabled={!draftExcel.trim() || !isExcelValid}
                data-testid={testId ? `${testId}-apply` : undefined}
                onClick={() => commitExcel(draftExcel)}
              />
              {/* Reference — toggles an INLINE example list (no nested
               *  popover). Highlighted while open. */}
              <ChromeButton
                type="button"
                onClick={() => setShowReference((s) => !s)}
                aria-expanded={showReference}
                title="Excel format reference"
                aria-label="Excel format reference"
                data-testid={testId ? `${testId}-info` : undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: controls.sm.height,
                  height: controls.sm.height,
                  padding: 0,
                  background: showReference ? 'var(--ds-primary-soft)' : 'transparent',
                  border: `1px solid ${
                    showReference ? 'var(--ds-primary)' : 'var(--ds-border-secondary)'
                  }`,
                  borderRadius: radius.md,
                  color: showReference ? 'var(--ds-primary)' : 'var(--ds-text-muted)',
                  cursor: 'pointer',
                  transition: 'background 100ms, border-color 100ms, color 100ms',
                }}
              >
                <Info size={12} strokeWidth={1.75} />
              </ChromeButton>
            </div>
            {showReference ? (
              <div
                className="rounded-[2px] border border-border"
                style={{ background: 'var(--ds-surface-ground)' }}
              >
                <ExcelReferenceList
                  maxHeight={200}
                  onPick={(format) => {
                    setDraftExcel(format);
                    commitExcel(format);
                    setShowReference(false);
                  }}
                />
              </div>
            ) : (
              <Caps size="2xs" color="var(--ds-text-faint)">
                {EXCEL_EXAMPLES.length} categories of example formats in the{' '}
                <Info size={9} strokeWidth={2} className="inline align-middle" />{' '}
                reference.
              </Caps>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Renders a `{groupKey: presets[]}` map as labeled 2-column tile grids. */
function PresetGroups({
  groups,
  activePreset,
  pickPreset,
  testId,
}: {
  groups: Record<string, FormatterPreset[]>;
  activePreset: FormatterPreset | undefined;
  pickPreset: (preset: FormatterPreset) => void;
  testId?: string;
}) {
  return (
    <>
      {Object.entries(groups).map(([groupKey, items]) => (
        <div key={groupKey}>
          <SubLabel>{GROUP_LABELS[groupKey] ?? groupKey.toUpperCase()}</SubLabel>
          <div className="grid grid-cols-2 gap-1 mt-1">
            {items.map((p) => {
              const active = activePreset?.id === p.id;
              return (
                <ChromeButton
                  key={p.id}
                  type="button"
                  onClick={() => pickPreset(p)}
                  title={
                    hintText(p) ? `${p.label} · ${hintText(p)}` : p.label
                  }
                  data-testid={testId ? `${testId}-preset-${p.id}` : undefined}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: spacing[0.5],
                    padding: `${spacing[1.5]}px ${spacing[2]}px`,
                    background: active
                      ? 'var(--ds-primary-soft)'
                      : 'var(--ds-surface-ground)',
                    border: `1px solid ${
                      active ? 'var(--ds-primary)' : 'var(--ds-border-primary)'
                    }`,
                    borderRadius: radius.md,
                    color: active ? 'var(--ds-primary)' : 'var(--ds-text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: controls.sm.fontSize,
                  }}
                >
                  <span className="font-semibold leading-[1.1]">{p.label}</span>
                  <TileHint preset={p} active={active} />
                </ChromeButton>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Second-line tile hint. Prefers `hintSamples` — the actual formatted
 * output, colored to match what the cell will render (green/red etc.) —
 * over the plain `hint` string. The old hints leaked raw `[Red]`/`[Green]`
 * Excel tokens, which read as "the cell will literally say [Red]".
 */
function TileHint({ preset, active }: { preset: FormatterPreset; active: boolean }) {
  if (preset.hintSamples?.length) {
    return (
      <span
        style={{
          fontFamily: 'var(--ds-font-mono)',
          fontSize: typography.fontSize.xs,
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing[1],
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {preset.hintSamples.map((s, i) => (
          <Fragment key={i}>
            {i > 0 ? <span style={{ color: 'var(--ds-text-faint)' }}>/</span> : null}
            <span style={{ color: toneColor(s.tone) }}>{s.text}</span>
          </Fragment>
        ))}
      </span>
    );
  }
  if (preset.hint) {
    return (
      <span
        style={{
          fontFamily: 'var(--ds-font-mono)',
          fontSize: typography.fontSize.xs,
          color: active ? 'var(--ds-primary)' : 'var(--ds-text-faint)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {preset.hint}
      </span>
    );
  }
  return null;
}

/**
 * Apply button next to the custom Excel input. Square, accent-tinted
 * check that mirrors the top-bar Clear chip's affordance.
 */
function ApplyButton({
  disabled,
  onClick,
  ...rest
}: {
  disabled?: boolean;
  onClick: () => void;
  'data-testid'?: string;
}) {
  return (
    <ChromeButton
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Apply format"
      aria-label="Apply format"
      data-testid={rest['data-testid']}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: controls.sm.height,
        height: controls.sm.height,
        padding: 0,
        background: 'transparent',
        border: '1px solid var(--ds-border-secondary)',
        borderRadius: radius.md,
        color: disabled ? 'var(--ds-text-faint)' : 'var(--ds-primary)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 100ms, border-color 100ms, color 100ms',
      }}
    >
      <Check size={12} strokeWidth={2.25} />
    </ChromeButton>
  );
}
