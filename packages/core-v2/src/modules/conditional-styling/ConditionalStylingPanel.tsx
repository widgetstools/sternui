import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ExpressionEngine,
  PropertySection,
  PropRow,
  PropSelect,
  PropNumber,
  PropText,
  PropColor,
  Button,
  Input,
  Switch,
  Tooltip,
  ColorPickerPopover,
  cn,
} from '@grid-customizer/core';
import {
  Plus, Trash2, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  Type, PaintBucket, Sun, Moon,
  Square, X, ChevronDown,
  PanelTop, PanelBottom, PanelLeft, PanelRight,
  Grid3X3,
} from 'lucide-react';
import type { CellStyleProperties } from '@grid-customizer/core';
import type { SettingsPanelProps } from '../../core/types';
import { useGridStore, useGridCore } from '../../ui/GridContext';
import { useModuleState } from '../../store/useModuleState';
import type { ConditionalRule, ConditionalStylingState } from './state';

/**
 * v2 SettingsPanel for the conditional-styling module.
 *
 * Adapted from the v1 panel (packages/core/src/modules/conditional-styling/
 * ConditionalStylingPanel.tsx) — same shape, same UX, but rewired against:
 *   - v2's `useModuleState(store, id)` (takes a store handle, not a context)
 *   - v2's `useGridStore` / `useGridCore` (the v2 GridProvider)
 *   - v2's column enumeration (live from `core.getGridApi()` directly,
 *     replacing v1's ColumnPickerMulti which couples to the v1 core context)
 *
 * No drafts. v2 has no draft layer — every edit lands in the live store and
 * the auto-save subscriber persists it on a 300ms debounce. This is a
 * deliberate simplification of v1's apply/discard flow.
 */

const engine = new ExpressionEngine();

// ─── Portal popover ─────────────────────────────────────────────────────────
//
// The shared `Popover` from @grid-customizer/core uses `position: absolute`
// inline — fine in most places, but the conditional-styling rule editor lives
// inside a `PropertySection` whose card wrapper sets `overflow: hidden`, so
// any popover content rendered as a descendant gets clipped.
//
// This local PortalPopover renders the menu into a floating layer on `body`
// positioned next to the trigger, so the overflow ancestor never sees it.
// Uses React.cloneElement to attach the open/close click handler directly
// onto the trigger button — avoids relying on event bubbling past any inner
// stopPropagation calls the trigger button may have.
function PortalPopover({
  trigger,
  children,
  className,
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void; ref?: React.Ref<HTMLElement> }>;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (triggerRef.current?.contains(target) || contentRef.current?.contains(target)) return;
      if (target.tagName === 'SELECT' || target.tagName === 'INPUT' || target.tagName === 'OPTION') return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const prevOnClick = trigger.props.onClick;
  const clonedTrigger = React.cloneElement(trigger, {
    ref: (el: HTMLElement | null) => { triggerRef.current = el; },
    onClick: (e: React.MouseEvent) => {
      prevOnClick?.(e);
      setOpen((p) => !p);
    },
  });

  return (
    <>
      {clonedTrigger}
      {open && createPortal(
        <div
          ref={contentRef}
          className={cn(
            'rounded-md border border-border bg-card shadow-lg',
            className,
          )}
          // Use inline styles for position/z-index so we don't depend on the
          // host app's Tailwind JIT picking up arbitrary classes like
          // `z-[10100]` from a deeply-nested package source file.
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 10100,
          }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Style editor (rich formatting palette for a single rule) ───────────────
//
// Writes to the rule's `CellStyleProperties` shape (flat v1 shape — fontWeight,
// color, backgroundColor, textAlign, borderTopWidth, ...). Most controls push
// the same value into both `rule.style.light` and `rule.style.dark` because
// type/alignment/border choices shouldn't change between themes; only the
// backgrounds have separate per-theme pickers.

/** Toolbar icon button — same look as markets-grid-v2 FormattingToolbar */
function CsTBtn({ children, active, onClick, tooltip, className }: {
  children: React.ReactNode; active?: boolean; onClick?: () => void;
  tooltip?: string; className?: string;
}) {
  const btn = (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn(
        'shrink-0 w-7 h-7 rounded-[4px] transition-all duration-150 gc-tbtn',
        active && 'gc-tbtn-active',
        className,
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
    >
      {children}
    </Button>
  );
  return tooltip ? <Tooltip content={tooltip}>{btn}</Tooltip> : btn;
}

function CsTGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-0.5 px-1.5 py-1 rounded-[4px] bg-accent/40', className)}>
      {children}
    </div>
  );
}

const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 24];

/** Apply `patch` to both light and dark style sub-objects. Passing `undefined`
 * for a key removes it so toggle-off truly drops the property. */
function mergeBothThemes(
  style: { light?: CellStyleProperties; dark?: CellStyleProperties } | undefined,
  patch: Partial<CellStyleProperties>,
): { light: CellStyleProperties; dark: CellStyleProperties } {
  const stripUndefined = (src: CellStyleProperties): CellStyleProperties => {
    const out: Record<string, string | undefined> = { ...src };
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out as CellStyleProperties;
  };
  const light = stripUndefined({ ...(style?.light ?? {}), ...patch });
  const dark = stripUndefined({ ...(style?.dark ?? {}), ...patch });
  return { light, dark };
}

function mergeOneTheme(
  style: { light?: CellStyleProperties; dark?: CellStyleProperties } | undefined,
  which: 'light' | 'dark',
  patch: Partial<CellStyleProperties>,
): { light: CellStyleProperties; dark: CellStyleProperties } {
  const stripUndefined = (src: CellStyleProperties): CellStyleProperties => {
    const out: Record<string, string | undefined> = { ...src };
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out as CellStyleProperties;
  };
  return {
    light: which === 'light'
      ? stripUndefined({ ...(style?.light ?? {}), ...patch })
      : (style?.light ?? {}),
    dark: which === 'dark'
      ? stripUndefined({ ...(style?.dark ?? {}), ...patch })
      : (style?.dark ?? {}),
  };
}

const BORDER_SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
type BorderSide = typeof BORDER_SIDES[number];

function keysForSide(side: BorderSide): Array<keyof CellStyleProperties> {
  return [`border${side}Width`, `border${side}Style`, `border${side}Color`] as const as Array<keyof CellStyleProperties>;
}

function sideHasBorder(style: CellStyleProperties | undefined, side: BorderSide): boolean {
  if (!style) return false;
  return !!style[`border${side}Width` as keyof CellStyleProperties];
}

const ConditionalStyleEditor = memo(function ConditionalStyleEditor({
  style,
  onUpdate,
}: {
  style: { light: CellStyleProperties; dark: CellStyleProperties };
  onUpdate: (next: { light: CellStyleProperties; dark: CellStyleProperties }) => void;
}) {
  // We read from `style.light` for all "shared" controls because we keep light
  // and dark in sync for everything except backgroundColor.
  const ref = style.light;

  const toggle = (key: keyof CellStyleProperties, onValue: string) => {
    const isOn = ref[key] === onValue;
    onUpdate(mergeBothThemes(style, { [key]: isOn ? undefined : onValue } as Partial<CellStyleProperties>));
  };

  const setAlign = (v: 'left' | 'center' | 'right') => {
    const isOn = ref.textAlign === v;
    onUpdate(mergeBothThemes(style, { textAlign: isOn ? undefined : v }));
  };

  const setFontSize = (px: number) => {
    onUpdate(mergeBothThemes(style, { fontSize: `${px}px` }));
  };

  const setTextColor = (hex?: string) => {
    onUpdate(mergeBothThemes(style, { color: hex }));
  };

  const setBg = (which: 'light' | 'dark', hex?: string) => {
    onUpdate(mergeOneTheme(style, which, { backgroundColor: hex }));
  };

  // ─── Borders ──────────────────────────────────────────────────────────
  const activeSides = BORDER_SIDES.filter((s) => sideHasBorder(ref, s));
  const firstActive = activeSides[0];
  const widthStr = firstActive ? ref[`border${firstActive}Width` as keyof CellStyleProperties] as string | undefined : undefined;
  const colorStr = firstActive ? ref[`border${firstActive}Color` as keyof CellStyleProperties] as string | undefined : undefined;
  const styleStr = firstActive ? ref[`border${firstActive}Style` as keyof CellStyleProperties] as string | undefined : undefined;
  const widthN = widthStr ? parseInt(widthStr, 10) : 1;
  const colorVal = colorStr ?? '#eaecef';
  const styleVal = styleStr ?? 'solid';

  const setBordersAll = () => {
    const patch: Partial<CellStyleProperties> = {};
    for (const s of BORDER_SIDES) {
      patch[`border${s}Width` as keyof CellStyleProperties] = `${widthN}px` as never;
      patch[`border${s}Style` as keyof CellStyleProperties] = styleVal as never;
      patch[`border${s}Color` as keyof CellStyleProperties] = colorVal as never;
    }
    onUpdate(mergeBothThemes(style, patch));
  };

  const setBordersNone = () => {
    const patch: Partial<CellStyleProperties> = {};
    for (const s of BORDER_SIDES) for (const k of keysForSide(s)) (patch as Record<string, undefined>)[k] = undefined;
    onUpdate(mergeBothThemes(style, patch));
  };

  const toggleSide = (side: BorderSide) => {
    const hasIt = sideHasBorder(ref, side);
    const patch: Partial<CellStyleProperties> = {};
    if (hasIt) {
      for (const k of keysForSide(side)) (patch as Record<string, undefined>)[k] = undefined;
    } else {
      patch[`border${side}Width` as keyof CellStyleProperties] = `${widthN}px` as never;
      patch[`border${side}Style` as keyof CellStyleProperties] = styleVal as never;
      patch[`border${side}Color` as keyof CellStyleProperties] = colorVal as never;
    }
    onUpdate(mergeBothThemes(style, patch));
  };

  const updateBorderWidth = (px: number) => {
    if (activeSides.length === 0) return;
    const patch: Partial<CellStyleProperties> = {};
    for (const s of activeSides) patch[`border${s}Width` as keyof CellStyleProperties] = `${px}px` as never;
    onUpdate(mergeBothThemes(style, patch));
  };

  const updateBorderStyle = (v: string) => {
    if (activeSides.length === 0) return;
    const patch: Partial<CellStyleProperties> = {};
    for (const s of activeSides) patch[`border${s}Style` as keyof CellStyleProperties] = v as never;
    onUpdate(mergeBothThemes(style, patch));
  };

  const updateBorderColor = (c: string) => {
    if (activeSides.length === 0) return;
    const patch: Partial<CellStyleProperties> = {};
    for (const s of activeSides) patch[`border${s}Color` as keyof CellStyleProperties] = c as never;
    onUpdate(mergeBothThemes(style, patch));
  };

  const fontSizeLabel = ref.fontSize ? parseInt(ref.fontSize as string, 10) + 'px' : '12px';

  return (
    <div
      className="gc-cs-style-editor flex flex-wrap items-center gap-1 p-2 rounded-md border border-border bg-card"
      data-testid="cs-style-editor"
    >
      {/* Typography */}
      <CsTGroup>
        <CsTBtn tooltip="Bold" active={ref.fontWeight === '700'} onClick={() => toggle('fontWeight', '700')}>
          <Bold size={14} strokeWidth={1.75} />
        </CsTBtn>
        <CsTBtn tooltip="Italic" active={ref.fontStyle === 'italic'} onClick={() => toggle('fontStyle', 'italic')}>
          <Italic size={14} strokeWidth={1.75} />
        </CsTBtn>
        <CsTBtn tooltip="Underline" active={ref.textDecoration === 'underline'} onClick={() => toggle('textDecoration', 'underline')}>
          <Underline size={14} strokeWidth={1.75} />
        </CsTBtn>
      </CsTGroup>

      {/* Font size */}
      <PortalPopover
        trigger={
          <button
            type="button"
            className="gc-tbtn flex items-center gap-1 px-2.5 py-1 h-7 rounded-[4px] text-[9px] font-mono transition-all duration-150 cursor-pointer"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <span className="tracking-wider">{fontSizeLabel}</span>
            <ChevronDown size={9} strokeWidth={2} className="opacity-50" />
          </button>
        }
      >
        <div className="p-1.5 min-w-[68px]">
          {FONT_SIZES.map((sz) => (
            <button
              key={sz}
              type="button"
              className={cn(
                'flex items-center w-full px-2.5 py-1 rounded-md text-[11px] font-mono hover:bg-accent cursor-pointer transition-colors',
                fontSizeLabel === `${sz}px` ? 'text-primary' : 'text-foreground',
              )}
              onClick={() => setFontSize(sz)}
              onMouseDown={(e) => e.preventDefault()}
            >
              {sz}px
            </button>
          ))}
        </div>
      </PortalPopover>

      {/* Alignment */}
      <CsTGroup>
        <CsTBtn tooltip="Align Left" active={ref.textAlign === 'left'} onClick={() => setAlign('left')}>
          <AlignLeft size={14} strokeWidth={1.75} />
        </CsTBtn>
        <CsTBtn tooltip="Align Center" active={ref.textAlign === 'center'} onClick={() => setAlign('center')}>
          <AlignCenter size={14} strokeWidth={1.75} />
        </CsTBtn>
        <CsTBtn tooltip="Align Right" active={ref.textAlign === 'right'} onClick={() => setAlign('right')}>
          <AlignRight size={14} strokeWidth={1.75} />
        </CsTBtn>
      </CsTGroup>

      {/* Colors: text + per-theme background */}
      <CsTGroup>
        <Tooltip content="Text Color">
          <div className="inline-flex">
            <ColorPickerPopover
              value={ref.color}
              icon={<Type size={11} strokeWidth={2} />}
              onChange={(c) => setTextColor(c)}
              compact
            />
          </div>
        </Tooltip>
        <Tooltip content="Background (Light Theme)">
          <div className="inline-flex">
            <ColorPickerPopover
              value={style.light.backgroundColor}
              icon={<Sun size={11} strokeWidth={2} />}
              onChange={(c) => setBg('light', c)}
              compact
            />
          </div>
        </Tooltip>
        <Tooltip content="Background (Dark Theme)">
          <div className="inline-flex">
            <ColorPickerPopover
              value={style.dark.backgroundColor}
              icon={<Moon size={11} strokeWidth={2} />}
              onChange={(c) => setBg('dark', c)}
              compact
            />
          </div>
        </Tooltip>
      </CsTGroup>

      {/* Borders */}
      <PortalPopover
        trigger={
          <button
            type="button"
            className={cn(
              'gc-tbtn flex items-center gap-1 px-2.5 py-1 h-7 rounded-[4px] text-[10px] transition-all duration-150 cursor-pointer',
              activeSides.length > 0 && 'gc-tbtn-active',
            )}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <Grid3X3 size={12} strokeWidth={1.75} />
            <span>Borders</span>
            <ChevronDown size={9} strokeWidth={2} className="opacity-50" />
          </button>
        }
      >
        <div className="p-2 min-w-[200px] flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-1">
            <Button variant="ghost" size="sm" className="gc-tbtn h-7 text-[10px]" onMouseDown={(e) => e.preventDefault()} onClick={setBordersAll}>All</Button>
            <Button variant="ghost" size="sm" className="gc-tbtn h-7 text-[10px]" onMouseDown={(e) => e.preventDefault()} onClick={setBordersNone}>None</Button>
            <div />
            <CsTBtn tooltip="Top" active={sideHasBorder(ref, 'Top')} onClick={() => toggleSide('Top')}>
              <PanelTop size={13} strokeWidth={1.75} />
            </CsTBtn>
            <CsTBtn tooltip="Bottom" active={sideHasBorder(ref, 'Bottom')} onClick={() => toggleSide('Bottom')}>
              <PanelBottom size={13} strokeWidth={1.75} />
            </CsTBtn>
            <div />
            <CsTBtn tooltip="Left" active={sideHasBorder(ref, 'Left')} onClick={() => toggleSide('Left')}>
              <PanelLeft size={13} strokeWidth={1.75} />
            </CsTBtn>
            <CsTBtn tooltip="Right" active={sideHasBorder(ref, 'Right')} onClick={() => toggleSide('Right')}>
              <PanelRight size={13} strokeWidth={1.75} />
            </CsTBtn>
          </div>

          <div className="flex items-center gap-1">
            <label className="text-[9px] text-muted-foreground w-10">Width</label>
            <select
              value={widthN}
              onChange={(e) => updateBorderWidth(parseInt(e.target.value, 10))}
              className="text-[10px] bg-card border border-border rounded px-1 py-0.5 flex-1"
            >
              {[1, 2, 3].map((w) => <option key={w} value={w}>{w}px</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[9px] text-muted-foreground w-10">Style</label>
            <select
              value={styleVal}
              onChange={(e) => updateBorderStyle(e.target.value)}
              className="text-[10px] bg-card border border-border rounded px-1 py-0.5 flex-1"
            >
              {['solid', 'dashed', 'dotted'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[9px] text-muted-foreground w-10">Color</label>
            <ColorPickerPopover
              value={colorVal}
              icon={<Square size={11} strokeWidth={2} />}
              onChange={(c) => { if (c) updateBorderColor(c); }}
              compact
            />
          </div>
        </div>
      </PortalPopover>

      {/* Reset */}
      <CsTBtn
        tooltip="Clear all styles"
        onClick={() => onUpdate({ light: {}, dark: {} })}
        className="ml-auto"
      >
        <X size={14} strokeWidth={1.75} />
      </CsTBtn>
    </div>
  );
});

function generateId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Live column list (replaces v1's useGridColumns) ────────────────────────

interface GridColumnInfo {
  colId: string;
  headerName: string;
}

function useGridColumns(): GridColumnInfo[] {
  const core = useGridCore();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const api = core.getGridApi();
    if (!api) return;
    const handler = () => setTick((n) => n + 1);
    const events = ['displayedColumnsChanged', 'columnEverythingChanged'] as const;
    for (const evt of events) {
      try { api.addEventListener(evt, handler); } catch { /* */ }
    }
    return () => {
      for (const evt of events) {
        try { api.removeEventListener(evt, handler); } catch { /* */ }
      }
    };
  }, [core, tick]);

  return useMemo(() => {
    const api = core.getGridApi();
    if (!api) return [];
    try {
      const cols = api.getColumns?.() ?? [];
      return cols.map((c) => ({
        colId: c.getColId(),
        headerName: c.getColDef().headerName ?? c.getColId(),
      }));
    } catch {
      return [];
    }
    // tick is a render-trigger; deps are intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, tick]);
}

// ─── Multi-select column picker (minimal, chip-style) ───────────────────────

const ColumnPickerMulti = memo(function ColumnPickerMulti({
  value,
  onChange,
  placeholder = 'Add columns…',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const cols = useGridColumns();
  const remaining = cols.filter((c) => !value.includes(c.colId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 22 }}>
        {value.length === 0 ? (
          <span
            role="alert"
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--gc-warning, #d97706)',
              background: 'var(--gc-warning-bg, rgba(217,119,6,0.08))',
              border: '1px solid var(--gc-warning, #d97706)',
              borderRadius: 3,
              padding: '2px 6px',
            }}
            data-testid="cs-no-columns-warning"
          >
            No columns selected — rule won't apply until you add at least one
          </span>
        ) : (
          value.map((colId) => {
            const col = cols.find((c) => c.colId === colId);
            return (
              <span
                key={colId}
                className="gc-cs-col-chip"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                  borderRadius: 3,
                  border: '1px solid var(--gc-border)',
                  background: 'var(--gc-surface-hover)',
                  fontSize: 10,
                  fontFamily: 'var(--gc-font-mono)',
                  color: 'var(--gc-text)',
                }}
              >
                {col?.headerName ?? colId}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== colId))}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--gc-text-dim)', padding: 0, lineHeight: 1, fontSize: 12,
                  }}
                  title="Remove"
                  aria-label={`Remove ${col?.headerName ?? colId}`}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>
      {remaining.length > 0 && (
        <select
          className="gc-cs-col-add"
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id) onChange([...value, id]);
          }}
          style={{
            width: '100%',
            background: 'var(--gc-surface)',
            color: 'var(--gc-text)',
            border: '1px solid var(--gc-border)',
            borderRadius: 3,
            padding: '4px 6px',
            fontSize: 11,
          }}
          aria-label={placeholder}
        >
          <option value="">{placeholder}</option>
          {remaining.map((c) => (
            <option key={c.colId} value={c.colId}>{c.headerName}</option>
          ))}
        </select>
      )}
    </div>
  );
});

// ─── Inline rule editor ─────────────────────────────────────────────────────

const RuleEditor = memo(function RuleEditor({
  rule,
  onUpdate,
}: {
  rule: ConditionalRule;
  onUpdate: (patch: Partial<ConditionalRule>) => void;
}) {
  const [expression, setExpression] = useState(rule.expression);
  const exprRef = useRef(rule.expression);

  // Keep local state in sync if the underlying rule changes from elsewhere
  // (e.g., another panel edits the same rule).
  useEffect(() => {
    if (rule.expression !== exprRef.current) {
      setExpression(rule.expression);
      exprRef.current = rule.expression;
    }
  }, [rule.expression]);

  const commitExpression = useCallback(() => {
    if (expression !== exprRef.current) {
      exprRef.current = expression;
      onUpdate({ expression });
    }
  }, [expression, onUpdate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitExpression();
  };

  return (
    <div data-testid="cs-rule-editor">
      <PropertySection title="Rule Configuration" defaultOpen>
        <PropRow label="Name">
          <PropText value={rule.name} onChange={(v) => onUpdate({ name: v })} width={200} />
        </PropRow>
        <PropRow label="Scope">
          <PropSelect
            value={rule.scope.type}
            onChange={(v) => {
              const scopeType = v as 'cell' | 'row';
              onUpdate({
                scope: scopeType === 'row' ? { type: 'row' } : { type: 'cell', columns: [] },
              });
            }}
            options={[
              { value: 'cell', label: 'Cell (specific columns)' },
              { value: 'row', label: 'Entire Row' },
            ]}
          />
        </PropRow>
        {rule.scope.type === 'cell' && (
          <PropRow label="Target Columns" vertical>
            <ColumnPickerMulti
              value={rule.scope.columns ?? []}
              onChange={(cols) => onUpdate({ scope: { type: 'cell', columns: cols } })}
            />
          </PropRow>
        )}
        <PropRow label="Expression" vertical>
          <Input
            className="font-mono text-[10px]"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onBlur={commitExpression}
            onKeyDown={handleKeyDown}
            placeholder="x >= 1000"
            error={!engine.validate(expression).valid}
            style={{ width: '100%' }}
            data-testid="cs-rule-expression-input"
          />
          <div style={{ fontSize: 10, color: 'var(--gc-text-dim)', marginTop: 4 }}>
            Use <code style={{ fontFamily: 'var(--gc-font-mono)' }}>x</code> for cell value,{' '}
            <code style={{ fontFamily: 'var(--gc-font-mono)' }}>{'data.field'}</code> for row data
          </div>
        </PropRow>
        <PropRow label="Priority">
          <PropNumber
            value={rule.priority}
            onChange={(n) => onUpdate({ priority: Math.max(0, Math.min(100, n)) })}
            min={0}
            max={100}
          />
        </PropRow>
      </PropertySection>

      <PropertySection title="Appearance" defaultOpen>
        <ConditionalStyleEditor
          style={rule.style}
          onUpdate={(next) => onUpdate({ style: next })}
        />
      </PropertySection>
    </div>
  );
});

// ─── Top-level panel ────────────────────────────────────────────────────────

export function ConditionalStylingPanel(_props: SettingsPanelProps) {
  const store = useGridStore();
  const [state, setState] = useModuleState<ConditionalStylingState>(store, 'conditional-styling');
  const [editingId, setEditingId] = useState<string | null>(null);

  const addRule = useCallback(() => {
    // Default to `row` scope so the rule applies immediately as the user tweaks
    // the style controls — v1 defaulted to `cell` with an empty columns array,
    // which silently did nothing until the user found and used the Target
    // Columns picker. Users hitting that cliff reported "I set styles but
    // nothing happened". Row scope applies visibly on first tweak; anyone who
    // needs column-scoped styling switches the Scope dropdown and gets the
    // explicit "No columns selected — rule won't apply until you add columns"
    // warning below.
    // Default expression `true` so the rule applies to everything immediately
    // and the user sees their style changes take effect. For cell scope the
    // engine binds `x` to the cell value; for row scope it binds `x` to null
    // — so v1's default of `x > 0` silently matched nothing when users
    // switched to row scope. `true` works across both and is the obvious
    // "everything matches" starting point.
    const newRule: ConditionalRule = {
      id: generateId(),
      name: 'New Rule',
      enabled: true,
      priority: state.rules.length,
      scope: { type: 'row' },
      expression: 'true',
      style: {
        light: { backgroundColor: 'rgba(16,185,129,0.12)' },
        dark: { backgroundColor: 'rgba(33,184,164,0.15)' },
      },
    };
    setState((prev) => ({ ...prev, rules: [...prev.rules, newRule] }));
    setEditingId(newRule.id);
  }, [state.rules.length, setState]);

  const updateRule = useCallback(
    (ruleId: string, patch: Partial<ConditionalRule>) => {
      setState((prev) => ({
        ...prev,
        rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
      }));
    },
    [setState],
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      setState((prev) => ({
        ...prev,
        rules: prev.rules.filter((r) => r.id !== ruleId),
      }));
      setEditingId((cur) => (cur === ruleId ? null : cur));
    },
    [setState],
  );

  const editingRule = editingId ? state.rules.find((r) => r.id === editingId) ?? null : null;

  return (
    <div data-testid="cs-panel">
      <div className="gc-section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div
            className="gc-section-title"
            style={{ margin: 0, border: 'none', paddingBottom: 0 }}
          >
            Styling Rules ({state.rules.length})
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={addRule}
            data-testid="cs-add-rule-btn"
          >
            <Plus size={12} strokeWidth={1.75} /> Add Rule
          </Button>
        </div>

        {state.rules.length === 0 ? (
          <div className="gc-empty">
            No conditional styling rules configured.
            <br />
            Add a rule to apply dynamic styles based on cell values.
          </div>
        ) : (
          state.rules.map((rule) => {
            const validation = engine.validate(rule.expression);
            return (
              <div
                key={rule.id}
                className="gc-rule-card"
                style={{ cursor: 'pointer' }}
                data-testid={`cs-rule-card-${rule.id}`}
                onClick={() => setEditingId(editingId === rule.id ? null : rule.id)}
              >
                <div className="gc-rule-card-header">
                  <Switch
                    checked={rule.enabled}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateRule(rule.id, { enabled: !rule.enabled });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ transform: 'scale(0.85)' }}
                  />
                  <div className="gc-rule-card-title">{rule.name}</div>
                  <div
                    className="gc-color-swatch"
                    style={{
                      background:
                        rule.style.dark.backgroundColor ??
                        rule.style.light.backgroundColor ??
                        '#666',
                    }}
                  />
                  {!validation.valid && (
                    <span style={{ fontSize: 10, color: 'var(--gc-danger)' }}>Error</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRule(rule.id);
                    }}
                    data-testid={`cs-rule-delete-${rule.id}`}
                    title="Delete rule"
                  >
                    <Trash2 size={12} strokeWidth={1.75} />
                  </Button>
                </div>
                <div className="gc-rule-card-body">
                  <code style={{ fontFamily: 'var(--gc-font-mono)', fontSize: 11 }}>
                    {rule.expression}
                  </code>
                  <span
                    style={{ marginLeft: 8, fontSize: 10, color: 'var(--gc-text-dim)' }}
                  >
                    {rule.scope.type === 'row'
                      ? 'Row'
                      : `${rule.scope.columns?.length ?? 0} columns`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {editingRule && (
        <RuleEditor
          key={editingId}
          rule={editingRule}
          onUpdate={(patch) => updateRule(editingRule.id, patch)}
        />
      )}
    </div>
  );
}
