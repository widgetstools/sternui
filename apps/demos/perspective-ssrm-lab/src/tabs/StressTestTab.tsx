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
import { useLabPerspectiveRows } from '../demo/useLabPerspectiveRows';
import { PerspectiveAttachNotice } from '../components/PerspectiveAttachNotice';
import { getFeatureGuide } from '../guides/featureGuides';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import { STRESS_TEST_FEATURE } from './labFeatureConfigs';
import { PlainStressAgGrid } from './PlainStressAgGrid';
import { PerspectiveStressGrid } from './altGrids/PerspectiveStressGrid';

/** Stable empty array — see the `rowData` note at the grid. */
const NO_ROWS: never[] = [];

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
  | 'markets'
  | 'markets-window';

const VARIANTS = [
  { id: 'markets-50k40', label: 'MarketsGrid SSRM · 50k × 40' },
  { id: 'plain-20k40', label: 'Plain AG Grid · 20k × 40' },
  { id: 'perspective-20k40', label: 'Perspective · 20k × 40' },
  { id: 'plain-50k400', label: 'Plain AG Grid · 50k × 400' },
  { id: 'markets', label: 'MarketsGrid · 50k × 400 (modules)' },
  { id: 'markets-window', label: 'MarketsGrid · 50k × 400 (column window)' },
] as const;

/**
 * Column-window fetching, on.
 *
 * Identical to the `markets` variant in every other respect — same provider,
 * same columns, same grid id and therefore the same seeded profiles — so the
 * pair is a controlled A/B and any difference between them is the window.
 *
 * **What this pair does NOT show, stated so nobody re-derives it as a win.**
 * MEASURED (`perspective-grid/scripts/columnPayloadProbe.mjs`): a block on this
 * tab carries **56 columns**, not 400. Every lab Table is built from one
 * ~53-field declared schema, and 368 of the 404 AG columns are the synthetic
 * `sNNN` value getters computed in this window from `id` and `midPrice`. So
 * there is almost nothing here for a window to narrow; this variant exists to
 * prove the feature CORRECT, not fast.
 *
 * `midPrice` is pinned because the value getters read it and it sits at the far
 * left of the display order — a band centred anywhere to the right would drop
 * it, and the sparklines would draw a wrong value with nothing logged. `id` is
 * the key column and the engine pins that itself.
 */
const COLUMN_WINDOW = { enabled: true, pinned: ['midPrice'] } as const;

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
  const isColumnWindow = surface === 'markets-window';
  const isMarkets = surface === 'markets' || isMarkets50k40 || isColumnWindow;

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

  /**
   * TWO row supplies, and only the active surface's one is SUBSCRIBED.
   *
   * The baseline surfaces (plain AG Grid, the FINOS Perspective viewer) are
   * client-side by construction — that is what makes them controls. Feeding
   * them from a worker-held Table would measure the Table instead of them.
   * MarketsGrid takes the pull path, which is what this lab is for.
   *
   * `enabled` and not just `enableUpdates`, and this cost a renderer:
   * `enableUpdates: false` stops the TICKS but the snapshot still arrives, so
   * this window held the whole 50,000-row book while showing a grid that reads
   * from the worker. MEASURED — two live arrays of 50,000 rows x 256 fields in
   * hook state (`rows` and `rowsRef`), rendered by nothing — and the tab died
   * with "Aw, Snap! Error code: Out of Memory". A pull-path window holding the
   * book is the one thing this lab exists to disprove.
   */
  const { rowData, onReady: onBaselineReady, tickMs } = useLabRows(
    config.tabId,
    providerId,
    {
      ...stream,
      enabled: !isMarkets,
      enableUpdates: isMarkets ? false : stream.enableUpdates,
    },
    undefined,
  );
  const {
    table,
    status: attachStatus,
    reason: attachReason,
    onReady: onMarketsReady,
  } = useLabPerspectiveRows(
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
        return `MarketsGrid CustomSSRM · ${CUSTOM_STRESS_ROWS.toLocaleString()} × ${CUSTOM_STRESS_COLS} · ticks off · scroll focus`;
      case 'perspective-20k40':
        return `FINOS Perspective viewer · ${BASELINE_ROWS.toLocaleString()} × ${BASELINE_COLS} · ticks off`;
      case 'plain-20k40':
        return `Plain AG Grid 36 CSRM · ${BASELINE_ROWS.toLocaleString()} × ${BASELINE_COLS} · ticks off`;
      case 'plain-50k400':
        return `Plain AG Grid 36 CSRM · 50k × 400 · ${tickMs} ms ticks`;
      case 'markets-window':
        return `${config.subtitle} · ${tickMs} ms tick · column window ON`;
      default:
        return `${config.subtitle} · ${tickMs} ms tick · CustomSSRMGrid`;
    }
  })();

  const grid = config.grid ?? {};

  // No engine escalation: every MarketsGrid surface here is already on the
  // server row model, so there is nothing to suggest or switch to.
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
              onReady={onBaselineReady}
              rowHeight={grid.rowHeight ?? 28}
            />
          )}
          {isMarkets && !table && (
            <PerspectiveAttachNotice status={attachStatus} reason={attachReason} />
          )}
          {isMarkets && table && (
            <MarketsGrid
              gridId={isMarkets50k40 ? `${config.gridId}-50k40` : config.gridId}
              // `rowData` is required by the props type and UNUSED on this path:
              // the rows come from the worker-held Table. A stable empty array
              // rather than a literal, so it is not a new reference every render.
              rowData={NO_ROWS}
              rowModel="perspective"
              perspectiveTable={table}
              perspectiveColumnWindow={isColumnWindow ? COLUMN_WINDOW : undefined}
              componentName={config.componentName}
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
              onReady={onMarketsReady}
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
              statusBar={grid.statusBar}
              rowHeight={grid.rowHeight}
              animateRows={false}
            />
          )}
        </div>
        {guide && (surface === 'markets' || isColumnWindow) && (
          <InspectorDrawer guide={guide} configBlocks={configBlocks} fullDocs={config.help} />
        )}
      </div>
    </TabContainer>
  );
}
