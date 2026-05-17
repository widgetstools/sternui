import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MarketsGrid,
  createMarketsGridLocalStorageStorage,
} from '@starui/markets-grid';
import { useProviderStream } from '@starui/data-services-react/runtime';
import { useMockConfig } from '../state/MockConfigContext';
import { useStats } from '../state/StatsContext';
import { columnDefsByType } from '../data/columnDefsByType';
import { applyDelta } from '../data/applyDelta';
import { dataServices, dataServicesBootstrapError } from '../dataServices';
import { TriangleAlert } from 'lucide-react';
import type { ProviderConfig } from '@starui/shared-types';

const storage = createMarketsGridLocalStorageStorage();

export function DataServicesGridPanel() {
  if (!dataServices) {
    return <BootstrapErrorState />;
  }
  return <DataServicesGridInner />;
}

function DataServicesGridInner() {
  const { cfg } = useMockConfig();
  const { recordTick } = useStats();
  const dataType = (cfg.dataType ?? 'positions') as 'positions' | 'trades' | 'orders';
  const gridId = `mockdata-via-ds-${dataType}-v1`;
  const providerId = `mock-${dataType}`;
  const { columnDefs, rowIdField, defaultColDef } = columnDefsByType[dataType];

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const rowsRef = useRef<Record<string, unknown>[]>([]);

  // The hub dedupes its row cache by `cfg.keyColumn` and drops rows
  // that don't resolve a value for it. MockProviderConfig itself
  // doesn't declare keyColumn, so we widen the cfg here using the same
  // value as the grid's rowIdField.
  const cfgForHub = useMemo<ProviderConfig>(
    () => ({ ...cfg, keyColumn: rowIdField } as ProviderConfig),
    [cfg, rowIdField],
  );

  useEffect(() => {
    rowsRef.current = [];
    setRows([]);
  }, [dataType]);

  useProviderStream<Record<string, unknown>>(providerId, cfgForHub, {
    onDelta: (incoming, replace) => {
      if (replace) {
        rowsRef.current = [...incoming];
      } else {
        rowsRef.current = applyDelta(rowsRef.current, incoming, rowIdField);
      }
      setRows(rowsRef.current);
      recordTick('dataservices', Date.now(), rowsRef.current.length);
    },
    onStatus: () => undefined,
  });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <MarketsGrid
        key={gridId}
        gridId={gridId}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowIdField={rowIdField}
        storage={storage}
        showFiltersToolbar
        showFormattingToolbar
        showProfileSelector
        showSaveButton
        showSettingsButton
        componentName={`DataServices · ${dataType}`}
        sideBar={{ toolPanels: ['columns', 'filters'] }}
        statusBar={{
          statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agSelectedRowCountComponent', align: 'center' },
            { statusPanel: 'agAggregationComponent', align: 'right' },
          ],
        }}
      />
    </div>
  );
}

function BootstrapErrorState() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[color:var(--ds-surface-ground)] p-6">
      <div className="flex max-w-md items-start gap-3 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-4 text-[12px] text-[color:var(--ds-text-secondary)]">
        <TriangleAlert size={16} strokeWidth={1.75} className="mt-[2px] shrink-0 text-[color:var(--ds-accent-warning,var(--ds-accent-info))]" />
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-text-primary)]">
            DataServices bootstrap failed
          </span>
          <span className="leading-relaxed">
            {dataServicesBootstrapError?.message ?? 'Unknown error'}
          </span>
          <span className="leading-relaxed text-[color:var(--ds-text-faint)]">
            SharedWorker is unavailable in this browser context (private
            tab, restricted origin, etc.). The Direct panel still works.
          </span>
        </div>
      </div>
    </div>
  );
}
