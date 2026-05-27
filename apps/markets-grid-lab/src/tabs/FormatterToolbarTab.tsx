import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { useLabRows } from '../demo/useLabRows';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  FORMATTER_TOOLBAR_ACTIVE_PROFILE_ID,
  FORMATTER_TOOLBAR_DEMO_PROFILES,
  FORMATTER_TOOLBAR_GRID_ID,
} from '../profiles/catalogs';

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
  const { rows } = useLabRows('toolbar', 'mock-positions-formatter-toolbar', {
    rowCount: 500,
    updateIntervalMs: 600,
  });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const onReady = useLabDemoProfiles(
    FORMATTER_TOOLBAR_GRID_ID,
    FORMATTER_TOOLBAR_DEMO_PROFILES,
    FORMATTER_TOOLBAR_ACTIVE_PROFILE_ID,
  );

  return (
    <TabContainer
      title="Formatter Toolbar"
      subtitle={`${FORMATTER_TOOLBAR_DEMO_PROFILES.length} profiles · floating palette · cell + header paint`}
      help={HELP.formatterToolbar}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={FORMATTER_TOOLBAR_GRID_ID}
          componentName="Formatter Toolbar"
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
