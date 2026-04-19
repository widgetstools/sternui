/**
 * FormatterPicker — kind dropdown + custom-format input + live preview.
 *
 * Emits `ValueFormatterTemplate`. Three authoring modes:
 *
 *   1. Preset — dropdown of curated excel / tick / expression presets for
 *      the host's `dataType`. Picking a preset emits the preset's template
 *      wholesale.
 *   2. Custom Excel format — mono input. SSF compiles the string; when it
 *      fails `isValidExcelFormat` returns false, the input turns red.
 *   3. Tick (bond convention) — sub-select for 32 / 32+ / 64 / 128 / 256.
 *
 * Live preview rendered via `valueFormatterFromTemplate` against the
 * host's `sampleValue` (or the `defaultSampleValue` for the dataType).
 */
import { useMemo, useState } from 'react';
import {
  presetsForDataType,
  findMatchingPreset,
  defaultSampleValue,
  type FormatterPreset,
  type FormatterPickerDataType,
} from './presetsForDataType';
import {
  isValidExcelFormat,
  valueFormatterFromTemplate,
  type ValueFormatterTemplate,
} from '../../colDef';
import { IconInput, Mono, Caps } from '../settings';

export interface FormatterPickerProps {
  value?: ValueFormatterTemplate;
  onChange: (next: ValueFormatterTemplate | undefined) => void;
  dataType: FormatterPickerDataType;
  sampleValue?: unknown;
  'data-testid'?: string;
}

export function FormatterPicker({
  value,
  onChange,
  dataType,
  sampleValue,
  'data-testid': testId,
}: FormatterPickerProps) {
  const presets = useMemo(() => presetsForDataType(dataType), [dataType]);
  const matchingPreset = useMemo(() => findMatchingPreset(dataType, value), [dataType, value]);

  const [customMode, setCustomMode] = useState<'preset' | 'excel' | 'expression'>(() => {
    if (!value) return 'preset';
    if (value.kind === 'expression') return 'expression';
    if (value.kind === 'excelFormat' && !matchingPreset) return 'excel';
    return 'preset';
  });

  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['preset', 'excel', 'expression'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setCustomMode(m)}
            style={{
              padding: '4px 10px',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              background: customMode === m ? 'var(--ck-green)' : 'var(--ck-card)',
              color: customMode === m ? '#0b0e11' : 'var(--ck-t1)',
              border: '1px solid var(--ck-border-hi)',
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >{m === 'excel' ? 'Excel' : m[0].toUpperCase() + m.slice(1)}</button>
        ))}
      </div>

      {customMode === 'preset' && (
        <PresetDropdown
          presets={presets}
          selected={matchingPreset}
          onPick={(preset) => onChange(preset?.template)}
        />
      )}

      {customMode === 'excel' && (
        <ExcelInput
          value={value?.kind === 'excelFormat' ? value.format : ''}
          onCommit={(format) => {
            if (!format.trim()) { onChange(undefined); return; }
            onChange({ kind: 'excelFormat', format });
          }}
        />
      )}

      {customMode === 'expression' && (
        <ExpressionInput
          value={value?.kind === 'expression' ? value.expression : ''}
          onCommit={(expression) => {
            if (!expression.trim()) { onChange(undefined); return; }
            onChange({ kind: 'expression', expression });
          }}
        />
      )}

      {/* Live preview */}
      <Preview
        template={value}
        sample={sampleValue ?? matchingPreset?.sampleValue ?? defaultSampleValue(dataType)}
      />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function PresetDropdown({
  presets,
  selected,
  onPick,
}: {
  presets: ReadonlyArray<FormatterPreset>;
  selected: FormatterPreset | undefined;
  onPick: (preset: FormatterPreset | undefined) => void;
}) {
  return (
    <select
      value={selected?.id ?? ''}
      onChange={(e) => {
        const id = e.target.value;
        if (!id) { onPick(undefined); return; }
        const preset = presets.find((p) => p.id === id);
        onPick(preset);
      }}
      style={{
        height: 30,
        padding: '0 8px',
        background: 'var(--ck-bg)',
        border: '1px solid var(--ck-border-hi)',
        color: 'var(--ck-t0)',
        fontSize: 11,
        fontFamily: 'var(--ck-font-mono)',
        borderRadius: 3,
      }}
    >
      <option value="">— No format —</option>
      {presets.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}{p.hint ? ` — ${p.hint}` : ''}
        </option>
      ))}
    </select>
  );
}

function ExcelInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (format: string) => void;
}) {
  const valid = !value || isValidExcelFormat(value);
  return (
    <div>
      <IconInput
        value={value}
        onCommit={onCommit}
        placeholder="#,##0.00"
        style={{
          borderColor: valid ? 'var(--ck-border-hi)' : 'var(--ck-red, #ef4444)',
          fontFamily: 'var(--ck-font-mono)',
        }}
      />
      {!valid && (
        <Mono size={10} color="var(--ck-red, #ef4444)" style={{ marginTop: 4 }}>
          invalid excel format
        </Mono>
      )}
    </div>
  );
}

function ExpressionInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (expression: string) => void;
}) {
  return (
    <IconInput
      value={value}
      onCommit={onCommit}
      placeholder="x.toFixed(2)"
      style={{ fontFamily: 'var(--ck-font-mono)' }}
    />
  );
}

function Preview({
  template,
  sample,
}: {
  template: ValueFormatterTemplate | undefined;
  sample: unknown;
}) {
  const rendered = useMemo(() => {
    if (!template) return String(sample);
    try {
      const fn = valueFormatterFromTemplate(template);
      return fn({ value: sample });
    } catch {
      return '—';
    }
  }, [template, sample]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '6px 10px',
      background: 'var(--ck-bg)',
      border: '1px dashed var(--ck-border)',
      borderRadius: 2,
    }}>
      <Caps size={9} color="var(--ck-t3)">Preview</Caps>
      <Mono size={11} color="var(--ck-t0)">{rendered}</Mono>
    </div>
  );
}
