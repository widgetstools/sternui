import React, { useState, useRef, useEffect } from 'react';
import { Input } from './shadcn/input';
import { Select } from './shadcn/select';
import { Switch } from './shadcn/switch';
import { Label } from './shadcn/label';
import { ColorPicker } from './shadcn/color-picker';
import { cn } from './shadcn/utils';
import { ChevronRight } from 'lucide-react';

/**
 * PropertyPanel — Figma/VS-style collapsible property section.
 * Uses Shadcn UI components throughout.
 */

// ─── Collapsible Section ─────────────────────────────────────────────────────

interface PropertySectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PropertySection({ title, badge, defaultOpen = true, actions, children }: PropertySectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden mb-2">
      <div
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer select-none border-b border-border hover:bg-accent/50"
      >
        <ChevronRight className={cn('size-3 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="text-[9px] font-semibold uppercase tracking-[0.05em] text-muted-foreground flex-1">
          {title}
        </span>
        {badge !== undefined && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
            {badge}
          </span>
        )}
        {actions && (
          <div onClick={(e) => e.stopPropagation()} className="flex gap-1">
            {actions}
          </div>
        )}
      </div>
      {open && (
        <div className="px-2.5 py-1.5">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Property Row ────────────────────────────────────────────────────────────

interface PropRowProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  vertical?: boolean;
}

export function PropRow({ label, hint, children, vertical }: PropRowProps) {
  if (vertical) {
    return (
      <div className="mb-1.5">
        <Label className="text-[10px] text-muted-foreground mb-1 block">
          {label}
          {hint && <span className="font-normal ml-1 opacity-70">{hint}</span>}
        </Label>
        {children}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1 min-h-7 gap-2">
      <div className="shrink-0">
        <Label className="text-[11px]">{label}</Label>
        {hint && <p className="text-[9px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Inline Controls ─────────────────────────────────────────────────────────

export function PropSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <Switch checked={checked} onChange={() => onChange(!checked)} />;
}

export function PropSelect({ value, onChange, options, width }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; width?: number;
}) {
  return (
    <Select style={{ width }} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}

export function PropNumber({ value, onChange, min, max, placeholder, width }: {
  value: number | string; onChange: (v: number) => void;
  min?: number; max?: number; placeholder?: string; width?: number;
}) {
  const [local, setLocal] = React.useState(String(value ?? ''));
  const ref = React.useRef(String(value ?? ''));

  React.useEffect(() => {
    const sv = String(value ?? '');
    if (sv !== ref.current) { setLocal(sv); ref.current = sv; }
  }, [value]);

  const commit = () => {
    const n = Number(local);
    if (!isNaN(n) && String(n) !== ref.current) { ref.current = String(n); onChange(n); }
  };

  return (
    <Input type="number" className={cn('text-right', width ? '' : 'w-16')} style={{ width }}
      value={local} min={min} max={max} placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
  );
}

export function PropText({ value, onChange, placeholder, mono, width }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; width?: number;
}) {
  const [local, setLocal] = React.useState(value);
  const ref = React.useRef(value);

  React.useEffect(() => {
    if (value !== ref.current) { setLocal(value); ref.current = value; }
  }, [value]);

  const commit = () => {
    if (local !== ref.current) { ref.current = local; onChange(local); }
  };

  return (
    <Input className={cn(mono && 'font-mono text-[9px]')} style={{ width }}
      value={local} placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
  );
}

export function PropColor({ value, onChange, label }: {
  value: string | undefined; onChange: (v: string) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT') return;
      if (ref.current && !ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="flex items-center gap-1.5" ref={ref}>
      {label && <span className="text-[9px] text-muted-foreground w-6">{label}</span>}
      <button
        className="relative block w-6 h-6 rounded border border-border cursor-pointer overflow-hidden"
        style={{ background: value || 'transparent' }}
        onClick={() => setOpen(!open)}
      />
      <span className="text-[9px] font-mono text-muted-foreground cursor-pointer" onClick={() => setOpen(!open)}>
        {value || '—'}
      </span>
      {open && (
        <div className="absolute z-50 mt-1 top-full left-0 rounded-[6px] border border-border bg-card shadow-lg shadow-black/25">
          <ColorPicker
            value={value}
            onChange={(c) => { if (c) onChange(c); setOpen(false); }}
            allowClear={false}
            compact
          />
        </div>
      )}
    </div>
  );
}
