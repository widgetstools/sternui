import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useMockStream } from '../data/useMockStream';
import { useSeed } from '../data/useSeed';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import { FORMATTING_CC_STATE } from '../seeds';

const GRID_ID = 'lab-formatting-v6';

const SEED = {
  'column-customization': FORMATTING_CC_STATE,
};

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'currency', 'compositeRating', 'issuerSector',
  'bidPrice', 'midPrice', 'askPrice', 'lastPrice',
  'priceChangePct', 'bidAskWidthBps',
  'yieldToMaturity', 'yieldToWorst', 'currentYield',
  'oas', 'zSpread',
  'modifiedDuration', 'dv01',
  'quantityFace', 'marketValue', 'avgCost',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'issueDate', 'maturityDate', 'lastUpdate',
];

export function FormattingTab() {
  const rows = useMockStream('mock-positions-formatting', { rowCount: 500, updateIntervalMs: 600 });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const onReady = useSeed(GRID_ID, SEED);

  return (
    <TabContainer
      title="Formatting"
      subtitle="Every formatter kind in one grid · presets, Excel format, tick (32nds), color overrides, themed headers, global number/date defaults"
      help={HELP.formatting}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={GRID_ID}
          componentName="Formatting"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowIdField="id"
          storage={labStorage}
          onReady={onReady}
          showFormattingToolbar
          showProfileSelector
          showSaveButton
          showSettingsButton
        />
      </div>
    </TabContainer>
  );
}
