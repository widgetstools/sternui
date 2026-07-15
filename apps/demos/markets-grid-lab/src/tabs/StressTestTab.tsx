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
import { PerspectiveStressGrid } from './altGrids/PerspectiveStressGrid';
import { GlideStressGrid } from './altGrids/GlideStressGrid';
import { CanvasStressGrid } from './altGrids/CanvasStressGrid';

/** Lean baseline for isolating scroll cost across engines. */
const BASELINE_ROWS = 20_000;
const BASELINE_COLS = 40;

type StressSurface =
  | 'plain-20k40'
  | 'perspective-20k40'
  | 'glide-20k40'
  | 'canvas-20k40'
  | 'plain-50k400'
  | 'markets';

const VARIANTS = [
  { id: 'plain-20k40', label: 'Plain AG Grid · 20k × 40' },
  { id: 'perspective-20k40', label: 'Perspective · 20k × 40' },
  { id: 'glide-20k40', label: 'Glide Data Grid · 20k × 40' },
  { id: 'canvas-20k40', label: 'Canvas / Bryntum stand-in · 20k × 40' },
  { id: 'plain-50k400', label: 'Plain AG Grid · 50k × 400' },
  { id: 'markets', label: 'MarketsGrid (modules)' },
] as const;

/**
 * Stress Test — A/B AG Grid vs Perspective / Glide / canvas (Bryntum-class)
 * on the same mock stream so scroll + long-run cost can be compared.
 */
export function StressTestTab() {
  const config = STRESS_TEST_FEATURE;
  const [surface, setSurface] = useState<StressSurface>('perspective-20k40');
  const { useSSRM, setUseSSRM } = useLabDemoRegistry();

  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );

  const isBaseline =
    surface === 'plain-20k40' ||
    surface === 'perspective-20k40' ||
    surface === 'glide-20k40' ||
    surface === 'canvas-20k40';
  const isPlainAg = surface === 'plain-20k40' || surface === 'plain-50k400';

  const stream = useMemo(
    () => ({
      rowCount: isBaseline ? BASELINE_ROWS : (config.stream?.rowCount ?? 50_000),
      updateIntervalMs: config.stream?.updateIntervalMs ?? 200,
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
    // Alt grids skip onReady so ticks (when enabled) update React rowData.
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

  const subtitle = (() => {
    switch (surface) {
      case 'perspective-20k40':
        return `FINOS Perspective viewer · ${BASELINE_ROWS.toLocaleString()} × ${BASELINE_COLS} · ticks off`;
      case 'glide-20k40':
        return `Glide Data Grid (canvas cells) · ${BASELINE_ROWS.toLocaleString()} × ${BASELINE_COLS} · ticks off`;
      case 'canvas-20k40':
        return `Canvas virtualizer (Bryntum stand-in) · ${BASELINE_ROWS.toLocaleString()} × ${BASELINE_COLS} · ticks off`;
      case 'plain-20k40':
        return `Plain AG Grid 36 CSRM · ${BASELINE_ROWS.toLocaleString()} × ${BASELINE_COLS} · ticks off`;
      case 'plain-50k400':
        return `Plain AG Grid 36 CSRM · 50k × 400 · ${tickMs} ms ticks`;
      default:
        return `${config.subtitle} · ${tickMs} ms tick`;
    }
  })();

  const grid = config.grid ?? {};
  const suggestAbove = 10_000;

  const onVariantChange = useCallback((id: string) => {
    if (VARIANTS.some((v) => v.id === id)) {
      setSurface(id as StressSurface);
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
          {surface === 'perspective-20k40' && (
            <PerspectiveStressGrid
              key="perspective-20k40"
              rowData={rowData}
              columnDefs={columnDefs}
            />
          )}
          {surface === 'glide-20k40' && (
            <GlideStressGrid
              key="glide-20k40"
              rowData={rowData}
              columnDefs={columnDefs}
            />
          )}
          {surface === 'canvas-20k40' && (
            <CanvasStressGrid
              key="canvas-20k40"
              rowData={rowData}
              columnDefs={columnDefs}
              showBryntumNote
            />
          )}
          {isPlainAg && (
            <PlainStressAgGrid
              key={surface}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={plainDefaultColDef}
              onReady={onReady}
              rowHeight={grid.rowHeight ?? 28}
            />
          )}
          {surface === 'markets' && (
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
