# Perspective grid branch — file inventory

Every file this branch adds, changes or removes under `packages/` and
`apps/`, against `main`. Generated from the diff rather than written by hand,
so it is exact:

```bash
git diff --name-status main...HEAD -- packages apps
```

**Branch:** `feat/perspective-grid` · **commits:** 84 ·
**head:** `c9addc87`

| | count |
|---|---|
| New files | **378** |
| Modified files | **57** |
| Removed files | **1** |
| New directories | **44** |

Changes outside these two trees are listed at the end for completeness.

---

## What the new units are

Orientation before the lists, since 378 filenames say little on their own.

| unit | what it is |
|---|---|
| `packages/react-grid/perspective-grid` | **The new package**, `@starui/perspective-grid` — the row engine: `viewManager`, `perspectiveRowEngine`, `perspectiveDatasource`, `safeView`, `viewConfig`. Plus `harness/` (standalone browser harnesses that proved the plumbing) and `scripts/` (the probes every measurement in the docs came from). No AG Grid dependency: the grid api is described structurally. |
| `packages/data/host-data/src/runtime/perspective` | Worker-side Table hosting — `perspectiveHost` (one engine, one Table per provider, a ProxySession per window), `perspectiveSchema`, `perspectiveTableFeed`. |
| `apps/demos/perspective-ssrm-lab` | The feature lab on `rowModel="perspective"` (:5301). Twin of `markets-grid-lab`, which stays CSRM as the control. 110 of its files are seeded profile JSON under `public/`. |
| `apps/demos/minimal-perspective-table` | Product-path demo against the STOMP fixture (:5273) — what `npm run e2e:perspective` drives. |
| `apps/demos/perspective-blotter` | Earlier standalone blotter demo from the milestone-1 work. |

The two new **provider types** are not a folder of their own: `stomp-perspective`
and `mock-perspective` are transports inside `host-data`, registered in
`registry.ts`, typed in `shared-types/dataProvider.ts`, and given editor UI by
`StompPerspectiveFields.tsx` in `widgets-react`.

---

## New directories

- `apps/demos/minimal-perspective-table/`
- `apps/demos/minimal-perspective-table/public/`
- `apps/demos/minimal-perspective-table/src/`
- `apps/demos/minimal-perspective-table/src/platform/`
- `apps/demos/perspective-blotter/`
- `apps/demos/perspective-blotter/src/`
- `apps/demos/perspective-ssrm-lab/`
- `apps/demos/perspective-ssrm-lab/public/`
- `apps/demos/perspective-ssrm-lab/public/alert-profiles/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/alerts/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/bulk-update/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/calculated-columns/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/column-groups/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/conditional-styling/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/editing/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/formatter-toolbar/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/formatting/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/live-updates/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/overview/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/plus-minus/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/quick-filters/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/renderers/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/shortcuts/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/smart-edit/`
- `apps/demos/perspective-ssrm-lab/public/lab-profiles/visual-excel/`
- `apps/demos/perspective-ssrm-lab/scripts/`
- `apps/demos/perspective-ssrm-lab/src/`
- `apps/demos/perspective-ssrm-lab/src/bootstrap/`
- `apps/demos/perspective-ssrm-lab/src/components/`
- `apps/demos/perspective-ssrm-lab/src/data/`
- `apps/demos/perspective-ssrm-lab/src/demo/`
- `apps/demos/perspective-ssrm-lab/src/guides/`
- `apps/demos/perspective-ssrm-lab/src/help/`
- `apps/demos/perspective-ssrm-lab/src/profiles/`
- `apps/demos/perspective-ssrm-lab/src/profiles/catalogs/`
- `apps/demos/perspective-ssrm-lab/src/seeds/`
- `apps/demos/perspective-ssrm-lab/src/tabs/`
- `apps/demos/perspective-ssrm-lab/src/tabs/altGrids/`
- `packages/data/host-data/src/runtime/perspective/`
- `packages/react-grid/perspective-grid/`
- `packages/react-grid/perspective-grid/harness/`
- `packages/react-grid/perspective-grid/scripts/`
- `packages/react-grid/perspective-grid/src/`

---

## packages/ — new files

#### `packages/data/host-data` — 14 new files

`src/runtime/perspective/` (7)

- `src/runtime/perspective/index.ts`
- `src/runtime/perspective/perspectiveHost.test.ts`
- `src/runtime/perspective/perspectiveHost.ts`
- `src/runtime/perspective/perspectiveSchema.test.ts`
- `src/runtime/perspective/perspectiveSchema.ts`
- `src/runtime/perspective/perspectiveTableFeed.test.ts`
- `src/runtime/perspective/perspectiveTableFeed.ts`

`src/runtime/providers/transports/` (4)

- `src/runtime/providers/transports/mockPerspective.test.ts`
- `src/runtime/providers/transports/mockPerspective.ts`
- `src/runtime/providers/transports/stompPerspective.test.ts`
- `src/runtime/providers/transports/stompPerspective.ts`

`src/runtime/worker/` (3)

- `src/runtime/worker/bootWorkerEntry.ts`
- `src/runtime/worker/hubHelpers.test.ts`
- `src/runtime/worker/perspectiveEntry.ts`

#### `packages/react-core/widgets-react` — 3 new files

`src/container/markets-grid-container/` (1)

- `src/container/markets-grid-container/perspectivePullPath.test.tsx`

`src/container/provider-editor/transports/` (2)

- `src/container/provider-editor/transports/StompPerspectiveFields.test.tsx`
- `src/container/provider-editor/transports/StompPerspectiveFields.tsx`

#### `packages/react-grid/grid` — 16 new files

`src/customizer/modules/alerts/runtime/` (1)

- `src/customizer/modules/alerts/runtime/alertsFullBookRescan.test.ts`

`src/customizer/modules/conditional-styling/runtime/` (1)

- `src/customizer/modules/conditional-styling/runtime/headerPainter.test.ts`

`src/customizer/modules/visual-excel/` (1)

- `src/customizer/modules/visual-excel/exportVisualExcel.test.ts`

`src/engine/` (13)

- `src/engine/PerspectiveMarketsGridSurface.test.tsx`
- `src/engine/PerspectiveMarketsGridSurface.tsx`
- `src/engine/PerspectiveStatusPanel.test.tsx`
- `src/engine/PerspectiveStatusPanel.tsx`
- `src/engine/PerspectiveStatusPanels.test.tsx`
- `src/engine/PerspectiveStatusPanels.tsx`
- `src/engine/perspectiveEngineHolder.ts`
- `src/engine/perspectiveSetFilterValues.test.ts`
- `src/engine/perspectiveSetFilterValues.ts`
- `src/engine/perspectiveStyleRules.test.ts`
- `src/engine/perspectiveStyleRules.ts`
- `src/engine/types.test.ts`
- `src/engine/useSsrmColumnDefs.test.ts`

#### `packages/react-grid/perspective-grid` — 73 new files

`./` (4)

- `ARCHITECTURE.md`
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`

`harness/` (15)

- `harness/blotter.html`
- `harness/blotter.mjs`
- `harness/customElementsShim.mjs`
- `harness/harness.css`
- `harness/hostClient.mjs`
- `harness/index.html`
- `harness/mockBook.mjs`
- `harness/plumbing.html`
- `harness/plumbing.mjs`
- `harness/pspHost.mjs`
- `harness/vite.config.mjs`
- `harness/wasmShare.mjs`
- `harness/wasmShareClient.mjs`
- `harness/wasmShareHost.mjs`
- `harness/wasmshare.html`

`scripts/` (34)

- `scripts/calcColumnProbe.mjs`
- `scripts/csrmPillsProbe.mjs`
- `scripts/deleteRaceProbe.mjs`
- `scripts/filterApplyProbe.mjs`
- `scripts/filterPillProbe.mjs`
- `scripts/grandTotalNodeProbe.mjs`
- `scripts/hostPullPathProbe.mjs`
- `scripts/multiWindowTimingProbe.mjs`
- `scripts/providerToTableProbe.mjs`
- `scripts/quickFilterProbe.mjs`
- `scripts/quickFilterProbe2.mjs`
- `scripts/quickFilterProbe3.mjs`
- `scripts/quickFilterProbe4.mjs`
- `scripts/rendererMemoryProbe.mjs`
- `scripts/safeViewProbe.mjs`
- `scripts/statusBarProbe.mjs`
- `scripts/stompFeedProbe.mjs`
- `scripts/stompSchemaProbe.mjs`
- `scripts/stompToTableProbe.mjs`
- `scripts/stressAttachRaceProbe.mjs`
- `scripts/stressCrashProbe.mjs`
- `scripts/stressGroupProbe.mjs`
- `scripts/stressLoadProbe.mjs`
- `scripts/stressScrollProbe.mjs`
- `scripts/stressVariantProbe.mjs`
- `scripts/stressVariantsSmokeProbe.mjs`
- `scripts/styleRuleProbe.mjs`
- `scripts/styleRuleProbe2.mjs`
- `scripts/styleRuleProbe3.mjs`
- `scripts/styleRuleProbe4.mjs`
- `scripts/variantRetentionProbe.mjs`
- `scripts/viewConfigProbe.mjs`
- `scripts/viewCostProbe.mjs`
- `scripts/workerCrashProbe.mjs`

`src/` (20)

- `src/assets.d.ts`
- `src/cellEdits.test.ts`
- `src/cellEdits.ts`
- `src/editTransactions.test.ts`
- `src/editTransactions.ts`
- `src/index.ts`
- `src/loadPerspectiveClient.test.ts`
- `src/loadPerspectiveClient.ts`
- `src/perspectiveDatasource.test.ts`
- `src/perspectiveDatasource.ts`
- `src/perspectiveRowEngine.test.ts`
- `src/perspectiveRowEngine.ts`
- `src/safeView.test.ts`
- `src/safeView.ts`
- `src/usePerspectiveTable.test.tsx`
- `src/usePerspectiveTable.ts`
- `src/viewConfig.test.ts`
- `src/viewConfig.ts`
- `src/viewManager.test.ts`
- `src/viewManager.ts`

---

## apps/ — new files

#### `apps/demos/minimal-perspective-table` — 17 new files

`./` (7)

- `README.md`
- `index.html`
- `package.json`
- `postcss.config.js`
- `tailwind.config.js`
- `tsconfig.json`
- `vite.config.ts`

`public/` (1)

- `public/app-config.json`

`src/` (6)

- `src/App.tsx`
- `src/bootstrap.ts`
- `src/globals.css`
- `src/main.tsx`
- `src/perspectiveProvider.ts`
- `src/vite-env.d.ts`

`src/platform/` (3)

- `src/platform/appDataBootstrap.ts`
- `src/platform/gridEventHandlers.ts`
- `src/platform/hooksMeta.ts`

#### `apps/demos/perspective-blotter` — 17 new files

`./` (8)

- `blotter.html`
- `index.html`
- `marketsgrid.html`
- `package.json`
- `postcss.config.js`
- `tailwind.config.js`
- `tsconfig.json`
- `vite.config.ts`

`src/` (9)

- `src/MarketsGridBlotter.tsx`
- `src/app.css`
- `src/blotter.ts`
- `src/feedConfig.ts`
- `src/globals.css`
- `src/hostClient.ts`
- `src/launcher.ts`
- `src/marketsGridEntry.tsx`
- `src/perspectiveWorker.ts`

#### `apps/demos/perspective-ssrm-lab` — 238 new files

`./` (7)

- `README.md`
- `index.html`
- `package.json`
- `postcss.config.js`
- `tailwind.config.js`
- `tsconfig.json`
- `vite.config.ts`

`public/` (1)

- `public/app-config.json`

`public/alert-profiles/` (10)

- `public/alert-profiles/README.md`
- `public/alert-profiles/alert-00-full-demo.json`
- `public/alert-profiles/alert-01-data-change.json`
- `public/alert-profiles/alert-02-relative-change.json`
- `public/alert-profiles/alert-03-row-change.json`
- `public/alert-profiles/alert-04-toast-channel.json`
- `public/alert-profiles/alert-05-badge-channel.json`
- `public/alert-profiles/alert-06-rate-limit.json`
- `public/alert-profiles/alert-07-debounce.json`
- `public/alert-profiles/alert-08-paused.json`

`public/lab-profiles/` (1)

- `public/lab-profiles/README.md`

`public/lab-profiles/alerts/` (9)

- `public/lab-profiles/alerts/alert-00-full-demo.json`
- `public/lab-profiles/alerts/alert-01-data-change.json`
- `public/lab-profiles/alerts/alert-02-relative-change.json`
- `public/lab-profiles/alerts/alert-03-row-change.json`
- `public/lab-profiles/alerts/alert-04-toast-channel.json`
- `public/lab-profiles/alerts/alert-05-badge-channel.json`
- `public/lab-profiles/alerts/alert-06-rate-limit.json`
- `public/lab-profiles/alerts/alert-07-debounce.json`
- `public/lab-profiles/alerts/alert-08-paused.json`

`public/lab-profiles/bulk-update/` (4)

- `public/lab-profiles/bulk-update/bu-00-curriculum.json`
- `public/lab-profiles/bulk-update/bu-01-text-column.json`
- `public/lab-profiles/bulk-update/bu-02-date-column.json`
- `public/lab-profiles/bulk-update/bu-03-confirm-low.json`

`public/lab-profiles/calculated-columns/` (6)

- `public/lab-profiles/calculated-columns/calc-00-all-virtual.json`
- `public/lab-profiles/calculated-columns/calc-01-pnl-stack.json`
- `public/lab-profiles/calculated-columns/calc-02-risk-ratios.json`
- `public/lab-profiles/calculated-columns/calc-03-spreads.json`
- `public/lab-profiles/calculated-columns/calc-04-overview-derivatives.json`
- `public/lab-profiles/calculated-columns/calc-05-traffic-light.json`

`public/lab-profiles/column-groups/` (5)

- `public/lab-profiles/column-groups/cg-00-pricing-pnl-open.json`
- `public/lab-profiles/column-groups/cg-01-all-collapsed.json`
- `public/lab-profiles/column-groups/cg-02-identifier-pricing.json`
- `public/lab-profiles/column-groups/cg-03-risk-yields.json`
- `public/lab-profiles/column-groups/cg-04-status-book.json`

`public/lab-profiles/conditional-styling/` (6)

- `public/lab-profiles/conditional-styling/cs-00-full-curriculum.json`
- `public/lab-profiles/conditional-styling/cs-01-flash-lab.json`
- `public/lab-profiles/conditional-styling/cs-02-diff-old-new.json`
- `public/lab-profiles/conditional-styling/cs-03-row-indicators.json`
- `public/lab-profiles/conditional-styling/cs-04-cell-paint.json`
- `public/lab-profiles/conditional-styling/cs-05-all-disabled.json`

`public/lab-profiles/editing/` (12)

- `public/lab-profiles/editing/ed-00-full-curriculum.json`
- `public/lab-profiles/editing/ed-01-smart-edit-only.json`
- `public/lab-profiles/editing/ed-02-bulk-update-text.json`
- `public/lab-profiles/editing/ed-03-bulk-update-date.json`
- `public/lab-profiles/editing/ed-04-plus-minus-nudges.json`
- `public/lab-profiles/editing/ed-05-shortcuts.json`
- `public/lab-profiles/editing/ed-06-history-suspend.json`
- `public/lab-profiles/editing/ed-07-preview-validation.json`
- `public/lab-profiles/editing/ed-08-custom-ops.json`
- `public/lab-profiles/editing/ed-09-confirm-thresholds.json`
- `public/lab-profiles/editing/ed-10-shortcuts-off-magnitude-on.json`
- `public/lab-profiles/editing/ed-11-all-disabled.json`

`public/lab-profiles/formatter-toolbar/` (6)

- `public/lab-profiles/formatter-toolbar/ft-00-painted-desk.json`
- `public/lab-profiles/formatter-toolbar/ft-01-typography.json`
- `public/lab-profiles/formatter-toolbar/ft-02-borders.json`
- `public/lab-profiles/formatter-toolbar/ft-03-pnl-palette.json`
- `public/lab-profiles/formatter-toolbar/ft-04-headers.json`
- `public/lab-profiles/formatter-toolbar/ft-05-blank-canvas.json`

`public/lab-profiles/formatting/` (6)

- `public/lab-profiles/formatting/fmt-00-full-showcase.json`
- `public/lab-profiles/formatting/fmt-01-excel-pnl.json`
- `public/lab-profiles/formatting/fmt-02-yields-spreads.json`
- `public/lab-profiles/formatting/fmt-03-pricing-precision.json`
- `public/lab-profiles/formatting/fmt-04-themed-overrides.json`
- `public/lab-profiles/formatting/fmt-05-global-defaults.json`

`public/lab-profiles/live-updates/` (4)

- `public/lab-profiles/live-updates/live-00-storm.json`
- `public/lab-profiles/live-updates/live-01-tick-only.json`
- `public/lab-profiles/live-updates/live-02-pnl-sign.json`
- `public/lab-profiles/live-updates/live-03-big-tick.json`

`public/lab-profiles/overview/` (6)

- `public/lab-profiles/overview/ov-00-kitchen-sink.json`
- `public/lab-profiles/overview/ov-01-trader-pnl.json`
- `public/lab-profiles/overview/ov-02-risk-desk.json`
- `public/lab-profiles/overview/ov-03-groups-collapsed.json`
- `public/lab-profiles/overview/ov-04-calc-heavy.json`
- `public/lab-profiles/overview/ov-05-minimal.json`

`public/lab-profiles/plus-minus/` (3)

- `public/lab-profiles/plus-minus/pm-00-global-step.json`
- `public/lab-profiles/plus-minus/pm-01-column-rules.json`
- `public/lab-profiles/plus-minus/pm-02-expression-gate.json`

`public/lab-profiles/quick-filters/` (8)

- `public/lab-profiles/quick-filters/qf-00-curriculum.json`
- `public/lab-profiles/quick-filters/qf-01-rates.json`
- `public/lab-profiles/quick-filters/qf-02-corp-ig.json`
- `public/lab-profiles/quick-filters/qf-03-hy.json`
- `public/lab-profiles/quick-filters/qf-04-energy.json`
- `public/lab-profiles/quick-filters/qf-05-losers.json`
- `public/lab-profiles/quick-filters/qf-06-and-stack.json`
- `public/lab-profiles/quick-filters/qf-07-capture.json`

`public/lab-profiles/renderers/` (6)

- `public/lab-profiles/renderers/render-00-full-showcase.json`
- `public/lab-profiles/renderers/render-01-pills.json`
- `public/lab-profiles/renderers/render-02-charts.json`
- `public/lab-profiles/renderers/render-03-pnl-motion.json`
- `public/lab-profiles/renderers/render-04-flags.json`
- `public/lab-profiles/renderers/render-05-plain-text.json`

`public/lab-profiles/shortcuts/` (3)

- `public/lab-profiles/shortcuts/sc-00-curriculum.json`
- `public/lab-profiles/shortcuts/sc-01-multiply-shortcut.json`
- `public/lab-profiles/shortcuts/sc-02-suspended.json`

`public/lab-profiles/smart-edit/` (5)

- `public/lab-profiles/smart-edit/se-00-curriculum.json`
- `public/lab-profiles/smart-edit/se-01-qty-only.json`
- `public/lab-profiles/smart-edit/se-02-shortcuts-off.json`
- `public/lab-profiles/smart-edit/se-03-confirm-low.json`
- `public/lab-profiles/smart-edit/se-04-history.json`

`public/lab-profiles/visual-excel/` (4)

- `public/lab-profiles/visual-excel/vx-00-full-showcase.json`
- `public/lab-profiles/visual-excel/vx-01-formatters-only.json`
- `public/lab-profiles/visual-excel/vx-02-styles-only.json`
- `public/lab-profiles/visual-excel/vx-03-module-off.json`

`scripts/` (2)

- `scripts/writeAlertProfileJson.ts`
- `scripts/writeLabProfileJson.ts`

`src/` (5)

- `src/App.tsx`
- `src/globals.css`
- `src/main.tsx`
- `src/platformBootstrap.ts`
- `src/vite-env.d.ts`

`src/bootstrap/` (1)

- `src/bootstrap/asLegacyDataServices.ts`

`src/components/` (7)

- `src/components/HelpSheet.tsx`
- `src/components/InspectorDrawer.tsx`
- `src/components/LabSidebarNav.tsx`
- `src/components/Markdown.tsx`
- `src/components/PerspectiveAttachNotice.tsx`
- `src/components/TabContainer.tsx`
- `src/components/ThemeToggle.tsx`

`src/data/` (15)

- `src/data/applyDelta.ts`
- `src/data/applyLabStreamDelta.test.ts`
- `src/data/applyLabStreamDelta.ts`
- `src/data/columns.ts`
- `src/data/perspectiveProvider.ts`
- `src/data/restartLabProvider.ts`
- `src/data/rowDiff.test.ts`
- `src/data/rowDiff.ts`
- `src/data/storage.ts`
- `src/data/stressColumns.test.ts`
- `src/data/stressColumns.ts`
- `src/data/types.ts`
- `src/data/useDebouncedValue.ts`
- `src/data/useLabDemoProfiles.ts`
- `src/data/useMockStream.ts`

`src/demo/` (6)

- `src/demo/LabDemoContext.tsx`
- `src/demo/LabScenarioRail.tsx`
- `src/demo/scenarios.ts`
- `src/demo/types.ts`
- `src/demo/useLabPerspectiveRows.ts`
- `src/demo/useLabRows.ts`

`src/guides/` (8)

- `src/guides/buildConfigBlocks.test.ts`
- `src/guides/buildConfigBlocks.ts`
- `src/guides/categories.ts`
- `src/guides/featureGuides.test.ts`
- `src/guides/featureGuides.ts`
- `src/guides/serializeConfig.test.ts`
- `src/guides/serializeConfig.ts`
- `src/guides/types.ts`

`src/help/` (20)

- `src/help/alerts.md`
- `src/help/bulk-update.md`
- `src/help/calculated-columns.md`
- `src/help/column-groups.md`
- `src/help/conditional-styling.md`
- `src/help/edit-history.md`
- `src/help/editing.md`
- `src/help/formatter-toolbar.md`
- `src/help/formatting.md`
- `src/help/index.ts`
- `src/help/live-updates.md`
- `src/help/overview.md`
- `src/help/plus-minus.md`
- `src/help/profiles.md`
- `src/help/quick-filters.md`
- `src/help/renderers.md`
- `src/help/shortcuts.md`
- `src/help/smart-edit.md`
- `src/help/stress-test.md`
- `src/help/visual-excel.md`

`src/profiles/` (4)

- `src/profiles/alertDemoCatalog.ts`
- `src/profiles/labProfileKit.ts`
- `src/profiles/presets.ts`
- `src/profiles/types.ts`

`src/profiles/catalogs/` (18)

- `src/profiles/catalogs/alertsCatalog.ts`
- `src/profiles/catalogs/bulkUpdateCatalog.ts`
- `src/profiles/catalogs/calculatedCatalog.ts`
- `src/profiles/catalogs/columnGroupsCatalog.ts`
- `src/profiles/catalogs/conditionalCatalog.ts`
- `src/profiles/catalogs/editingCatalog.ts`
- `src/profiles/catalogs/formatterToolbarCatalog.ts`
- `src/profiles/catalogs/formattingCatalog.ts`
- `src/profiles/catalogs/index.ts`
- `src/profiles/catalogs/liveCatalog.ts`
- `src/profiles/catalogs/overviewCatalog.ts`
- `src/profiles/catalogs/plusMinusCatalog.ts`
- `src/profiles/catalogs/quickFiltersCatalog.ts`
- `src/profiles/catalogs/renderersCatalog.ts`
- `src/profiles/catalogs/shortcutsCatalog.ts`
- `src/profiles/catalogs/smartEditCatalog.ts`
- `src/profiles/catalogs/stressCatalog.ts`
- `src/profiles/catalogs/visualExcelCatalog.ts`

`src/seeds/` (13)

- `src/seeds/alerts.ts`
- `src/seeds/calculatedColumns.ts`
- `src/seeds/columnCustomization.ts`
- `src/seeds/columnGroups.ts`
- `src/seeds/conditionalStyling.ts`
- `src/seeds/formatterToolbar.ts`
- `src/seeds/generalSettings.ts`
- `src/seeds/index.ts`
- `src/seeds/renderers.ts`
- `src/seeds/savedFilters.ts`
- `src/seeds/smartEdit.ts`
- `src/seeds/styleHelpers.ts`
- `src/seeds/types.ts`

`src/tabs/` (23)

- `src/tabs/AlertsTab.tsx`
- `src/tabs/BulkUpdateTab.tsx`
- `src/tabs/CalculatedColumnsTab.tsx`
- `src/tabs/ColumnGroupsTab.tsx`
- `src/tabs/ConditionalStylingTab.tsx`
- `src/tabs/EditingTab.tsx`
- `src/tabs/FormatterToolbarTab.tsx`
- `src/tabs/FormattingTab.tsx`
- `src/tabs/HomeTab.tsx`
- `src/tabs/LabFeatureTab.tsx`
- `src/tabs/LiveUpdatesTab.tsx`
- `src/tabs/OverviewTab.tsx`
- `src/tabs/PlainStressAgGrid.tsx`
- `src/tabs/PlusMinusTab.tsx`
- `src/tabs/ProfilesTab.tsx`
- `src/tabs/QuickFiltersTab.tsx`
- `src/tabs/RenderersTab.tsx`
- `src/tabs/ShortcutsTab.tsx`
- `src/tabs/SmartEditTab.tsx`
- `src/tabs/StressTestTab.tsx`
- `src/tabs/VisualExcelTab.tsx`
- `src/tabs/labFeatureConfigs.ts`
- `src/tabs/labStatusBar.ts`

`src/tabs/altGrids/` (4)

- `src/tabs/altGrids/PerspectiveStressGrid.tsx`
- `src/tabs/altGrids/altFieldColumns.ts`
- `src/tabs/altGrids/perspective-jsx.d.ts`
- `src/tabs/altGrids/wasm-url.d.ts`

---

## Modified files

### packages/ — 49 modified

**`packages/data/host-data`** (14)

- `package.json`
- `scripts/buildWorker.mjs`
- `src/runtime/client/SharedWorkerDataServicesClient.test.ts`
- `src/runtime/client/SharedWorkerDataServicesClient.ts`
- `src/runtime/protocol.ts`
- `src/runtime/providers/registry.ts`
- `src/runtime/providers/transports/stomp.test.ts`
- `src/runtime/providers/transports/stomp.ts`
- `src/runtime/worker/SharedWorkerDataServicesHub.test.ts`
- `src/runtime/worker/SharedWorkerDataServicesHub.ts`
- `src/runtime/worker/defaultEntry.ts`
- `src/runtime/worker/entry.ts`
- `src/runtime/worker/hubHelpers.ts`
- `src/runtime/worker/hubTypes.ts`

**`packages/react-core/widgets-react`** (10)

- `src/container/markets-grid-container/MarketsGridContainer.tsx`
- `src/container/markets-grid-container/applyProviderToGrid.test.ts`
- `src/container/markets-grid-container/applyProviderToGrid.ts`
- `src/container/markets-grid-container/captionPersistence.test.tsx`
- `src/container/markets-grid-container/providerConfigLoadingGate.test.tsx`
- `src/container/markets-grid-container/providerEditorDialog.test.tsx`
- `src/container/markets-grid-container/providerStaleState.test.tsx`
- `src/container/markets-grid-container/toolbarHistoricalMode.test.tsx`
- `src/container/provider-editor/DataProviderEditor.tsx`
- `src/container/provider-editor/tabs/ConnectionTab.tsx`

**`packages/react-grid/grid`** (22)

- `package.json`
- `src/customizer/modules/alerts/AlertsPanel.tsx`
- `src/customizer/modules/alerts/runtime/activate.ts`
- `src/customizer/modules/alerts/runtime/alertsFullBookRescan.ts`
- `src/customizer/modules/conditional-styling/runtime/headerPainter.ts`
- `src/customizer/modules/toolbar-date-settings/ToolbarDateSettingsPanel.tsx`
- `src/customizer/modules/visual-excel/exportVisualExcel.ts`
- `src/engine/resolveUseSsrm.test.ts`
- `src/engine/resolveUseSsrm.ts`
- `src/engine/ssrmCalcColumns.test.ts`
- `src/engine/ssrmExpressionCompile.test.ts`
- `src/engine/ssrmExpressionCompile.ts`
- `src/engine/types.ts`
- `src/engine/useSsrmColumnDefs.ts`
- `src/index.ts`
- `src/widget/MarketsGrid.tsx`
- `src/widget/MarketsGridHost.tsx`
- `src/widget/gridSurfaceOptions.ts`
- `src/widget/types.ts`
- `src/widget/useFilterModel.ts`
- `src/widget/useMarketsGridController.ts`
- `tsconfig.json`

**`packages/shared/engine`** (2)

- `src/customizer/modules/conditional-styling/transforms.ts`
- `src/platform/GridPlatform.ts`

**`packages/shared/shared-types`** (1)

- `src/dataProvider.ts`

### apps/ — 8 modified

**`apps`** (1)

- `package.json`

**`apps/demos/markets-grid-lab`** (6)

- `src/App.tsx`
- `src/demo/LabDemoContext.tsx`
- `src/guides/featureGuides.ts`
- `src/tabs/LabFeatureTab.tsx`
- `src/tabs/ProfilesTab.tsx`
- `src/tabs/StressTestTab.tsx`

**`apps/demos/star-demo`** (1)

- `src/views/BlottersMarketsGrid.tsx`

---

## Removed files

- `apps/demos/markets-grid-lab/src/components/UseSsrmToggle.tsx`

---

## Outside `packages/` and `apps/`

Listed for completeness — the question was scoped to the two trees above.

- `docs/PERSPECTIVE_GRID_NEXT_SESSION.md` — new
- `docs/PERSPECTIVE_GRID_PARITY_WORKLOG.md` — new
- `docs/perspective-grid-issuetobefixed.md` — new
- `e2e/perspective-surface.spec.ts` — new
- `playwright.perspective.config.ts` — new
- `CLAUDE.md` — modified
- `docs/E2E_STATUS.md` — modified
- `docs/current-features.md` — modified
- `e2e/README.md` — modified
- `package.json` — modified
- `scripts/staruiConsumerAliases.mjs` — modified
