import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useMockStream } from '../data/useMockStream';
import { useSeed } from '../data/useSeed';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import { ALERTS_TAB_STATE } from '../seeds';

const GRID_ID = 'lab-alerts-v1';

const SEED = {
  alerts: ALERTS_TAB_STATE,
};

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'yieldToWorst',
  'marketValue',
  'unrealizedPnL', 'dailyPnL',
  'lastUpdate',
];

export function AlertsTab() {
  const rows = useMockStream('mock-positions-alerts', { rowCount: 250, updateIntervalMs: 600 });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useSeed(GRID_ID, SEED);

  return (
    <TabContainer
      title="Alerts"
      subtitle="7 seeded rules · 3 trigger families · toast + bell badge + OpenFin · debounce · rate limit · live settings"
      help={HELP.alerts}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={GRID_ID}
          componentName="Alerts"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={memoizedDefaultColDef}
          rowIdField="id"
          storage={labStorage}
          onReady={onReady}
          showProfileSelector
          showSaveButton
          showSettingsButton
        />
      </div>
    </TabContainer>
  );
}
