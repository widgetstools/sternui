/**
 * Unified formatter state.
 *
 * Single hook that returns every piece of state + every action the two
 * formatter surfaces (in-grid `<FormattingToolbar />` and popped-out
 * `<FormattingPropertiesPanel />`) need. Both surfaces consume the same
 * `useFormatter()` shape so behavioural drift is impossible — change a
 * reducer here, both surfaces pick it up.
 *
 * Reuses the existing hooks (`useActiveColumns`, `useColumnFormatting`,
 * `useFlashConfirm`, `useUndoRedo`) — this module just composes them
 * into the larger contract that the modules render against.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addTemplateReducer,
  applyAlignmentReducer,
  applyBordersReducer,
  applyColorsReducer,
  applyEditableReducer,
  applyFormatterReducer,
  applyHeaderNameReducer,
  applyTemplateToColumnsReducer,
  applyTypographyReducer,
  clearAllStylesInProfileReducer,
  clearAllStylesReducer,
  pickTemplateFields,
  removeTemplateRefFromAssignmentsReducer,
  removeTemplateReducer,
  renameTemplateReducer,
  resolveTemplates,
  snapshotTemplate,
  snapshotTemplateUpdate,
  updateTemplateReducer,
  useGridPlatform,
  useModuleState,
  useUndoRedo,
  type BorderSpec,
  type ColumnCustomizationState,
  type ColumnTemplatesState,
  type ValueFormatterTemplate,
} from '@marketsui/core';
import {
  numberTemplate,
  templateDecimals,
} from '../formatterPresets';
import {
  readCellDataType,
  readFirstRowValue,
  readHeaderName,
  useActiveColumns,
  useColumnFormatting,
  useFlashConfirm,
  type ResolvedFormatting,
  type TargetKind,
} from '../formattingToolbarHooks';
import { valueFormatterFromTemplate } from '@marketsui/core';

export type PickerDataType = 'number' | 'date' | 'datetime' | 'boolean' | 'string';

export interface FormatterState {
  /** Currently-targeted columns. Empty when no column is focused. */
  colIds: string[];
  /** Single-column display label (header name or fallback id). */
  colLabel: string;
  /** Per-call site `cellDataType` of the first targeted column. */
  pickerDataType: PickerDataType;
  /** Cell vs header — drives whether type/colour writes go into
   *  cellStyleOverrides or headerStyleOverrides. Formatters are
   *  always cell-scope (headers have no formatter). */
  target: TargetKind;
  /** True when no column is selected. Modules use this to disable. */
  disabled: boolean;
  /** True when target = 'header'. Format module disables itself. */
  isHeader: boolean;
  /** Resolved styling + formatter view of the active assignment. */
  fmt: ResolvedFormatting;
  /** Formatted output of `fmt.valueFormatterTemplate` against a
   *  representative sample value for the picker data type. */
  previewText: string;
  /** Column templates — sorted alphabetically. */
  templates: Array<{ id: string; name: string }>;
  /** First template id chained on the active column, when any. */
  activeTemplateId?: string;
  /** Save-as-template input draft + flash-confirm flag. */
  saveAsTplName: string;
  saveAsTplConfirmed: boolean;
  /** Clear-all flash + dialog open flag. */
  clearConfirmed: boolean;
  clearDialogOpen: boolean;
  /** Clear-selected (current column scope) flash + dialog open flag. */
  clearSelectedConfirmed: boolean;
  clearSelectedDialogOpen: boolean;
  /** Undo / redo affordances bound to column-customization. */
  canUndo: boolean;
  canRedo: boolean;
  /** True only when exactly one column is selected — gates the
   *  inline column-caption rename UI. */
  singleColumnSelected: boolean;
  /** True when the resolved assignment forces cells to be editable.
   *  Drives the editable-toggle pill's active state. */
  cellsEditable: boolean;
  /** Human-readable list of template categories the active column has
   *  authored that would be captured if "Save as new" / "Update" fired
   *  right now (e.g. `['Cell style', 'Formatter', 'Filter']`). Drives
   *  the TemplateManager's "what will be saved" hint. Empty when the
   *  column has nothing template-eligible. */
  capturableFields: ReadonlyArray<string>;
}

export interface FormatterActions {
  setTarget: (t: TargetKind) => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  setFontSizePx: (px: number) => void;
  toggleAlign: (h: 'left' | 'center' | 'right') => void;
  setTextColor: (c: string | undefined) => void;
  setBgColor: (c: string | undefined) => void;
  applyBordersMap: (
    next: { top?: BorderSpec; right?: BorderSpec; bottom?: BorderSpec; left?: BorderSpec },
  ) => void;
  doFormat: (t: ValueFormatterTemplate | undefined) => void;
  decreaseDecimals: () => void;
  increaseDecimals: () => void;
  applyTemplate: (tplId: string) => void;
  saveAsTemplate: (name: string) => string | undefined;
  /** Re-snapshot the active column and overwrite an existing template's
   *  data fields. Identity (id, name, description, createdAt) is
   *  preserved; updatedAt bumps. Returns true on a successful write,
   *  false when the column has nothing template-eligible to capture. */
  updateTemplate: (tplId: string) => boolean;
  /** Rename an existing template. Empty / whitespace-only names are
   *  rejected (returns false). Unknown id is also a no-op (returns
   *  false). */
  renameTemplate: (tplId: string, name: string) => boolean;
  deleteTemplate: (tplId: string) => void;
  setSaveAsTplName: (v: string) => void;
  flashSaveAsTpl: () => void;
  /** Open the destructive confirm dialog. Does NOT clear by itself. */
  requestClearAll: () => void;
  /** Imperative dialog control. */
  setClearDialogOpen: (open: boolean) => void;
  /** Actually clear — wired to the AlertDialog's Confirm action. */
  confirmClearAll: () => void;
  /** Open the destructive confirm dialog for the currently-targeted
   *  columns only. No-op when nothing is selected. */
  requestClearSelected: () => void;
  setClearSelectedDialogOpen: (open: boolean) => void;
  /** Reset every targeted column's assignment to a bare `{ colId }`. */
  confirmClearSelected: () => void;
  undo: () => void;
  redo: () => void;
  /** Rename the single targeted column's display caption. Empty / blank
   *  clears the override so the host's original headerName takes over. */
  setHeaderName: (name: string) => void;
  /** Toggle the `editable` override on every targeted column. Active
   *  state writes `true`, inactive writes `false` (explicit lock). */
  toggleEditable: () => void;
}

export interface UseFormatterResult {
  state: FormatterState;
  actions: FormatterActions;
}

/**
 * Returns the unified state + action bundle. Call once at the
 * orchestrator level (the wrapper component that hosts both the
 * toolbar and the popped panel) and pass `state` + `actions` down to
 * the modules.
 */
export function useFormatter(): UseFormatterResult {
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
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearSelectedConfirmed, flashClearSelected] = useFlashConfirm();
  const [clearSelectedDialogOpen, setClearSelectedDialogOpen] = useState(false);
  const [saveAsTplConfirmed, flashSaveAsTpl] = useFlashConfirm();
  const [saveAsTplName, setSaveAsTplName] = useState('');

  const [custState, setCustState] = useModuleState<ColumnCustomizationState>('column-customization');
  const [tplState, setTplState] = useModuleState<ColumnTemplatesState>('column-templates');

  const undoRedo = useUndoRedo<ColumnCustomizationState | undefined>(
    custState,
    (next) => setCustState(() => next as ColumnCustomizationState),
    { limit: 50 },
  );
  const setCustStateWithHistory = useCallback<typeof setCustState>(
    (updater) => {
      undoRedo.push();
      setCustState(updater);
    },
    [setCustState, undoRedo],
  );

  const templates = useMemo(() => {
    const t = tplState?.templates ?? {};
    return Object.values(t)
      .map((v) => ({ id: v.id, name: v.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tplState]);

  const activeTemplateId = colIds.length > 0
    ? custState?.assignments?.[colIds[0]]?.templateIds?.[0]
    : undefined;

  // Resolve the active column's effective state once, then map the
  // populated template categories into human-readable labels for the
  // TemplateManager's "what will be saved" hint.
  const capturableFields = useMemo<ReadonlyArray<string>>(() => {
    if (colIds.length === 0) return [];
    const colId = colIds[0];
    const assignment = custState?.assignments?.[colId];
    if (!assignment) return [];
    const tpls = tplState ?? { templates: {}, typeDefaults: {} };
    const t = readCellDataType(platform.api.api, colId);
    const dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined =
      t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean' ? t : undefined;
    const resolved = resolveTemplates(assignment, tpls, dataType);
    // Cast: resolveTemplates returns the base shape; values flowed
    // through unchanged from the narrowed source — same boundary cast
    // pattern snapshotTemplate uses.
    const fields = pickTemplateFields(
      resolved as unknown as Parameters<typeof pickTemplateFields>[0],
    );

    const labels: string[] = [];
    if (fields.cellStyleOverrides) labels.push('Cell style');
    if (fields.headerStyleOverrides) labels.push('Header style');
    if (fields.valueFormatterTemplate) labels.push('Formatter');
    // Behavior flags collapse into one bucket regardless of which
    // subset is set — the user doesn't need to know the granularity.
    if (
      typeof fields.editable === 'boolean' ||
      typeof fields.sortable === 'boolean' ||
      typeof fields.filterable === 'boolean' ||
      typeof fields.resizable === 'boolean'
    ) {
      labels.push('Behavior');
    }
    if (fields.cellEditorName || fields.cellEditorParams) labels.push('Editor');
    if (fields.cellRendererName) labels.push('Renderer');
    if (fields.filter) labels.push('Filter');
    if (fields.rowGrouping) labels.push('Grouping');
    return labels;
  }, [colIds, custState, tplState, platform]);

  const colLabel = useMemo(() => {
    if (colIds.length === 0) return 'Select a cell';
    if (colIds.length === 1) {
      return readHeaderName(platform.api.api, colIds[0]) ?? colIds[0];
    }
    return `${colIds.length} columns`;
  }, [colIds, platform]);

  // pickerDataType — re-evaluates on column / data-render events so
  // auto-detected types take effect once they land on the colDef.
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

  const pickerDataType = useMemo<PickerDataType>(() => {
    if (colIds.length === 0) return 'number';
    const raw = readCellDataType(platform.api.api, colIds[0]);
    if (raw === 'dateTimeString' || raw === 'datetime') return 'datetime';
    if (raw === 'date' || raw === 'dateString') return 'date';
    if (raw === 'boolean') return 'boolean';
    if (raw === 'text' || raw === 'string') return 'string';
    if (raw === 'number' || raw === 'numeric') return 'number';
    return 'number';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colIds, platform, colEventTick]);

  // ─── Reducers ────────────────────────────────────────────────────

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

  const doFormat = useCallback((t: ValueFormatterTemplate | undefined) => {
    setCustStateWithHistory(applyFormatterReducer(colIdsRef.current, t));
  }, [setCustStateWithHistory]);

  const applyTemplate = useCallback((tplId: string) => {
    setCustStateWithHistory(applyTemplateToColumnsReducer(colIdsRef.current, tplId));
  }, [setCustStateWithHistory]);

  const saveAsTemplate = useCallback((name: string): string | undefined => {
    const ids = colIdsRef.current;
    if (!ids.length) return undefined;
    const colId = ids[0];
    const t = readCellDataType(platform.api.api, colId);
    const dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined =
      t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean' ? t : undefined;
    const tpl = snapshotTemplate(custState, tplState, colId, name, dataType);
    if (!tpl) return undefined;
    setTplState(addTemplateReducer(tpl));
    return tpl.id;
  }, [platform, custState, tplState, setTplState]);

  const updateTemplate = useCallback((tplId: string): boolean => {
    const ids = colIdsRef.current;
    if (!ids.length) return false;
    const colId = ids[0];
    const t = readCellDataType(platform.api.api, colId);
    const dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined =
      t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean' ? t : undefined;
    const fields = snapshotTemplateUpdate(custState, tplState, colId, dataType);
    if (!fields) return false;
    setTplState(updateTemplateReducer(tplId, fields));
    return true;
  }, [platform, custState, tplState, setTplState]);

  const renameTemplate = useCallback((tplId: string, name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const existing = tplState?.templates?.[tplId];
    if (!existing) return false;
    if (existing.name === trimmed) return false;
    setTplState(renameTemplateReducer(tplId, trimmed));
    return true;
  }, [tplState, setTplState]);

  const deleteTemplate = useCallback((tplId: string) => {
    setTplState(removeTemplateReducer(tplId));
    setCustStateWithHistory(removeTemplateRefFromAssignmentsReducer(tplId));
  }, [setTplState, setCustStateWithHistory]);

  const confirmClearAll = useCallback(() => {
    setCustStateWithHistory(clearAllStylesInProfileReducer());
    flashClear();
  }, [setCustStateWithHistory, flashClear]);

  const requestClearAll = useCallback(() => setClearDialogOpen(true), []);

  const requestClearSelected = useCallback(() => {
    if (!colIdsRef.current.length) return;
    setClearSelectedDialogOpen(true);
  }, []);

  const confirmClearSelected = useCallback(() => {
    if (!colIdsRef.current.length) return;
    setCustStateWithHistory(clearAllStylesReducer(colIdsRef.current));
    flashClearSelected();
  }, [setCustStateWithHistory, flashClearSelected]);

  const setHeaderName = useCallback((name: string) => {
    if (colIdsRef.current.length !== 1) return;
    setCustStateWithHistory(applyHeaderNameReducer(colIdsRef.current, name));
  }, [setCustStateWithHistory]);

  const toggleEditable = useCallback(() => {
    if (!colIdsRef.current.length) return;
    const current = !!fmt.editable;
    setCustStateWithHistory(applyEditableReducer(colIdsRef.current, !current));
  }, [setCustStateWithHistory, fmt.editable]);

  // Decimals — read the live state so consecutive clicks compound on
  // the latest committed formatter.
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

  // Borders — multi-side diffing routed through one undoable step.
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
      const hasAny = toClear.length > 0 || Object.keys(toSet).length > 0;
      if (hasAny) undoRedo.push();
      if (toClear.length) {
        setCustState(applyBordersReducer(colIdsRef.current, targetRef.current, toClear, undefined));
      }
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

  // ─── Preview ─────────────────────────────────────────────────────

  const previewSample: unknown =
    pickerDataType === 'number'   ? 1234.5678
    : pickerDataType === 'date'     ? new Date('2026-04-17T00:00:00Z')
    : pickerDataType === 'datetime' ? new Date('2026-04-17T09:30:00Z')
    : pickerDataType === 'boolean'  ? true
    :                                 'sample';

  const vft = fmt.valueFormatterTemplate;
  const previewText = useMemo(() => {
    if (!vft) {
      return String(previewSample instanceof Date
        ? previewSample.toISOString().slice(0, 10)
        : previewSample);
    }
    try { return valueFormatterFromTemplate(vft)({ value: previewSample }); }
    catch { return '—'; }
  }, [vft, previewSample]);

  // ─── Bundle ──────────────────────────────────────────────────────

  return {
    state: {
      colIds,
      colLabel,
      pickerDataType,
      target,
      disabled,
      isHeader,
      fmt,
      previewText,
      templates,
      activeTemplateId,
      saveAsTplName,
      saveAsTplConfirmed,
      clearConfirmed,
      clearDialogOpen,
      clearSelectedConfirmed,
      clearSelectedDialogOpen,
      canUndo: undoRedo.canUndo,
      canRedo: undoRedo.canRedo,
      singleColumnSelected: colIds.length === 1,
      cellsEditable: !!fmt.editable,
      capturableFields,
    },
    actions: {
      setTarget,
      toggleBold,
      toggleItalic,
      toggleUnderline,
      setFontSizePx,
      toggleAlign,
      setTextColor,
      setBgColor,
      applyBordersMap,
      doFormat,
      decreaseDecimals,
      increaseDecimals,
      applyTemplate,
      saveAsTemplate,
      updateTemplate,
      renameTemplate,
      deleteTemplate,
      setSaveAsTplName,
      flashSaveAsTpl,
      requestClearAll,
      setClearDialogOpen,
      confirmClearAll,
      requestClearSelected,
      setClearSelectedDialogOpen,
      confirmClearSelected,
      undo: undoRedo.undo,
      redo: undoRedo.redo,
      setHeaderName,
      toggleEditable,
    },
  };
}
