import { useMemo, useState } from 'react';
import { TabContainer } from '../components/TabContainer';
import { HELP } from '../help';
import { SsrmEngineMarketsGrid } from './SsrmEngineMarketsGrid';
import { buildStressColumnDefs, STRESS_COL_COUNT, STRESS_ROW_COUNT } from '../data/stressColumns';
import {
  LAB_SSRM_CALC_CUSTOMIZATION,
  LAB_SSRM_CALC_COLUMNS,
  LAB_SSRM_VIRTUAL_COLUMNS,
} from '../data/ssrmCalcColumns';
import { useLabDemoProfiles } from '../data/useLabDemoProfiles';
import { labStorage } from '../data/storage';
import { LAB_STATUS_BAR } from './labStatusBar';
import type { LabDemoProfileEntry } from '../profiles/labProfileKit';

/**
 * `@starui/ssrm-engine` under the whole MarketsGrid platform.
 *
 * ## Why this exists beside the SSRM Engine tab rather than inside it
 *
 * The SSRM Engine tab is the CONTROL and keeps its plain `AgGridReact`. This is
 * the treatment: the same 20,000 x 120 book, in the same SharedWorker, under the
 * same book id — so the two tabs share ONE book — with the customizer, the
 * toolbars, profiles, the status bar and the Excel export on top.
 *
 * Two addresses rather than one toggle, because the question this pair exists to
 * answer ("what does the platform cost the read path") can only be measured by
 * ALTERNATING them in one series. `browserSmokeProbe` is bimodal on identical
 * code — 12,715 ms and 1,925 ms have both been read from the same build — so two
 * consecutive runs of one configuration is not a control, and a toggle inside
 * one tab gives a probe nothing to interleave with.
 *
 * ## The calculated columns come from the CUSTOMIZER
 *
 * Not from a prop. The seeded profile below puts the same six authored
 * expressions into the calculated-columns module, and from there they take the
 * path a user's own column takes: the module builds the colDefs,
 * `useSsrmEngineCalcColumns` plans them for the `ssrm-engine` backend, the AST
 * crosses the worker port, and the engine evaluates it where the book is. They
 * are then sortable, filterable and groupable from the grid's own header menus
 * and row-group panel — there are no demo buttons on this tab, deliberately.
 * The control tab has those, because a plain AG Grid has no customizer to
 * author one in.
 */

const GRID_ID = 'lab-ssrm-engine-marketsgrid-v2';

const PROFILES: LabDemoProfileEntry[] = [
  {
    id: 'ssrm-engine-mg-00-calc',
    name: '00 · Calculated columns',
    blurb: 'Six authored expressions, evaluated in the worker over the columnar book.',
    seed: {
      'calculated-columns': { virtualColumns: LAB_SSRM_VIRTUAL_COLUMNS as never },
      'column-customization': LAB_SSRM_CALC_CUSTOMIZATION as never,
    },
  },
];

/**
 * Dimension columns that get a real SET filter here, and nowhere else in the lab.
 *
 * Every stress column ships `agTextColumnFilter`, because until now a set filter
 * under a server row model had no values to offer: AG builds the checkbox list
 * from the rows the client model holds, which is one block, and opening one
 * threw `r.values is not iterable` out of AG's own validation. That is the
 * capability this surface adds, so the demo has to actually use it — a tab that
 * quietly kept text filters would prove nothing.
 */
const SET_FILTER_COLUMNS = new Set([
  'assetClass',
  'currency',
  'compositeRating',
  'seniority',
]);

export function SsrmEngineMarketsGridTab() {
  const onProfilesReady = useLabDemoProfiles(GRID_ID, PROFILES, PROFILES[0].id);
  const columnDefs = useState(() =>
    buildStressColumnDefs().map((def) =>
      SET_FILTER_COLUMNS.has(def.field ?? '')
        ? { ...def, filter: 'agSetColumnFilter' as const }
        : def,
    ),
  )[0];
  const [ready, setReady] = useState(false);

  const subtitle = useMemo(
    () =>
      `${STRESS_ROW_COUNT.toLocaleString()} × ${STRESS_COL_COUNT} in a SharedWorker, under MarketsGrid — ` +
      `the same book the SSRM Engine tab reads with a plain AgGridReact. ` +
      `${LAB_SSRM_CALC_COLUMNS.length} calculated columns, authored in the customizer.`,
    [],
  );

  return (
    <TabContainer
      title="SSRM Engine — MarketsGrid surface"
      subtitle={subtitle}
      help={HELP.ssrmEngineMarketsGrid}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex min-h-0 flex-1">
          <SsrmEngineMarketsGrid
            gridId={GRID_ID}
            columnDefs={columnDefs}
            tickMs={200}
            chrome={{
              statusBar: LAB_STATUS_BAR,
              sideBar: { toolPanels: ['columns', 'filters'] },
              storage: labStorage,
              showProfileSelector: true,
              showSaveButton: true,
              showSettingsButton: true,
              showVisualExcelExport: true,
            }}
            onProfilesReady={onProfilesReady}
            onReady={() => setReady(true)}
          />
        </div>
        <div
          className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-[11px] text-[color:var(--ds-text-secondary)]"
          data-testid="ssrm-mg-legend"
        >
          <span>{ready ? 'book open' : 'opening the book…'}</span>
          {LAB_SSRM_CALC_COLUMNS.map((c) => (
            <span key={c.colId} className="font-mono">
              <span className="text-[color:var(--ds-text-primary)]">{c.headerName}</span>
              {' = '}
              {c.expression}
            </span>
          ))}
        </div>
      </div>
    </TabContainer>
  );
}
