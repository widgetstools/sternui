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
import type { MockProviderConfig } from '@starui/shared-types';

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
  const [streamStatus, setStreamStatus] = useState<string>('mounting');
  const [streamError, setStreamError] = useState<string | undefined>();
  const rowsRef = useRef<Record<string, unknown>[]>([]);
  const deltaCountRef = useRef(0);

  // The hub dedupes its row cache by `cfg.keyColumn`; supply the same
  // value the grid uses as `rowIdField` so the two sides agree.
  const cfgForHub = useMemo<MockProviderConfig>(
    () => ({ ...cfg, keyColumn: rowIdField }),
    [cfg, rowIdField],
  );

  useEffect(() => {
    rowsRef.current = [];
    deltaCountRef.current = 0;
    setRows([]);
    // eslint-disable-next-line no-console
    console.log('[ds-panel] dataType swap →', dataType, 'providerId =', providerId, 'rowIdField =', rowIdField);
  }, [dataType, providerId, rowIdField]);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[ds-panel] cfgForHub changed →', cfgForHub);
  }, [cfgForHub]);

  const handle = useProviderStream<Record<string, unknown>>(providerId, cfgForHub, {
    onDelta: (incoming, replace) => {
      deltaCountRef.current += 1;
      // eslint-disable-next-line no-console
      console.log(
        `[ds-panel] onDelta #${deltaCountRef.current}: replace=${replace} incoming.length=${incoming.length}`,
        incoming.length > 0
          ? { firstRowKey: incoming[0]?.[rowIdField], firstRow: incoming[0] }
          : undefined,
      );
      if (replace) {
        rowsRef.current = [...incoming];
      } else {
        rowsRef.current = applyDelta(rowsRef.current, incoming, rowIdField);
      }
      setRows(rowsRef.current);
      recordTick('dataservices', Date.now(), rowsRef.current.length);
    },
    onStatus: (s, err) => {
      // eslint-disable-next-line no-console
      console.log('[ds-panel] onStatus:', s, err ?? '');
      setStreamStatus(s);
      setStreamError(err);
    },
  });

  // eslint-disable-next-line no-console
  console.log('[ds-panel] render: status=', streamStatus, 'rows=', rows.length, 'handle.status=', handle.status);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[color:var(--ds-surface-ground)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-1.5 font-mono text-[11px] text-[color:var(--ds-text-secondary)]">
        <span><span className="text-[color:var(--ds-text-faint)]">provider </span><span className="text-[color:var(--ds-text-primary)]">{providerId}</span></span>
        <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
        <span><span className="text-[color:var(--ds-text-faint)]">keyColumn </span><span className="text-[color:var(--ds-text-primary)]">{rowIdField}</span></span>
        <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
        <span><span className="text-[color:var(--ds-text-faint)]">status </span><span className="text-[color:var(--ds-text-primary)]">{streamStatus}</span></span>
        <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
        <span><span className="text-[color:var(--ds-text-faint)]">deltas </span><span className="text-[color:var(--ds-text-primary)]">{deltaCountRef.current}</span></span>
        <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
        <span><span className="text-[color:var(--ds-text-faint)]">rows </span><span className="text-[color:var(--ds-text-primary)]">{rows.length}</span></span>
        {streamError ? (
          <>
            <span className="h-3 w-px bg-[color:var(--ds-border-primary)]" />
            <span className="text-[color:var(--ds-accent-danger,#f43f5e)]">error: {streamError}</span>
          </>
        ) : null}
      </div>
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
