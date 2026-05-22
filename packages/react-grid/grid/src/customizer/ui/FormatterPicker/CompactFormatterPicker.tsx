import { useMemo } from 'react';
import { Check, ChevronDown, Hash, Info, X } from 'lucide-react';
import { Button, cn } from '@starui/ui';
import { isValidExcelFormat } from '@starui/engine';
import { controls, radius, spacing, typography } from '@starui/design-system/tokens';
import { FormatPopover } from '../format-editor';
import { Caps, IconInput, SubLabel } from '../SettingsPanel';
import { ExcelReferencePopover } from './ExcelReferencePopover';
import { EXCEL_EXAMPLES } from './excelExamples';
import { CURRENCY_QUICK_INSERT, applyCurrencySymbol } from './currencyQuickInsert';
import { GROUP_LABELS, groupKeyForPreset } from './presetGroups';
import { triggerCaption, type SharedBodyProps } from './formatterPickerShared';
import type { FormatterPreset } from './presetsForDataType';

// Inline data-chip dimension (CURRENT preview, clear, currency-insert) —
// sits one step tighter than controls.xs so chip rows read as data, not
// controls. Local-only — chips don't surface in other modules.
const CHIP_HEIGHT = '22px';

/**
 * Compact (toolbar) presentation of FormatterPicker.
 *
 * Single chip trigger that opens a shadcn popover containing:
 *   • live preview of the current format
 *   • tiled preset grid grouped by category (pattern mirrors the
 *     IndicatorPicker)
 *   • currency-symbol quick-insert row
 *   • custom Excel input + apply/clear/info actions
 *
 * One toolbar slot replaces the old preset dropdown + custom input +
 * info icon triple.
 */
export function CompactFormatterPicker({
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
  testId,
}: SharedBodyProps) {
  const groups = useMemo(() => {
    const grouped: Record<string, FormatterPreset[]> = {};
    for (const p of presets) {
      const g = groupKeyForPreset(p);
      (grouped[g] ??= []).push(p);
    }
    return grouped;
  }, [presets]);

  return (
    <FormatPopover
      width={360}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="sm"
          title="Value formatter"
          data-testid={testId ? `${testId}-trigger` : undefined}
          className={cn(
            'inline-flex h-[var(--ds-control-sm-height,28px)] gap-1.5 rounded-[var(--ds-radius-md,4px)] border border-transparent px-2 font-sans text-[length:var(--ds-control-sm-font-size,11px)] shadow-none transition-[background,color] transition-duration-[120ms] hover:bg-accent/40',
            value ? 'text-[var(--ds-primary)]' : 'text-[var(--ds-text-primary)]',
          )}
        >
          <Hash size={12} strokeWidth={1.75} className="opacity-70" />
          <span
            style={{
              maxWidth: 140,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily:
                activePreset || !value
                  ? 'var(--ds-font-sans)'
                  : 'var(--ds-font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {triggerCaption(value, activePreset)}
          </span>
          <ChevronDown size={11} strokeWidth={1.75} className="opacity-50" />
        </Button>
      }
    >
      {({ close }) => (
      <div
        data-testid={testId}
        className="flex-1 min-h-0 flex flex-col gap-2.5 font-sans p-0.5"
      >
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
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              setDraftExcel('');
              onChange(undefined);
            }}
            disabled={!value}
            title="Clear formatter"
            data-testid={testId ? `${testId}-clear` : undefined}
            className="h-[22px] w-[22px] shrink-0 rounded-[var(--ds-radius-md,4px)] border-[var(--ds-border-secondary)] bg-transparent p-0 text-[var(--ds-accent-negative)] shadow-none disabled:text-[var(--ds-text-faint)]"
          >
            <X size={11} strokeWidth={2} />
          </Button>
        </div>

        {/* Preset tile grid — the single scrollable region of the
            popover. `flex: 1` + `min-height: 0` lets it grow to fill
            the popover height between the fixed CURRENT bar above and
            the divider+custom-Excel block below; if it still overflows
            the available space, only THIS section scrolls. */}
        <div
          className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-0.5"
          style={{ scrollbarColor: 'var(--ds-border-primary) transparent', scrollbarWidth: 'thin' }}
        >
          {Object.entries(groups).map(([groupKey, items]) => (
            <div key={groupKey}>
              <SubLabel>{GROUP_LABELS[groupKey] ?? groupKey.toUpperCase()}</SubLabel>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {items.map((p) => {
                  const active = activePreset?.id === p.id;
                  return (
                    <Button
                      key={p.id}
                      type="button"
                      variant="outline"
                      onClick={() => pickPreset(p)}
                      title={p.hint ? `${p.label} · ${p.hint}` : p.label}
                      data-testid={testId ? `${testId}-preset-${p.id}` : undefined}
                      className={cn(
                        'flex h-auto w-full flex-col items-start gap-0.5 rounded-[var(--ds-radius-md,4px)] px-2 py-1.5 text-left font-[inherit] text-[length:var(--ds-control-sm-font-size,11px)] shadow-none',
                        active
                          ? 'border-[var(--ds-primary)] bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]'
                          : 'border-[var(--ds-border-primary)] bg-[var(--ds-surface-ground)] text-[var(--ds-text-primary)]',
                      )}
                    >
                      <span className="font-semibold leading-[1.1]">{p.label}</span>
                      {p.hint ? (
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
                          {p.hint}
                        </span>
                      ) : null}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
          {presets.length === 0 ? (
            <Caps size="xs" color="var(--ds-text-faint)">
              No presets for this data type — use the custom format below.
            </Caps>
          ) : null}
        </div>

        <div className="h-px bg-border shrink-0" />

        {/* Custom Excel input + info (fixed-height shrinker — never collapses) */}
        <div className="flex flex-col gap-1 shrink-0">
          <SubLabel>Custom Excel format</SubLabel>

          {/* Currency symbol quick-insert — one click swaps the symbol
               in the current format, or seeds `${symbol}#,##0.00` if
               the input is empty. Saves users from hunting for the
               right keyboard shortcut (especially ₹ / €). */}
          <div className="flex items-center gap-1 flex-wrap">
            <Caps size="2xs" color="var(--ds-text-faint)" style={{ paddingRight: spacing[1] }}>
              SYMBOL
            </Caps>
            {CURRENCY_QUICK_INSERT.map((c) => (
              <Button
                key={c.symbol}
                type="button"
                variant="outline"
                size="sm"
                title={`Insert ${c.aria}`}
                aria-label={`Insert ${c.aria}`}
                data-testid={testId ? `${testId}-currency-${c.label.toLowerCase()}` : undefined}
                onClick={() => {
                  const next = applyCurrencySymbol(draftExcel, c.symbol);
                  setDraftExcel(next);
                  commitExcel(next);
                }}
                className="inline-flex h-[22px] min-w-[var(--ds-control-sm-height,28px)] rounded-[var(--ds-radius-md,4px)] border-[var(--ds-border-primary)] bg-[var(--ds-surface-ground)] px-1.5 font-mono text-[length:var(--ds-control-sm-font-size,11px)] leading-none text-[var(--ds-text-primary)] shadow-none hover:bg-[var(--ds-surface-tertiary)]"
              >
                {c.label}
              </Button>
            ))}
          </div>

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
            {/* Apply — commits the current draft and dismisses the popover.
             *  Disabled when the input is empty or syntactically invalid;
             *  the user shouldn't be able to "apply" nothing or a parse-fail. */}
            <ApplyOrClearButton
              icon={<Check size={12} strokeWidth={2.25} />}
              title="Apply format"
              accent="green"
              disabled={!draftExcel.trim() || !isExcelValid}
              data-testid={testId ? `${testId}-apply` : undefined}
              onClick={() => {
                commitExcel(draftExcel);
                close();
              }}
            />
            {/* Clear — wipes the draft AND the committed formatter. Mirrors
             *  the top-bar X but lives next to the input so the user
             *  doesn't have to scroll past the preset grid to reset.
             *  Stays open so the user can immediately type a new format. */}
            <ApplyOrClearButton
              icon={<X size={12} strokeWidth={2.25} />}
              title="Clear format"
              accent="red"
              disabled={!draftExcel && !value}
              data-testid={testId ? `${testId}-clear-inline` : undefined}
              onClick={() => {
                setDraftExcel('');
                onChange(undefined);
              }}
            />
            <ExcelReferencePopover
              onPick={(format) => {
                setDraftExcel(format);
                commitExcel(format);
              }}
              data-testid={testId ? `${testId}-info` : undefined}
            />
          </div>
          <Caps size="2xs" color="var(--ds-text-faint)">
            {EXCEL_EXAMPLES.length} categories of example formats in the{' '}
            <Info size={9} strokeWidth={2} className="inline align-middle" />{' '}
            reference.
          </Caps>
        </div>
      </div>
      )}
    </FormatPopover>
  );
}

/**
 * Small inline action button used next to the custom Excel format
 * input (Apply ✓ / Clear ×). Visually mirrors the top-bar Clear chip
 * — square, monochrome border, accent-tinted icon — so the two button
 * variants and the existing top X all read as the same affordance.
 *
 * Local helper rather than a shared primitive: single use site, and
 * the design-system `Pill` is too heavy for this.
 */
function ApplyOrClearButton({
  icon,
  title,
  accent,
  disabled,
  onClick,
  ...rest
}: {
  icon: React.ReactNode;
  title: string;
  accent: 'green' | 'red';
  disabled?: boolean;
  onClick: () => void;
  'data-testid'?: string;
}) {
  const accentColor =
    accent === 'green'
      ? 'var(--ds-primary)'
      : 'var(--ds-accent-negative)';
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      data-testid={rest['data-testid']}
      className="h-[var(--ds-control-sm-height,28px)] w-[var(--ds-control-sm-height,28px)] shrink-0 rounded-[var(--ds-radius-md,4px)] border-[var(--ds-border-secondary)] bg-transparent p-0 shadow-none transition-[background,border-color,color] transition-duration-[100ms] disabled:opacity-40"
      style={{ color: disabled ? 'var(--ds-text-faint)' : accentColor }}
    >
      {icon}
    </Button>
  );
}
