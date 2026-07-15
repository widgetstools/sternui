import { useCallback, useMemo, useState } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { InspectorDrawer } from '../components/InspectorDrawer';
import { defaultColDef } from '../data/columns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { useLabDemoRegistry } from '../demo/LabDemoContext';
import { useLabRows } from '../demo/useLabRows';
import { getFeatureGuide } from '../guides/featureGuides';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import { STRESS_TEST_FEATURE } from './labFeatureConfigs';
import { LAB_STATUS_BAR } from './labStatusBar';
import { PlainStressAgGrid } from './PlainStressAgGrid';

type StressSurface = 'markets' | 'plain';

const VARIANTS = [
  { id: 'markets', label: 'MarketsGrid (modules)' },
  { id: 'plain', label: 'Plain AG Grid 36' },
] as const;

/**
 * Stress Test — A/B MarketsGrid vs bare AgGridReact on the same 50k×400
 * stream so scroll jank can be attributed to product modules vs AG Grid.
 */
export function StressTestTab() {
  const config = STRESS_TEST_FEATURE;
  const [surface, setSurface] = useState<StressSurface>('plain');
  const { useSSRM, setUseSSRM } = useLabDemoRegistry();

  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );

  const { rowData, onReady, tickMs } = useLabRows(
    config.tabId,
    config.providerId,
    config.stream ?? { rowCount: 500, updateIntervalMs: 500 },
    surface === 'markets' ? onProfilesReady : undefined,
  );

  const columnDefs = useMemo(() => config.getColumnDefs(), [config]);
  const colDefBase = config.defaultColDef ?? defaultColDef;

  const guide = getFeatureGuide(config.tabId);
  const configBlocks = useMemo(
    () => (guide ? buildConfigBlocks(config, guide) : []),
    [config, guide],
  );

  const subtitle =
    surface === 'plain'
      ? `Plain AG Grid 36 CSRM · ${tickMs} ms ticks · no MarketsGrid modules`
      : `${config.subtitle} · ${tickMs} ms tick`;

  const grid = config.grid ?? {};
  const suggestAbove = 10_000;

  const onVariantChange = useCallback((id: string) => {
    setSurface(id === 'plain' ? 'plain' : 'markets');
  }, []);

  return (
    <TabContainer
      title={config.title}
      subtitle={subtitle}
      help={config.help}
      variants={[...VARIANTS]}
      activeVariant={surface}
      onVariantChange={onVariantChange}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          {surface === 'plain' ? (
            <PlainStressAgGrid
              key="plain-ag-grid"
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={colDefBase}
              onReady={onReady}
              rowHeight={grid.rowHeight ?? 28}
            />
          ) : (
            <MarketsGrid
              key={useSSRM ? 'ssrm' : 'csrm'}
              gridId={config.gridId}
              useSSRM={useSSRM}
              suggestSsrmAbove={suggestAbove}
              onSuggestSsrm={() => setUseSSRM(true)}
              componentName={config.componentName}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={colDefBase}
              rowIdField="id"
              storage={labStorage}
              onReady={onReady}
              showProfileSelector={grid.showProfileSelector ?? true}
              showSaveButton={grid.showSaveButton ?? true}
              showSettingsButton={grid.showSettingsButton ?? true}
              showFiltersToolbar={grid.showFiltersToolbar}
              showFormattingToolbar={grid.showFormattingToolbar}
              showEditingToolbar={grid.showEditingToolbar}
              showSmartEditToolbar={grid.showSmartEditToolbar}
              showBulkUpdateToolbar={grid.showBulkUpdateToolbar}
              showEditHistoryToolbar={grid.showEditHistoryToolbar}
              showVisualExcelExport={grid.showVisualExcelExport}
              sideBar={grid.sideBar}
              statusBar={useSSRM ? undefined : (grid.statusBar ?? LAB_STATUS_BAR)}
              rowHeight={grid.rowHeight}
              animateRows={grid.animateRows}
            />
          )}
        </div>
        {guide && surface === 'markets' && (
          <InspectorDrawer guide={guide} configBlocks={configBlocks} fullDocs={config.help} />
        )}
      </div>
    </TabContainer>
  );
}
