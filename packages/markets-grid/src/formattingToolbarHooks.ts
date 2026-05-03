import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import {
  resolveTemplates,
  useGridPlatform,
  useModuleState,
  type BorderSpec,
  type CellStyleOverrides,
  type ColumnCustomizationState,
  type ColumnTemplatesState,
  type ValueFormatterTemplate,
} from '@marketsui/core';

/**
 * Reusable hooks + api helpers for the FormattingToolbar. Extracted from
 * the toolbar during the AUDIT i1 split so the component body focuses on
 * JSX + handler wiring rather than effect orchestration.
 *
 * Contents:
 *   - useActiveColumns    — tracks the grid's currently-selected cols
 *                           via ApiHub (cellFocused / cellClicked /
 *                           cellSelectionChanged). Keeps "last non-empty"
 *                           memory so toolbar clicks don't wipe selection.
 *   - useColumnFormatting — resolves the ColumnAssignment for the first
 *                           selected column through the template resolver
 *                           so typeDefaults and referenced templates fold
 *                           into the active/inactive view states.
 *   - useFlashConfirm     — 400ms checkmark flash after successful action.
 *                           Ref-guarded timer clears on unmount.
 */

// ─── GridApi micro-helpers ───────────────────────────────────────────────

export type RawCellDataType =
  | 'numeric'
  | 'number'
  | 'date'
  | 'dateString'
  | 'dateTimeString'
  | 'datetime'
  | 'string'
  | 'text'
  | 'boolean'
  | undefined;

export function readCellDataType(api: GridApi | null, colId: string): RawCellDataType {
  if (!api) return undefined;
  try {
    return api.getColumn(colId)?.getColDef()?.cellDataType as RawCellDataType;
  } catch {
    return undefined;
  }
}

export function readHeaderName(api: GridApi | null, colId: string): string | undefined {
  if (!api) return undefined;
  try {
    return api.getColumn(colId)?.getColDef()?.headerName ?? undefined;
  } catch {
    return undefined;
  }
}

export function readFirstRowValue(api: GridApi | null, colId: string): unknown {
  if (!api) return undefined;
  try {
    const row = api.getDisplayedRowAtIndex(0);
    return row?.data ? (row.data as Record<string, unknown>)[colId] : undefined;
  } catch {
    return undefined;
  }
}

// ─── Active-column tracking ─────────────────────────────────────────────

export function useActiveColumns(): string[] {
  const platform = useGridPlatform();
  const [colIds, setColIds] = useState<string[]>([]);
  const lastColIds = useRef<string[]>([]);

  useEffect(() => {
    const getColIds = (): string[] => {
      const api: GridApi | null = platform.api.api;
      if (!api) return lastColIds.current;

      // `CellRange.columns` is typed `Column[]`; `FocusedCell.column` is
      // `Column`. Both carry `getColId()`. We keep the `unknown`-guarded
      // extractor so the helper handles mock apis in tests gracefully.
      const extractId = (col: unknown): string | null => {
        const c = col as { getColId?: () => string } | null;
        return c && typeof c.getColId === 'function' ? c.getColId() || null : null;
      };

      const ids: string[] = [];
      try {
        for (const range of api.getCellRanges() ?? []) {
          for (const col of range.columns ?? []) {
            const id = extractId(col);
            if (id && !ids.includes(id)) ids.push(id);
          }
        }
      } catch { /* range api unavailable */ }

      if (ids.length === 0) {
        try {
          const id = extractId(api.getFocusedCell()?.column);
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

// ─── Reactive resolved-state hook ───────────────────────────────────────

export type TargetKind = 'cell' | 'header';

export interface ResolvedFormatting {
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
  /** Resolved header caption override (assignment + template chain). */
  headerName?: string;
  /** Resolved `editable` override. `undefined` means inherit colDef. */
  editable?: boolean;
}

export function useColumnFormatting(colIds: string[], target: TargetKind): ResolvedFormatting {
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
    const t = readCellDataType(platform.api.api, colIds[0]);
    const dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined =
      t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean' ? t : undefined;

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
      headerName: resolved.headerName,
      editable: resolved.editable,
    };
  }, [cust, tpls, colIds, target, platform]);
}

// ─── Flash confirm — 400ms checkmark after a successful action ──────────

export function useFlashConfirm(): [boolean, () => void] {
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
