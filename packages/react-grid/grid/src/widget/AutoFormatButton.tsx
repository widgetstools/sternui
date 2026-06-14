/**
 * AutoFormatButton — a one-click "Auto Format" action in the primary
 * toolbar. It reads every column from the live grid, matches each field
 * name against the FI/equity field-format catalog (see
 * `@starui/engine` → `buildAutoFormatPlan`), and applies the resolved
 * number/date formats, right-alignment for numerics, and semantic cell
 * renderers (P&L red/green, side, status, rating, ticker) in ONE
 * profile-persisted state update.
 *
 * Self-contained like {@link QuickSearch}: it reaches the live `GridApi`
 * and the module store through the platform context rather than props, so
 * the view-only `PrimaryToolbar` stays free of grid wiring. It uses the
 * *optional* platform accessor so it renders a harmless no-op when mounted
 * outside a `<GridProvider>` (e.g. characterisation tests) instead of
 * throwing.
 *
 * Overwrite mode: Auto Format re-applies the catalog to every matched
 * column (replacing prior formatting). The user can then override any
 * column afterward in the formatter toolbar — those manual edits persist
 * until Auto Format is clicked again. The reducer still supports a
 * non-destructive (`onlyUnstyled`) mode for other callers.
 */
import { useCallback, useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { Check, Wand2 } from 'lucide-react';
import { Button } from '@starui/ui';
import {
  applyAutoFormatPlanReducer,
  buildAutoFormatPlan,
  type AutoFormatColumn,
  type ColumnCustomizationState,
} from '@starui/engine';
import { useOptionalGridPlatform } from '../customizer/hooks/GridProvider';
import { useFlashConfirm } from './formattingToolbarHooks';

function readColumns(api: GridApi): AutoFormatColumn[] {
  const out: AutoFormatColumn[] = [];
  for (const col of api.getColumns() ?? []) {
    const colId = col.getColId();
    if (!colId) continue;
    const def = col.getColDef();
    out.push({
      colId,
      // colId equals the field path for dotted/nested columns
      // (buildColumnDefs sets `colId = def.colId ?? field`), so colId is a
      // safe fallback when `field` isn't a plain string.
      field: typeof def.field === 'string' ? def.field : colId,
      headerName: typeof def.headerName === 'string' ? def.headerName : undefined,
      cellDataType: typeof def.cellDataType === 'string' ? def.cellDataType : undefined,
    });
  }
  return out;
}

export function AutoFormatButton() {
  const platform = useOptionalGridPlatform();
  const [api, setApi] = useState<GridApi | null>(platform?.api.api ?? null);
  const [confirmed, flash] = useFlashConfirm();

  useEffect(() => {
    if (!platform) return;
    return platform.api.onReady((a) => setApi(a));
  }, [platform]);

  const handleClick = useCallback(() => {
    if (!platform || !api) return;
    const plan = buildAutoFormatPlan(readColumns(api));
    if (Object.keys(plan).length === 0) return;
    // Overwrite mode: Auto Format re-applies the catalog to ALL matched
    // columns, replacing any prior formatting. Users then override
    // individual columns afterward via the formatter toolbar (those edits
    // win until Auto Format is clicked again).
    platform.store.setModuleState<ColumnCustomizationState>(
      'column-customization',
      applyAutoFormatPlanReducer(plan, { onlyUnstyled: false }),
    );
    flash();
  }, [platform, api, flash]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="ds-primary-action"
      onClick={handleClick}
      title="Auto-format all columns from the field catalog"
      data-testid="auto-format-btn"
      data-state={confirmed ? 'saved' : 'idle'}
      aria-label="Auto-format all columns"
    >
      {confirmed ? <Check size={14} strokeWidth={2.5} /> : <Wand2 size={14} strokeWidth={2} />}
    </Button>
  );
}
