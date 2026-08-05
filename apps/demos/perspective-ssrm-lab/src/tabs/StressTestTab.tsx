import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { InspectorDrawer } from '../components/InspectorDrawer';
import {
  buildStressColumnDefs,
  STRESS_COL_COUNT,
  STRESS_FIELD_TYPES,
  STRESS_ROW_COUNT,
  stressDefaultColDef,
} from '../data/stressColumns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { useLabPerspectiveRows } from '../demo/useLabPerspectiveRows';
import { PerspectiveAttachNotice } from '../components/PerspectiveAttachNotice';
import { SsrmEngineStressGrid } from './SsrmEngineStressGrid';
import { getFeatureGuide } from '../guides/featureGuides';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import { STRESS_TEST_FEATURE } from './labFeatureConfigs';

/** Stable empty array — see the `rowData` note at the grid. */
const NO_ROWS: never[] = [];

/**
 * Stress Test — ONE surface, 50,000 rows x 120 real columns.
 *
 * ## Why there is only one variant
 *
 * There were six: two MarketsGrid widths, two plain-AG client-side baselines and
 * a FINOS viewer. They are gone, and the reason is that the widest of them was
 * measuring something other than what its label said.
 *
 * MEASURED (`perspective-grid/scripts/columnPayloadProbe.mjs`): the variant
 * labelled "50k x 400" put 404 columns on screen while a block carried **56**.
 * A Perspective View carries the columns of the TABLE, and 368 of those 404
 * were synthetic `sNNN` columns computed in this window by a `valueGetter` from
 * `id` and `midPrice` — never fetched, never in the book. Every wide-book number
 * taken here inherited that confusion, including a 284x read-cost figure that
 * has since been withdrawn.
 *
 * This tab now runs one book whose column count, Table width and block width are
 * the SAME number, so a measurement means what it says. See `stressColumns.ts`.
 *
 * ## The column window
 *
 * Off, as it ships everywhere. `?columnWindow=1` turns it on for a run — that is
 * how `e2e/perspective-column-window.spec.ts` exercises the surface's banding
 * and hysteresis against a genuinely wide book, and how a before/after can be
 * taken over one book without a second variant to drift from it.
 */
export function StressTestTab() {
  const config = STRESS_TEST_FEATURE;

  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );

  /**
   * A run-time flag, not a second test surface.
   *
   * Column-window fetching is opt-in and off by default because every way it can
   * be wrong is silent — a forgotten column renders BLANK and a value getter
   * reading a forgotten field reports nothing. Read once from the URL so a
   * measurement or an e2e run can enable it without the tab growing a variant
   * whose seeded profiles could drift from the default one's.
   */
  /**
   * `?engine=ssrm` runs the same book on `@starui/ssrm-engine` instead of the
   * Perspective pull path — a like-for-like comparison of the row supply, with
   * the same rows, columns, types and tick rate, so the probes apply unchanged.
   *
   * A run-time flag rather than a variant, for the same reason `?columnWindow=1`
   * is: one test surface, no second set of seeded profiles to drift from the
   * first.
   */
  const useSsrmEngine = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('engine') === 'ssrm';
  }, []);

  const columnWindow = useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const on = new URLSearchParams(window.location.search).get('columnWindow') === '1';
    return on ? { enabled: true } : undefined;
  }, []);

  const stream = useMemo(
    () => ({
      rowCount: STRESS_ROW_COUNT,
      updateIntervalMs: config.stream?.updateIntervalMs ?? 200,
      enableUpdates: config.stream?.enableUpdates ?? true,
      // The wide declaration. Everything downstream — the Table, a block, an
      // export — is exactly these fields.
      fields: STRESS_FIELD_TYPES,
    }),
    [config.stream],
  );

  const {
    table,
    status: attachStatus,
    reason: attachReason,
    onReady,
    tickMs,
  } = useLabPerspectiveRows(config.tabId, config.providerId, stream, onProfilesReady);

  const columnDefs = useMemo(() => buildStressColumnDefs(), []);

  const guide = getFeatureGuide(config.tabId);
  const configBlocks = useMemo(
    () => (guide ? buildConfigBlocks(config, guide) : []),
    [config, guide],
  );

  const grid = config.grid ?? {};

  return (
    <TabContainer
      title={config.title}
      subtitle={`${STRESS_ROW_COUNT.toLocaleString()} × ${STRESS_COL_COUNT} real columns · ${tickMs} ms tick${
        columnWindow ? ' · column window ON' : ''
      }${useSsrmEngine ? ' · @starui/ssrm-engine (in-window book)' : ''}`}
      help={config.help}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          {useSsrmEngine && (
            <SsrmEngineStressGrid
              columnDefs={columnDefs}
              rowHeight={grid.rowHeight ?? 28}
              tickMs={config.stream?.updateIntervalMs ?? 200}
            />
          )}
          {!useSsrmEngine && !table && (
            <PerspectiveAttachNotice status={attachStatus} reason={attachReason} />
          )}
          {!useSsrmEngine && table && (
            <MarketsGrid
              gridId={config.gridId}
              // `rowData` is required by the props type and UNUSED on this path:
              // the rows come from the worker-held Table. A stable empty array
              // rather than a literal, so it is not a new reference every render.
              rowData={NO_ROWS}
              rowModel="perspective"
              perspectiveTable={table}
              perspectiveColumnWindow={columnWindow}
              componentName={config.componentName}
              columnDefs={columnDefs}
              defaultColDef={stressDefaultColDef}
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
              statusBar={grid.statusBar}
              rowHeight={grid.rowHeight}
              animateRows={false}
            />
          )}
        </div>
        {guide && (
          <InspectorDrawer guide={guide} configBlocks={configBlocks} fullDocs={config.help} />
        )}
      </div>
    </TabContainer>
  );
}
