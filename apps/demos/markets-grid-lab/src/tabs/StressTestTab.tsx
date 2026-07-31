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
import { useLabRows } from '../demo/useLabRows';
import { getFeatureGuide } from '../guides/featureGuides';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import { STRESS_TEST_FEATURE } from './labFeatureConfigs';
import { LAB_STATUS_BAR } from './labStatusBar';
import { PlainStressAgGrid } from './PlainStressAgGrid';
import { PerspectiveStressGrid } from './altGrids/PerspectiveStressGrid';

/** Lean baseline for isolating scroll cost across engines. */
const BASELINE_ROWS = 20_000;
const BASELINE_COLS = 40;
/** Tall × narrow MarketsGrid CustomSSRM target (scroll isolation, ticks off). */
const CUSTOM_STRESS_ROWS = 50_000;
const CUSTOM_STRESS_COLS = 40;

type StressSurface =
  | 'plain-20k40'
  | 'perspective-20k40'
  | 'plain-50k400'
  | 'markets-50k40'
  | 'markets';

const VARIANTS = [
  { id: 'markets-50k40', label: 'MarketsGrid · 50k × 40' },
  { id: 'plain-20k40', label: 'Plain AG Grid · 20k × 40' },
  { id: 'perspective-20k40', label: 'Perspective · 20k × 40' },
  { id: 'plain-50k400', label: 'Plain AG Grid · 50k × 400' },
  { id: 'markets', label: 'MarketsGrid · 50k × 400 (modules)' },
] as const;

/**
 * Stress Test — A/B AG Grid vs Perspective on the same mock stream so
 * scroll + long-run cost can be compared.
 */
export function StressTestTab() {
  const config = STRESS_TEST_FEATURE;
  const [surface, setSurface] = useState<StressSurface>('markets-50k40');

  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );

  const isBaseline =
    surface === 'plain-20k40' || surface === 'perspective-20k40';
  const isPlainAg = surface === 'plain-20k40' || surface === 'plain-50k400';
  const isMarkets50k40 = surface === 'markets-50k40';
  const isMarkets = surface === 'markets' || isMarkets50k40;

  const stream = useMemo(() => {
    if (isBaseline) {
      return {
        rowCount: BASELINE_ROWS,
        updateIntervalMs: config.stream?.updateIntervalMs ?? 200,
        enableUpdates: false,
      };
    }
    if (isMarkets50k40) {
      return {
        rowCount: CUSTOM_STRESS_ROWS,
        updateIntervalMs: 600,
        // Scroll isolation — live ticks fight SSRM thumb/horizontal paint.
        enableUpdates: false,
      };
    }
    return {
      rowCount: config.stream?.rowCount ?? 50_000,
      updateIntervalMs: config.stream?.updateIntervalMs ?? 200,
      enableUpdates: config.stream?.enableUpdates ?? true,
    };
  }, [config.stream, isBaseline, isMarkets50k40]);

  const providerId = isBaseline
    ? 'mock-positions-stress-20k'
    : isMarkets50k40
      ? 'mock-positions-stress-50k40'
      : config.providerId;

  const { rowData, onReady, tickMs } = useLabRows(
    config.tabId,
    providerId,
    stream,
    isMarkets ? onProfilesReady : undefined,
  );

  const columnDefs = useMemo(() => {
    if (isBaseline || isMarkets50k40) {
      return buildStressColumnDefs(
        isMarkets50k40 ? CUSTOM_STRESS_COLS : BASELINE_COLS,
      );
    }
    return buildStressColumnDefs(STRESS_COL_COUNT);
  }, [isBaseline, isMarkets50k40]);
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
      case 'markets-50k40':
        return `MarketsGrid CSRM · ${CUSTOM_STRESS_ROWS.toLocaleString()} × ${CUSTOM_STRESS_COLS} · ticks off · scroll focus`;
      case 'perspective-20k40':
        return `FINOS Perspective viewer · ${BASELINE_ROWS.toLocaleString()} × ${BASELINE_COLS} · ticks off`;
      case 'plain-20k40':
        return `Plain AG Grid 36 CSRM · ${BASELINE_ROWS.toLocaleString()} × ${BASELINE_COLS} · ticks off`;
      case 'plain-50k400':
        return `Plain AG Grid 36 CSRM · 50k × 400 · ${tickMs} ms ticks`;
      default:
        return `${config.subtitle} · ${tickMs} ms tick · CustomSSRMGrid`;
    }
  })();

  const grid = config.grid ?? {};

  const onVariantChange = useCallback((id: string) => {
    if (VARIANTS.some((v) => v.id === id)) setSurface(id as StressSurface);
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
          {isMarkets && (
            <MarketsGrid
              gridId={isMarkets50k40 ? `${config.gridId}-50k40` : config.gridId}
              componentName={config.componentName}
              rowData={rowData}
              columnDefs={columnDefs}
              defaultColDef={
                isMarkets50k40
                  ? {
                      ...colDefBase,
                      floatingFilter: false,
                      enableRowGroup: false,
                      enablePivot: false,
                      filter: false,
                    }
                  : colDefBase
              }
              rowIdField="id"
              storage={labStorage}
              onReady={onReady}
              showProfileSelector={isMarkets50k40 ? false : (grid.showProfileSelector ?? true)}
              showSaveButton={grid.showSaveButton ?? true}
              showSettingsButton={grid.showSettingsButton ?? true}
              showFiltersToolbar={isMarkets50k40 ? false : grid.showFiltersToolbar}
              showFormattingToolbar={isMarkets50k40 ? false : grid.showFormattingToolbar}
              showEditingToolbar={isMarkets50k40 ? false : grid.showEditingToolbar}
              showSmartEditToolbar={grid.showSmartEditToolbar}
              showBulkUpdateToolbar={grid.showBulkUpdateToolbar}
              showEditHistoryToolbar={grid.showEditHistoryToolbar}
              showVisualExcelExport={isMarkets50k40 ? false : grid.showVisualExcelExport}
              sideBar={isMarkets50k40 ? false : grid.sideBar}
              statusBar={grid.statusBar ?? LAB_STATUS_BAR}
              rowHeight={grid.rowHeight}
              animateRows={false}
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
