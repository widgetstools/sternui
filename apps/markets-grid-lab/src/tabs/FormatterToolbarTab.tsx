import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useMockStream } from '../data/useMockStream';
import { labStorage } from '../data/storage';
import { HELP } from '../help';

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'issuerSector', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'oas', 'zSpread',
  'modifiedDuration', 'dv01',
  'quantityFace', 'marketValue',
  'unrealizedPnL', 'dailyPnL', 'mtdPnL', 'ytdPnL',
  'book', 'trader', 'maturityDate',
];

export function FormatterToolbarTab() {
  const rows = useMockStream('mock-positions-formatter-toolbar', { rowCount: 500, updateIntervalMs: 600 });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);

  return (
    <TabContainer
      title="Formatter Toolbar"
      subtitle="Floating palette · click a column header, then paint cell style — persisted to the active profile"
      help={HELP.formatterToolbar}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId="lab-formatter-toolbar-v1"
          componentName="Formatter Toolbar"
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowIdField="id"
          storage={labStorage}
          showFormattingToolbar
          showProfileSelector
          showSaveButton
          showSettingsButton
        />
      </div>
    </TabContainer>
  );
}
