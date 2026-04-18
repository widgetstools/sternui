import { useCallback, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllEnterpriseModule, ModuleRegistry } from 'ag-grid-enterprise';
import { GridProvider, type AnyModule } from '@grid-customizer/core';
import type { MarketsGridProps } from './types';
import { useGridHost } from './useGridHost';

// One-shot AG-Grid Enterprise registration. Idempotent under StrictMode.
let _agRegistered = false;
function ensureAgGridRegistered() {
  if (_agRegistered) return;
  ModuleRegistry.registerModules([AllEnterpriseModule]);
  _agRegistered = true;
}

/** Default module list — empty for M0. Later milestones wire in the real set. */
export const DEFAULT_MODULES: AnyModule[] = [];

/**
 * Host component. Thin wrapper over `AgGridReact` that:
 *   - constructs a per-mount `GridPlatform`,
 *   - exposes it through `<GridProvider>` so hooks / panels reach it,
 *   - threads transformed `columnDefs` + `gridOptions` into AG-Grid.
 *
 * Toolbar + settings sheet are deliberately NOT part of M0 — they arrive
 * with the toolbar-visibility + settings-sheet milestones.
 */
export function MarketsGrid<TData = unknown>(props: MarketsGridProps<TData>) {
  const {
    rowData,
    columnDefs: baseColumnDefs,
    theme,
    gridId,
    rowIdField = 'id',
    modules = DEFAULT_MODULES,
    rowHeight = 36,
    headerHeight = 32,
    animateRows = true,
    sideBar,
    statusBar,
    defaultColDef,
    onGridReady: onGridReadyProp,
    className,
    style,
  } = props;

  ensureAgGridRegistered();

  const gridRef = useRef<AgGridReact<TData>>(null);

  const { platform, columnDefs, gridOptions, onGridReady, onGridPreDestroyed } = useGridHost({
    gridId,
    rowIdField,
    modules,
    baseColumnDefs: baseColumnDefs as never,
  });

  const handleGridReady = useCallback(
    (event: Parameters<NonNullable<typeof onGridReadyProp>>[0]) => {
      onGridReady(event);
      event.api.sizeColumnsToFit();
      onGridReadyProp?.(event);
    },
    [onGridReady, onGridReadyProp],
  );

  const rootStyle = useMemo(
    () => ({ display: 'flex', flexDirection: 'column' as const, height: '100%', ...style }),
    [style],
  );

  return (
    <GridProvider platform={platform}>
      <div className={className} style={rootStyle} data-grid-id={gridId}>
        <div style={{ flex: 1 }}>
          <AgGridReact
            ref={gridRef}
            {...(gridOptions as Record<string, unknown>)}
            theme={theme}
            rowData={rowData}
            columnDefs={columnDefs as never}
            maintainColumnOrder
            rowHeight={rowHeight}
            headerHeight={headerHeight}
            animateRows={animateRows}
            cellSelection={true}
            sideBar={sideBar}
            statusBar={statusBar}
            defaultColDef={defaultColDef}
            onGridReady={handleGridReady}
            onGridPreDestroyed={onGridPreDestroyed}
          />
        </div>
      </div>
    </GridProvider>
  );
}
