/**
 * FormattingToolbar v2 — inline cell/header styling + formatting.
 *
 * Port of v1's FormattingToolbar, adapted to core-v2's structured
 * `CellStyleOverrides` shape and the discriminated `ValueFormatterTemplate`
 * union. The shared UI primitives (Button, Popover, ColorPickerPopover,
 * ToggleGroup, ...) come from `@grid-customizer/core` v1 — they're
 * framework-agnostic and both v1 and v2 consume them.
 *
 * Translation of v1 flat CSS keys to v2 structured sub-sections:
 *   bold        → cellStyleOverrides.typography.bold        (boolean)
 *   italic      → cellStyleOverrides.typography.italic      (boolean)
 *   underline   → cellStyleOverrides.typography.underline   (boolean)
 *   fontSize    → cellStyleOverrides.typography.fontSize    (number, px)
 *   color       → cellStyleOverrides.colors.text            (string)
 *   background  → cellStyleOverrides.colors.background      (string)
 *   textAlign   → cellStyleOverrides.alignment.horizontal   (left|center|right)
 *   border-*    → cellStyleOverrides.borders.{top|right|bottom|left}: BorderSpec
 *
 * Value formatters go through `valueFormatterTemplate` instead of an
 * expression string. Currency / percent / thousands use `kind: 'preset'`;
 * BPS falls back to `kind: 'expression'` (CSP-unsafe) because there is no
 * built-in preset for basis points.
 *
 * v2 has no undo/redo module yet (v2.2 work). The Undo/Redo buttons render
 * disabled with a tooltip so the UI shape stays aligned with v1.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Popover as RadixPopover,
  PopoverTrigger as RadixPopoverTrigger,
  PopoverContent as RadixPopoverContent,
  PopoverCompat as Popover,
  Tooltip,
  ToggleGroup,
  ToggleGroupItem,
  ColorPickerPopover,
  cn,
} from '@grid-customizer/core';
import {
  BorderStyleEditor,
  FormatterPicker,
  type GridCore,
  type GridStore,
  type ColumnAssignment,
  type ColumnCustomizationState,
  type ColumnTemplatesState,
  type ColumnTemplate,
  type BorderSpec,
  type CellStyleOverrides,
  type TickToken,
  type ValueFormatterTemplate,
  resolveTemplates,
  useModuleState,
  isValidExcelFormat,
  presetToExcelFormat,
} from '@grid-customizer/core-v2';
import {
  Undo2, Redo2, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  Type, PaintBucket,
  Trash2, Grid3X3, Check,
  ChevronDown, ArrowLeft, ArrowRight,
  DollarSign, Percent, Hash,
  Plus,
} from 'lucide-react';

// ─── Formatter presets ───────────────────────────────────────────────────────
//
// v1 used Intl.NumberFormat expression strings; v2 prefers structured preset
// templates because they're CSP-safe and round-trip through JSON. BPS has no
// preset equivalent, so we retain v1's expression for that one button.

type FormatterChoice = {
  label: string;
  template: ValueFormatterTemplate;
};

const FMT_USD: FormatterChoice = {
  label: '$',
  template: { kind: 'preset', preset: 'currency', options: { currency: 'USD', decimals: 2 } },
};
const FMT_EUR: FormatterChoice = {
  label: '\u20AC',
  template: { kind: 'preset', preset: 'currency', options: { currency: 'EUR', decimals: 2 } },
};
const FMT_GBP: FormatterChoice = {
  label: '\u00A3',
  template: { kind: 'preset', preset: 'currency', options: { currency: 'GBP', decimals: 2 } },
};
const FMT_JPY: FormatterChoice = {
  label: '\u00A5',
  template: { kind: 'preset', preset: 'currency', options: { currency: 'JPY', decimals: 0 } },
};

const CURRENCY_FORMATTERS: Record<string, FormatterChoice> = {
  USD: FMT_USD, EUR: FMT_EUR, GBP: FMT_GBP, JPY: FMT_JPY,
};

const PERCENT_TEMPLATE: ValueFormatterTemplate = {
  kind: 'preset', preset: 'percent', options: { decimals: 2 },
};

const COMMA_TEMPLATE: ValueFormatterTemplate = {
  kind: 'preset', preset: 'number', options: { decimals: 0, thousands: true },
};

// BPS has no preset equivalent; v1 used a raw expression, we keep that.
const BPS_TEMPLATE: ValueFormatterTemplate = {
  kind: 'expression',
  expression: "(x>=0?'+':'')+x.toFixed(1)+'bp'",
};

function numberTemplate(decimals: number): ValueFormatterTemplate {
  return {
    kind: 'preset',
    preset: 'number',
    options: { decimals: Math.max(0, Math.min(10, decimals)), thousands: true },
  };
}

/** Pull a decimal count out of an existing formatter template. Returns null if
 *  we can't tell (e.g. date/duration presets that have no decimals concept). */
function templateDecimals(t: ValueFormatterTemplate | undefined): number | null {
  if (!t) return null;
  if (t.kind === 'preset') {
    const n = (t.options as { decimals?: unknown } | undefined)?.decimals;
    return typeof n === 'number' ? n : null;
  }
  if (t.kind === 'expression') {
    // Expression fallback: try a couple of known patterns so v1 snapshots keep working.
    const m = t.expression.match(/maximumFractionDigits:(\d+)/);
    if (m) return parseInt(m[1], 10);
    const tx = t.expression.match(/toFixed\((\d+)\)/);
    if (tx) return parseInt(tx[1], 10);
  }
  // excelFormat / tick — no structured decimals concept.
  return null;
}

function isPercentTemplate(t: ValueFormatterTemplate | undefined): boolean {
  return !!t && t.kind === 'preset' && t.preset === 'percent';
}

/** `true` when the template is any fixed-income tick format. */
function isTickTemplate(t: ValueFormatterTemplate | undefined): boolean {
  return !!t && t.kind === 'tick';
}

/** Extract the tick token from a template (or null if not a tick). */
function currentTickToken(t: ValueFormatterTemplate | undefined): TickToken | null {
  return t && t.kind === 'tick' ? t.tick : null;
}

/** Sample-output string per tick token, used inside the dropdown so
 *  traders see exactly what each precision produces. Values come from
 *  TICK_SAMPLES in core-v2; inlined here to keep the dropdown self-
 *  contained without importing yet another barrel symbol. */
const TICK_MENU: ReadonlyArray<{ token: TickToken; label: string; sample: string }> = [
  { token: 'TICK32',      label: '32nds',           sample: '101-16' },
  { token: 'TICK32_PLUS', label: '32nds + halves',  sample: '101-16+' },
  { token: 'TICK64',      label: '64ths',           sample: '101-161' },
  { token: 'TICK128',     label: '128ths',          sample: '101-162' },
  { token: 'TICK256',     label: '256ths',          sample: '101-161' },
];

function isCommaTemplate(t: ValueFormatterTemplate | undefined): boolean {
  return !!t && t.kind === 'preset' && t.preset === 'number'
    && (t.options as { decimals?: unknown } | undefined)?.decimals === 0;
}

// ─── Sub-components (copied from v1, untouched) ──────────────────────────────

/** Toolbar icon button — theme-aware via CSS variables */
function TBtn({ children, active, disabled, tooltip, onClick, className, ...rest }: {
  children: React.ReactNode; active?: boolean; disabled?: boolean;
  tooltip?: string; onClick?: () => void; className?: string;
  'data-testid'?: string;
}) {
  const btn = (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={disabled}
      data-testid={rest['data-testid']}
      className={cn(
        'shrink-0 w-7 h-7 rounded-[4px] transition-all duration-150 gc-tbtn',
        active && 'gc-tbtn-active',
        disabled && 'opacity-25 pointer-events-none',
        className,
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && onClick) onClick();
      }}
    >
      {children}
    </Button>
  );
  if (tooltip) return <Tooltip content={tooltip}>{btn}</Tooltip>;
  return btn;
}

function TGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center gap-0.5 px-1.5 py-1 rounded-[4px] bg-accent/40', className)}>
      {children}
    </div>
  );
}

/** Flash a checkmark icon for 400ms after an action */
function useFlashConfirm(): [boolean, () => void] {
  const [confirmed, setConfirmed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback(() => {
    setConfirmed(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setConfirmed(false), 400);
  }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return [confirmed, flash];
}

// ─── Active-column tracking ──────────────────────────────────────────────────
//
// Polls for the grid API (same pattern v1 uses), subscribes to focus/click/
// selection events, and remembers the last non-empty list so toolbar clicks
// don't clear it when focus leaves the grid.

function useActiveColumns(core: GridCore): string[] {
  const [colIds, setColIds] = useState<string[]>([]);
  const apiRef = useRef<unknown>(null);
  const lastColIds = useRef<string[]>([]);
  const cleanupRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    let mounted = true;

    const getColIds = (): string[] => {
      const api = (apiRef.current ?? core.getGridApi()) as unknown as {
        getCellRanges?: () => Array<{ columns?: unknown[] }>;
        getFocusedCell?: () => { column?: unknown } | null;
      } | null;
      if (!api) return lastColIds.current;
      apiRef.current = api;

      const ids: string[] = [];
      const extractId = (col: unknown): string | null => {
        if (!col) return null;
        const c = col as { getColId?: () => string };
        const colId = typeof c.getColId === 'function' ? c.getColId() : null;
        return colId || null;
      };

      try {
        const ranges = api.getCellRanges?.();
        if (ranges?.length) {
          for (const range of ranges) {
            for (const col of (range.columns ?? [])) {
              const id = extractId(col);
              if (id && !ids.includes(id)) ids.push(id);
            }
          }
        }
      } catch { /* ignore */ }

      if (ids.length === 0) {
        try {
          const focused = api.getFocusedCell?.();
          const id = extractId(focused?.column);
          if (id) ids.push(id);
        } catch { /* ignore */ }
      }

      if (ids.length > 0) {
        lastColIds.current = ids;
        return ids;
      }
      return lastColIds.current;
    };

    const update = () => {
      if (!mounted) return;
      setColIds(getColIds());
    };

    const poll = setInterval(() => {
      const api = core.getGridApi() as unknown as {
        addEventListener?: (type: string, fn: () => void) => void;
        removeEventListener?: (type: string, fn: () => void) => void;
      } | null;
      if (!api || !mounted) return;
      apiRef.current = api;
      clearInterval(poll);

      const bind = (type: string) => {
        try {
          api.addEventListener?.(type, update);
          cleanupRef.current.push(() => { try { api.removeEventListener?.(type, update); } catch { /* */ } });
        } catch { /* */ }
      };
      bind('cellFocused');
      bind('cellClicked');
      bind('cellSelectionChanged');
      update();
    }, 300);

    return () => {
      mounted = false;
      clearInterval(poll);
      for (const fn of cleanupRef.current) fn();
      cleanupRef.current = [];
    };
  }, [core]);

  return colIds;
}

// ─── Reactive resolved-state hook ────────────────────────────────────────────
//
// Reads the column-customization assignment + templates through the resolver
// so typeDefaults and referenced templates fold into the view the toolbar
// displays (active/inactive states).

type TargetKind = 'cell' | 'header';

interface ResolvedFormatting {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize?: number;
  color?: string;
  background?: string;
  horizontal?: 'left' | 'center' | 'right';
  valueFormatterTemplate?: ValueFormatterTemplate;
  borders: {
    top?: BorderSpec;
    right?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
  };
}

function useColumnFormatting(
  core: GridCore,
  store: GridStore,
  colIds: string[],
  target: TargetKind,
): ResolvedFormatting {
  const [cust] = useModuleState<ColumnCustomizationState>(store, 'column-customization');
  const [tpls] = useModuleState<ColumnTemplatesState>(store, 'column-templates');

  return useMemo(() => {
    const empty: ResolvedFormatting = { bold: false, italic: false, underline: false, borders: {} };
    if (!colIds.length || !cust) return empty;
    const a = cust.assignments?.[colIds[0]];
    if (!a) return empty;

    // Look up the colDef's cellDataType so resolveTemplates can apply a
    // matching typeDefault (e.g. numeric columns inherit a right-align style).
    let dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined;
    try {
      const api = core.getGridApi() as unknown as { getColumn?: (id: string) => { getColDef?: () => { cellDataType?: unknown } } } | null;
      const colDef = api?.getColumn?.(colIds[0])?.getColDef?.();
      const t = colDef?.cellDataType;
      if (t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean') dataType = t;
    } catch { /* ignore */ }

    const resolved = resolveTemplates(a, tpls ?? { templates: {}, typeDefaults: {} }, dataType);
    const style: CellStyleOverrides | undefined =
      target === 'header' ? resolved.headerStyleOverrides : resolved.cellStyleOverrides;

    return {
      bold: !!style?.typography?.bold,
      italic: !!style?.typography?.italic,
      underline: !!style?.typography?.underline,
      fontSize: style?.typography?.fontSize,
      color: style?.colors?.text,
      background: style?.colors?.background,
      horizontal: style?.alignment?.horizontal,
      valueFormatterTemplate: resolved.valueFormatterTemplate,
      borders: {
        top: style?.borders?.top,
        right: style?.borders?.right,
        bottom: style?.borders?.bottom,
        left: style?.borders?.left,
      },
    };
  }, [cust, tpls, colIds, target, core]);
}

// ─── State-writer helpers ────────────────────────────────────────────────────
//
// All writers use `setModuleState` so subscribers re-render. They all ensure
// each target column has an assignment first (the customization walker only
// applies overrides to columns that have one).

function overrideKey(target: TargetKind): 'cellStyleOverrides' | 'headerStyleOverrides' {
  return target === 'header' ? 'headerStyleOverrides' : 'cellStyleOverrides';
}

/** Drop keys whose value is `undefined` so a "clear" patch actually removes the
 *  key rather than leaving an `undefined` that flatteners treat as present. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

function mergeOverrides(
  base: CellStyleOverrides | undefined,
  patch: Partial<CellStyleOverrides>,
): CellStyleOverrides | undefined {
  const next: CellStyleOverrides = { ...(base ?? {}) };

  if (patch.typography !== undefined) {
    const merged = stripUndefined({ ...(next.typography ?? {}), ...patch.typography });
    next.typography = Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (patch.colors !== undefined) {
    const merged = stripUndefined({ ...(next.colors ?? {}), ...patch.colors });
    next.colors = Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (patch.alignment !== undefined) {
    const merged = stripUndefined({ ...(next.alignment ?? {}), ...patch.alignment });
    next.alignment = Object.keys(merged).length > 0 ? merged : undefined;
  }
  if (patch.borders !== undefined) {
    const merged = stripUndefined({ ...(next.borders ?? {}), ...patch.borders });
    next.borders = Object.keys(merged).length > 0 ? merged : undefined;
  }

  const clean = stripUndefined(next as unknown as Record<string, unknown>) as CellStyleOverrides;
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function writeOverrides(
  store: GridStore,
  colIds: string[],
  target: TargetKind,
  patch: Partial<CellStyleOverrides>,
) {
  if (!colIds.length) return;
  const key = overrideKey(target);
  store.setModuleState<ColumnCustomizationState>('column-customization', (prev) => {
    const assignments = { ...(prev?.assignments ?? {}) };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const merged = mergeOverrides(a[key], patch);
      const next: ColumnAssignment = { ...a };
      if (merged === undefined) {
        delete next[key];
      } else {
        next[key] = merged;
      }
      assignments[colId] = next;
    }
    return { ...prev, assignments };
  });
}

function applyTypography(
  store: GridStore, colIds: string[], target: TargetKind,
  patch: { bold?: boolean | undefined; italic?: boolean | undefined; underline?: boolean | undefined; fontSize?: number | undefined },
) {
  writeOverrides(store, colIds, target, { typography: patch });
}

function applyColors(
  store: GridStore, colIds: string[], target: TargetKind,
  patch: { text?: string | undefined; background?: string | undefined },
) {
  writeOverrides(store, colIds, target, { colors: patch });
}

function applyAlignment(
  store: GridStore, colIds: string[], target: TargetKind,
  patch: { horizontal?: 'left' | 'center' | 'right' | undefined },
) {
  writeOverrides(store, colIds, target, { alignment: patch });
}

/** Write a BorderSpec (or undefined to clear) to one or more sides. */
function applyBorders(
  store: GridStore, colIds: string[], target: TargetKind,
  sides: Array<'top' | 'right' | 'bottom' | 'left'>,
  spec: BorderSpec | undefined,
) {
  if (!colIds.length) return;
  const patch: NonNullable<CellStyleOverrides['borders']> = {};
  for (const side of sides) patch[side] = spec;
  writeOverrides(store, colIds, target, { borders: patch });
}

/** Clear every border side (top/right/bottom/left). */
function clearAllBorders(store: GridStore, colIds: string[], target: TargetKind) {
  applyBorders(store, colIds, target, ['top', 'right', 'bottom', 'left'], undefined);
}

/** Set valueFormatterTemplate on each column (undefined removes it). */
function applyFormatter(
  store: GridStore, colIds: string[],
  template: ValueFormatterTemplate | undefined,
) {
  if (!colIds.length) return;
  store.setModuleState<ColumnCustomizationState>('column-customization', (prev) => {
    const assignments = { ...(prev?.assignments ?? {}) };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      const next: ColumnAssignment = { ...a };
      if (template === undefined) delete next.valueFormatterTemplate;
      else next.valueFormatterTemplate = template;
      assignments[colId] = next;
    }
    return { ...prev, assignments };
  });
}

/** Replace the templateIds chain with the single picked template.
 *  v2's resolver composes templateIds in array order; for toolbar UX we
 *  intentionally keep it single so picking a template swaps cleanly. */
function applyTemplateToColumns(store: GridStore, colIds: string[], templateId: string) {
  if (!colIds.length || !templateId) return;
  store.setModuleState<ColumnCustomizationState>('column-customization', (prev) => {
    const assignments = { ...(prev?.assignments ?? {}) };
    for (const colId of colIds) {
      const a: ColumnAssignment = assignments[colId] ?? { colId };
      assignments[colId] = { ...a, templateIds: [templateId] };
    }
    return { ...prev, assignments };
  });
}

/** Snapshot the first column's resolved overrides + formatter as a named template. */
function saveCurrentAsTemplate(
  core: GridCore, store: GridStore, colIds: string[], name: string,
): string | undefined {
  if (!colIds.length || !name.trim()) return undefined;

  const cust = store.getModuleState<ColumnCustomizationState>('column-customization');
  const tpls = store.getModuleState<ColumnTemplatesState>('column-templates');
  const a = cust?.assignments?.[colIds[0]];
  if (!a) return undefined;

  // Resolve (templates + typeDefault + overrides) so the saved template
  // captures the *effective* appearance, matching v1's behavior.
  let dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined;
  try {
    const api = core.getGridApi() as unknown as { getColumn?: (id: string) => { getColDef?: () => { cellDataType?: unknown } } } | null;
    const colDef = api?.getColumn?.(colIds[0])?.getColDef?.();
    const t = colDef?.cellDataType;
    if (t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean') dataType = t;
  } catch { /* ignore */ }

  const resolved = resolveTemplates(a, tpls ?? { templates: {}, typeDefaults: {} }, dataType);

  const hasCell = !!resolved.cellStyleOverrides && Object.keys(resolved.cellStyleOverrides).length > 0;
  const hasHeader = !!resolved.headerStyleOverrides && Object.keys(resolved.headerStyleOverrides).length > 0;
  const vft = resolved.valueFormatterTemplate;
  if (!hasCell && !hasHeader && !vft) return undefined;

  const now = Date.now();
  const newId = `tpl_${now}_${Math.random().toString(36).slice(2, 6)}`;
  const tpl: ColumnTemplate = {
    id: newId,
    name: name.trim(),
    description: `Saved from ${colIds[0]}`,
    createdAt: now,
    updatedAt: now,
    ...(hasCell ? { cellStyleOverrides: resolved.cellStyleOverrides } : {}),
    ...(hasHeader ? { headerStyleOverrides: resolved.headerStyleOverrides } : {}),
    ...(vft ? { valueFormatterTemplate: vft } : {}),
  };

  store.setModuleState<ColumnTemplatesState>('column-templates', (prev) => ({
    ...prev,
    templates: { ...(prev?.templates ?? {}), [newId]: tpl },
  }));
  return newId;
}

/** Drop every override (and template ref) on the selected columns. */
function clearAllStyles(store: GridStore, colIds: string[]) {
  if (!colIds.length) return;
  store.setModuleState<ColumnCustomizationState>('column-customization', (prev) => {
    const assignments = { ...(prev?.assignments ?? {}) };
    for (const colId of colIds) {
      assignments[colId] = { colId };
    }
    return { ...prev, assignments };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface FormattingToolbarProps {
  core: GridCore;
  store: GridStore;
}

export function FormattingToolbar({ core, store }: FormattingToolbarProps) {
  const colIds = useActiveColumns(core);
  const colIdsRef = useRef(colIds);
  colIdsRef.current = colIds;

  const [target, setTarget] = useState<TargetKind>('cell');
  const targetRef = useRef(target);
  targetRef.current = target;

  const fmt = useColumnFormatting(core, store, colIds, target);
  const disabled = colIds.length === 0;
  const isHeader = target === 'header';

  const [clearConfirmed, flashClear] = useFlashConfirm();
  const [saveAsTplConfirmed, flashSaveAsTpl] = useFlashConfirm();
  const [saveAsTplName, setSaveAsTplName] = useState('');

  // Reactive templates list for the dropdown.
  const [tplState] = useModuleState<ColumnTemplatesState>(store, 'column-templates');
  const templateList = useMemo(() => {
    const templates = tplState?.templates ?? {};
    return Object.values(templates).sort((a, b) => a.name.localeCompare(b.name));
  }, [tplState]);

  // Column label for the right-side context affordance.
  const colLabel = useMemo(() => {
    if (colIds.length === 0) return 'Select a cell';
    if (colIds.length === 1) {
      try {
        const api = core.getGridApi() as unknown as { getColumn?: (id: string) => { getColDef?: () => { headerName?: string } } } | null;
        const col = api?.getColumn?.(colIds[0]);
        return col?.getColDef?.()?.headerName ?? colIds[0];
      } catch { /* ignore */ }
      return colIds[0];
    }
    return `${colIds.length} columns`;
  }, [colIds, core]);

  // Typography toggles — the writers pass `undefined` to clear the key.
  const toggleBold = useCallback(() => {
    applyTypography(store, colIdsRef.current, targetRef.current, { bold: fmt.bold ? undefined : true });
  }, [store, fmt.bold]);

  const toggleItalic = useCallback(() => {
    applyTypography(store, colIdsRef.current, targetRef.current, { italic: fmt.italic ? undefined : true });
  }, [store, fmt.italic]);

  const toggleUnderline = useCallback(() => {
    applyTypography(store, colIdsRef.current, targetRef.current, { underline: fmt.underline ? undefined : true });
  }, [store, fmt.underline]);

  const setFontSizePx = useCallback((px: number) => {
    applyTypography(store, colIdsRef.current, targetRef.current, { fontSize: px });
  }, [store]);

  const toggleAlign = useCallback((h: 'left' | 'center' | 'right') => {
    const next = fmt.horizontal === h ? undefined : h;
    applyAlignment(store, colIdsRef.current, targetRef.current, { horizontal: next });
  }, [store, fmt.horizontal]);

  const setTextColor = useCallback((c: string | undefined) => {
    applyColors(store, colIdsRef.current, targetRef.current, { text: c || undefined });
  }, [store]);

  const setBgColor = useCallback((c: string | undefined) => {
    applyColors(store, colIdsRef.current, targetRef.current, { background: c || undefined });
  }, [store]);

  // Formatter — always cell-target (headers have no formatter).
  const doFormat = useCallback((t: ValueFormatterTemplate | undefined) => {
    applyFormatter(store, colIdsRef.current, t);
  }, [store]);

  // Decimals ± — read the fresh template out of the store so consecutive clicks
  // compound. Fall back to sampling the first cell's precision if no formatter
  // has been applied yet, mirroring v1's UX.
  const getCurrentDecimals = useCallback((): number => {
    const ids = colIdsRef.current;
    if (!ids.length) return 2;
    const cust = store.getModuleState<ColumnCustomizationState>('column-customization');
    const tpls = store.getModuleState<ColumnTemplatesState>('column-templates');
    const a = cust?.assignments?.[ids[0]];
    if (a) {
      const resolved = resolveTemplates(a, tpls ?? { templates: {}, typeDefaults: {} }, undefined);
      const d = templateDecimals(resolved.valueFormatterTemplate);
      if (d !== null) return d;
    }
    try {
      const api = core.getGridApi() as unknown as { getDisplayedRowAtIndex?: (i: number) => { data?: Record<string, unknown> } | null } | null;
      const firstRow = api?.getDisplayedRowAtIndex?.(0);
      const val = firstRow?.data?.[ids[0]];
      if (typeof val === 'number') {
        const s = String(val);
        const dot = s.indexOf('.');
        return dot >= 0 ? s.length - dot - 1 : 0;
      }
    } catch { /* ignore */ }
    return 2;
  }, [store, core]);

  const decreaseDecimals = useCallback(() => {
    if (!colIdsRef.current.length) return;
    doFormat(numberTemplate(getCurrentDecimals() - 1));
  }, [doFormat, getCurrentDecimals]);

  const increaseDecimals = useCallback(() => {
    if (!colIdsRef.current.length) return;
    doFormat(numberTemplate(getCurrentDecimals() + 1));
  }, [doFormat, getCurrentDecimals]);

  // ─── Excel-format text input state ──────────────────────────────────────
  //
  // Local draft + commit-on-blur/Enter so typing doesn't spam the store.
  // Seeded from the active column's current formatter every time the
  // selection changes — if the user is in the middle of editing (`focused`),
  // we skip the sync so we don't clobber their in-progress typing.
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [excelDraft, setExcelDraft] = useState('');
  const [excelFocused, setExcelFocused] = useState(false);
  // Seed from current template when the active column or its formatter changes.
  const currentExcelEquivalent = useMemo(
    () => presetToExcelFormat(fmt.valueFormatterTemplate),
    [fmt.valueFormatterTemplate],
  );
  useEffect(() => {
    if (excelFocused) return;   // don't clobber in-flight edits
    setExcelDraft(currentExcelEquivalent);
  }, [currentExcelEquivalent, excelFocused]);

  const commitExcel = useCallback(() => {
    const v = excelDraft.trim();
    if (v === '') {
      // Empty input → clear the formatter entirely.
      doFormat(undefined);
      return;
    }
    if (!isValidExcelFormat(v)) {
      // Keep the draft on screen so the user can fix it; aria-invalid is
      // handled on the input directly.
      return;
    }
    doFormat({ kind: 'excelFormat', format: v });
  }, [excelDraft, doFormat]);

  const excelDraftValid = excelDraft.length === 0 || isValidExcelFormat(excelDraft);

  // ─── Borders — delegated to the shared <BorderStyleEditor /> ───────────
  // The editor emits the full borders map on every change; we diff against
  // the current `fmt.borders` and issue exactly the writes needed so the
  // store sees minimal patches. `applyBorders` with `undefined` clears a
  // side; with a spec sets it.
  const applyBordersMap = useCallback(
    (next: { top?: BorderSpec; right?: BorderSpec; bottom?: BorderSpec; left?: BorderSpec }) => {
      const sides: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
      const current = fmt.borders;
      const toSet: Partial<Record<'top' | 'right' | 'bottom' | 'left', BorderSpec>> = {};
      const toClear: Array<'top' | 'right' | 'bottom' | 'left'> = [];
      for (const s of sides) {
        const cur = current[s];
        const nxt = next[s];
        if (!cur && !nxt) continue;
        if (!nxt) {
          toClear.push(s);
        } else if (
          !cur ||
          cur.width !== nxt.width ||
          cur.color !== nxt.color ||
          cur.style !== nxt.style
        ) {
          toSet[s] = nxt;
        }
      }
      if (toClear.length) {
        applyBorders(store, colIdsRef.current, targetRef.current, toClear, undefined);
      }
      // Group by spec so sides with identical specs land in one write.
      const bySpec = new Map<string, Array<'top' | 'right' | 'bottom' | 'left'>>();
      for (const [side, spec] of Object.entries(toSet) as Array<[
        'top' | 'right' | 'bottom' | 'left',
        BorderSpec,
      ]>) {
        const key = `${spec.width}|${spec.style}|${spec.color}`;
        const list = bySpec.get(key) ?? [];
        list.push(side);
        bySpec.set(key, list);
      }
      for (const [, list] of bySpec) {
        if (list.length) {
          applyBorders(store, colIdsRef.current, targetRef.current, list, toSet[list[0]]!);
        }
      }
    },
    [fmt.borders, store],
  );

  // ─── Render ────────────────────────────────────────────────────────────
  const fontSizeLabel = fmt.fontSize != null ? `${fmt.fontSize}px` : '11px';
  const vft = fmt.valueFormatterTemplate;

  return (
    <div
      className={cn('gc-formatting-toolbar flex items-center gap-2 h-11 shrink-0 border-b border-border bg-card text-xs relative z-[10000]', !disabled && 'gc-toolbar-enabled')}
      style={{ paddingLeft: 16, paddingRight: 16 }}
      data-testid="formatting-toolbar"
      onMouseDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
      }}
    >

      {/* ── Templates ── */}
      {!disabled && (
        <TGroup>
          <select
            className="h-7 text-[9px] font-mono rounded-[4px] px-2.5 cursor-pointer transition-all gc-tbtn bg-card border border-border text-foreground max-w-[110px]"
            value=""
            data-testid="templates-select"
            onChange={(e) => {
              const tplId = e.target.value;
              if (tplId) {
                applyTemplateToColumns(store, colIdsRef.current, tplId);
                e.target.value = '';
              }
            }}
          >
            <option value="" disabled>Templates</option>
            {templateList.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
            ))}
            {templateList.length === 0 && <option disabled>No templates yet</option>}
          </select>
          <Popover
            trigger={
              <TBtn tooltip="Save as template" className={saveAsTplConfirmed ? 'gc-tbtn-confirm' : undefined}>
                {saveAsTplConfirmed
                  ? <Check size={14} strokeWidth={2.5} style={{ color: 'var(--bn-green, #2dd4bf)' }} />
                  : <Plus size={14} strokeWidth={1.75} />}
              </TBtn>
            }
          >
            <div className="p-3 w-[230px]" onMouseDown={(e) => {
              if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
            }}>
              <div className="text-[9px] uppercase tracking-[0.05em] mb-1.5 text-muted-foreground font-semibold">
                Save as template
              </div>
              <input
                type="text"
                value={saveAsTplName}
                onChange={(e) => setSaveAsTplName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveAsTplName.trim()) {
                    saveCurrentAsTemplate(core, store, colIdsRef.current, saveAsTplName);
                    setSaveAsTplName('');
                    flashSaveAsTpl();
                  }
                }}
                placeholder={`${colLabel} Style`}
                className="w-full h-7 px-2.5 rounded-[3px] text-[11px] font-mono mb-2 bg-background text-foreground border border-border outline-none focus:ring-1 focus:ring-ring"
                autoFocus
                data-testid="save-tpl-input"
              />
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const name = saveAsTplName.trim() || `${colLabel} Style`;
                  saveCurrentAsTemplate(core, store, colIdsRef.current, name);
                  setSaveAsTplName('');
                  flashSaveAsTpl();
                }}
                data-testid="save-tpl-btn"
              >
                Save Template
              </Button>
            </div>
          </Popover>
        </TGroup>
      )}

      <div className="gc-toolbar-sep h-5" />

      {/* ── Typography ── */}
      <TGroup>
        <TBtn disabled={disabled} tooltip="Bold" active={fmt.bold} onClick={toggleBold}>
          <Bold size={14} strokeWidth={2.25} />
        </TBtn>
        <TBtn disabled={disabled} tooltip="Italic" active={fmt.italic} onClick={toggleItalic}>
          <Italic size={14} strokeWidth={1.75} />
        </TBtn>
        <TBtn disabled={disabled} tooltip="Underline" active={fmt.underline} onClick={toggleUnderline}>
          <Underline size={14} strokeWidth={1.75} />
        </TBtn>
        <div className="gc-toolbar-sep h-4 opacity-50" />
        {/* Font size dropdown */}
        <Popover
          trigger={
            <button disabled={disabled}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-[4px] text-[9px] font-mono transition-all duration-150 cursor-pointer gc-tbtn',
                disabled && 'opacity-20 pointer-events-none',
              )}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
              <span className="tracking-wider">{fontSizeLabel}</span>
              <ChevronDown size={9} strokeWidth={2} className="opacity-50" />
            </button>
          }
        >
          <div className="p-1.5 min-w-[68px]">
            {[9, 10, 11, 12, 13, 14, 16, 18, 20, 24].map((sz) => (
              <button
                key={sz}
                className={cn(
                  'flex items-center w-full px-2.5 py-1 rounded-md text-[11px] font-mono hover:bg-accent cursor-pointer transition-colors',
                  fmt.fontSize === sz ? 'text-primary' : 'text-foreground',
                )}
                onClick={() => setFontSizePx(sz)}
                onMouseDown={(e) => e.preventDefault()}
              >
                {sz}px
              </button>
            ))}
          </div>
        </Popover>
        <ColorPickerPopover
          disabled={disabled}
          value={fmt.color}
          icon={<Type size={11} strokeWidth={2} />}
          onChange={(c) => setTextColor(c)}
          compact
        />
        <ColorPickerPopover
          disabled={disabled}
          value={fmt.background}
          icon={<PaintBucket size={11} strokeWidth={1.5} />}
          onChange={(c) => setBgColor(c)}
          compact
        />
      </TGroup>

      <div className="gc-toolbar-sep h-5" />

      {/* ── Alignment ── */}
      <TGroup>
        <TBtn disabled={disabled} tooltip="Left" active={fmt.horizontal === 'left'} onClick={() => toggleAlign('left')}>
          <AlignLeft size={14} strokeWidth={1.75} />
        </TBtn>
        <TBtn disabled={disabled} tooltip="Center" active={fmt.horizontal === 'center'} onClick={() => toggleAlign('center')}>
          <AlignCenter size={14} strokeWidth={1.75} />
        </TBtn>
        <TBtn disabled={disabled} tooltip="Right" active={fmt.horizontal === 'right'} onClick={() => toggleAlign('right')}>
          <AlignRight size={14} strokeWidth={1.75} />
        </TBtn>
      </TGroup>

      <div className="gc-toolbar-sep h-5" />

      {/* ── Number Format (cell-only) ── */}
      <TGroup className={isHeader ? 'opacity-30 pointer-events-none' : undefined}>
        <Popover
          trigger={
            <Button variant="ghost" size="icon-sm" disabled={disabled || isHeader}
              className={cn('shrink-0 w-7 h-7 rounded-[4px] gc-tbtn transition-all duration-150', (disabled || isHeader) && 'opacity-25 pointer-events-none')}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}>
              <DollarSign size={14} strokeWidth={1.75} />
            </Button>
          }
        >
          <div className="p-1.5 min-w-[120px]">
            {Object.entries(CURRENCY_FORMATTERS).map(([key, f]) => (
              <button
                key={key}
                className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-[11px] text-foreground hover:bg-accent cursor-pointer transition-colors"
                onClick={() => doFormat(f.template)}
                onMouseDown={(e) => e.preventDefault()}
              >
                <span className="font-mono font-semibold w-4 text-muted-foreground">{f.label}</span>
                <span>{key}</span>
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            <button
              className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md text-[11px] text-foreground hover:bg-accent cursor-pointer transition-colors"
              onClick={() => doFormat(BPS_TEMPLATE)}
              onMouseDown={(e) => e.preventDefault()}
            >
              <span className="font-mono font-semibold w-4 text-muted-foreground">bp</span>
              <span>BPS</span>
            </button>
          </div>
        </Popover>
        <TBtn disabled={disabled || isHeader} tooltip="Percentage"
          active={!isHeader && isPercentTemplate(vft)}
          onClick={() => doFormat(isPercentTemplate(vft) ? undefined : PERCENT_TEMPLATE)}>
          <Percent size={14} strokeWidth={1.75} />
        </TBtn>
        <TBtn disabled={disabled || isHeader} tooltip="Thousands"
          active={!isHeader && isCommaTemplate(vft)}
          onClick={() => doFormat(isCommaTemplate(vft) ? undefined : COMMA_TEMPLATE)}>
          <Hash size={14} strokeWidth={1.75} />
        </TBtn>
        <div className="gc-toolbar-sep h-4 opacity-50" />
        {/* ── Tick format (fixed-income bond price) — split button ────
             Main button toggles TICK32 (most common). Chevron opens a
             precision menu (32 / 32+ / 64 / 128 / 256). When a tick
             format is already applied, the main button shows the
             active token's label inside the tooltip. */}
        <TBtn
          disabled={disabled || isHeader}
          active={!isHeader && isTickTemplate(vft)}
          tooltip={
            currentTickToken(vft)
              ? `Tick: ${TICK_MENU.find((m) => m.token === currentTickToken(vft))?.label ?? '32nds'}`
              : 'Tick format (32nds)'
          }
          onClick={() =>
            doFormat(
              isTickTemplate(vft)
                ? undefined
                : { kind: 'tick', tick: currentTickToken(vft) ?? 'TICK32' },
            )
          }
          data-testid="fmt-tick-btn"
        >
          <span style={{
            fontFamily: 'var(--ck-font-mono, monospace)',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}>
            {currentTickToken(vft)
              ? (TICK_MENU.find((m) => m.token === currentTickToken(vft))?.sample.split('-').pop() ?? '32')
              : '32'}
          </span>
        </TBtn>
        <Popover
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={disabled || isHeader}
              className={cn(
                'shrink-0 w-4 h-7 rounded-[4px] gc-tbtn transition-all duration-150',
                (disabled || isHeader) && 'opacity-25 pointer-events-none',
              )}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              data-testid="fmt-tick-menu-trigger"
              title="Tick precision"
            >
              <ChevronDown size={10} strokeWidth={1.75} />
            </Button>
          }
        >
          <div className="p-1 min-w-[180px]">
            {TICK_MENU.map((m) => {
              const active = currentTickToken(vft) === m.token;
              return (
                <button
                  key={m.token}
                  type="button"
                  onClick={() => doFormat({ kind: 'tick', tick: m.token })}
                  onMouseDown={(e) => e.preventDefault()}
                  className={cn(
                    'flex items-center gap-3 w-full px-2 py-1.5 rounded-md text-[11px]',
                    'text-foreground hover:bg-accent cursor-pointer transition-colors',
                    active && 'bg-accent',
                  )}
                  data-testid={`fmt-tick-menu-${m.token}`}
                >
                  <span className="font-mono text-muted-foreground w-4">
                    {active ? <Check size={10} strokeWidth={2.5} /> : ''}
                  </span>
                  <span className="flex-1 text-left">{m.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{m.sample}</span>
                </button>
              );
            })}
          </div>
        </Popover>
        <div className="gc-toolbar-sep h-4 opacity-50" />
        <TBtn disabled={disabled || isHeader} tooltip="Fewer decimals" onClick={decreaseDecimals}>
          <span className="flex items-center gap-px text-[9px] font-mono"><ArrowLeft size={9} strokeWidth={2} />.0</span>
        </TBtn>
        <TBtn disabled={disabled || isHeader} tooltip="More decimals" onClick={increaseDecimals}>
          <span className="flex items-center gap-px text-[9px] font-mono">.0<ArrowRight size={9} strokeWidth={2} /></span>
        </TBtn>
        <div className="gc-toolbar-sep h-4 opacity-50" />
        {/* Excel format-string input — power-user escape hatch. Commits on
             blur or Enter; invalid format strings keep the draft on screen
             but don't mutate state (red border via aria-invalid). */}
        <Tooltip content={'Excel format string — e.g. #,##0.00 · $#,##0;(#,##0) · 0.00% · yyyy-mm-dd · [Red]#,##0'}>
          <input
            ref={excelInputRef}
            type="text"
            data-testid="fmt-excel-input"
            disabled={disabled || isHeader}
            value={excelDraft}
            placeholder={currentExcelEquivalent || '#,##0.00'}
            onChange={(e) => setExcelDraft(e.target.value)}
            onFocus={() => setExcelFocused(true)}
            onBlur={() => { setExcelFocused(false); commitExcel(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitExcel(); excelInputRef.current?.blur(); }
              else if (e.key === 'Escape') { e.preventDefault(); setExcelDraft(currentExcelEquivalent); excelInputRef.current?.blur(); }
            }}
            aria-invalid={!excelDraftValid}
            style={{
              width: 140,
              height: 24,
              padding: '0 6px',
              fontSize: 10,
              fontFamily: 'var(--fi-mono, "JetBrains Mono", Menlo, monospace)',
              background: 'var(--bn-bg, #0b0e11)',
              color: 'var(--bn-t0, #eaecef)',
              border: `1px solid ${excelDraftValid ? 'var(--bn-border, #313944)' : 'var(--bn-red, #f87171)'}`,
              borderRadius: 3,
              outline: 'none',
            }}
          />
        </Tooltip>
        {/* ── Shared FormatterPicker — additive, collapsed by default so
              it sits as a single chip next to the raw Excel input. The
              existing numeric quick-buttons above still drive the same
              column assignment; the picker surfaces structured presets
              (including tick formats), a categorised Excel reference,
              and a live preview chip for power users. Operates on the
              same `ColumnAssignment.valueFormatterTemplate` field so
              persistence rides column-customization's existing profile
              pipeline. */}
        <FormatterPicker
          dataType="number"
          value={vft}
          onChange={(next) => doFormat(next)}
          defaultCollapsed
          compact
          data-testid="fmt-picker-toolbar"
        />
      </TGroup>

      <div className="gc-toolbar-sep h-5" />

      {/* ── Borders ── Cockpit-native popover shell.
            Uses Radix directly so the content wrapper (`PopoverContent`) is
            our box — no `PopoverCompat` legacy chrome underneath. That lets
            the shell itself be cockpit-coloured (card surface, hairline rim,
            cockpit shadow) instead of inheriting the --gc-* values from the
            compat wrapper. */}
      <RadixPopover>
        <RadixPopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            className={cn(
              'shrink-0 w-7 h-7 rounded-[4px] gc-tbtn transition-all duration-150',
              disabled && 'opacity-25 pointer-events-none',
            )}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
          >
            <Grid3X3 size={14} strokeWidth={1.75} />
          </Button>
        </RadixPopoverTrigger>
        <RadixPopoverContent
          align="start"
          sideOffset={6}
          className="gc-sheet-v2"
          style={{
            padding: 8,
            width: 460,
            maxWidth: '90vw',
            background: 'var(--ck-bg, #111417)',
            color: 'var(--ck-t0, #eaecef)',
            border: '1px solid var(--ck-border-hi, #3e4754)',
            borderRadius: 2,
            boxShadow: 'var(--ck-popout-shadow, 0 20px 40px rgba(0,0,0,0.5))',
            fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", "Inter", sans-serif)',
          }}
          onMouseDown={(e) => {
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== 'SELECT' && tag !== 'INPUT') e.preventDefault();
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ck-t2, var(--muted-foreground))',
                fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
              }}
            >
              Borders · {target === 'header' ? 'Header' : 'Cell'}
            </span>
          </div>

          {/* Shared editor — same component used by the Styling Rules
              BORDER band. Flex-wraps at narrow widths automatically. */}
          <BorderStyleEditor
            value={fmt.borders}
            onChange={applyBordersMap}
            previewLabel={target === 'header' ? 'Header' : 'Cell'}
          />
        </RadixPopoverContent>
      </RadixPopover>

      <div className="gc-toolbar-sep h-5" />

      {/* ── History + Actions ── */}
      <TGroup>
        {/* v2 has no undo-redo module yet — render disabled for layout parity.  */}
        <Tooltip content="Undo/redo deferred to v2.2">
          <span>
            <TBtn disabled tooltip={undefined}>
              <Undo2 size={14} strokeWidth={1.75} />
            </TBtn>
          </span>
        </Tooltip>
        <Tooltip content="Undo/redo deferred to v2.2">
          <span>
            <TBtn disabled tooltip={undefined}>
              <Redo2 size={14} strokeWidth={1.75} />
            </TBtn>
          </span>
        </Tooltip>
        <div className="gc-toolbar-sep h-4 opacity-50" />
        <TBtn
          tooltip="Clear all styles"
          disabled={disabled}
          onClick={() => {
            clearAllStyles(store, colIdsRef.current);
            flashClear();
          }}
          className={clearConfirmed ? 'gc-tbtn-confirm' : undefined}
        >
          {clearConfirmed
            ? <Check size={14} strokeWidth={2.5} style={{ color: 'var(--bn-green, #2dd4bf)' }} />
            : <Trash2 size={14} strokeWidth={1.75} />}
        </TBtn>
      </TGroup>

      <div className="flex-1" />

      {/* Column context + Cell/Header toggle */}
      <div className="flex items-center gap-4 shrink-0">
        <span className={cn(
          'text-[11px] max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap select-none',
          colIds.length > 0 ? 'text-foreground' : 'text-muted-foreground',
        )} title={colIds.join(', ')} data-testid="formatting-col-label">
          {colLabel}
        </span>
        <ToggleGroup
          value={target}
          onValueChange={(v) => setTarget(v as TargetKind)}
          size="sm"
          className="min-w-[75px]"
        >
          <ToggleGroupItem value="cell" className="flex-1">Cell</ToggleGroupItem>
          <ToggleGroupItem value="header" className="flex-1">Header</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}

