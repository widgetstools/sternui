import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MarketsGrid,
  createMarketsGridLocalStorageStorage,
} from '@starui/grid';
import { useProviderStream, useProviderStats } from '@starui/host-data-react/runtime';
import { useMockConfig } from '../state/MockConfigContext';
import { useStats } from '../state/StatsContext';
import { columnDefsByType } from '../data/columnDefsByType';
import { applyDelta } from '../data/applyDelta';
import { getPlatform } from '../platformBootstrap';
import type { MockProviderConfig } from '@starui/types';

const storage = createMarketsGridLocalStorageStorage();

export function DataServicesGridPanel() {
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

  // Probe 1: does `services.ready` resolve? If yes, the SharedWorker is
  // alive and the AppData mirror round-tripped at least once.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[ds-panel] awaiting services.ready ...');
    getPlatform().ready.then(
      () => console.log('[ds-panel] services.ready RESOLVED — SharedWorker is alive'),
      (err) => console.error('[ds-panel] services.ready REJECTED', err),
    );
  }, []);

  // Probe 2: stats subscription. Hub sends one immediately on attach
  // and one per second after that — independent of provider deltas.
  useProviderStats(providerId, {
    onStats: (stats) => {
      // eslint-disable-next-line no-console
      console.log('[ds-panel] onStats:', stats);
    },
  });

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
