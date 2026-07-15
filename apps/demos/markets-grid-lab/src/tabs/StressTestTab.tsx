import { useCallback, useMemo, useState } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { InspectorDrawer } from '../components/InspectorDrawer';
import { defaultColDef } from '../data/columns';
import {
  buildStressColumnDefs,
  STRESS_COL_COUNT,
  stressDefaultColDef,
} from '../data/stressColumns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { useLabDemoRegistry } from '../demo/LabDemoContext';
import { useLabRows } from '../demo/useLabRows';
import { getFeatureGuide } from '../guides/featureGuides';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import { STRESS_TEST_FEATURE } from './labFeatureConfigs';
import { LAB_STATUS_BAR } from './labStatusBar';
import { PlainStressAgGrid } from './PlainStressAgGrid';

/** Lean baseline for isolating AG Grid scroll cost. */
const BASELINE_ROWS = 20_000;
const BASELINE_COLS = 40;

type StressSurface = 'plain-20k40' | 'plain-50k400' | 'markets';

const VARIANTS = [
  { id: 'plain-20k40', label: 'Plain AG Grid · 20k × 40' },
  { id: 'plain-50k400', label: 'Plain AG Grid · 50k × 400' },
  { id: 'markets', label: 'MarketsGrid (modules)' },
] as const;

/**
 * Stress Test — A/B bare AgGridReact shapes vs MarketsGrid so scroll jank
 * can be attributed to column/row cost vs product modules.
 */
export function StressTestTab() {
  const config = STRESS_TEST_FEATURE;
  const [surface, setSurface] = useState<StressSurface>('plain-20k40');
  const { useSSRM, setUseSSRM } = useLabDemoRegistry();

  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );

  const isBaseline = surface === 'plain-20k40';
  const isPlain = surface === 'plain-20k40' || surface === 'plain-50k400';

  const stream = useMemo(
    () => ({
      rowCount: isBaseline ? BASELINE_ROWS : (config.stream?.rowCount ?? 50_000),
      updateIntervalMs: config.stream?.updateIntervalMs ?? 200,
      // Baseline scroll test: ticks off by default (Demo Console can re-enable).
      enableUpdates: isBaseline ? false : (config.stream?.enableUpdates ?? true),
    }),
    [config.stream, isBaseline],
  );

  const providerId = isBaseline
    ? 'mock-positions-stress-20k'
    : config.providerId;

  const { rowData, onReady, tickMs } = useLabRows(
    config.tabId,
    providerId,
    stream,
    surface === 'markets' ? onProfilesReady : undefined,
  );

  const columnDefs = useMemo(
    () =>
      isBaseline
        ? buildStressColumnDefs(BASELINE_COLS)
        : buildStressColumnDefs(STRESS_COL_COUNT),
    [isBaseline],
  );
  const colDefBase = config.defaultColDef ?? stressDefaultColDef ?? defaultColDef;

  // Strip floating filters / group chrome on the lean baseline.
  const plainDefaultColDef = useMemo(
    () =>
      isBaseline
        ? {
            ...colDefBase,
            floatingFilter: false,
            enableRowGroup: false,
            enablePivot: false,
            enableValue: false,
            filter: false,
          }
        : colDefBase,
    [colDefBase, isBaseline],
  );

  const guide = getFeatureGuide(config.tabId);
  const configBlocks = useMemo(
    () => (guide ? buildConfigBlocks(config, guide) : []),
    [config, guide],
  );

  const subtitle = isBaseline
    ? `Plain AG Grid 36 CSRM · ${BASELINE_ROWS.toLocaleString()} × ${BASELINE_COLS} · ticks off`
    : surface === 'plain-50k400'
      ? `Plain AG Grid 36 CSRM · 50k × 400 · ${tickMs} ms ticks`
      : `${config.subtitle} · ${tickMs} ms tick`;

  const grid = config.grid ?? {};
  const suggestAbove = 10_000;

  const onVariantChange = useCallback((id: string) => {
    if (id === 'plain-20k40' || id === 'plain-50k400' || id === 'markets') {
      setSurface(id);
    }
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
          {isPlain ? (
            <PlainStressAgGrid
              key={`${surface}-${providerId}`}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={plainDefaultColDef}
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
