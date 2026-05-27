import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { defaultColDef, pickColumns } from '../data/columns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { useLabRows } from '../demo/useLabRows';
import { labStorage } from '../data/storage';
import { HELP } from '../help';
import {
  RENDERERS_ACTIVE_PROFILE_ID,
  RENDERERS_DEMO_PROFILES,
  RENDERERS_GRID_ID,
} from '../profiles/catalogs';

const FIELDS = [
  'cusip', 'ticker', 'instrumentDescription',
  'assetClass', 'issuerSector', 'issuerCountryCode', 'currency', 'compositeRating',
  'bidPrice', 'midPrice', 'askPrice', 'priceChangePct',
  'yieldToMaturity', 'oas',
  'modifiedDuration', 'krdSparkline',
  'marketValue', 'unrealizedPnL', 'dailyPnL', 'ytdPnL',
  'lastUpdate',
];

export function RenderersTab() {
  const { rows } = useLabRows('renderers', 'mock-positions-renderers', {
    rowCount: 500,
    updateIntervalMs: 600,
  });
  const columnDefs = useMemo(() => pickColumns(FIELDS), []);
  const memoizedDefaultColDef = useMemo(
    () => ({ ...defaultColDef, autoHeight: false }),
    [],
  );
  const onReady = useLabDemoProfiles(
    RENDERERS_GRID_ID,
    RENDERERS_DEMO_PROFILES,
    RENDERERS_ACTIVE_PROFILE_ID,
  );

  return (
    <TabContainer
      title="Cell Renderers"
      subtitle={`${RENDERERS_DEMO_PROFILES.length} profiles · pills · heatmaps · sparklines · bars · flags`}
      help={HELP.renderers}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={RENDERERS_GRID_ID}
          componentName="Renderers"
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
