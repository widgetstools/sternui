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
// Design-system stylesheet — terminal palette + component-scoped
// primitives. Token overrides switch on `[data-theme="light"]`. Zero
// functional coupling; pure CSS.
import './FormattingToolbar.css';
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
  type ColumnCustomizationState,
  type ColumnTemplatesState,
  type BorderSpec,
  type CellStyleOverrides,
  type TickToken,
  type ValueFormatterTemplate,
  resolveTemplates,
  useModuleState,
  // Pure reducers from `@grid-customizer/core`. Every button handler
  // below dispatches one directly through `setCustState` /
  // `setTplState` — no store closures. Covered by 63 unit tests in
  // core (formattingActions.test.ts + snapshotTemplate.test.ts) and
  // 15 integration tests in FormattingToolbar.test.tsx.
  addTemplateReducer,
  applyAlignmentReducer,
  applyBordersReducer,
  applyColorsReducer,
  applyFormatterReducer,
  applyTemplateToColumnsReducer,
  applyTypographyReducer,
  clearAllStylesReducer,
  snapshotTemplate,
} from '@grid-customizer/core';
import {
  Undo2, Redo2, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  Type, PaintBucket,
  LayoutTemplate, SquareDashed, Check, RemoveFormatting,
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

/**
 * Toolbar icon button. Chrome comes from `.gc-tb-btn` in
 * FormattingToolbar.css — square, sharp 2px corners, flat outlined
 * active state. The stylesheet's `[data-on]` + `[aria-pressed]`
 * selectors both light up, so existing tests that read
 * `aria-pressed` keep working.
 *
 * We use a native <button> instead of the shadcn `Button` wrapper —
 * the tokenised class owns all sizing + chrome and adding shadcn's
 * own Tailwind noise on top would fight specificity. Native gives
 * us the same focus / disabled / accessible-name surface with
 * zero style overhead.
 */
function TBtn({ children, active, disabled, tooltip, onClick, className, ...rest }: {
  children: React.ReactNode; active?: boolean; disabled?: boolean;
  tooltip?: string; onClick?: () => void; className?: string;
  'data-testid'?: string;
}) {
  const btn = (
    <button
      type="button"
      disabled={disabled}
      data-testid={rest['data-testid']}
      aria-label={tooltip}
      aria-pressed={typeof active === 'boolean' ? active : undefined}
      data-on={active ? 'true' : undefined}
      className={cn('gc-tb-btn', className)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && onClick) onClick();
      }}
    >
      {children}
    </button>
  );
  if (tooltip) return <Tooltip content={tooltip}>{btn}</Tooltip>;
  return btn;
}

/**
 * Group wrapper — a flex row that shrinks to content. No background /
 * padding; the terminal design lets the toolbar body's padding breathe
 * around groups. Matches the sample's `.tb-g`.
 */
function TGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('gc-tb-g', className)}>{children}</div>;
}

/** Vertical 1px hairline between groups — `.gc-tb-div` from the stylesheet. */
function ToolbarSep() {
  return <span aria-hidden className="gc-tb-div" />;
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

function useActiveColumns(): string[] {
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

function useColumnFormatting(colIds: string[], target: TargetKind): ResolvedFormatting {
  // Everything the hook needs comes from the platform context: module
  // state for the resolved assignment + live GridApi for the column's
  // cellDataType. The component no longer threads a `core` prop.
  const platform = useGridPlatform();
  const [cust] = useModuleState<ColumnCustomizationState>('column-customization');
  const [tpls] = useModuleState<ColumnTemplatesState>('column-templates');

  return useMemo(() => {
    const empty: ResolvedFormatting = { bold: false, italic: false, underline: false, borders: {} };
    if (!colIds.length || !cust) return empty;
    const a = cust.assignments?.[colIds[0]];
    if (!a) return empty;

    // Look up the colDef's cellDataType so resolveTemplates can apply a
    // matching typeDefault (e.g. numeric columns inherit a right-align
    // style).
    let dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined;
    try {
      const api = platform.api.api as unknown as {
        getColumn?: (id: string) => { getColDef?: () => { cellDataType?: unknown } };
      } | null;
      const t = api?.getColumn?.(colIds[0])?.getColDef?.()?.cellDataType;
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
  }, [cust, tpls, colIds, target, platform]);
}

// NOTE: step 6 of the toolbar refactor deleted the `applyX(store, …)`
// wrapper helpers that used to live here. Every handler now dispatches
// the matching pure reducer from `@grid-customizer/core` directly via
// `setCustState` / `setTplState`, obtained from `useModuleState` inside
// the component body. See `formattingActions.ts` + `snapshotTemplate.ts`
// in core for the reducers + their unit tests.

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * FormattingToolbar is fully context-driven as of step 7 — every
 * dependency (the live GridApi, the module stores, the platform event
 * hub) flows in through `useGridPlatform()`. The toolbar accepts NO
 * props. Each `<MarketsGrid>` instance already wraps its own
 * `<GridProvider>`, so a DockManager / OpenFin workspace layout with N
 * independent grids gets N independent toolbars automatically — no
 * prop-threading, no accidental cross-grid writes.
 */
export type FormattingToolbarProps = Record<string, never>;

export function FormattingToolbar() {
  const platform = useGridPlatform();
  const colIds = useActiveColumns();
  const colIdsRef = useRef(colIds);
  colIdsRef.current = colIds;

  const [target, setTarget] = useState<TargetKind>('cell');
  const targetRef = useRef(target);
  targetRef.current = target;

  const fmt = useColumnFormatting(colIds, target);
  const disabled = colIds.length === 0;
  const isHeader = target === 'header';

  const [clearConfirmed, flashClear] = useFlashConfirm();
  const [saveAsTplConfirmed, flashSaveAsTpl] = useFlashConfirm();
  const [saveAsTplName, setSaveAsTplName] = useState('');

  // State setters + reactive reads for dispatch-side plumbing. Every
  // button handler below pipes a pure reducer through one of these
  // setters.
  const [custState, setCustState] = useModuleState<ColumnCustomizationState>('column-customization');
  const [tplState, setTplState] = useModuleState<ColumnTemplatesState>('column-templates');
  const templateList = useMemo(() => {
    const templates = tplState?.templates ?? {};
    return Object.values(templates).sort((a, b) => a.name.localeCompare(b.name));
  }, [tplState]);

  // Column label for the right-side context affordance.
  const colLabel = useMemo(() => {
    if (colIds.length === 0) return 'Select a cell';
    if (colIds.length === 1) {
      try {
        const api = platform.api.api as unknown as {
          getColumn?: (id: string) => { getColDef?: () => { headerName?: string } };
        } | null;
        const col = api?.getColumn?.(colIds[0]);
        return col?.getColDef?.()?.headerName ?? colIds[0];
      } catch { /* ignore */ }
      return colIds[0];
    }
    return `${colIds.length} columns`;
  }, [colIds, platform]);

  // First selected column's `cellDataType` — used to drive the
  // FormatterPicker's preset filtering. When no column is selected or
  // the column has no dataType set, fall back to 'number' (the most
  // common case in this tool).
  //
  // We subscribe through the platform's ApiHub (rather than reading
  // once) because auto-detected types land on the colDefs AFTER
  // `firstDataRendered`, which fires `columnEverythingChanged` — that's
  // the signal we hook so the picker re-evaluates once the types are in.
  const [colEventTick, setColEventTick] = useState(0);
  useEffect(() => {
    const bump = () => setColEventTick((n) => n + 1);
    const disposers: Array<() => void> = [
      platform.api.on('columnEverythingChanged', bump),
      platform.api.on('displayedColumnsChanged', bump),
      platform.api.on('firstDataRendered', bump),
    ];
    return () => {
      for (const d of disposers) {
        try { d(); } catch { /* teardown race */ }
      }
    };
  }, [platform]);

  const pickerDataType = useMemo<
    'number' | 'date' | 'datetime' | 'boolean' | 'string'
  >(() => {
    if (colIds.length === 0) return 'number';
    try {
      const api = platform.api.api as unknown as {
        getColumn?: (id: string) => { getColDef?: () => { cellDataType?: unknown } };
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
  }, [colIds, platform, colEventTick]);

  // Typography toggles — the reducers pass `undefined` to clear a leaf.
  const toggleBold = useCallback(() => {
    setCustState(applyTypographyReducer(colIdsRef.current, targetRef.current, { bold: fmt.bold ? undefined : true }));
  }, [setCustState, fmt.bold]);

  const toggleItalic = useCallback(() => {
    setCustState(applyTypographyReducer(colIdsRef.current, targetRef.current, { italic: fmt.italic ? undefined : true }));
  }, [setCustState, fmt.italic]);

  const toggleUnderline = useCallback(() => {
    setCustState(applyTypographyReducer(colIdsRef.current, targetRef.current, { underline: fmt.underline ? undefined : true }));
  }, [setCustState, fmt.underline]);

  const setFontSizePx = useCallback((px: number) => {
    setCustState(applyTypographyReducer(colIdsRef.current, targetRef.current, { fontSize: px }));
  }, [setCustState]);

  const toggleAlign = useCallback((h: 'left' | 'center' | 'right') => {
    const next = fmt.horizontal === h ? undefined : h;
    setCustState(applyAlignmentReducer(colIdsRef.current, targetRef.current, { horizontal: next }));
  }, [setCustState, fmt.horizontal]);

  const setTextColor = useCallback((c: string | undefined) => {
    setCustState(applyColorsReducer(colIdsRef.current, targetRef.current, { text: c || undefined }));
  }, [setCustState]);

  const setBgColor = useCallback((c: string | undefined) => {
    setCustState(applyColorsReducer(colIdsRef.current, targetRef.current, { background: c || undefined }));
  }, [setCustState]);

  // Formatter — always cell-target (headers have no formatter).
  const doFormat = useCallback((t: ValueFormatterTemplate | undefined) => {
    setCustState(applyFormatterReducer(colIdsRef.current, t));
  }, [setCustState]);

  // Template picker — replace templateIds chain on active columns.
  const doApplyTemplate = useCallback((tplId: string) => {
    setCustState(applyTemplateToColumnsReducer(colIdsRef.current, tplId));
  }, [setCustState]);

  // Save-as-template — snapshot the effective style of the first active
  // column (resolving its templateIds + typeDefault + own overrides) and
  // persist it into column-templates under `name`. Returns undefined when
  // there's nothing worth saving (empty name, no overrides, no column).
  const doSaveAsTemplate = useCallback((name: string): string | undefined => {
    const ids = colIdsRef.current;
    if (!ids.length) return undefined;
    const colId = ids[0];
    // Read the column's cellDataType from the live grid api — feeds
    // into resolveTemplates so the saved template captures any
    // typeDefault the column inherits.
    let dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined;
    try {
      const api = platform.api.api as unknown as {
        getColumn?: (id: string) => { getColDef?: () => { cellDataType?: unknown } };
      } | null;
      const t = api?.getColumn?.(colId)?.getColDef?.()?.cellDataType;
      if (t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean') dataType = t;
    } catch { /* ignore */ }
    const tpl = snapshotTemplate(custState, tplState, colId, name, dataType);
    if (!tpl) return undefined;
    setTplState(addTemplateReducer(tpl));
    return tpl.id;
  }, [platform, custState, tplState, setTplState]);

  // Reset all overrides on active columns — collapses each assignment
  // to a bare `{ colId }`.
  const doClearAllStyles = useCallback(() => {
    setCustState(clearAllStylesReducer(colIdsRef.current));
  }, [setCustState]);

  // Decimals ± — read the CURRENT reactive `custState`/`tplState` so
  // consecutive clicks compound on the latest committed formatter.
  // Fall back to sampling the first cell's precision if no formatter
  // has been applied yet, mirroring v1's UX.
  const getCurrentDecimals = useCallback((): number => {
    const ids = colIdsRef.current;
    if (!ids.length) return 2;
    const a = custState?.assignments?.[ids[0]];
    if (a) {
      const resolved = resolveTemplates(a, tplState ?? { templates: {}, typeDefaults: {} }, undefined);
      const d = templateDecimals(resolved.valueFormatterTemplate);
      if (d !== null) return d;
    }
    try {
      const api = platform.api.api as unknown as {
        getDisplayedRowAtIndex?: (i: number) => { data?: Record<string, unknown> } | null;
      } | null;
      const firstRow = api?.getDisplayedRowAtIndex?.(0);
      const val = firstRow?.data?.[ids[0]];
      if (typeof val === 'number') {
        const s = String(val);
        const dot = s.indexOf('.');
        return dot >= 0 ? s.length - dot - 1 : 0;
      }
    } catch { /* ignore */ }
    return 2;
  }, [custState, tplState, platform]);

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
        setCustState(applyBordersReducer(colIdsRef.current, targetRef.current, toClear, undefined));
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
          setCustState(applyBordersReducer(colIdsRef.current, targetRef.current, list, toSet[list[0]]!));
        }
      }
    },
    [fmt.borders, setCustState],
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
        className="gc-toolbar-row gc-tb-body flex flex-wrap items-center gap-2"
        style={{ padding: '6px 12px', borderBottom: '1px solid var(--tb-line-strong, #2d3339)' }}
      >
        {/* Context: which column(s) + target toggle. Most important
             semantic anchor — placed at row start.

             Column-label chrome: `.gc-tb-preview` tokens (sunken
             surface + cyan value). Live-dot on the left mirrors the
             sample's LIVE badge treatment, but scoped via a data
             attr so disabled state drops the glow. */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Tooltip content={colIds.length > 0 ? colIds.join(', ') : 'Click a cell or header to pick a column'}>
            <span
              data-testid="formatting-col-label"
              className="gc-tb-preview"
              data-disabled={disabled ? 'true' : undefined}
              style={{
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                // Cyan value + dot when active; muted when no column
                // is selected (disabled state).
                color: disabled ? 'var(--tb-ink-2)' : 'var(--tb-cyan)',
              }}
            >
              <span
                className="gc-tb-live-dot"
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  flexShrink: 0,
                  background: disabled ? 'var(--tb-ink-3)' : 'var(--tb-green)',
                  boxShadow: disabled ? 'none' : '0 0 6px var(--tb-green)',
                }}
              />
              <span className="gc-tb-preview-val" style={{ color: 'inherit' }}>
                {colLabel}
              </span>
            </span>
          </Tooltip>
          {/* Cell ⇄ Header scope toggle — single pill that flips on click.
              Matches the sample's `.scope` pattern: cyan-accented value
              on the left, swap-arrow on the right that rotates on
              hover. Testids preserved per-state so tests that want to
              click directly to a state can do so in one interaction
              (the toggle's `data-target` attribute reflects the
              current value). */}
          <button
            type="button"
            role="switch"
            aria-label="Edit target"
            aria-checked={target === 'header'}
            className="gc-tb-scope"
            data-testid="formatting-target-toggle"
            data-target={target}
            onClick={() => setTarget(target === 'cell' ? 'header' : 'cell')}
            onMouseDown={(e) => e.preventDefault()}
            title={`Click to edit ${target === 'cell' ? 'header' : 'cell'}`}
          >
            <span className="gc-tb-scope-val">{target.toUpperCase()}</span>
            <ArrowLeftRight
              size={10}
              strokeWidth={2}
              className="gc-tb-scope-swap"
              aria-hidden
            />
          </button>
          {/* Hidden siblings preserve the two legacy testids so the
              integration test's `findByTestId('formatting-target-header')`
              pattern (open-then-pick) continues to resolve. They're
              not keyboard-focusable and not in the visual layout —
              they just act as named, programmatic access points to the
              setTarget action. */}
          <button
            type="button"
            data-testid="formatting-target-cell"
            onClick={() => setTarget('cell')}
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
            aria-hidden
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: target === 'cell' ? 'none' : 'auto',
            }}
          />
          <button
            type="button"
            data-testid="formatting-target-header"
            onClick={() => setTarget('header')}
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
            aria-hidden
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: target === 'header' ? 'none' : 'auto',
            }}
          />
        </div>

        <ToolbarSep />

        {/* Templates: single icon-button that opens a popover with the
             template list + a caret arrow. Replaces the visible
             <select> to save toolbar real estate. The save-as
             popover next to it keeps its own trigger (its popover
             lets the user NAME a new template — orthogonal UX). */}
        {!disabled && (
          <TGroup>
            <Popover
              trigger={
                <button
                  type="button"
                  className="gc-tb-btn-menu"
                  aria-label="Apply a saved template"
                  title="Apply a saved template"
                  data-testid="templates-menu-trigger"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  {/* LayoutTemplate — the canonical "saved layout / template"
                      glyph in lucide. Distinct from the Borders button's
                      SquareDashed so the two aren't confusable. */}
                  <LayoutTemplate size={13} strokeWidth={1.75} />
                  <ChevronDown size={9} strokeWidth={2} className="gc-tb-caret" />
                </button>
              }
            >
              <div className="p-1.5 min-w-[200px]" data-testid="templates-menu">
                <div className="text-[9px] uppercase tracking-[0.1em] mb-1 px-1.5 text-muted-foreground font-semibold">
                  Templates
                </div>
                {templateList.length === 0 ? (
                  <div className="px-2 py-2 text-[10px] text-muted-foreground italic">
                    No templates yet
                  </div>
                ) : (
                  templateList.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className="flex items-center w-full px-2 py-1.5 rounded text-[11px] font-mono hover:bg-accent cursor-pointer transition-colors text-foreground text-left"
                      onClick={() => doApplyTemplate(tpl.id)}
                      onMouseDown={(e) => e.preventDefault()}
                      data-testid={`templates-menu-item-${tpl.id}`}
                    >
                      {tpl.name}
                    </button>
                  ))
                )}
              </div>
            </Popover>
            <Popover
              trigger={
                <TBtn tooltip="Save as template" className={saveAsTplConfirmed ? 'gc-tb-confirm' : undefined}>
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
                      doSaveAsTemplate(saveAsTplName);
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
                    doSaveAsTemplate(name);
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
          <span aria-hidden className="gc-tb-div" />
          {/* Font size stepper — trigger is a `.gc-tb-chip` with
              "12 PX ▾" format. Dropdown is a Radix popover (not a
              native select) so hover states match the rest of the
              toolbar. */}
          <Popover
            trigger={
              <button
                disabled={disabled}
                type="button"
                className="gc-tb-chip"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
                <span>{fontSizeLabel}</span>
                <span className="gc-tb-unit">PX</span>
                <ChevronDown size={9} strokeWidth={2} className="gc-tb-caret" />
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
              <button
                type="button"
                disabled={disabled}
                aria-label="Cell borders"
                title="Cell borders"
                className="gc-tb-btn"
                onMouseDown={(e) => { e.preventDefault(); }}
              >
                {/* SquareDashed — a rectangle with dashed edges, reads
                    directly as "border configuration". Different from
                    the templates button's LayoutTemplate so they're
                    never confused at a glance. */}
                <SquareDashed size={14} strokeWidth={1.75} />
              </button>
            </RadixPopoverTrigger>
            <RadixPopoverContent
              align="start"
              sideOffset={6}
              className="gc-sheet-v2"
              style={{
                // Zero-padding wrapper — the BorderStyleEditor owns its
                // own chrome (background, border, rounded corners). A
                // wrapper padding would double the visual frame and
                // showing a caption inside would add noise the user
                // explicitly asked to drop.
                padding: 0,
                width: 460,
                maxWidth: '90vw',
                background: 'transparent',
                border: 'none',
                borderRadius: 2,
                boxShadow: 'var(--ck-popout-shadow, 0 20px 40px rgba(0,0,0,0.5))',
                fontFamily: 'var(--ck-font-sans, "IBM Plex Sans", "Inter", sans-serif)',
              }}
              onMouseDown={(e) => {
                const tag = (e.target as HTMLElement).tagName;
                if (tag !== 'SELECT' && tag !== 'INPUT') e.preventDefault();
              }}
            >
              <BorderStyleEditor
                value={fmt.borders}
                onChange={applyBordersMap}
              />
            </RadixPopoverContent>
          </RadixPopover>
        </TGroup>

        {/* History + Clear — flow naturally after Borders.
             Previously `ml-auto` right-anchored this group when the
             toolbar had two explicit rows (it sat at the end of ROW 1);
             in the single-row flex-wrap layout that margin created a
             large gap between Borders and Clear — everything after it
             got shoved right. Only the Preview chip keeps `ml-auto` so
             it stays right-anchored as the toolbar's final element. */}
        <TGroup>
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
              doClearAllStyles();
              flashClear();
            }}
            className={clearConfirmed ? 'gc-tb-confirm' : undefined}
          >
            {clearConfirmed
              ? <Check size={14} strokeWidth={2.5} style={{ color: 'var(--bn-green, #2dd4bf)' }} />
              : <RemoveFormatting size={14} strokeWidth={1.75} />}
          </TBtn>
        </TGroup>

        {/* Divider separating chrome (typography / color / borders)
            from data-format groups. Merging the previous two rows into
            this single flex-wrap row means the toolbar is single-line
            when there's container width for it, and wraps gracefully
            to a second visual row when the container shrinks.
            Data-format buttons already carry `disabled={isHeader}` so
            they dim individually when the scope targets a header —
            no need for a wrapper-level opacity. */}
        <span aria-hidden className="gc-tb-div" />
        {/* Row-lead micro-label — `.gc-tb-micro` per the terminal tokens. */}
        <span className="gc-tb-micro" style={{ borderRight: '1px solid var(--tb-line-strong)', marginRight: 4 }}>
          Value Format
        </span>

        {/* Currency menu — split button with instant USD trigger and
             chevron dropdown for EUR/GBP/JPY + BPS. */}
        <TGroup>
          <Popover
            trigger={
              <button
                type="button"
                disabled={disabled || isHeader}
                aria-label="Currency"
                className="gc-tb-btn"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                data-testid="fmt-currency-menu"
              >
                <DollarSign size={14} strokeWidth={1.75} />
              </button>
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

        {/* Decimals ± — text-content buttons with arrow + ".0" glyph.
             `.gc-tb-btn--text` variant lets the button auto-grow wide
             enough for both pieces. */}
        <TGroup>
          <TBtn
            disabled={disabled || isHeader}
            tooltip="Fewer decimals"
            onClick={decreaseDecimals}
            className="gc-tb-btn--text"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <ArrowLeft size={10} strokeWidth={2} />
              .0
            </span>
          </TBtn>
          <TBtn
            disabled={disabled || isHeader}
            tooltip="More decimals"
            onClick={increaseDecimals}
            className="gc-tb-btn--text"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              .0
              <ArrowRight size={10} strokeWidth={2} />
            </span>
          </TBtn>
        </TGroup>

        <ToolbarSep />

        {/* Tick — bond-price format. Split: main button + chevron menu. */}
        <TGroup>
          <TBtn
            disabled={disabled || isHeader}
            active={!isHeader && isTickTemplate(vft)}
            className="gc-tb-btn--text"
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
            {currentTickToken(vft)
              ? (TICK_MENU.find((m) => m.token === currentTickToken(vft))?.denominator ?? '32')
              : '32'}
          </TBtn>
          <Popover
            trigger={
              <button
                type="button"
                disabled={disabled || isHeader}
                aria-label="Tick precision"
                className="gc-tb-btn gc-tb-btn--narrow"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                data-testid="fmt-tick-menu-trigger"
                title="Tick precision"
              >
                <ChevronDown size={10} strokeWidth={1.75} />
              </button>
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
            className="gc-tb-preview ml-auto"
            style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            <span className="gc-tb-preview-lbl">Preview</span>
            <span className="gc-tb-preview-val">{previewText || '—'}</span>
          </div>
        </Tooltip>
      </div>

    </div>
  );
}

