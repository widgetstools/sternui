import { useState } from 'react';
import { ChevronDown, ChevronLeft, Hash } from 'lucide-react';
import { Button } from '@starui/ui';
import { isValidExcelFormat } from '@starui/engine';
import { controls, radius, spacing } from '@starui/design-system/tokens';
import { FormatDropdown } from '../format-editor';
import { Caps, IconInput } from '../SettingsPanel';
import { ExcelReferencePopover } from './ExcelReferencePopover';
import { triggerCaption, type SharedBodyProps } from './formatterPickerShared';

/**
 * Inline (editor) presentation of FormatterPicker.
 *
 * Kept intentionally unchanged from the previous implementation —
 * editors have the vertical + horizontal room for a full row of
 * controls, and the inline form scans faster than opening a popover
 * on every format tweak inside a dense settings panel.
 *
 * Two sub-layouts:
 *  • `horizontal` (default): collapse-chevron + preset + custom + info + preview.
 *  • `vertical`: stack preset on top (full width), custom + info below.
 *    Suppresses the inline preview (the host header owns that). Designed
 *    for narrow panels (≤400px) like the FormattingPropertiesPanel popout
 *    where a single-row layout would overflow the column.
 */
export function InlineFormatterPicker({
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
  defaultCollapsed,
  layout = 'horizontal',
  testId,
}: SharedBodyProps & { defaultCollapsed: boolean; layout?: 'horizontal' | 'vertical' }) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  // All inline-form rows snap to the md control tier so picker controls
  // align with sibling editor inputs (28px high).
  const rowHeight = controls.md.height;

  // Vertical layout: stack preset on top, custom input + info below.
  // No collapse chevron (the host section is always-expanded in this
  // layout). No inline preview (host header owns that). Everything
  // full-width so it fits a narrow (≤360px) column without overflow.
  if (layout === 'vertical') {
    return (
      <div
        data-testid={testId}
        className="flex flex-col gap-1.5 w-full"
      >
        {/* Preset row — full-width dropdown trigger */}
        <FormatDropdown<string>
          value={activePreset?.id ?? ''}
          onChange={(id) => {
            const match = presets.find((p) => p.id === id);
            if (match) pickPreset(match);
          }}
          options={presets.map((p) => ({
            value: p.id,
            label: p.hint ? `${p.label} — ${p.hint}` : p.label,
          }))}
          width={280}
          trigger={
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="Presets"
              data-testid={testId ? `${testId}-preset` : undefined}
              className="flex h-[var(--ds-control-md-height,28px)] w-full items-center gap-1.5 rounded-[var(--ds-radius-md,4px)] border-[var(--ds-border-primary)] bg-[var(--ds-surface-ground)] px-2.5 py-0 font-[inherit] text-[length:var(--ds-control-sm-font-size,11px)] tracking-[0.02em] text-[var(--ds-text-primary)] shadow-none"
            >
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
                {activePreset?.label ?? 'Preset…'}
              </span>
              <ChevronDown size={12} strokeWidth={1.75} className="opacity-60" />
            </Button>
          }
        />

        {/* Custom format row — input grows, info tooltip pinned right */}
        <div className="flex gap-1.5 w-full">
          <div className="flex-1 min-w-0">
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
              placeholder={dataType === 'date' || dataType === 'datetime' ? 'yyyy-mm-dd' : '#,##0.00'}
              error={!isExcelValid}
              data-testid={testId ? `${testId}-excel` : undefined}
            />
          </div>
          <ExcelReferencePopover
            onPick={(format) => {
              setDraftExcel(format);
              commitExcel(format);
            }}
            data-testid={testId ? `${testId}-info` : undefined}
          />
        </div>
      </div>
    );
  }

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setExpanded(true)}
        title="Expand format picker"
        data-testid={testId ? `${testId}-collapsed` : undefined}
        className="inline-flex h-7 gap-1.5 rounded-sm border-border bg-background px-2 font-sans text-[length:var(--ds-control-sm-font-size)] text-foreground shadow-none transition-[background,border-color] transition-duration-[120ms]"
      >
        <Hash size={12} strokeWidth={1.75} className="opacity-60" />
        <span className="max-w-[140px] whitespace-nowrap overflow-hidden text-ellipsis font-mono tabular-nums">
          {triggerCaption(value, activePreset)}
        </span>
        <ChevronDown size={11} strokeWidth={1.75} className="opacity-50" />
      </Button>
    );
  }

  return (
    <div
      data-testid={testId}
      className="inline-flex items-center gap-1.5 p-1 bg-[var(--ds-surface-secondary)] border border-border rounded-sm font-sans"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setExpanded(false)}
        title="Collapse"
        className="h-[var(--ds-control-md-height,28px)] w-[var(--ds-control-md-height,28px)] shrink-0 border-none bg-transparent p-0 text-[var(--ds-text-muted)] shadow-none hover:bg-transparent hover:text-[var(--ds-text-muted)]"
      >
        <ChevronLeft size={12} strokeWidth={1.75} />
      </Button>

      <FormatDropdown<string>
        value={activePreset?.id ?? ''}
        onChange={(id) => {
          const match = presets.find((p) => p.id === id);
          if (match) pickPreset(match);
        }}
        options={presets.map((p) => ({
          value: p.id,
          label: p.hint ? `${p.label} — ${p.hint}` : p.label,
        }))}
        width={240}
        trigger={
          <Button
            type="button"
            variant="outline"
            size="sm"
            title="Presets"
            data-testid={testId ? `${testId}-preset` : undefined}
            className="inline-flex h-[var(--ds-control-md-height,28px)] min-w-[120px] max-w-[240px] items-center gap-1.5 rounded-[var(--ds-radius-md,4px)] border-[var(--ds-border-primary)] bg-[var(--ds-surface-ground)] px-2.5 py-0 font-[inherit] text-[length:var(--ds-control-sm-font-size,11px)] tracking-[0.02em] text-[var(--ds-text-primary)] shadow-none"
          >
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left">
              {activePreset?.label ?? 'Preset…'}
            </span>
            <ChevronDown size={12} strokeWidth={1.75} className="opacity-60" />
          </Button>
        }
      />

      <div className="w-[180px]">
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
          placeholder={dataType === 'date' || dataType === 'datetime' ? 'yyyy-mm-dd' : '#,##0.00'}
          error={!isExcelValid}
          data-testid={testId ? `${testId}-excel` : undefined}
        />
      </div>

      <ExcelReferencePopover
        onPick={(format) => {
          setDraftExcel(format);
          commitExcel(format);
        }}
        data-testid={testId ? `${testId}-info` : undefined}
      />

      {preview ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing[1],
            height: rowHeight,
            padding: `0 ${spacing[2]}px`,
            background: 'var(--ds-primary-soft)',
            border: '1px dashed var(--ds-border-secondary)',
            borderRadius: radius.md,
            color: 'var(--ds-primary)',
            fontFamily: 'var(--ds-font-mono)',
            fontSize: controls.sm.fontSize,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 180,
          }}
          title={`Preview: ${preview}`}
        >
          <Caps size="2xs" color="var(--ds-primary)">
            PREVIEW
          </Caps>
          {preview}
        </span>
      ) : null}
    </div>
  );
}
