import React, { useState, useRef, useEffect } from 'react';
import { Input } from './shadcn/input';
import { Select } from './shadcn/select';
import { Switch } from './shadcn/switch';
import { Label } from './shadcn/label';
import { cn } from './shadcn/utils';
import { ChevronRight } from 'lucide-react';
import { FormatPopover } from './format-editor/FormatPopover';
import { FormatColorPicker } from './format-editor/FormatColorPicker';

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

export function PropColor({ value, onChange, onClear, label }: {
  value: string | undefined;
  onChange: (v: string) => void;
  /** When provided AND value is set, a small × clear-button is shown next to
   * the swatch so the user can drop the color back to undefined without
   * having to type/guess a sentinel. Callers keep backwards compatibility by
   * simply not passing `onClear`. */
  onClear?: () => void;
  label?: string;
}) {
  const hasValue = Boolean(value);
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[9px] text-muted-foreground w-6">{label}</span>}
      <FormatPopover
        trigger={
          <button
            className="relative block w-6 h-6 rounded border border-border cursor-pointer overflow-hidden"
            style={{ background: value || 'transparent' }}
            title={value ? `Edit ${value}` : 'Pick a color'}
          >
            {/* Diagonal "empty" hatching when no color is set, so the user
                can distinguish an un-set color from a transparent one. */}
            {!hasValue && (
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, var(--gc-border, #313944) 0 1px, transparent 1px 4px)',
                }}
              />
            )}
          </button>
        }
        width={240}
      >
        <FormatColorPicker
          value={value || '#000000'}
          onChange={(c) => { if (c) onChange(c); }}
        />
      </FormatPopover>
      <span className="text-[9px] font-mono text-muted-foreground">
        {value || '—'}
      </span>
      {onClear && hasValue && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClear();
          }}
          className="flex items-center justify-center w-4 h-4 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          style={{ fontSize: 11, lineHeight: 1 }}
          title="Clear color"
          aria-label="Clear color"
        >
          ×
        </button>
      )}
    </div>
  );
}
