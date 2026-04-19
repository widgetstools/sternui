/**
 * <StyleEditor /> — the one editor every panel uses for styling a grid
 * element (cell, header, row, group header). Four sections:
 *
 *   Text   — bold/italic/underline/strike · align · size · weight
 *   Color  — text color · background color
 *   Border — per-side width / style / color
 *   Format — via <FormatterPicker />
 *
 * Sections are opt-in via the `sections` prop; the section indices stay
 * sequential (01, 02, 03…) regardless of subset, so numbering stays tidy.
 */
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Underline,
} from 'lucide-react';
import {
  Band,
  Caps,
  IconInput,
  PillBtn,
  PillGroup,
  Row,
  Stepper,
} from '../settings';
import { CompactColorField } from '../ColorPicker';
import { FormatterPicker, type FormatterPickerDataType } from '../FormatterPicker';
import type {
  StyleEditorDataType,
  StyleEditorSection,
  StyleEditorValue,
  TextAlign,
} from './types';
import type { BorderSpec } from '../../colDef';

export interface StyleEditorProps {
  value: StyleEditorValue;
  onChange: (patch: Partial<StyleEditorValue>) => void;
  /** Which bands to render. Default: all four. */
  sections?: StyleEditorSection[];
  /** Narrow the Format section's preset menu. `undefined` hides the section. */
  dataType?: StyleEditorDataType;
  /** Optional sample value for the Format section's live preview. */
  sampleValue?: unknown;
  /** Starting band index — lets the host embed the editor inside a numbered
   *  panel and continue the index sequence. Default `'01'`. */
  startIndex?: number;
  'data-testid'?: string;
}

const DEFAULT_SECTIONS: StyleEditorSection[] = ['text', 'color', 'border', 'format'];

export function StyleEditor({
  value,
  onChange,
  sections = DEFAULT_SECTIONS,
  dataType,
  sampleValue,
  startIndex = 1,
  'data-testid': testId,
}: StyleEditorProps) {
  const enabled = new Set(sections);
  let i = startIndex;
  const nextIdx = () => String(i++).padStart(2, '0');

  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column' }}>
      {enabled.has('text') && <TextSection index={nextIdx()} value={value} onChange={onChange} />}
      {enabled.has('color') && <ColorSection index={nextIdx()} value={value} onChange={onChange} />}
      {enabled.has('border') && <BorderSection index={nextIdx()} value={value} onChange={onChange} />}
      {enabled.has('format') && dataType && (
        <FormatSection index={nextIdx()} value={value} onChange={onChange} dataType={dataType} sampleValue={sampleValue} />
      )}
    </div>
  );
}

// ─── Text ───────────────────────────────────────────────────────────────────

interface SectionProps {
  index: string;
  value: StyleEditorValue;
  onChange: (patch: Partial<StyleEditorValue>) => void;
}

function TextSection({ index, value, onChange }: SectionProps) {
  const toggle = (key: 'bold' | 'italic' | 'underline' | 'strikethrough') =>
    onChange({ [key]: !value[key] });
  const setAlign = (a: TextAlign) => onChange({ align: value.align === a ? undefined : a });

  return (
    <Band index={index} title="Type">
      <Row
        label="Style"
        control={
          <PillGroup>
            <PillBtn active={!!value.bold} onClick={() => toggle('bold')} title="Bold"><Bold size={12} strokeWidth={2.25} /></PillBtn>
            <PillBtn active={!!value.italic} onClick={() => toggle('italic')} title="Italic"><Italic size={12} strokeWidth={2.25} /></PillBtn>
            <PillBtn active={!!value.underline} onClick={() => toggle('underline')} title="Underline"><Underline size={12} strokeWidth={2.25} /></PillBtn>
            <PillBtn active={!!value.strikethrough} onClick={() => toggle('strikethrough')} title="Strike"><Strikethrough size={12} strokeWidth={2.25} /></PillBtn>
          </PillGroup>
        }
      />
      <Row
        label="Align"
        control={
          <PillGroup>
            <PillBtn active={value.align === 'left'} onClick={() => setAlign('left')}><AlignLeft size={12} strokeWidth={2.25} /></PillBtn>
            <PillBtn active={value.align === 'center'} onClick={() => setAlign('center')}><AlignCenter size={12} strokeWidth={2.25} /></PillBtn>
            <PillBtn active={value.align === 'right'} onClick={() => setAlign('right')}><AlignRight size={12} strokeWidth={2.25} /></PillBtn>
            <PillBtn active={value.align === 'justify'} onClick={() => setAlign('justify')}><AlignJustify size={12} strokeWidth={2.25} /></PillBtn>
          </PillGroup>
        }
      />
      <Row
        label="Size"
        control={
          <Stepper
            value={value.fontSize ?? 0}
            onChange={(n) => onChange({ fontSize: n > 0 ? n : undefined })}
            min={0}
            max={72}
          />
        }
      />
      <Row
        label="Weight"
        control={
          <Stepper
            value={value.fontWeight ?? 400}
            onChange={(n) => {
              const allowed: Array<400 | 500 | 600 | 700> = [400, 500, 600, 700];
              const next = (allowed as number[]).includes(n) ? (n as 400 | 500 | 600 | 700) : undefined;
              onChange({ fontWeight: next });
            }}
            min={400}
            max={700}
            step={100}
          />
        }
      />
    </Band>
  );
}

// ─── Color ──────────────────────────────────────────────────────────────────

function ColorSection({ index, value, onChange }: SectionProps) {
  return (
    <Band index={index} title="Color">
      <Row
        label="Text"
        control={
          <CompactColorField
            value={value.color}
            onChange={(next) => onChange({ color: next })}
            onClear={() => onChange({ color: undefined })}
          />
        }
      />
      <Row
        label="Background"
        control={
          <CompactColorField
            value={value.backgroundColor}
            onChange={(next) => onChange({ backgroundColor: next })}
            onClear={() => onChange({ backgroundColor: undefined })}
          />
        }
      />
    </Band>
  );
}

// ─── Border ─────────────────────────────────────────────────────────────────

const SIDES: Array<keyof NonNullable<StyleEditorValue['borders']>> = ['top', 'right', 'bottom', 'left'];
const STYLE_OPTIONS: BorderSpec['style'][] = ['solid', 'dashed', 'dotted'];

function BorderSection({ index, value, onChange }: SectionProps) {
  const setSide = (side: typeof SIDES[number], next: BorderSpec | undefined) => {
    const borders = { ...(value.borders ?? {}), [side]: next };
    // Strip undefined sides so equality compares cleanly.
    const cleaned: StyleEditorValue['borders'] = {};
    for (const s of SIDES) if (borders[s]) cleaned[s] = borders[s];
    onChange({ borders: Object.keys(cleaned).length > 0 ? cleaned : undefined });
  };

  return (
    <Band index={index} title="Border">
      {SIDES.map((side) => (
        <Row
          key={side}
          label={side[0].toUpperCase() + side.slice(1)}
          control={<SideEditor spec={value.borders?.[side]} onChange={(s) => setSide(side, s)} />}
        />
      ))}
    </Band>
  );
}

function SideEditor({ spec, onChange }: { spec?: BorderSpec; onChange: (next?: BorderSpec) => void }) {
  const current: BorderSpec = spec ?? { width: 0, color: '#000000', style: 'solid' };
  const touch = (patch: Partial<BorderSpec>) => {
    const next = { ...current, ...patch };
    onChange(next.width > 0 ? next : undefined);
  };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <IconInput
        value={String(current.width)}
        numeric
        suffix="px"
        style={{ width: 80 }}
        onCommit={(raw) => {
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) touch({ width: n });
        }}
      />
      <select
        value={current.style}
        onChange={(e) => touch({ style: e.target.value as BorderSpec['style'] })}
        style={{
          height: 26, padding: '0 6px', fontSize: 10,
          background: 'var(--ck-bg)', color: 'var(--ck-t0)',
          border: '1px solid var(--ck-border-hi)', borderRadius: 2,
        }}
      >
        {STYLE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <div style={{ width: 110 }}>
        <CompactColorField
          value={current.color}
          onChange={(next) => touch({ color: next })}
        />
      </div>
    </div>
  );
}

// ─── Format ─────────────────────────────────────────────────────────────────

function FormatSection({
  index, value, onChange, dataType, sampleValue,
}: SectionProps & { dataType: StyleEditorDataType; sampleValue?: unknown }) {
  const pickerType = toPickerDataType(dataType);
  return (
    <Band index={index} title="Format">
      <div style={{ padding: '4px 0' }}>
        <Caps size={9} color="var(--ck-t3)" style={{ display: 'block', marginBottom: 8 }}>
          Value Format
        </Caps>
        <FormatterPicker
          value={value.valueFormatter}
          onChange={(next) => onChange({ valueFormatter: next })}
          dataType={pickerType}
          sampleValue={sampleValue}
        />
      </div>
    </Band>
  );
}

function toPickerDataType(dt: StyleEditorDataType): FormatterPickerDataType {
  // The StyleEditor carries the coarse AG-Grid data type; FormatterPicker
  // wants the narrower authoring-time enum. Booleans and text map 1:1;
  // numbers and dates lean on the matching preset group.
  switch (dt) {
    case 'number':  return 'number';
    case 'date':    return 'date';
    case 'boolean': return 'boolean';
    case 'text':    return 'string';
  }
}
