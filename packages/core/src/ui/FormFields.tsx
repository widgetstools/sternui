import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Input } from './shadcn/input';
import { Select } from './shadcn/select';
import { Switch } from './shadcn/switch';
import { Label } from './shadcn/label';
import { cn } from './shadcn/utils';

/**
 * Shared form field components using Shadcn UI.
 * Use LOCAL state for responsive editing — commit to parent on blur or Enter.
 */

// ─── Field Layout ────────────────────────────────────────────────────────────

interface FieldRowProps {
  label: string;
  desc?: string;
  children: React.ReactNode;
  vertical?: boolean;
}

export function FieldRow({ label, desc, children, vertical }: FieldRowProps) {
  return (
    <div className={cn(
      'flex min-h-7 py-1',
      vertical ? 'flex-col gap-1' : 'items-center justify-between gap-3'
    )}>
      <div className={vertical ? '' : 'shrink-0'}>
        <Label className="text-[11px]">{label}</Label>
        {desc && <p className="text-[9px] text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Switch ──────────────────────────────────────────────────────────────────

export function SwitchField({
  label, desc, checked, onChange,
}: {
  label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <FieldRow label={label} desc={desc}>
      <Switch checked={checked} onChange={() => onChange(!checked)} />
    </FieldRow>
  );
}

// ─── Number Input ────────────────────────────────────────────────────────────

export function NumberField({
  label, desc, value, onChange, min, max, placeholder,
}: {
  label: string; desc?: string; value: number | undefined;
  onChange: (v: number) => void; min?: number; max?: number; placeholder?: string;
}) {
  const [local, setLocal] = useState(String(value ?? ''));
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) { setLocal(String(value ?? '')); committed.current = value; }
  }, [value]);

  const commit = useCallback(() => {
    const n = Number(local);
    if (!isNaN(n) && n !== committed.current) {
      const clamped = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
      committed.current = clamped;
      onChange(clamped);
    }
  }, [local, min, max, onChange]);

  return (
    <FieldRow label={label} desc={desc}>
      <Input
        type="number"
        className="w-20 text-right"
        value={local}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
    </FieldRow>
  );
}

// ─── Text Input ──────────────────────────────────────────────────────────────

export function TextField({
  label, desc, value, onChange, placeholder, mono, width, vertical, error,
}: {
  label: string; desc?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; width?: number; vertical?: boolean; error?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) { setLocal(value); committed.current = value; }
  }, [value]);

  const commit = useCallback(() => {
    if (local !== committed.current) { committed.current = local; onChange(local); }
  }, [local, onChange]);

  return (
    <FieldRow label={label} desc={desc} vertical={vertical}>
      <Input
        className={cn(mono && 'font-mono text-[9px]')}
        style={{ width: width ?? (vertical ? '100%' : 180) }}
        value={local}
        placeholder={placeholder}
        error={error}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
    </FieldRow>
  );
}

// ─── Select ──────────────────────────────────────────────────────────────────

export function SelectField({
  label, desc, value, onChange, options,
}: {
  label: string; desc?: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <FieldRow label={label} desc={desc}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </FieldRow>
  );
}

// ─── Color Picker ────────────────────────────────────────────────────────────

export function ColorField({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-[11px] mb-1 block">{label}</Label>
      <label className="relative block w-6 h-6 rounded border border-border cursor-pointer overflow-hidden"
        style={{ background: value || 'transparent' }}>
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </label>
    </div>
  );
}

// ─── Expression Input ────────────────────────────────────────────────────────

export function ExpressionField({
  label, desc, value, onChange, placeholder, valid,
}: {
  label: string; desc?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; valid?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) { setLocal(value); committed.current = value; }
  }, [value]);

  const commit = useCallback(() => {
    if (local !== committed.current) { committed.current = local; onChange(local); }
  }, [local, onChange]);

  return (
    <FieldRow label={label} desc={desc} vertical>
      <Input
        className="font-mono text-[9px]"
        value={local}
        placeholder={placeholder}
        error={valid === false}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
    </FieldRow>
  );
}
