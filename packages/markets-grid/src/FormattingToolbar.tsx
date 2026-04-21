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

import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
// Design-system stylesheet — terminal palette + component-scoped
// primitives. Token overrides switch on `[data-theme="light"]`. Zero
// functional coupling; pure CSS.
import './FormattingToolbar.css';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  Button,
  Poppable,
  Popover as RadixPopover,
  PopoverTrigger as RadixPopoverTrigger,
  PopoverContent as RadixPopoverContent,
  PopoverCompat as Popover,
  Tooltip,
  ColorPickerPopover,
  cn,
  type PoppableHandle,
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
  removeTemplateReducer,
  removeTemplateRefFromAssignmentsReducer,
  applyAlignmentReducer,
  applyBordersReducer,
  applyColorsReducer,
  applyFormatterReducer,
  applyTemplateToColumnsReducer,
  applyTypographyReducer,
  clearAllStylesInProfileReducer,
  snapshotTemplate,
  useUndoRedo,
} from '@grid-customizer/core';
import {
  Undo2, Redo2, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  Type, PaintBucket,
  LayoutTemplate, SquareDashed, Check, RemoveFormatting,
  ChevronDown, ArrowLeft, ArrowRight, ArrowLeftRight,
  DollarSign, Percent, Hash,
  Plus, ExternalLink,
} from 'lucide-react';
import { FormattingPropertiesPanel } from './FormattingPropertiesPanel';
import { TemplateManager } from './TemplateManager';

// Extracted sibling modules — see AUDIT i1 split. Presets + pure helpers
// live in `formatterPresets.ts`; hooks + api reads in
// `formattingToolbarHooks.ts`; TBtn/TGroup/ToolbarSep in
// `formattingToolbarPrimitives.tsx`.
import {
  CURRENCY_FORMATTERS,
  PERCENT_TEMPLATE,
  COMMA_TEMPLATE,
  BPS_TEMPLATE,
  TICK_MENU,
  numberTemplate,
  templateDecimals,
  isPercentTemplate,
  isTickTemplate,
  currentTickToken,
  isCommaTemplate,
} from './formatterPresets';
import {
  readCellDataType,
  readHeaderName,
  readFirstRowValue,
  useActiveColumns,
  useColumnFormatting,
  useFlashConfirm,
  type TargetKind,
} from './formattingToolbarHooks';
import { TBtn, TGroup, ToolbarSep } from './formattingToolbarPrimitives';

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
/** No props — everything flows through `useGridPlatform()` /
 *  `useGridApi()` contexts. The empty object type is intentional
 *  (vs `Record<string, never>` which conflicts with forwardRef's
 *  own ref typing). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FormattingToolbarProps {}

/** Imperative handle over FormattingToolbar — thin alias to PoppableHandle
 *  so MarketsGrid's brush-icon handler can raise a buried popout window
 *  before falling back to its normal "toggle toolbar" flow. */
export type FormattingToolbarHandle = PoppableHandle;

export const FormattingToolbar = forwardRef<FormattingToolbarHandle, FormattingToolbarProps>(function FormattingToolbar(_props, ref) {
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
  // Controlled AlertDialog for "Clear all styles" — triggered from
  // TBtn (which fires on mousedown, not click, so we can't use
  // AlertDialogTrigger asChild without refactoring TBtn). Lifting the
  // open state here also lets the panel's footer button reuse the same
  // dialog instance via `doClearAllStyles` going through a callback.
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [saveAsTplConfirmed, flashSaveAsTpl] = useFlashConfirm();
  const [saveAsTplName, setSaveAsTplName] = useState('');

  // State setters + reactive reads for dispatch-side plumbing. Every
  // button handler below pipes a pure reducer through one of these
  // setters.
  const [custState, setCustState] = useModuleState<ColumnCustomizationState>('column-customization');
  const [tplState, setTplState] = useModuleState<ColumnTemplatesState>('column-templates');

  // Undo/redo history scoped to column-customization. Tracks every
  // reducer dispatch (typography, colors, formatter, borders, template
  // apply, clear-all, etc.) — each mutation site below calls
  // `undoRedo.push()` BEFORE dispatching its reducer, giving us one
  // history entry per user action (deterministic; no auto-capture-via-
  // effect noise from module bootstrap transitions). Capped at 50
  // steps so a long session doesn't grow unbounded.
  const undoRedo = useUndoRedo<ColumnCustomizationState | undefined>(
    custState,
    (next) => setCustState(() => next as ColumnCustomizationState),
    { limit: 50 },
  );
  // Convenience: wrap the module setter so every call site auto-pushes
  // the current state onto the undo stack before dispatching.
  const setCustStateWithHistory = useCallback<typeof setCustState>(
    (updater) => {
      undoRedo.push();
      setCustState(updater);
    },
    [setCustState, undoRedo],
  );
  const templateList = useMemo(() => {
    const templates = tplState?.templates ?? {};
    return Object.values(templates).sort((a, b) => a.name.localeCompare(b.name));
  }, [tplState]);
  // Active template id for the first active column — surfaces in both
  // the toolbar's Templates popover and the popped panel so the saved
  // template that produced the current style is visibly highlighted.
  const activeTemplateId = colIds.length > 0
    ? custState?.assignments?.[colIds[0]]?.templateIds?.[0]
    : undefined;

  // Column label for the right-side context affordance.
  const colLabel = useMemo(() => {
    if (colIds.length === 0) return 'Select a cell';
    if (colIds.length === 1) {
      return readHeaderName(platform.api.api, colIds[0]) ?? colIds[0];
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
    const raw = readCellDataType(platform.api.api, colIds[0]);
    // AG-Grid emits 'dateString' for pure dates and 'dateTimeString' for
    // date+time; our picker's enum splits those into 'date' vs 'datetime'
    // so the preset list shows the right sub-menu (ISO vs ISO-with-time,
    // EU short vs US with AM/PM, etc.).
    if (raw === 'dateTimeString' || raw === 'datetime') return 'datetime';
    if (raw === 'date' || raw === 'dateString') return 'date';
    if (raw === 'boolean') return 'boolean';
    if (raw === 'text' || raw === 'string') return 'string';
    if (raw === 'number' || raw === 'numeric') return 'number';
    return 'number';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colIds, platform, colEventTick]);

  // Typography toggles — the reducers pass `undefined` to clear a leaf.
  // All of these route through `setCustStateWithHistory` so the undo
  // stack gets a snapshot per user action (one click = one history
  // entry, exactly what we want).
  const toggleBold = useCallback(() => {
    setCustStateWithHistory(applyTypographyReducer(colIdsRef.current, targetRef.current, { bold: fmt.bold ? undefined : true }));
  }, [setCustStateWithHistory, fmt.bold]);

  const toggleItalic = useCallback(() => {
    setCustStateWithHistory(applyTypographyReducer(colIdsRef.current, targetRef.current, { italic: fmt.italic ? undefined : true }));
  }, [setCustStateWithHistory, fmt.italic]);

  const toggleUnderline = useCallback(() => {
    setCustStateWithHistory(applyTypographyReducer(colIdsRef.current, targetRef.current, { underline: fmt.underline ? undefined : true }));
  }, [setCustStateWithHistory, fmt.underline]);

  const setFontSizePx = useCallback((px: number) => {
    setCustStateWithHistory(applyTypographyReducer(colIdsRef.current, targetRef.current, { fontSize: px }));
  }, [setCustStateWithHistory]);

  const toggleAlign = useCallback((h: 'left' | 'center' | 'right') => {
    const next = fmt.horizontal === h ? undefined : h;
    setCustStateWithHistory(applyAlignmentReducer(colIdsRef.current, targetRef.current, { horizontal: next }));
  }, [setCustStateWithHistory, fmt.horizontal]);

  const setTextColor = useCallback((c: string | undefined) => {
    setCustStateWithHistory(applyColorsReducer(colIdsRef.current, targetRef.current, { text: c || undefined }));
  }, [setCustStateWithHistory]);

  const setBgColor = useCallback((c: string | undefined) => {
    setCustStateWithHistory(applyColorsReducer(colIdsRef.current, targetRef.current, { background: c || undefined }));
  }, [setCustStateWithHistory]);

  // Formatter — always cell-target (headers have no formatter).
  const doFormat = useCallback((t: ValueFormatterTemplate | undefined) => {
    setCustStateWithHistory(applyFormatterReducer(colIdsRef.current, t));
  }, [setCustStateWithHistory]);

  // Template picker — replace templateIds chain on active columns.
  const doApplyTemplate = useCallback((tplId: string) => {
    setCustStateWithHistory(applyTemplateToColumnsReducer(colIdsRef.current, tplId));
  }, [setCustStateWithHistory]);

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
    const t = readCellDataType(platform.api.api, colId);
    const dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined =
      t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean' ? t : undefined;
    const tpl = snapshotTemplate(custState, tplState, colId, name, dataType);
    if (!tpl) return undefined;
    setTplState(addTemplateReducer(tpl));
    return tpl.id;
  }, [platform, custState, tplState, setTplState]);

  // Delete a saved template. Two writes run together: pop the template
  // out of column-templates AND strip the id from every
  // column-assignment's `templateIds` chain so no assignment is left
  // carrying a dangling reference. Both stores converge on their own
  // auto-save cycle.
  const doDeleteTemplate = useCallback((tplId: string) => {
    setTplState(removeTemplateReducer(tplId));
    setCustStateWithHistory(removeTemplateRefFromAssignmentsReducer(tplId));
  }, [setTplState, setCustStateWithHistory]);

  // Clear ALL column-customization assignments in the active profile.
  // Was scoped to selected columns; expanded per user request so the
  // button reads "wipe the profile's styles clean" rather than "reset
  // this one column". Templates are preserved (users manage those
  // explicitly). Wrapped in an AlertDialog at each call site because
  // this is destructive and global.
  const doClearAllStyles = useCallback(() => {
    setCustStateWithHistory(clearAllStylesInProfileReducer());
  }, [setCustStateWithHistory]);

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
    const val = readFirstRowValue(platform.api.api, ids[0]);
    if (typeof val === 'number') {
      const s = String(val);
      const dot = s.indexOf('.');
      return dot >= 0 ? s.length - dot - 1 : 0;
    }
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
      // Borders may emit multiple writes in one interaction (e.g.
      // clearing some sides + setting others). Push ONCE so the whole
      // border-edit counts as a single undoable step rather than N
      // small ones.
      const hasAny = toClear.length > 0 || Object.keys(toSet).length > 0;
      if (hasAny) undoRedo.push();
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
    [fmt.borders, setCustState, undoRedo],
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

  // Pop-out into a detached OS window. Most valuable for multi-grid
  // dashboards where vertical space is at a premium — users pin the
  // toolbar (alwaysOnTop under OpenFin) to a compact window and
  // interact with grids underneath.
  //
  // `popped` + `PopoutButton` flow from Poppable's render-prop below;
  // the toolbar hoists them up via closure for use inside the JSX.
  // Figma-style properties panel as the popped-out layout. No more
  // auto-resize gymnastics — the panel's fixed 400×620 shell hosts
  // every editor inline, so popovers aren't needed inside the
  // popout. The compact toolbar stays for the inline-in-grid case
  // where a horizontal strip is the right metaphor.
  const templateListForPanel = templateList.map((t) => ({ id: t.id, name: t.name }));

  return (
    <>
      {/* Shared "Clear all styles" confirm dialog — one instance serves
          BOTH the in-grid toolbar's button AND the popped-out panel's
          footer button (which flips `clearAllConfirmOpen` via the
          `requestClearAllStyles` callback below). Lives outside the
          Poppable tree so opening/closing the popout doesn't remount
          the dialog and lose in-flight confirm state. */}
      <AlertDialog open={clearAllConfirmOpen} onOpenChange={setClearAllConfirmOpen}>
        <AlertDialogContent data-testid="formatting-clear-all-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all styles?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every column's cell + header styling, value
              formatters, border overrides, filter config, and template
              references from the active profile. Saved templates are
              not affected. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                doClearAllStyles();
                flashClear();
              }}
              data-testid="formatting-clear-all-confirm-btn"
            >
              Clear all styles
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    <Poppable
      ref={ref}
      name={`gc-popout-toolbar-${platform.gridId}`}
      title={`Formatting — ${platform.gridId}`}
      // 400×620 is the user-confirmed size for the properties panel:
      // fits all five sections at once on a standard viewport, tall
      // enough that scrolling is rare but readily possible. The
      // compact toolbar still uses its natural max-content width
      // when NOT popped — this dim only applies to the OS window.
      width={400}
      height={620}
      // alwaysOnTop: honored by OpenFin (pins the popout above all
      // other windows — what traders want for a styling tool they
      // return to constantly). Browsers silently ignore it since the
      // web platform has no equivalent API. See openFin.ts for the
      // runtime split.
      alwaysOnTop
      // Frameless: OpenFin drops its OS title bar + close button.
      // Our properties panel renders its own compact title bar
      // (`-webkit-app-region: drag`) with a close "X" that calls
      // the `close` helper from Poppable's render-props. Browsers
      // ignore this — they always render full chrome — so the
      // panel's title bar is harmlessly hidden there (see the
      // `frameless` branch in the panel). Inside OpenFin this
      // gives us a sleek, integrated window look.
      frame={false}
    >
      {({ popped, PopoutButton, close }) => {
        if (popped) {
          return (
            <FormattingPropertiesPanel
              // Flagged `frameless` so the panel renders its own
              // title bar with drag region + close X. Only true
              // under OpenFin (which honors frame:false); browsers
              // always keep OS chrome so we let the panel check
              // via isOpenFin() internally — see panel code.
              frameless
              onClose={close}
              titleText={`Formatting — ${platform.gridId}`}
              disabled={disabled}
              isHeader={isHeader}
              target={target}
              colLabel={colLabel}
              fmt={fmt}
              pickerDataType={pickerDataType}
              previewText={previewText}
              templateList={templateListForPanel}
              activeTemplateId={activeTemplateId}
              saveAsTplName={saveAsTplName}
              saveAsTplConfirmed={saveAsTplConfirmed}
              setTarget={setTarget}
              toggleBold={toggleBold}
              toggleItalic={toggleItalic}
              toggleUnderline={toggleUnderline}
              setFontSizePx={setFontSizePx}
              toggleAlign={toggleAlign}
              setTextColor={setTextColor}
              setBgColor={setBgColor}
              applyBordersMap={applyBordersMap}
              doFormat={doFormat}
              decreaseDecimals={decreaseDecimals}
              increaseDecimals={increaseDecimals}
              doApplyTemplate={doApplyTemplate}
              doSaveAsTemplate={doSaveAsTemplate}
              doDeleteTemplate={doDeleteTemplate}
              requestClearAllStyles={() => setClearAllConfirmOpen(true)}
              canUndo={undoRedo.canUndo}
              canRedo={undoRedo.canRedo}
              onUndo={undoRedo.undo}
              onRedo={undoRedo.redo}
              setSaveAsTplName={setSaveAsTplName}
              flashSaveAsTpl={flashSaveAsTpl}
            />
          );
        }
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
      {/* Pop-out trigger — placed absolutely in the top-right corner
          so it doesn't disturb the dense toolbar layout. Hidden
          automatically in popped mode by PopoutButton itself. */}
      <PopoutButton
        className="gc-tb-popout-btn"
        title="Open toolbar in a separate window"
        data-testid="formatting-popout-btn"
        icon={<ExternalLink size={13} strokeWidth={2.25} />}
      />

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

        {/* Templates — one consolidated popover that hosts the full
             TemplateManager surface: list with click-to-apply + a
             two-step delete confirm, plus the save-as row. Identical
             markup/behavior to the popped Properties panel's
             Templates section so users don't relearn the interaction
             when switching between the two surfaces. */}
        {!disabled && (
          <TGroup>
            <Popover
              trigger={
                <button
                  type="button"
                  className="gc-tb-btn-menu"
                  aria-label="Templates"
                  title="Templates"
                  data-testid="templates-menu-trigger"
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  <LayoutTemplate size={13} strokeWidth={1.75} />
                  <ChevronDown size={9} strokeWidth={2} className="gc-tb-caret" />
                </button>
              }
            >
              <div
                className="p-2"
                data-testid="templates-menu"
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault();
                }}
              >
                <div className="text-[9px] uppercase tracking-[0.1em] mb-2 px-1.5 text-muted-foreground font-semibold">
                  Templates
                </div>
                <TemplateManager
                  templates={templateList}
                  activeTemplateId={activeTemplateId}
                  disabled={disabled}
                  saveName={saveAsTplName}
                  saveConfirmed={saveAsTplConfirmed}
                  onSaveNameChange={setSaveAsTplName}
                  onSave={() => {
                    const name = saveAsTplName.trim() || `${colLabel} Style`;
                    const id = doSaveAsTemplate(name);
                    if (id) {
                      setSaveAsTplName('');
                      flashSaveAsTpl();
                    }
                  }}
                  onApply={doApplyTemplate}
                  onDelete={doDeleteTemplate}
                  variant="compact"
                  testIdPrefix="tb-tpl"
                />
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
                title="Font size (px)"
                aria-label="Font size"
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
            title="Text color"
          />
          <ColorPickerPopover
            disabled={disabled}
            value={fmt.background}
            icon={<PaintBucket size={11} strokeWidth={1.5} />}
            onChange={(c) => setBgColor(c)}
            compact
            title="Fill color"
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
          <TBtn
            tooltip="Undo"
            disabled={!undoRedo.canUndo}
            onClick={undoRedo.undo}
            data-testid="formatting-undo"
          >
            <Undo2 size={14} strokeWidth={1.75} />
          </TBtn>
          <TBtn
            tooltip="Redo"
            disabled={!undoRedo.canRedo}
            onClick={undoRedo.redo}
            data-testid="formatting-redo"
          >
            <Redo2 size={14} strokeWidth={1.75} />
          </TBtn>
          <div className="gc-toolbar-sep h-4 opacity-50" />
          <TBtn
            tooltip="Clear all styles in this profile"
            onClick={() => setClearAllConfirmOpen(true)}
            data-testid="formatting-clear-all"
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
                title="Currency format (click for USD, chevron for EUR/GBP/JPY/BPS)"
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
      }}
    </Poppable>
    </>
  );
});

