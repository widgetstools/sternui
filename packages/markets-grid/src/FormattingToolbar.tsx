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
  ColorPickerPopover,
  cn,
} from '@grid-customizer/core';
import {
  BorderStyleEditor,
  FormatterPicker,
  useGridPlatform,
  valueFormatterFromTemplate,
  type GridCore,
  type GridStore,
  type ColumnCustomizationState,
  type ColumnTemplatesState,
  type BorderSpec,
  type CellStyleOverrides,
  type TickToken,
  type ValueFormatterTemplate,
  resolveTemplates,
  useModuleState,
  // Pure reducers extracted in step 1. The v2 helper bodies below
  // delegate to these; behaviour is unchanged, covered by 43 unit
  // tests in core/modules/column-customization/formattingActions.test.ts.
  addTemplateReducer,
  applyAlignmentReducer,
  applyBordersReducer,
  applyColorsReducer,
  applyFormatterReducer,
  applyTemplateToColumnsReducer,
  applyTypographyReducer,
  clearAllBordersReducer,
  clearAllStylesReducer,
  snapshotTemplate,
  writeOverridesReducer,
} from '@grid-customizer/core';
import {
  Undo2, Redo2, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  Type, PaintBucket,
  Trash2, Grid3X3, Check,
  ChevronDown, ArrowLeft, ArrowRight, ArrowLeftRight,
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
const TICK_MENU: ReadonlyArray<{
  token: TickToken;
  label: string;
  sample: string;
  /** Short denominator label displayed on the toolbar button — reflects
   *  the active tick base (32 / 32+ / 64 / 128 / 256) so the user can see
   *  at a glance which tick system is applied. Derived separately from
   *  `sample` because `sample.split('-').pop()` would incorrectly return
   *  the fractional numerator ('16' from '101-16') instead of the
   *  denominator the user actually cares about. */
  denominator: string;
}> = [
  { token: 'TICK32',      label: '32nds',           sample: '101-16',  denominator: '32'  },
  { token: 'TICK32_PLUS', label: '32nds + halves',  sample: '101-16+', denominator: '32+' },
  { token: 'TICK64',      label: '64ths',           sample: '101-161', denominator: '64'  },
  { token: 'TICK128',     label: '128ths',          sample: '101-162', denominator: '128' },
  { token: 'TICK256',     label: '256ths',          sample: '101-161', denominator: '256' },
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

/**
 * Vertical hairline separator between toolbar groups. Sized + coloured
 * against the cockpit border var so it's consistent across themes.
 */
function ToolbarSep() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 20,
        background: 'var(--border, #2d3339)',
        opacity: 0.6,
        flexShrink: 0,
      }}
    />
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

// ─── Active-column tracking ────────────────────────────────────────────
//
// Tracks the grid's currently-selected columns (range selection /
// focused cell) so the toolbar knows which columns to write to. Used
// to poll for the grid api every 300ms through `setInterval`; v4 switches
// to `platform.api.onReady()` + typed ApiHub subscriptions. The ApiHub
// hangs off the per-grid platform so listeners are auto-disposed on
// platform teardown — no manual `removeEventListener` bookkeeping, no
// polling, no leaked timers across StrictMode mount/unmount cycles.
//
// The "last non-empty" memory is preserved — toolbar clicks that shift
// focus away from the grid shouldn't clear the remembered selection.

function useActiveColumns(core: GridCore): string[] {
  const platform = useGridPlatform();
  const [colIds, setColIds] = useState<string[]>([]);
  const lastColIds = useRef<string[]>([]);

  useEffect(() => {
    const getColIds = (): string[] => {
      const api = platform.api.api as unknown as {
        getCellRanges?: () => Array<{ columns?: unknown[] }>;
        getFocusedCell?: () => { column?: unknown } | null;
      } | null;
      if (!api) return lastColIds.current;

      const extractId = (col: unknown): string | null => {
        const c = col as { getColId?: () => string } | null;
        return c && typeof c.getColId === 'function' ? c.getColId() || null : null;
      };

      const ids: string[] = [];
      try {
        for (const range of api.getCellRanges?.() ?? []) {
          for (const col of range.columns ?? []) {
            const id = extractId(col);
            if (id && !ids.includes(id)) ids.push(id);
          }
        }
      } catch { /* range api unavailable */ }

      if (ids.length === 0) {
        try {
          const id = extractId(api.getFocusedCell?.()?.column);
          if (id) ids.push(id);
        } catch { /* focused-cell api unavailable */ }
      }

      if (ids.length > 0) {
        lastColIds.current = ids;
        return ids;
      }
      return lastColIds.current;
    };

    const update = () => setColIds(getColIds());

    // Install all three listeners as soon as the api is ready; `onReady`
    // returns a disposer that also unsubscribes any listeners we
    // registered while the api was live.
    const disposers: Array<() => void> = [];
    disposers.push(
      platform.api.onReady(() => {
        disposers.push(platform.api.on('cellFocused', update));
        disposers.push(platform.api.on('cellClicked', update));
        disposers.push(platform.api.on('cellSelectionChanged', update));
        update();
      }),
    );

    return () => {
      for (const d of disposers) {
        try { d(); } catch { /* teardown race */ }
      }
    };
  }, [platform]);

  // `core` is still accepted as a prop for parity with the rest of the
  // toolbar (helpers that need `getGridApi` as a plain callable), but the
  // hook itself now reads through the platform context.
  void core;
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

// ─── State-writer helpers ────────────────────────────────────────────
//
// THIN delegates to the pure reducers in
// `@grid-customizer/core/modules/column-customization/formattingActions`.
// Every helper here preserves its v2 signature (so the ~40 callsites
// in this file stay untouched across the refactor) while the body
// dispatches a reducer through `setModuleState`. Behaviour is pinned
// by the 43 reducer unit tests + 20 snapshotTemplate tests in core.
//
// Step 6 of the toolbar refactor will inline these delegates at the
// callsite + drop the `store` parameter entirely. Keeping them as
// one-liners now is the step that swaps implementations without
// touching the component body.

function writeOverrides(
  store: GridStore,
  colIds: string[],
  target: TargetKind,
  patch: Partial<CellStyleOverrides>,
) {
  store.setModuleState<ColumnCustomizationState>(
    'column-customization',
    writeOverridesReducer(colIds, target, patch),
  );
}

function applyTypography(
  store: GridStore, colIds: string[], target: TargetKind,
  patch: { bold?: boolean | undefined; italic?: boolean | undefined; underline?: boolean | undefined; fontSize?: number | undefined },
) {
  store.setModuleState<ColumnCustomizationState>(
    'column-customization',
    applyTypographyReducer(colIds, target, patch),
  );
}

function applyColors(
  store: GridStore, colIds: string[], target: TargetKind,
  patch: { text?: string | undefined; background?: string | undefined },
) {
  store.setModuleState<ColumnCustomizationState>(
    'column-customization',
    applyColorsReducer(colIds, target, patch),
  );
}

function applyAlignment(
  store: GridStore, colIds: string[], target: TargetKind,
  patch: { horizontal?: 'left' | 'center' | 'right' | undefined },
) {
  store.setModuleState<ColumnCustomizationState>(
    'column-customization',
    applyAlignmentReducer(colIds, target, patch),
  );
}

/** Write a BorderSpec (or undefined to clear) to one or more sides. */
function applyBorders(
  store: GridStore, colIds: string[], target: TargetKind,
  sides: Array<'top' | 'right' | 'bottom' | 'left'>,
  spec: BorderSpec | undefined,
) {
  store.setModuleState<ColumnCustomizationState>(
    'column-customization',
    applyBordersReducer(colIds, target, sides, spec),
  );
}

/** Clear every border side (top/right/bottom/left). */
function clearAllBorders(store: GridStore, colIds: string[], target: TargetKind) {
  store.setModuleState<ColumnCustomizationState>(
    'column-customization',
    clearAllBordersReducer(colIds, target),
  );
}

/** Set valueFormatterTemplate on each column (undefined removes it). */
function applyFormatter(
  store: GridStore, colIds: string[],
  template: ValueFormatterTemplate | undefined,
) {
  store.setModuleState<ColumnCustomizationState>(
    'column-customization',
    applyFormatterReducer(colIds, template),
  );
}

/** Replace the templateIds chain with the single picked template.
 *  v2's resolver composes templateIds in array order; for toolbar UX we
 *  intentionally keep it single so picking a template swaps cleanly. */
function applyTemplateToColumns(store: GridStore, colIds: string[], templateId: string) {
  store.setModuleState<ColumnCustomizationState>(
    'column-customization',
    applyTemplateToColumnsReducer(colIds, templateId),
  );
}

/** Snapshot the first column's resolved overrides + formatter as a named template.
 *  Splits into two pure calls (snapshotTemplate → addTemplateReducer) + a
 *  grid-api read for the column's cellDataType. */
function saveCurrentAsTemplate(
  core: GridCore, store: GridStore, colIds: string[], name: string,
): string | undefined {
  if (!colIds.length) return undefined;
  const colId = colIds[0];

  // Ask the grid api for cellDataType so resolveTemplates can fold the
  // right typeDefault. Try/catch because v2's api shape drift is real.
  let dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined;
  try {
    const api = core.getGridApi() as unknown as {
      getColumn?: (id: string) => { getColDef?: () => { cellDataType?: unknown } };
    } | null;
    const t = api?.getColumn?.(colId)?.getColDef?.()?.cellDataType;
    if (t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean') dataType = t;
  } catch { /* ignore */ }

  const cust = store.getModuleState<ColumnCustomizationState>('column-customization');
  const tpls = store.getModuleState<ColumnTemplatesState>('column-templates');
  const tpl = snapshotTemplate(cust, tpls, colId, name, dataType);
  if (!tpl) return undefined;

  store.setModuleState<ColumnTemplatesState>('column-templates', addTemplateReducer(tpl));
  return tpl.id;
}

/** Drop every override (and template ref) on the selected columns. */
function clearAllStyles(store: GridStore, colIds: string[]) {
  store.setModuleState<ColumnCustomizationState>(
    'column-customization',
    clearAllStylesReducer(colIds),
  );
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

  // First selected column's `cellDataType` — used to drive the
  // FormatterPicker's preset filtering. When no column is selected or
  // the column has no dataType set, fall back to 'number' (the most
  // common case in this tool).
  //
  // We use an AG-Grid event subscription (rather than a pure useMemo
  // over `colIds`) because the auto-detected types land on the colDefs
  // AFTER the first `firstDataRendered` event, which triggers a
  // `columnEverythingChanged` on the api — that's the signal we hook
  // so the picker re-evaluates once the types are in.
  const [colEventTick, setColEventTick] = useState(0);
  useEffect(() => {
    const api = core.getGridApi() as unknown as {
      addEventListener?: (evt: string, fn: () => void) => void;
      removeEventListener?: (evt: string, fn: () => void) => void;
    } | null;
    if (!api || typeof api.addEventListener !== 'function') return;
    const bump = () => setColEventTick((n) => n + 1);
    const events = ['columnEverythingChanged', 'displayedColumnsChanged', 'firstDataRendered'] as const;
    for (const e of events) {
      try { api.addEventListener!(e, bump); } catch { /* */ }
    }
    return () => {
      for (const e of events) {
        try { api.removeEventListener?.(e, bump); } catch { /* */ }
      }
    };
  }, [core]);

  const pickerDataType = useMemo<
    'number' | 'date' | 'datetime' | 'boolean' | 'string'
  >(() => {
    if (colIds.length === 0) return 'number';
    try {
      const api = core.getGridApi() as unknown as {
        getColumn?: (id: string) => { getColDef?: () => { cellDataType?: unknown } } | null;
      } | null;
      const raw = api?.getColumn?.(colIds[0])?.getColDef?.()?.cellDataType;
      // AG-Grid emits 'dateString' for pure dates and 'dateTimeString' for
      // date+time; our picker's enum splits those into 'date' vs 'datetime'
      // so the preset list shows the right sub-menu (ISO vs ISO-with-time,
      // EU short vs US with AM/PM, etc.).
      if (raw === 'dateTimeString' || raw === 'datetime') return 'datetime';
      if (raw === 'date' || raw === 'dateString') return 'date';
      if (raw === 'boolean') return 'boolean';
      if (raw === 'text' || raw === 'string') return 'string';
      if (raw === 'number' || raw === 'numeric') return 'number';
    } catch {
      /* ignore */
    }
    return 'number';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colIds, core, colEventTick]);

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

  // Live-preview sample values per datatype — the chip at the end of Row 2
  // runs the current `vft` through `valueFormatterFromTemplate` and renders
  // the result. Gives traders an at-a-glance answer to "what does the current
  // format look like against a real value?" without touching the grid.
  const previewSample: unknown = pickerDataType === 'number'   ? 1234.5678
                             : pickerDataType === 'date'     ? new Date('2026-04-17T00:00:00Z')
                             : pickerDataType === 'datetime' ? new Date('2026-04-17T09:30:00Z')
                             : pickerDataType === 'boolean'  ? true
                             :                                 'sample';
  const previewText = useMemo(() => {
    if (!vft) return String(previewSample instanceof Date ? previewSample.toISOString().slice(0, 10) : previewSample);
    try { return valueFormatterFromTemplate(vft)({ value: previewSample }); }
    catch { return '—'; }
  }, [vft, previewSample]);

  return (
    <div
      className={cn(
        'gc-formatting-toolbar flex flex-col gap-0 bg-card text-xs relative z-[10000]',
        !disabled && 'gc-toolbar-enabled',
        disabled && 'gc-toolbar-disabled',
      )}
      style={{
        // Natural content width, capped at viewport. Rows flex-wrap inside.
        width: 'max-content',
        maxWidth: 'calc(100vw - 96px)',
        flex: '0 1 auto',
      }}
      data-testid="formatting-toolbar"
      onMouseDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
      }}
    >

      {/* ───────────────────────────── ROW 1 — CHROME ───────────────────
          Target + column context anchor the row. Typography, alignment,
          colours, borders, and actions flow left-to-right. Flex-wraps
          atomically at the group level so pill-groups never break. */}
      <div
        className="gc-toolbar-row flex flex-wrap items-center gap-2"
        style={{ padding: '6px 12px', borderBottom: '1px solid var(--border, #2d3339)' }}
      >
        {/* Context: which column(s) + target toggle. Most important
             semantic anchor — placed at row start. */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Tooltip content={colIds.length > 0 ? colIds.join(', ') : 'Click a cell or header to pick a column'}>
            <span
              data-testid="formatting-col-label"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                height: 26, padding: '0 10px',
                borderRadius: 13,
                background: disabled
                  ? 'transparent'
                  : 'color-mix(in srgb, var(--bn-green, #2dd4bf) 10%, transparent)',
                border: `1px solid ${disabled ? 'var(--border, #2d3339)' : 'var(--bn-green, #2dd4bf)'}`,
                color: disabled ? 'var(--muted-foreground, #8b93a1)' : 'var(--bn-green, #2dd4bf)',
                fontSize: 11, fontWeight: 600, letterSpacing: 0.08,
                whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: 3,
                background: disabled ? 'var(--muted-foreground, #8b93a1)' : 'var(--bn-green, #2dd4bf)',
                boxShadow: disabled ? 'none' : '0 0 6px var(--bn-green, #2dd4bf)',
                flexShrink: 0,
              }} />
              {colLabel}
            </span>
          </Tooltip>
          {/* Cell / Header segmented toggle — clearer than a single pill
              that flips label. Shows two chips with the active one highlighted. */}
          <div
            role="group"
            aria-label="Edit target"
            className="gc-target-segmented"
            data-testid="formatting-target-toggle"
            data-target={target}
            style={{
              display: 'inline-flex',
              height: 26,
              borderRadius: 4,
              border: '1px solid var(--border, #2d3339)',
              overflow: 'hidden',
              background: 'var(--card, #161a1e)',
            }}
          >
            {(['cell', 'header'] as const).map((k) => {
              const on = target === k;
              return (
                <button
                  key={k}
                  type="button"
                  data-testid={`formatting-target-${k}`}
                  onClick={() => setTarget(k)}
                  onMouseDown={(e) => e.preventDefault()}
                  style={{
                    padding: '0 10px',
                    background: on ? 'var(--bn-green, #2dd4bf)' : 'transparent',
                    color: on ? '#0b0e11' : 'var(--muted-foreground, #a0a8b4)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.08,
                    textTransform: 'uppercase',
                  }}
                  title={`Edit the ${k}`}
                >{k}</button>
              );
            })}
          </div>
        </div>

        <ToolbarSep />

        {/* Templates dropdown + save-as — compact. */}
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

        {!disabled && <ToolbarSep />}

        {/* Typography — B/I/U. */}
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
          {/* Font size stepper — dropdown menu */}
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
        </TGroup>

        <ToolbarSep />

        {/* Alignment */}
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

        <ToolbarSep />

        {/* Colours — text + background */}
        <TGroup>
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

        <ToolbarSep />

        {/* Borders — popover editor. */}
        <TGroup>
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
                onMouseDown={(e) => { e.preventDefault(); }}
              >
                <Grid3X3 size={14} strokeWidth={1.75} />
              </Button>
            </RadixPopoverTrigger>
            <RadixPopoverContent
              align="start"
              sideOffset={6}
              className="gc-sheet-v2"
              style={{
                padding: 8, width: 460, maxWidth: '90vw',
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
              <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--ck-t2, var(--muted-foreground))',
                    fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
                  }}
                >
                  Borders · {target === 'header' ? 'Header' : 'Cell'}
                </span>
              </div>
              <BorderStyleEditor
                value={fmt.borders}
                onChange={applyBordersMap}
                previewLabel={target === 'header' ? 'Header' : 'Cell'}
              />
            </RadixPopoverContent>
          </RadixPopover>
        </TGroup>

        {/* History + Clear — right-anchored actions. `margin-left: auto`
             glues the group to the right edge of its wrap-line when space
             is available; at narrow widths the group stays adjacent to the
             previous group instead of getting pushed to a new row. */}
        <TGroup className="ml-auto">
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
      </div>

      {/* ───────────────────────────── ROW 2 — DATA FORMAT ──────────────
          Number format presets, decimals, tick, Excel template + live
          preview. Dims when target=header (headers have no values). */}
      <div
        className={cn(
          'gc-toolbar-row flex flex-wrap items-center gap-2',
          isHeader && 'opacity-40 pointer-events-none',
        )}
        style={{ padding: '6px 12px' }}
      >
        {/* Row-lead chip: labels the row + reinforces semantics. */}
        <span
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--muted-foreground, #8b93a1)',
            paddingRight: 4,
            borderRight: '1px solid var(--border, #2d3339)',
            marginRight: 4,
          }}
        >
          Value Format
        </span>

        {/* Currency menu — split button with instant USD trigger and
             chevron dropdown for EUR/GBP/JPY + BPS. */}
        <TGroup>
          <Popover
            trigger={
              <Button variant="ghost" size="icon-sm" disabled={disabled || isHeader}
                className={cn('shrink-0 w-7 h-7 rounded-[4px] gc-tbtn transition-all duration-150', (disabled || isHeader) && 'opacity-25 pointer-events-none')}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                data-testid="fmt-currency-menu">
                <DollarSign size={14} strokeWidth={1.75} />
              </Button>
            }
          >
            <div className="p-1.5 min-w-[140px]">
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
                <span>Basis points</span>
              </button>
            </div>
          </Popover>
          <TBtn disabled={disabled || isHeader} tooltip="Percentage"
            active={!isHeader && isPercentTemplate(vft)}
            onClick={() => doFormat(isPercentTemplate(vft) ? undefined : PERCENT_TEMPLATE)}>
            <Percent size={14} strokeWidth={1.75} />
          </TBtn>
          <TBtn disabled={disabled || isHeader} tooltip="Thousands (1,234)"
            active={!isHeader && isCommaTemplate(vft)}
            onClick={() => doFormat(isCommaTemplate(vft) ? undefined : COMMA_TEMPLATE)}>
            <Hash size={14} strokeWidth={1.75} />
          </TBtn>
        </TGroup>

        <ToolbarSep />

        {/* Decimals ± */}
        <TGroup>
          <TBtn disabled={disabled || isHeader} tooltip="Fewer decimals" onClick={decreaseDecimals}>
            <span className="flex items-center gap-px text-[9px] font-mono"><ArrowLeft size={9} strokeWidth={2} />.0</span>
          </TBtn>
          <TBtn disabled={disabled || isHeader} tooltip="More decimals" onClick={increaseDecimals}>
            <span className="flex items-center gap-px text-[9px] font-mono">.0<ArrowRight size={9} strokeWidth={2} /></span>
          </TBtn>
        </TGroup>

        <ToolbarSep />

        {/* Tick — bond-price format. Split: main button + chevron menu. */}
        <TGroup>
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
              fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', lineHeight: 1,
            }}>
              {currentTickToken(vft)
                ? (TICK_MENU.find((m) => m.token === currentTickToken(vft))?.denominator ?? '32')
                : '32'}
            </span>
          </TBtn>
          <Popover
            trigger={
              <Button
                variant="ghost" size="icon-sm" disabled={disabled || isHeader}
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
        </TGroup>

        <ToolbarSep />

        {/* Excel / expression format picker — full editor in a chip popover. */}
        <FormatterPicker
          dataType={pickerDataType}
          value={vft}
          onChange={(next) => doFormat(next)}
          defaultCollapsed
          compact
          data-testid="fmt-picker-toolbar"
        />

        {/* Live preview chip — right-anchored. `margin-left: auto` glues
             to the right edge when the row has spare width; at narrow
             widths the chip wraps to its own line rather than stealing
             space from a split-button it sits next to. */}
        <Tooltip content="Live preview — current format against a sample value">
          <div
            data-testid="fmt-preview-chip"
            className="ml-auto"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 26, padding: '0 10px',
              borderRadius: 4,
              border: '1px dashed var(--border, #2d3339)',
              background: 'var(--background, #0f1115)',
              fontSize: 11,
              fontFamily: 'var(--ck-font-mono, "IBM Plex Mono", monospace)',
              color: 'var(--foreground, #eaecef)',
              maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--muted-foreground, #8b93a1)',
              fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", sans-serif)',
            }}>Preview</span>
            <span>{previewText || '—'}</span>
          </div>
        </Tooltip>
      </div>

    </div>
  );
}

