import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useMockStream } from '../data/useMockStream';
import { useSeed } from '../data/useSeed';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import { CALCULATED_TAB_VIRTUAL } from '../seeds';

const GRID_ID = 'lab-calculated-v4';

const SEED = {
  'calculated-columns': { virtualColumns: CALCULATED_TAB_VIRTUAL },
};

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'oas',
  'modifiedDuration', 'dv01', 'convexity',
  'marketValue', 'quantityFace',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
];

export function CalculatedColumnsTab() {
  const rows = useMockStream('mock-positions-calculated', { rowCount: 500, updateIntervalMs: 500 });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(() => defaultColDef, []);
  const onReady = useSeed(GRID_ID, SEED);

  return (
    <TabContainer
      title="Calculated Columns"
      subtitle="7 module-driven virtual columns · expression DSL · re-evaluated every tick · formatters per column"
      help={HELP.calculatedColumns}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={GRID_ID}
          componentName="Calculated"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={{ ...defaultColDef, enableCellChangeFlash: true }}
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
