import { useMemo } from 'react';
import { MarketsGrid } from '@starui/grid';
import { TabContainer } from '../components/TabContainer';
import { InspectorDrawer } from '../components/InspectorDrawer';
import { defaultColDef } from '../data/columns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { useLabPerspectiveRows } from '../demo/useLabPerspectiveRows';
import { getFeatureGuide } from '../guides/featureGuides';
import { LAB_STATUS_BAR } from './labStatusBar';
import { buildConfigBlocks } from '../guides/buildConfigBlocks';
import type { LabFeatureConfig } from './labFeatureConfigs';
import { PerspectiveAttachNotice } from '../components/PerspectiveAttachNotice';

/** Stable empty array — see the `rowData` note at the grid. */
const NO_ROWS: never[] = [];

export interface LabFeatureTabProps {
  config: LabFeatureConfig;
}

/**
 * Shared shell for feature tabs — the Perspective twin of the CSRM lab's.
 *
 * Three differences from that file, and nothing else changes:
 *
 *   1. **`rowModel="perspective"` + `perspectiveTable`, and NO `rowData`.**
 *      The book lives once as a Table in the SharedWorker; this window opens a
 *      View and reads the blocks its viewport asks for. Handing it `rowData`
 *      would be handing it a copy of the thing it is deliberately not holding.
 *   2. **No engine toggle and no remount `key`.** The CSRM lab remounts the
 *      grid to flip CSRM↔SSRM; here the engine never changes, and remounting
 *      would drop the attach for nothing. Note **exactly one grid may mount
 *      per GridPlatform, ever** — see `resolveGridSurface` — so a stray
 *      remount is not merely wasteful, it leaves a dead platform behind.
 *   3. **The status bar is left to the surface.** It supplies a Perspective
 *      panel that reads the worker-held Table; AG's stock panels count the
 *      rows THIS window holds, which is a few hundred of the book and reads
 *      as a bug.
 *
 * `onReady` still fires, so every profile, seed and guide behaves as before.
 */
export function LabFeatureTab({ config }: LabFeatureTabProps) {
  const onProfilesReady = useLabDemoProfiles(
    config.gridId,
    config.profiles,
    config.activeProfileId,
  );
  const { table, status, reason, onReady, tickMs } = useLabPerspectiveRows(
    config.tabId,
    config.providerId,
    config.stream ?? { rowCount: 500, updateIntervalMs: 500 },
    onProfilesReady,
  );

  const columnDefs = useMemo(() => config.getColumnDefs(), [config]);
  const colDefBase = config.defaultColDef ?? defaultColDef;

  const guide = getFeatureGuide(config.tabId);
  const configBlocks = useMemo(
    () => (guide ? buildConfigBlocks(config, guide) : []),
    [config, guide],
  );

  const subtitle = config.subtitleIncludesTickMs
    ? `${config.subtitle} · ${tickMs} ms tick · worker-held Table · use Demo console for scenarios`
    : config.subtitle;

  const grid = config.grid ?? {};

  return (
    <TabContainer title={config.title} subtitle={subtitle} help={config.help}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          {table ? (
            <MarketsGrid
              gridId={config.gridId}
              // `rowData` is required by the props type and UNUSED on this path:
              // the rows come from the worker-held Table. A stable empty array
              // rather than a literal, so it is not a new reference every render.
              rowData={NO_ROWS}
              rowModel="perspective"
              perspectiveTable={table}
              componentName={config.componentName}
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
              // `LAB_STATUS_BAR` now means the same thing here as on the CSRM
              // twin: the surface rewrites AG's stock row-count panels to ones
              // that read the worker-held Table, so a tab that asks for the
              // lab's four-panel bar gets it instead of nothing. Tabs with
              // their own `grid.statusBar` keep theirs.
              statusBar={grid.statusBar ?? LAB_STATUS_BAR}
              rowHeight={grid.rowHeight}
              animateRows={grid.animateRows}
            />
          ) : (
            <PerspectiveAttachNotice status={status} reason={reason} />
          )}
        </div>
        {guide && (
          <InspectorDrawer guide={guide} configBlocks={configBlocks} fullDocs={config.help} />
        )}
      </div>
    </TabContainer>
  );
}
