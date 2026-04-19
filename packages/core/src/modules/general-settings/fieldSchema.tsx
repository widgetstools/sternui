/**
 * Declarative field schema + renderer for the GridOptionsPanel.
 *
 * Why schema-driven: the v2-verbatim panel was 1400 LOC of hand-rolled
 * JSX for ~80 controls. Every field is a `<Row label control={...}>` with
 * the SAME row shape, just a different control underneath. Making fields
 * data lets us:
 *   - collapse 1400 LOC → ~150 LOC of schema data + this renderer,
 *   - test the renderer once instead of 80× separately,
 *   - extend a new tier by adding a record to the schema, not a new JSX block.
 *
 * Visual fidelity is guaranteed because the renderer emits the SAME
 * `<Band>` + `<Row label hint control>` markup v2 uses. The Cockpit
 * primitives (Band, Row, SubLabel, SharpBtn, ...) are unchanged from
 * v2-baseline, so the pixel-rendering is identical.
 */
import type { ReactNode } from 'react';
import {
  Band,
  IconInput,
  SubLabel,
} from '../../ui/SettingsPanel';
import { Select, Switch } from '../../ui/shadcn';
import type { GeneralSettingsState } from './state';

// ─── Row primitive (local — matches v2's Row byte-for-byte) ────────────
//
// Declared here rather than in the v3 SettingsPanel barrel because it's
// panel-level chrome; no other panel uses it.

export interface RowProps {
  label: string;
  hint?: string;
  control: ReactNode;
  /** Optional test id applied to the row `<div>`. */
  'data-testid'?: string;
}

export function Row({ label, hint, control, ...rest }: RowProps) {
  return (
    <div
      className="gc-option-row"
      data-testid={rest['data-testid']}
      style={{
        display: 'grid',
        gridTemplateColumns: '180px 1fr',
        alignItems: 'center',
        columnGap: 20,
        rowGap: 4,
        padding: '8px 0',
        borderBottom: '1px solid color-mix(in srgb, var(--ck-border) 50%, transparent)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 0.12,
          textTransform: 'uppercase', color: 'var(--ck-t2)',
        }}>{label}</span>
        {hint && (
          <span style={{ fontSize: 10, color: 'var(--ck-t3)', lineHeight: 1.35 }}>{hint}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{control}</div>
    </div>
  );
}

// ─── Control primitives ────────────────────────────────────────────────
//
// Each thin control aligns v2's inline patterns. Size + padding + colour
// come from the Cockpit `--ck-*` token system on `.gc-sheet-v2` so the
// look is unchanged from v2-baseline.

export function BoolControl({ checked, onChange, testId }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
    </div>
  );
}

export function NumberControl({
  value,
  onChange,
  min,
  suffix,
  testId,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  suffix?: string;
  testId?: string;
}) {
  return (
    <IconInput
      value={String(value)}
      numeric
      suffix={suffix}
      onCommit={(raw) => {
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (min != null && n < min) return onChange(min);
        onChange(n);
      }}
      data-testid={testId}
      style={{ maxWidth: 180 }}
    />
  );
}

/**
 * Optional-number control — emits `undefined` on empty / invalid, a number
 * otherwise. Used for DEFAULT COLDEF's max-width / width / flex which
 * have no sensible default value.
 */
export function OptNumberControl({
  value,
  onChange,
  min,
  max,
  suffix,
  testId,
  placeholder = 'auto',
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  suffix?: string;
  testId?: string;
  placeholder?: string;
}) {
  return (
    <IconInput
      value={value === undefined ? '' : String(value)}
      numeric
      suffix={suffix}
      placeholder={placeholder}
      onCommit={(raw) => {
        if (raw.trim() === '') return onChange(undefined);
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        if (min != null && n < min) return;
        if (max != null && n > max) return;
        onChange(n);
      }}
      data-testid={testId}
      style={{ maxWidth: 180 }}
    />
  );
}

export function TextControl({
  value,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <IconInput
      value={value}
      onCommit={onChange}
      placeholder={placeholder}
      data-testid={testId}
      style={{ maxWidth: 280 }}
    />
  );
}

// ─── Select with sentinel-encoded `undefined` / `''` values ────────────
//
// HTML `<select>` values are strings. Grid Options state carries
// `undefined` (e.g. `rowSelection: undefined` = "off") and `''`
// (e.g. `clipboardDelimiter: '\t'` where empty means "tab"). Encode
// those through sentinels so the select round-trips without losing
// the narrowed union type.

const SEL_NONE = '__none__';
const SEL_EMPTY = '__empty__';

function encode(v: unknown): string {
  if (v === undefined) return SEL_NONE;
  if (v === '') return SEL_EMPTY;
  return String(v);
}

function decode<T>(encoded: string, options: ReadonlyArray<{ value: T }>): T {
  if (encoded === SEL_NONE) return undefined as unknown as T;
  if (encoded === SEL_EMPTY) return '' as unknown as T;
  const hit = options.find((o) => encode(o.value) === encoded);
  return hit ? hit.value : (encoded as unknown as T);
}

export function SelectControl<T extends string | undefined | boolean | number>({
  value,
  onChange,
  options,
  testId,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  testId?: string;
}) {
  return (
    <Select
      value={encode(value)}
      onChange={(e) => onChange(decode<T>(e.target.value, options))}
      data-testid={testId}
      style={{ maxWidth: 240, flex: '1 1 auto' }}
    >
      {options.map((opt) => (
        <option key={encode(opt.value)} value={encode(opt.value)}>
          {opt.label}
        </option>
      ))}
    </Select>
  );
}

// ─── Field schema ─────────────────────────────────────────────────────

type StateKey = keyof GeneralSettingsState;

/**
 * Deep-typed helper: asserts that the given `key` is of type T on the
 * state object. Guards the rendering functions against accidental
 * mismatched keys at the schema level.
 */
type KeyOfType<S, T> = { [K in keyof S]: S[K] extends T ? K : never }[keyof S];

export type Field =
  | {
      kind: 'bool';
      key: KeyOfType<GeneralSettingsState, boolean>;
      label: string;
      hint?: string;
      testId: string;
      /** When true, the UI switch shows the INVERSE of the state value.
       *  Used for tokens like `suppressGroupRowsSticky` where the label
       *  in the UI is "STICKY GROUPS" (positive) but the underlying
       *  option is a suppress-flag. */
      invert?: boolean;
    }
  | { kind: 'num'; key: KeyOfType<GeneralSettingsState, number>; label: string; hint?: string; testId: string; min?: number; suffix?: string }
  | { kind: 'optNum'; key: KeyOfType<GeneralSettingsState, number | undefined>; label: string; hint?: string; testId: string; min?: number; max?: number; suffix?: string; placeholder?: string }
  | { kind: 'text'; key: KeyOfType<GeneralSettingsState, string>; label: string; hint?: string; testId: string; placeholder?: string }
  | {
      kind: 'select';
      key: StateKey;
      label: string;
      hint?: string;
      testId: string;
      options: ReadonlyArray<{ value: unknown; label: string }>;
    }
  | { kind: 'subsection'; title: string; fields: ReadonlyArray<Field> }
  | {
      kind: 'conditional';
      /** Show these fields only when `show(state)` is true. */
      show: (state: GeneralSettingsState) => boolean;
      fields: ReadonlyArray<Field>;
    }
  | {
      /** Custom control escape hatch. Renders an arbitrary React element.
       *  Used for the one-off PAGINATION page-size + auto row where the
       *  row's right column contains two controls side-by-side. */
      kind: 'custom';
      label: string;
      hint?: string;
      testId: string;
      render: (
        state: GeneralSettingsState,
        update: <K extends StateKey>(key: K, value: GeneralSettingsState[K]) => void,
      ) => ReactNode;
    };

export interface BandSchema {
  index: string;
  title: string;
  fields: ReadonlyArray<Field>;
}

// ─── Renderer ─────────────────────────────────────────────────────────

export function FieldRenderer({
  field,
  state,
  update,
}: {
  field: Field;
  state: GeneralSettingsState;
  update: <K extends StateKey>(key: K, value: GeneralSettingsState[K]) => void;
}) {
  switch (field.kind) {
    case 'bool': {
      const stored = state[field.key] as boolean;
      const shown = field.invert ? !stored : stored;
      return (
        <Row label={field.label} hint={field.hint} control={
          <BoolControl
            checked={shown}
            onChange={(v) => update(field.key, (field.invert ? !v : v) as GeneralSettingsState[typeof field.key])}
            testId={field.testId}
          />
        } />
      );
    }
    case 'num':
      return (
        <Row label={field.label} hint={field.hint} control={
          <NumberControl
            value={state[field.key]}
            onChange={(v) => update(field.key, v as GeneralSettingsState[typeof field.key])}
            min={field.min}
            suffix={field.suffix}
            testId={field.testId}
          />
        } />
      );
    case 'optNum':
      return (
        <Row label={field.label} hint={field.hint} control={
          <OptNumberControl
            value={state[field.key]}
            onChange={(v) => update(field.key, v as GeneralSettingsState[typeof field.key])}
            min={field.min}
            max={field.max}
            suffix={field.suffix}
            testId={field.testId}
            placeholder={field.placeholder}
          />
        } />
      );
    case 'text':
      return (
        <Row label={field.label} hint={field.hint} control={
          <TextControl
            value={state[field.key]}
            onChange={(v) => update(field.key, v as GeneralSettingsState[typeof field.key])}
            placeholder={field.placeholder}
            testId={field.testId}
          />
        } />
      );
    case 'select':
      return (
        <Row label={field.label} hint={field.hint} control={
          <SelectControl
            value={state[field.key] as never}
            onChange={(v) => update(field.key, v as GeneralSettingsState[typeof field.key])}
            options={field.options as ReadonlyArray<{ value: never; label: string }>}
            testId={field.testId}
          />
        } />
      );
    case 'subsection':
      return (
        <>
          <SubLabel>{field.title}</SubLabel>
          {field.fields.map((f, i) => <FieldRenderer key={i} field={f} state={state} update={update} />)}
        </>
      );
    case 'conditional':
      if (!field.show(state)) return null;
      return (
        <>
          {field.fields.map((f, i) => <FieldRenderer key={i} field={f} state={state} update={update} />)}
        </>
      );
    case 'custom':
      return (
        <Row label={field.label} hint={field.hint} control={field.render(state, update)} />
      );
  }
}

export function BandRenderer({
  band,
  state,
  update,
}: {
  band: BandSchema;
  state: GeneralSettingsState;
  update: <K extends StateKey>(key: K, value: GeneralSettingsState[K]) => void;
}) {
  return (
    <Band index={band.index} title={band.title}>
      {band.fields.map((f, i) => (
        <FieldRenderer key={i} field={f} state={state} update={update} />
      ))}
    </Band>
  );
}
