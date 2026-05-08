# PR-8 — Extract `core/src/{ui,hooks,modules}` into `@starui/grid-react`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal.** Take the ~24,117 LOC of React content currently living under
`packages/shared/core/src/{ui,hooks,modules}/` and lift it into a
brand-new package `packages/react/widgets/grid-react/`
(`@starui/grid-react`). After this PR `@starui/core` is vanilla-only
(no React peer-dep), all module panels + UI primitives + React hooks
live in `@starui/grid-react`, and `@starui/markets-grid` imports both
packages — vanilla helpers from `@starui/core`, React surfaces from
`@starui/grid-react`.

This is the highest-risk Task in the 12-Task monorepo refactor. It is
spelled out at every step because the implementer (a fresh subagent
with zero prior context) must NOT make judgment calls.

---

## ⚠ Paramount constraint — applies to every step

**Zero loss of features, functionality, look-and-feel, or behavior.**
This overrides every other consideration in this plan. Cleaner package
layout is the goal; preserving every end-user behavior is the
constraint.

If a step cannot satisfy this constraint as written, **the step is
wrong** — pause, consult the user, do not paper over with TODOs or
"fix later" notes.

---

## Verification protocol (before-and-after)

The Task starts with a baseline capture and ends with a parity check.

### Pre-task baseline

```bash
cd /Users/develop/wfh/marketsui-platform
git status                                                    # MUST be clean
git checkout main && git pull
git checkout -b refactor/pr-08-extract-grid-react

# Capture baseline
npx turbo run typecheck build test 2>&1 | tee /tmp/pr08-before.log
grep -E "Tests|passing|failing|Test Files" /tmp/pr08-before.log | tail -20
npx turbo run e2e 2>&1 | tee /tmp/pr08-before-e2e.log || true
```

**Baseline counts (record exact numbers from the log):**
- Vitest passing: ≥ 653 (Task-9 baseline; the broader 298 mentioned
  in the top-level plan is the pre-Task-1 figure — by this Task the
  suite has grown).
- Playwright passing: ≥ 195 / 214 (19 pre-existing failures).
- `typecheck` exit code: 0.
- `build` exit code: 0.

### Post-task parity check (run before final commit)

```bash
npx turbo run typecheck build test 2>&1 | tee /tmp/pr08-after.log
diff <(grep -E "Tests|passing|failing|Test Files" /tmp/pr08-before.log) \
     <(grep -E "Tests|passing|failing|Test Files" /tmp/pr08-after.log)
npx turbo run e2e 2>&1 | tee /tmp/pr08-after-e2e.log || true
```

**Acceptance gate (binary):**
- Vitest passing count ≥ baseline.
- Playwright passing count ≥ baseline. NEVER WORSE.
- `typecheck` exit code = 0.
- `build` exit code = 0.

If any gate fails: **stop, do not commit, investigate**.

### Visual / interactive parity (mandatory)

```bash
# Terminal A
cd apps/demo-react && npm run dev
# Terminal B
cd apps/markets-ui-react-reference && npm run dev
```

Per-module check matrix in §7. **The user is the visual-parity
authority. If anything looks off, stop and ask.**

---

## §1 Inventory of the to-be-moved subdirs

Snapshot taken from the working tree at the time this plan was
written. LOC includes test files; LOC numbers are line counts of the
source files as they sit on disk.

### `packages/shared/core/src/ui/` — 9,130 LOC, 65 files

| Subpath | LOC | Notes |
|---|---:|---|
| `ui/ColorPicker/CompactColorField.tsx` | 396 | Public surface |
| `ui/ColorPicker/index.ts` | 14 | Barrel |
| `ui/ExpressionEditor/ExpressionEditor.tsx` | 27 | Public surface |
| `ui/ExpressionEditor/ExpressionEditorInner.tsx` | 408 | Internal Monaco mount |
| `ui/ExpressionEditor/FallbackInput.tsx` | 110 | Internal |
| `ui/ExpressionEditor/HelpOverlay.tsx` | 167 | Internal |
| `ui/ExpressionEditor/Palette.tsx` | 228 | Internal |
| `ui/ExpressionEditor/completions.ts` | 248 | Internal |
| `ui/ExpressionEditor/diagnostics.ts` | 89 | Internal |
| `ui/ExpressionEditor/index.ts` | 2 | Barrel |
| `ui/ExpressionEditor/language.ts` | 128 | Internal |
| `ui/ExpressionEditor/types.ts` | 50 | Internal types |
| `ui/FormatterPicker/ExcelReferencePopover.tsx` | 173 | Internal |
| `ui/FormatterPicker/FormatterPicker.tsx` | 1091 | Public surface (largest single file) |
| `ui/FormatterPicker/excelExamples.ts` | 114 | Internal |
| `ui/FormatterPicker/index.ts` | 10 | Barrel |
| `ui/FormatterPicker/presetsForDataType.ts` | 451 | Internal |
| `ui/PopoutPortal.test.tsx` | 344 | TEST — moves with code |
| `ui/PopoutPortal.tsx` | 650 | Public surface |
| `ui/Poppable.tsx` | 228 | Public surface |
| `ui/PortalContainer.tsx` | 61 | Public surface |
| `ui/SettingsPanel/Cockpit.tsx` | 226 | Internal cockpit shell |
| `ui/SettingsPanel/CockpitList.tsx` | 91 | Internal cmdk wrap |
| `ui/SettingsPanel/DirtyDot.tsx` | 46 | Public surface |
| `ui/SettingsPanel/FigmaPanelSection.tsx` | 90 | Public surface |
| `ui/SettingsPanel/GhostIcon.tsx` | 71 | Public surface |
| `ui/SettingsPanel/IconInput.tsx` | 153 | Public surface |
| `ui/SettingsPanel/ItemCard.tsx` | 137 | Public surface |
| `ui/SettingsPanel/ObjectTitleRow.tsx` | 42 | Public surface |
| `ui/SettingsPanel/PairRow.tsx` | 36 | Public surface |
| `ui/SettingsPanel/PanelChrome.tsx` | 41 | Public surface |
| `ui/SettingsPanel/PillToggleGroup.tsx` | 80 | Public surface |
| `ui/SettingsPanel/SubLabel.tsx` | 37 | Public surface |
| `ui/SettingsPanel/TabStrip.tsx` | 101 | Public surface |
| `ui/SettingsPanel/TitleInput.tsx` | 44 | Public surface |
| `ui/SettingsPanel/index.ts` | 55 | Barrel — also exports `Caps`, `Mono`, `SharpBtn`, `TGroup`, `TBtn`, `TDivider`, `Band`, `MetaCell`, `Stepper` (defined inline) |
| `ui/StyleEditor/BorderStyleEditor.tsx` | 408 | Public surface |
| `ui/StyleEditor/StyleEditor.tsx` | 128 | Public surface |
| `ui/StyleEditor/index.ts` | 27 | Barrel |
| `ui/StyleEditor/sections/BorderSection.tsx` | 39 | Public surface |
| `ui/StyleEditor/sections/ColorSection.tsx` | 52 | Public surface |
| `ui/StyleEditor/sections/FormatSection.tsx` | 132 | Public surface |
| `ui/StyleEditor/sections/TextSection.tsx` | 157 | Public surface |
| `ui/StyleEditor/types.ts` | 42 | Public types |
| `ui/format-editor/FormatColorPicker.tsx` | 414 | Public surface |
| `ui/format-editor/FormatDropdown.tsx` | 140 | Public surface |
| `ui/format-editor/FormatPopover.tsx` | 146 | Public surface |
| `ui/format-editor/index.ts` | 24 | Barrel |
| `ui/format-editor/popoverStack.ts` | 29 | Internal helper (`registerPopoverRoot`, `clickIsInsideAnyOpenPopover`) |
| `ui/format-editor/types.ts` | 44 | Public types |
| `ui/icons.tsx` | 48 | Internal icons |
| `ui/shadcn/alert-dialog.tsx` | 214 | Public surface |
| `ui/shadcn/button.tsx` | 41 | Public surface |
| `ui/shadcn/color-picker.tsx` | 94 | Public surface (`ColorPicker`, `ColorPickerPopover`) |
| `ui/shadcn/ghost-icon-button.test.tsx` | 99 | TEST — moves with code |
| `ui/shadcn/ghost-icon-button.tsx` | 156 | Public surface |
| `ui/shadcn/index.ts` | 31 | Barrel |
| `ui/shadcn/input.tsx` | 24 | Public surface |
| `ui/shadcn/label.tsx` | 16 | Public surface |
| `ui/shadcn/popover.tsx` | 139 | Public surface — `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`, `PopoverClose`, `PopoverCompat` |
| `ui/shadcn/select.tsx` | 49 | Public surface (native-select wrap) |
| `ui/shadcn/separator.tsx` | 17 | Public surface |
| `ui/shadcn/switch.tsx` | 29 | Public surface |
| `ui/shadcn/textarea.tsx` | 36 | Public surface |
| `ui/shadcn/toggle-group.tsx` | 89 | Public surface |
| `ui/shadcn/tooltip.tsx` | 21 | Public surface |
| `ui/shadcn/utils.ts` | 6 | `cn` re-export |

### `packages/shared/core/src/hooks/` — 1,136 LOC, 13 files

| Subpath | LOC | Notes |
|---|---:|---|
| `hooks/GridContext.ts` | 20 | Internal context |
| `hooks/GridProvider.tsx` | 21 | Public — `GridProvider`, `useGridPlatform` |
| `hooks/index.ts` | 16 | Barrel |
| `hooks/useDirty.test.tsx` | 106 | TEST |
| `hooks/useDirty.ts` | 72 | Public — `useDirty`, `useDirtyCount`, `DirtyHandle` |
| `hooks/useGridApi.ts` | 25 | Public — `useGridApi`, `useGridEvent` |
| `hooks/useGridColumns.test.tsx` | 176 | TEST |
| `hooks/useGridColumns.ts` | 104 | Public — `useGridColumns`, `GridColumnInfo` |
| `hooks/useModuleDraft.test.tsx` | 151 | TEST |
| `hooks/useModuleDraft.ts` | 156 | Public — `useModuleDraft`, types |
| `hooks/useModuleState.ts` | 45 | Public — `useModuleState` |
| `hooks/useProfileManager.ts` | 153 | Public — `useProfileManager`, `UseProfileManagerResult` |
| `hooks/useUndoRedo.ts` | 91 | Public — `useUndoRedo`, `UseUndoRedoResult` |

### `packages/shared/core/src/modules/` — 13,851 LOC, 65 files

| Subpath | LOC | Notes |
|---|---:|---|
| `modules/calculated-columns/CalculatedColumnsPanel.test.tsx` | 165 | TEST |
| `modules/calculated-columns/CalculatedColumnsPanel.tsx` | 374 | React panel |
| `modules/calculated-columns/index.ts` | 212 | Barrel + module def + types |
| `modules/calculated-columns/state.ts` | 46 | Vanilla state |
| `modules/calculated-columns/virtualColumn.ts` | 148 | Mostly vanilla |
| `modules/column-customization/ColumnSettingsPanel.test.tsx` | 182 | TEST |
| `modules/column-customization/ColumnSettingsPanel.tsx` | 571 | React panel |
| `modules/column-customization/editors/CellEditorEditor.tsx` | 544 | React editor |
| `modules/column-customization/editors/CellStyleBand.tsx` | 23 | React |
| `modules/column-customization/editors/ColumnEditorHeader.tsx` | 61 | React |
| `modules/column-customization/editors/ColumnMetaStrip.tsx` | 39 | React |
| `modules/column-customization/editors/FilterEditor.tsx` | 454 | React editor |
| `modules/column-customization/editors/HeaderBand.tsx` | 45 | React |
| `modules/column-customization/editors/HeaderStyleBand.tsx` | 26 | React |
| `modules/column-customization/editors/LayoutBand.tsx` | 103 | React |
| `modules/column-customization/editors/Row.tsx` | 42 | React (CC-internal `Row`) |
| `modules/column-customization/editors/RowGroupingEditor.tsx` | 291 | React |
| `modules/column-customization/editors/TemplatePicker.tsx` | 50 | React |
| `modules/column-customization/editors/TemplatesBand.tsx` | 120 | React |
| `modules/column-customization/editors/TriStateToggle.tsx` | 39 | React |
| `modules/column-customization/editors/ValueFormatBand.tsx` | 30 | React |
| `modules/column-customization/editors/styleAdapter.ts` | 97 | Vanilla helper |
| `modules/column-customization/formattingActions.test.ts` | 502 | TEST (vanilla) |
| `modules/column-customization/formattingActions.ts` | 544 | Vanilla actions |
| `modules/column-customization/index.ts` | 193 | Barrel + module def |
| `modules/column-customization/state.ts` | 181 | Vanilla state + types |
| `modules/column-customization/transforms.test.ts` | 113 | TEST (vanilla) |
| `modules/column-customization/transforms.ts` | 611 | Vanilla |
| `modules/column-groups/ColumnGroupsPanel.test.tsx` | 143 | TEST |
| `modules/column-groups/ColumnGroupsPanel.tsx` | 669 | React panel |
| `modules/column-groups/composeGroups.ts` | 292 | Vanilla |
| `modules/column-groups/index.ts` | 174 | Barrel + module def |
| `modules/column-groups/state.ts` | 136 | Vanilla |
| `modules/column-groups/treeOps.test.ts` | 162 | TEST (vanilla) |
| `modules/column-groups/treeOps.ts` | 180 | Vanilla |
| `modules/column-templates/index.ts` | 66 | Barrel |
| `modules/column-templates/resolveTemplates.ts` | 137 | Vanilla |
| `modules/column-templates/snapshotTemplate.test.ts` | 727 | TEST (vanilla) |
| `modules/column-templates/snapshotTemplate.ts` | 383 | Vanilla |
| `modules/column-templates/state.ts` | 94 | Vanilla |
| `modules/conditional-styling/ConditionalStylingPanel.test.tsx` | 191 | TEST |
| `modules/conditional-styling/ConditionalStylingPanel.tsx` | 683 | React panel |
| `modules/conditional-styling/editor/ColumnPickerMulti.tsx` | 103 | React |
| `modules/conditional-styling/editor/ExpressionBand.tsx` | 81 | React |
| `modules/conditional-styling/editor/FlashBand.tsx` | 109 | React |
| `modules/conditional-styling/editor/RuleEditorHeader.tsx` | 53 | React |
| `modules/conditional-styling/editor/RuleMetaStrip.tsx` | 103 | React |
| `modules/conditional-styling/editor/TargetColumnsBand.tsx` | 17 | React |
| `modules/conditional-styling/editor/ValueFormatterBand.tsx` | 51 | React |
| `modules/conditional-styling/index.ts` | 266 | Barrel + module def |
| `modules/conditional-styling/indicatorIcons.ts` | 256 | Mostly vanilla (icon defs use lucide React types) |
| `modules/conditional-styling/state.ts` | 119 | Vanilla |
| `modules/conditional-styling/styleBridge.ts` | 126 | Vanilla |
| `modules/conditional-styling/transforms.ts` | 292 | Vanilla |
| `modules/general-settings/GridOptionsPanel.test.tsx` | 173 | TEST |
| `modules/general-settings/GridOptionsPanel.tsx` | 193 | React panel |
| `modules/general-settings/fieldSchema.tsx` | 454 | React (uses Select/Switch from shadcn) |
| `modules/general-settings/gridOptionsSchema.tsx` | 387 | React schema defs |
| `modules/general-settings/index.ts` | 271 | Barrel + module def |
| `modules/general-settings/state.ts` | 358 | Vanilla |
| `modules/grid-state/helpers.ts` | 331 | Vanilla (uses ag-grid types) |
| `modules/grid-state/index.ts` | 90 | Barrel + module def |
| `modules/grid-state/state.ts` | 42 | Vanilla |
| `modules/saved-filters/index.ts` | 86 | Vanilla module def + types |
| `modules/toolbar-visibility/index.ts` | 47 | Vanilla module def + types |

**Grand totals:** 9,130 + 1,136 + 13,851 = **24,117 LOC across 143
files** (the 24,259 in the top-level plan was an older snapshot —
deltas are the post-PR-1.5 dead-code sweep).

**Test files moving with the code: 14.** They live next to their
units and import them via relative `./` paths, so the move requires
no test-import edits beyond the cross-package back-edges.

---

## §2 Public surface of `@starui/core` today

Source of truth: `packages/shared/core/src/index.ts` (492 lines).
Below maps every export block to its origin and to its post-PR-8
home.

### A. Stays in `@starui/core` (vanilla-only after this PR)

These exports are NOT touched by PR-8. They re-export from
`./platform`, `./store`, `./persistence`, `./profiles`, `./expression`,
`./security`, `./css`, `./colDef`, `./history`, `./utils`, `./types`.

| Block | Symbols | Source path |
|---|---|---|
| Platform runtime | `GridPlatform`, `EventBus`, `topoSortModules`, `ApiHub`, `ResourceScope`, `CssInjector`, `PipelineRunner` + ~20 type exports | `./platform` |
| Store | `createGridStore`, `startAutoSave`, `CreateStoreOptions`, `AutoSaveHandle`, `AutoSaveOptions` | `./store/createGridStore`, `./store/autosave` |
| Persistence | `MemoryAdapter`, `DexieAdapter`, `RESERVED_DEFAULT_PROFILE_ID`, `activeProfileKey`, `ProfileSnapshot`, `StorageAdapter` | `./persistence` |
| Profiles | `ProfileManager` + types (`ActiveIdSource`, `ProfileManagerOptions`, `ProfileManagerState`, `ProfileMeta`, `ExportedProfilePayload`) | `./profiles` |
| Security | `configureExpressionPolicy`, `getExpressionPolicy`, `ExpressionPolicy`, `ExpressionPolicyMode`, `ExpressionPolicyViolation` | `./security/expressionPolicy` |
| History | `HistoryStack`, `HistoryStackOptions` | `./history/HistoryStack` |
| Expression engine | `ExpressionEngine`, `tokenize`, `parse`, `Evaluator`, `tryCompileToAgString`, `migrateExpressionSyntax`, `migrateExpressionsInObject`, plus 4 types | `./expression`, `./expression/migrate` |
| Open-fin util | `openFinWindowOpener`, `isOpenFin` | `./utils/openFin` |
| Common types | `CellStyleProperties`, `ThemeAwareStyle` | `./types/common` |
| CSS tokens | `cockpitCSS`, `COCKPIT_STYLE_ID`, `injectEditorStyles`, plus aliases `v2SheetCSS`, `V2_SHEET_STYLE_ID` | `./css` |
| ColDef helpers | `valueFormatterFromTemplate`, `excelFormatter`, `excelFormatColorResolver`, `isValidExcelFormat`, `tickFormatter`, `presetToExcelFormat`, `cellStyleToAgStyle`, plus types `BorderSpec`, `CellStyleOverrides`, `BaseColumnAssignment`, `ColumnDataType`, `PresetId`, `TickToken`, `ValueFormatterTemplate` | `./colDef` |

### B. Moves out of `@starui/core` and into `@starui/grid-react`

#### B.1 React bindings (from `./hooks`)

| Symbol | Current source | Target source |
|---|---|---|
| `GridProvider` | `core/src/hooks/GridProvider.tsx` | `grid-react/src/hooks/GridProvider.tsx` |
| `useGridPlatform` | `core/src/hooks/GridProvider.tsx` | same |
| `useModuleState` | `core/src/hooks/useModuleState.ts` | `grid-react/src/hooks/useModuleState.ts` |
| `useGridApi`, `useGridEvent` | `core/src/hooks/useGridApi.ts` | `grid-react/src/hooks/useGridApi.ts` |
| `useProfileManager` | `core/src/hooks/useProfileManager.ts` | `grid-react/src/hooks/useProfileManager.ts` |
| `useDirty`, `useDirtyCount`, `DirtyHandle` | `core/src/hooks/useDirty.ts` | `grid-react/src/hooks/useDirty.ts` |
| `useGridColumns`, `GridColumnInfo` | `core/src/hooks/useGridColumns.ts` | `grid-react/src/hooks/useGridColumns.ts` |
| `useModuleDraft`, types | `core/src/hooks/useModuleDraft.ts` | `grid-react/src/hooks/useModuleDraft.ts` |
| `useUndoRedo`, `UseUndoRedoResult` | `core/src/hooks/useUndoRedo.ts` | `grid-react/src/hooks/useUndoRedo.ts` |
| `GridCoreLike` (and aliases `GridCore`, `UseProfileManagerResult`) | `core/src/hooks/GridContext.ts` + `useProfileManager.ts` | re-exported from `grid-react/src/hooks/index.ts` |

All become public re-exports from `grid-react/src/index.ts`.

#### B.2 Settings-panel primitives (from `./ui/SettingsPanel`)

`DirtyDot`, `LedBar`, `GhostIcon`, `SubLabel`, `IconInput`,
`PillToggleGroup`, `PillToggleBtn`, `PairRow`, `FigmaPanelSection`,
`ItemCard`, `ObjectTitleRow`, `TitleInput`, `PanelChrome`,
`TabStrip`, `Caps`, `Mono`, `SharpBtn`, `TGroup`, `TBtn`,
`TDivider`, `Band`, `MetaCell`, `Stepper`, plus `*Props` and
`TabItem`, `SharpBtnVariant` types.

Source: `core/src/ui/SettingsPanel/*` (and inline in
`SettingsPanel/index.ts` for `Caps`/`Mono`/`SharpBtn`/`TGroup`/`TBtn`/
`TDivider`/`Band`/`MetaCell`/`Stepper`).
Target: `grid-react/src/ui/SettingsPanel/*` (path-preserving move).
Public.

#### B.3 shadcn primitives (from `./ui/shadcn`)

`Button`, `buttonVariants`, `ButtonProps`,
`GhostIconButton` + types,
`Input`, `InputProps`, `Textarea`, `TextareaProps`,
`Select`, `Switch`,
`Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor`,
`PopoverClose`, `PopoverCompat`,
`AlertDialog` + the 10 sub-exports,
`Tooltip`, `Separator`, `Label`,
`cn`,
`ToggleGroup`, `ToggleGroupItem`,
`ColorPicker`, `ColorPickerPopover`.

Source: `core/src/ui/shadcn/*`.
Target: `grid-react/src/ui/shadcn/*` (path-preserving move).
Public.

> **NOTE — these are NOT byte-equivalent to `@starui/ui`'s shadcn
> components.** See §5 for the duplication-resolution decision.

#### B.4 StyleEditor + ColorPicker + FormatterPicker (from `./ui/...`)

| Symbol | Current source | Target source |
|---|---|---|
| `StyleEditor`, `TextSection`, `ColorSection`, `BorderSection`, `FormatSection`, `BorderStyleEditor`, plus types (`StyleEditorProps`, `StyleEditorValue`, `StyleEditorSection`, `StyleEditorVariant`, `StyleEditorDataType`, `TextAlign`, `FontWeight`, `BorderStyleEditorProps`, `BordersValue`) | `core/src/ui/StyleEditor/*` | `grid-react/src/ui/StyleEditor/*` |
| `CompactColorField`, `CompactColorFieldProps` | `core/src/ui/ColorPicker/*` | `grid-react/src/ui/ColorPicker/*` |
| `FormatterPicker`, `inferPickerDataType`, `presetsForDataType`, `findMatchingPreset`, `defaultSampleValue`, `EXCEL_EXAMPLES`, plus 5 types | `core/src/ui/FormatterPicker/*` | `grid-react/src/ui/FormatterPicker/*` |

#### B.5 Format-editor primitives (from `./ui/format-editor`)

`FormatPopover`, `FormatDropdown`, `FormatColorPicker`,
`registerPopoverRoot`, `clickIsInsideAnyOpenPopover`,
`EDGE_ORDER`, `defaultSideSpec`, `makeDefaultSides`, plus types
(`BorderSide`, `BorderStyle`, `BorderMode`, `SideSpec`).

Source: `core/src/ui/format-editor/*`.
Target: `grid-react/src/ui/format-editor/*` (path-preserving).

#### B.6 ExpressionEditor (from `./ui/ExpressionEditor`)

`ExpressionEditor`, `ExpressionEditorProps`, `ExpressionEditorHandle`.

Source: `core/src/ui/ExpressionEditor/*`.
Target: `grid-react/src/ui/ExpressionEditor/*`.

> Note: PR-1.5 already dropped the `LANGUAGE_ID` and
> `defaultFunctionsProvider` exports.

#### B.7 Popout window (from `./ui`)

`PopoutPortal`, `PopoutPortalProps`, `Poppable`, `PoppableProps`,
`PoppableHandle`, `PoppableRenderProps`, `PopoutButtonProps`,
`PortalContainerProvider`, `usePortalContainer`,
`PortalContainerProviderProps`.

Source: `core/src/ui/PopoutPortal.tsx`, `Poppable.tsx`,
`PortalContainer.tsx`, plus `PopoutPortal.test.tsx`.
Target: `grid-react/src/ui/*` (path-preserving — kept at `ui/`
top-level since they're not in a subdir).

#### B.8 Modules (from `./modules`)

| Module | Public exports (state, ID, INITIAL_*, module def, types) | Current source | Target source |
|---|---|---|---|
| general-settings | `generalSettingsModule`, `GENERAL_SETTINGS_MODULE_ID`, `INITIAL_GENERAL_SETTINGS`, `GeneralSettingsState` | `core/src/modules/general-settings/*` | `grid-react/src/modules/general-settings/*` |
| column-templates | `columnTemplatesModule`, `COLUMN_TEMPLATES_MODULE_ID`, `INITIAL_COLUMN_TEMPLATES`, `resolveTemplates`, `snapshotTemplate`, `snapshotTemplateUpdate`, `pickTemplateFields`, `addTemplateReducer`, `removeTemplateReducer`, `updateTemplateReducer`, `renameTemplateReducer`, plus types `ColumnTemplate`, `ColumnTemplatesState`, `RowGroupingTemplate`, `SnapshotTemplateDeps` | `core/src/modules/column-templates/*` | `grid-react/src/modules/column-templates/*` |
| column-customization | `columnCustomizationModule`, `COLUMN_CUSTOMIZATION_MODULE_ID`, `INITIAL_COLUMN_CUSTOMIZATION`, `applyFilterConfigToColDef`, `applyRowGroupingConfigToColDef`, `useAppDataLookup`, `useAppDataProviders`, `useAppDataKeys`, `parseValuesSource`, `overrideKey`, `stripUndefined`, `mergeOverrides`, plus 14 reducers (`writeOverridesReducer`, `applyTypographyReducer`, `applyColorsReducer`, `applyAlignmentReducer`, `applyBordersReducer`, `clearAllBordersReducer`, `applyHeaderNameReducer`, `applyEditableReducer`, `applyCellEditorKindReducer`, `applyCellEditorValuesReducer`, `applyFilterPrimaryKindReducer`, `applyFloatingFilterReducer`, `applyFormatterReducer`, `applyTemplateToColumnsReducer`, `removeTemplateRefFromAssignmentsReducer`, `clearAllStylesReducer`, `clearAllStylesInProfileReducer`), plus types (`TargetKind`, `ColumnAssignment`, `ColumnCustomizationAssignment`, `ColumnCustomizationState`, `ColumnFilterConfig`, `RowGroupingConfig`, `FilterKind`, `CellEditorKind`, `ColumnCellEditorConfig`, `AggFuncName`, `SetFilterOptions`, `MultiFilterEntry`) | `core/src/modules/column-customization/*` | `grid-react/src/modules/column-customization/*` |
| conditional-styling | `conditionalStylingModule`, `CONDITIONAL_STYLING_MODULE_ID`, `INITIAL_CONDITIONAL_STYLING`, `INDICATOR_ICONS`, `findIndicatorIcon`, `toStyleEditorValue`, `fromStyleEditorValue`, plus types (`ConditionalRule`, `ConditionalStylingState`, `FlashConfig`, `FlashTarget`, `IndicatorPosition`, `IndicatorTarget`, `RuleIndicator`, `RuleScope`, `IndicatorIconDef`) | `core/src/modules/conditional-styling/*` | `grid-react/src/modules/conditional-styling/*` |
| calculated-columns | `calculatedColumnsModule`, `CALCULATED_COLUMNS_MODULE_ID`, `INITIAL_CALCULATED_COLUMNS`, plus types (`CalculatedColumnsState`, `VirtualColumnDef`) | `core/src/modules/calculated-columns/*` | `grid-react/src/modules/calculated-columns/*` |
| saved-filters | `savedFiltersModule`, `SAVED_FILTERS_MODULE_ID`, `INITIAL_SAVED_FILTERS`, `SavedFiltersState` | `core/src/modules/saved-filters/index.ts` (vanilla) | `grid-react/src/modules/saved-filters/index.ts` |
| toolbar-visibility | `toolbarVisibilityModule`, `TOOLBAR_VISIBILITY_MODULE_ID`, `INITIAL_TOOLBAR_VISIBILITY`, `ToolbarVisibilityState` | `core/src/modules/toolbar-visibility/index.ts` (vanilla) | `grid-react/src/modules/toolbar-visibility/index.ts` |
| grid-state | `gridStateModule`, `GRID_STATE_MODULE_ID`, `GRID_STATE_SCHEMA_VERSION`, `INITIAL_GRID_STATE`, `captureGridState`, `applyGridState`, `captureGridStateInto`, plus types (`GridStateState`, `SavedGridState`) | `core/src/modules/grid-state/*` | `grid-react/src/modules/grid-state/*` |
| column-groups | `columnGroupsModule`, `COLUMN_GROUPS_MODULE_ID`, `INITIAL_COLUMN_GROUPS`, `composeGroups`, `collectGroupIds`, `collectAssignedColIds`, plus types (`ColumnGroupsState`, `ColumnGroupNode`, `ColumnGroupChild`, `GroupChildShow`, `GroupHeaderStyle`, `GroupHeaderBorderSpec`) | `core/src/modules/column-groups/*` | `grid-react/src/modules/column-groups/*` |

> **Caveat about vanilla modules** (`saved-filters`,
> `toolbar-visibility`, partly `grid-state`): they have NO React
> content and could in principle stay in `@starui/core`. The plan
> moves them to `@starui/grid-react` anyway because (a) the entire
> `modules/` directory is moved as a unit per the spec; (b)
> `markets-grid` is the only consumer of these modules and it
> already imports `@starui/grid-react`; (c) splitting one module
> tree across two packages adds a confusing back-edge for zero
> benefit. If the user objects, the path forward is documented in
> §10.R3.

---

## §3 Per-symbol move list (consolidated)

The full inventory in §2 already maps every symbol; the table below
is a structural sanity check showing each symbol stays public.

**Total moved exports, broken down:**
- React hooks: 11 runtime exports + 6 type exports (incl. aliases)
- SettingsPanel primitives: 23 components + 22 type exports
- shadcn primitives: 27 component exports + 4 type exports
- StyleEditor / ColorPicker / FormatterPicker: 12 components + 14 type exports
- format-editor primitives: 8 runtime exports + 4 type exports
- ExpressionEditor: 1 component + 2 type exports
- Popout / Poppable / PortalContainer: 5 components + 5 type exports
- Modules: 9 modules × ~10–25 exports each ≈ 130 runtime + type exports

**Approximate total moved exports: ~270.**

**Every symbol stays publicly visible** (no internal-only collapse).
The only exceptions — exports already pruned by PR-1.5 — are noted
in the index source comments and are NOT regressed by this PR.

---

## §4 Consumer-by-consumer repoint table

Source command (re-run before executing):
```bash
grep -rn "@starui/core" packages apps --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v dist | grep -v node_modules
```

Each consumer is bucketed by what categories of symbol it imports:

- **(a) vanilla-only** — keeps importing from `@starui/core`
- **(b) moved-React-only** — switch fully to `@starui/grid-react`
- **(c) mixed** — split the import statement (preferred) or keep both deps with two import statements

### packages/

| File | Bucket | Moved-symbols imported | Vanilla-symbols imported | Action |
|---|---|---|---|---|
| `packages/shared/services/config-service/src/profileStorage.ts` | (a) | – | `ProfileSnapshot`, `StorageAdapter` (type-only) | No change |
| `packages/shared/services/config-service/src/profileStorage.identity.test.ts` | (a) | – | `ProfileSnapshot` (type-only) | No change |
| `packages/react/tools/workspace-setup-react/src/WorkspaceSetup.tsx` | (a) | – | `injectEditorStyles` | No change |
| `packages/react/tools/config-browser-react/src/editorStyles.ts` | (a) | – | `injectEditorStyles` | No change |
| `packages/react/widgets/widgets-react/src/v2/markets-grid-container/captionPersistence.test.tsx` | (a) | – | `StorageAdapter` (type-only) | No change |
| `packages/react/widgets/widgets-react/src/v2/markets-grid-container/MarketsGridContainer.tsx` | (a) | – | `AppDataLookup`, `StorageAdapter` (type-only) | No change |
| `packages/react/widgets/markets-grid/src/MarketsGrid.tsx` | (c) | `AlertDialog*` (10 sub-exports), `DirtyDot`, `GridProvider`, `Input`, `Popover*` (3), `useGridApi`, `useGridPlatform`, `useProfileManager`, plus 9 module exports (`calculatedColumnsModule`, `captureGridStateInto`, `columnCustomizationModule`, `columnGroupsModule`, `columnTemplatesModule`, `conditionalStylingModule`, `generalSettingsModule`, `gridStateModule`, `savedFiltersModule`, `toolbarVisibilityModule`) | `MemoryAdapter`, `cockpitCSS`, `COCKPIT_STYLE_ID`, `AnyModule` (type), `StorageAdapter` (type) | Split into two import statements |
| `packages/react/widgets/markets-grid/src/SettingsSheet.tsx` | (c) | `Poppable`, `SharpBtn`, `useDirtyCount`, `useGridPlatform`, `PoppableHandle` (type), `Popover`, `PopoverContent`, `PopoverTrigger` | `V2_SHEET_STYLE_ID`, `v2SheetCSS`, `isOpenFin`, `AnyModule` (type) | Split |
| `packages/react/widgets/markets-grid/src/FormattingToolbar.tsx` | (b) | `Poppable`, `useGridPlatform`, `PoppableHandle` (type) | – | Switch fully to `@starui/grid-react` |
| `packages/react/widgets/markets-grid/src/FormattingToolbar.test.tsx` | (b) | `columnCustomizationModule`, `columnTemplatesModule`, `GridProvider`, `ColumnCustomizationState` (type), `ColumnTemplatesState` (type) | `GridPlatform` | (c) Split |
| `packages/react/widgets/markets-grid/src/FiltersToolbar.tsx` | (b) | `useGridApi`, `useGridPlatform`, `useModuleState`, `Popover`, `PopoverContent`, `PopoverTrigger`, `Button`, `Textarea`, `SavedFiltersState` (type) | – | Switch fully |
| `packages/react/widgets/markets-grid/src/ProfileSelector.tsx` | (c) | `Popover`, `PopoverTrigger`, `PopoverContent`, `AlertDialog*` (8), `GhostIconButton` | `RESERVED_DEFAULT_PROFILE_ID`, `ProfileMeta` (type) | Split |
| `packages/react/widgets/markets-grid/src/TemplateManager.tsx` | (b) | `GhostIconButton` | – | Switch fully |
| `packages/react/widgets/markets-grid/src/types.ts` | (a) | – | `AnyModule`, `AppDataLookup`, `GridPlatform`, `UseProfileManagerResult` (note: type alias defined in core/src/index.ts re-exporting from hooks; keep as a type alias re-export from `@starui/grid-react` ALSO — see §6.2), `StorageAdapter` (all type-only) | Mostly no change — except `UseProfileManagerResult` becomes ambiguous (re-exported from BOTH packages); see §6.2 for the resolution. Recommended action: import `UseProfileManagerResult` from `@starui/grid-react`, keep the rest from `@starui/core`. |
| `packages/react/widgets/markets-grid/src/openfinViewProfile.ts` | (a) | – | `ActiveIdSource` (type-only) | No change |
| `packages/react/widgets/markets-grid/src/useGridHost.ts` | (a) | – | `GridPlatform`, `AnyColDef`, `AnyModule`, `AppDataLookup` | No change |
| `packages/react/widgets/markets-grid/src/formatter/state.ts` | (c) | `useGridPlatform`, `useModuleState`, `useUndoRedo`, plus types `BorderSpec` (NOTE: `BorderSpec` is exported from `./colDef` — this is vanilla; verify in §3 sanity), `CellEditorKind`, `ColumnCustomizationState`, `ColumnTemplatesState`, `FilterKind`, `ValueFormatterTemplate` (vanilla); also `valueFormatterFromTemplate` (vanilla) | `valueFormatterFromTemplate` (vanilla colDef export), `BorderSpec` and `ValueFormatterTemplate` (vanilla colDef types) | Split: hooks + module-state types from `@starui/grid-react`; colDef types + helper from `@starui/core` |
| `packages/react/widgets/markets-grid/src/formatter/Formatter.tsx` | (b) | `AlertDialog*` (8 sub-exports) | – | Switch fully |
| `packages/react/widgets/markets-grid/src/formatter/primitives.tsx` | (b) | `cn`, `Tooltip` | – | Switch fully |
| `packages/react/widgets/markets-grid/src/formatter/modules/ModuleType.tsx` | (b) | `PopoverCompat as Popover` | – | Switch fully |
| `packages/react/widgets/markets-grid/src/formatter/modules/ModuleClear.tsx` | (b) | `Tooltip` | – | Switch fully |
| `packages/react/widgets/markets-grid/src/formatter/modules/ModuleContext.tsx` | (b) | `Tooltip` | – | Switch fully |
| `packages/react/widgets/markets-grid/src/formatter/modules/ModulePaint.tsx` | (b) | `ColorPickerPopover`, `Popover`, `PopoverContent`, `PopoverTrigger`, `BorderStyleEditor` | – | Switch fully (two `from` lines collapse to one) |
| `packages/react/widgets/markets-grid/src/formatter/modules/ModuleFormat.tsx` | (b) | `PopoverCompat as Popover`, `FormatterPicker`, `ValueFormatterTemplate` (type — wait: `ValueFormatterTemplate` is vanilla colDef!) | `ValueFormatterTemplate` (type) | Split: `PopoverCompat`/`FormatterPicker` from `@starui/grid-react`; `ValueFormatterTemplate` from `@starui/core` |
| `packages/react/widgets/markets-grid/src/formatter/modules/ModuleEditorFilter.tsx` | (b/c) | (need to read full import block — likely shadcn + module-state hooks) | (likely none vanilla) | See per-file edit step in §6 |
| `packages/react/widgets/markets-grid/src/formatter/modules/ModuleLibrary.tsx` | (b) | `PopoverCompat as Popover` | – | Switch fully |
| `packages/react/widgets/markets-grid/src/formattingToolbarHooks.ts` | (c) | `useGridPlatform`, `useModuleState`, `resolveTemplates`, plus types `ColumnCustomizationState`, `ColumnTemplatesState` | Vanilla types: `BorderSpec`, `CellStyleOverrides`, `ValueFormatterTemplate` | Split |
| `packages/react/widgets/markets-grid/src/formatterPresets.ts` | (a) | – | `ValueFormatterTemplate` (type-only) | No change |
| `packages/react/widgets/markets-grid/src/marketsGrid.caption.test.tsx` | (special) | `vi.mock('@starui/core', ...)` | – | After repoint, MOCK SHOULD BE DUAL: `vi.mock('@starui/core', …)` for vanilla shells AND `vi.mock('@starui/grid-react', …)` for the React shells. See §6.4. |

### apps/

| File | Bucket | Moved-symbols imported | Vanilla-symbols imported | Action |
|---|---|---|---|---|
| `apps/markets-ui-react-reference/src/views/RenameViewTab.tsx` | (b) | `Button`, `Input` | – | Switch fully to `@starui/grid-react`. Add `@starui/grid-react` to app deps. |
| `apps/demo-react/src/App.tsx` | (a) | – | `DexieAdapter`, `activeProfileKey`, `StorageAdapter`/`ProfileSnapshot` (types) | No change |
| `apps/demo-react/src/showcaseProfile.ts` | (a) | – | `ExportedProfilePayload` (type) | No change |
| `apps/demo-react/src/Dashboard.tsx` | (a) | – | `DexieAdapter` | No change |
| `apps/demo-react/src/Fixture.tsx` | (a) | – | `activeProfileKey`, `ProfileSnapshot`/`StorageAdapter` (types) | No change |
| `apps/demo-react/src/nestedFixtures.ts` | (a) | – | `ExportedProfilePayload` (type) | No change |
| `apps/demo-configservice-react/src/App.tsx` | (a) | – | `activeProfileKey`, `ProfileSnapshot` (type) | No change |
| `apps/demo-configservice-react/src/showcaseProfile.ts` | (a) | – | `ExportedProfilePayload` (type) | No change |

### Vite/Vitest config aliases

| File | Action |
|---|---|
| `apps/demo-react/vite.config.ts` line 10 (`'@starui/core': resolve(...)`) | KEEP. Add a SECOND alias for `'@starui/grid-react'` pointing at `packages/react/widgets/grid-react/src`. |
| `apps/demo-configservice-react/vite.config.ts` line 16 | Same — add `'@starui/grid-react'` alias. |
| `packages/shared/core/vitest.config.ts` line 21 | KEEP (still resolves `@starui/core` to its own src). |
| `packages/react/widgets/markets-grid/vitest.config.ts` line 29 | UPDATE to add the `@starui/grid-react` alias (the package will not be installed in node_modules under the workspace setup; vitest needs the alias to resolve it). |

### Consumer counts

- (a) vanilla-only: **18 files** — no edit required.
- (b) moved-React-only: **11 files** — switch import to `@starui/grid-react`.
- (c) mixed: **8 files** — split import statement.

**Total touched consumer files: 19** (plus 4 vite/vitest configs +
2 package.json deps).

---

## §5 shadcn duplication resolution

**Discovery during audit (must read before executing).**
`packages/shared/core/src/ui/shadcn/` is **not** a byte-equivalent
duplicate of `@starui/ui`. Diff sample (`button.tsx`):

| Aspect | `core/ui/shadcn/button.tsx` | `@starui/ui/components/button.tsx` |
|---|---|---|
| Variants | `default`, `secondary`, `outline`, `ghost`, `destructive`, `link` (gc-themed) | `default`, `destructive`, `outline`, `secondary`, `ghost`, `link` (Stern-themed) |
| Sizes | `xs` (h-6), `sm` (h-7), `md` (h-8), `lg` (h-9), `icon` (h-7), `icon-sm` (h-6) | `default` (h-9), `sm` (h-8), `lg` (h-10), `icon` (h-9) |
| Primitives | Plain `<button>` with `cva` | Radix `Slot` + `cva` |
| Class focus rings | `focus-visible:ring-2 ring-ring ring-offset-1` | `focus-visible:ring-1 ring-ring` |

Same divergence on `Select` (core's is a styled native `<select>`,
ui's is a Radix composite), `Popover` (core's adds `--gc-*` token
theming and routes through `usePortalContainer`), and most other
components.

**Implication:** the `core/ui/shadcn/` folder must MOVE TO
`grid-react/ui/shadcn/` AS-IS. There is NO byte-equivalent migration
path to `@starui/ui`. The visual / portal / theming behavior is
intentionally grid-customizer-specific and reconciling the two copies
is a separate design decision, not part of PR-8.

**Internal consumers of `core/ui/shadcn/`** (cross-folder imports
from sibling subdirs of `core/src/ui/`):

| Importer | Imported from `../shadcn/...` |
|---|---|
| `core/src/ui/format-editor/FormatDropdown.tsx` | `cn` from `../shadcn/utils` |
| `core/src/ui/format-editor/FormatPopover.tsx` | `cn` from `../shadcn/utils` |
| `core/src/ui/ColorPicker/CompactColorField.tsx` | `Popover, PopoverContent, PopoverTrigger` from `../shadcn/popover` |
| `core/src/ui/ExpressionEditor/FallbackInput.tsx` | `Input` from `../shadcn/input`, `cn` from `../shadcn/utils` |
| `core/src/ui/SettingsPanel/...` (referenced by name in CSS comments only — no imports) | – |

**Internal consumers from `core/src/modules/` into `core/src/ui/shadcn/`:**

| Importer | Imported |
|---|---|
| `core/src/modules/general-settings/fieldSchema.tsx` | `Select, Switch` from `../../ui/shadcn` |
| `core/src/modules/column-customization/editors/CellEditorEditor.tsx` | `Select` from `../../../ui/shadcn` |
| `core/src/modules/column-customization/editors/FilterEditor.tsx` | `Select, Switch` from `../../../ui/shadcn` |
| `core/src/modules/column-customization/editors/LayoutBand.tsx` | `Select, Switch` from `../../../ui/shadcn` |
| `core/src/modules/column-customization/editors/RowGroupingEditor.tsx` | `Select, Switch, Textarea` from `../../../ui/shadcn` |
| `core/src/modules/column-customization/editors/TemplatePicker.tsx` | `Select` from `../../../ui/shadcn` |
| `core/src/modules/column-customization/editors/TriStateToggle.tsx` | `Select` from `../../../ui/shadcn` |
| `core/src/modules/column-groups/ColumnGroupsPanel.tsx` | `Select, Switch` from `../../ui/shadcn` |
| `core/src/modules/conditional-styling/editor/ColumnPickerMulti.tsx` | `Select` from `../../../ui/shadcn` |
| `core/src/modules/conditional-styling/editor/FlashBand.tsx` | `Switch` from `../../../ui/shadcn` |
| `core/src/modules/conditional-styling/editor/RuleMetaStrip.tsx` | `Select, Switch` from `../../../ui/shadcn` |

**All 16 internal imports stay relative** after the move because
`shadcn/`, `format-editor/`, `ColorPicker/`, `ExpressionEditor/`,
`SettingsPanel/`, and the entire `modules/` tree all relocate to the
SAME new package (`grid-react/`). The relative-path strings stay
EXACTLY THE SAME. No edits required for these 16 sites.

**Decision:**

> Move `core/src/ui/shadcn/` to `grid-react/src/ui/shadcn/` verbatim.
> Do not delete it; do not migrate to `@starui/ui`.
> Future PR can dedupe if/when the user wants the gc-* and Stern-*
> themes reconciled, but that decision is OUT OF SCOPE for PR-8.

The CLAUDE.md "anti-pattern: no native `<select>`" rule is preserved
because the moved `Select` (a styled native wrapper) IS the
project-canonical primitive for grid-customizer surfaces; the rule
means "don't use raw `<select>` — use this one or the Stern shadcn
one." Both still exist as wrappers; the consumer chooses based on
target visual tokens.

---

## §6 Internal core imports to fix (cross-package back-edges)

All cross-folder relative imports from inside the to-be-moved tree
that reach into vanilla parts of `core/src/` become CROSS-PACKAGE
imports back to `@starui/core` after the move.

### §6.1 Inside `hooks/` → vanilla siblings

```
GridProvider.tsx, useGridApi.ts, useDirty.ts, useGridColumns.ts,
useModuleDraft.ts, useUndoRedo.ts, useProfileManager.ts, useModuleState.ts
```

Imports to rewrite (`../platform`, `../persistence`, `../profiles`,
`../history`):

| Current path | New path |
|---|---|
| `import type { ApiEventName } from '../platform/types'` | `import type { ApiEventName } from '@starui/core'` |
| `import type { ExportedProfilePayload, ProfileMeta } from '../profiles/types'` | `import type { ExportedProfilePayload, ProfileMeta } from '@starui/core'` |
| `import type { GridPlatform } from '../platform/GridPlatform'` | `import type { GridPlatform } from '@starui/core'` |
| `import type { IDirtyBus } from '../platform'` | `import type { IDirtyBus } from '@starui/core'` |
| `import type { Module } from '../platform/types'` | `import type { Module } from '@starui/core'` |
| `import type { StorageAdapter } from '../persistence/StorageAdapter'` | `import type { StorageAdapter } from '@starui/core'` |
| `import type { Store } from '../platform/types'` | `import type { Store } from '@starui/core'` |
| `import { GridPlatform } from '../platform/GridPlatform'` | `import { GridPlatform } from '@starui/core'` |
| `import { HistoryStack, type HistoryStackOptions } from '../history/HistoryStack'` | `import { HistoryStack, type HistoryStackOptions } from '@starui/core'` |

> **Caveat — `IDirtyBus`:** verify this is exported from
> `@starui/core/index.ts`. As of this snapshot it's not in the
> public barrel — re-export it from `core/src/index.ts` AS PART OF
> THIS PR (the symbol becomes a public boundary because grid-react
> needs it). Search command for verification:
> ```bash
> grep -n "IDirtyBus" packages/shared/core/src/index.ts
> ```

### §6.2 Inside `ui/` → vanilla siblings

```
StyleEditor/*, ColorPicker/*, FormatterPicker/*, format-editor/*,
ExpressionEditor/*, PopoutPortal*, Poppable.tsx, PortalContainer.tsx
```

Imports to rewrite:

| Current path | New path |
|---|---|
| `import type { BorderSpec } from '../../colDef'` (StyleEditor sections) | `import type { BorderSpec } from '@starui/core'` |
| `import type { BorderSpec, ValueFormatterTemplate } from '../../colDef'` | `import type { BorderSpec, ValueFormatterTemplate } from '@starui/core'` |
| `import type { ValueFormatterTemplate } from '../../colDef'` | `import type { ValueFormatterTemplate } from '@starui/core'` |
| `import { ExpressionEngine } from '../../expression'` (ExpressionEditor) | `import { ExpressionEngine } from '@starui/core'` |
| `import { openFinWindowOpener } from '../utils/openFin'` (PopoutPortal) | `import { openFinWindowOpener } from '@starui/core'` |

Same-tree relative imports (NOT cross-package) — keep as-is:

- `import { Band } from '../../SettingsPanel'` (StyleEditor sections)
- `import { Caps, IconInput, SubLabel } from '../SettingsPanel'`
- `import { CompactColorField } from '../../ColorPicker'`
- `import { FormatColorPicker, FormatDropdown, FormatPopover } from '../format-editor'`
- `import type { StyleEditorDataType, StyleEditorValue } from '../types'`
- `import type { StyleEditorValue } from '../types'`
- `import { Input } from '../shadcn/input'` (ExpressionEditor/FallbackInput)
- `import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/popover'` (ColorPicker)
- `import { cn } from '../shadcn/utils'` (format-editor/*, ExpressionEditor/FallbackInput)
- `import { usePortalContainer } from '../PortalContainer'` (shadcn/popover)
- `import { BorderStyleEditor } from '../BorderStyleEditor'` (StyleEditor sections)

### §6.3 Inside `modules/` → vanilla siblings

| Current path | New path |
|---|---|
| `import type { AnyColDef } from '../../platform/types'` | `import type { AnyColDef } from '@starui/core'` |
| `import type { AnyColDef, CssHandle, ExpressionEngineLike } from '../../platform/types'` | same — `@starui/core` |
| `import type { AppDataLookup } from '../../../platform/types'` | same — `@starui/core` |
| `import type { AppDataLookup, CssHandle, ExpressionEngineLike } from '../../platform/types'` | same — `@starui/core` |
| `import type { BorderSpec } from '../../colDef'` | `@starui/core` |
| `import type { CellStyleProperties, ThemeAwareStyle } from '../../types/common'` | `@starui/core` |
| `import type { CssHandle } from '../../platform/types'` | `@starui/core` |
| `import type { EditorPaneProps, ListPaneProps } from '../../platform/types'` | `@starui/core` |
| `import type { ExpressionEngineLike } from '../../platform/types'` | `@starui/core` |
| `import type { Module } from '../../platform/types'` | `@starui/core` |
| `import type { Module, PlatformHandle } from '../../platform/types'` | `@starui/core` |
| `import type { Store } from '../../platform/types'` | `@starui/core` |
| `import type { ThemeAwareStyle } from '../../types/common'` | `@starui/core` |
| `import type { ValueFormatterTemplate } from '../../colDef'` | `@starui/core` |
| `import { GridPlatform } from '../../platform/GridPlatform'` | `@starui/core` |
| `import { valueFormatterFromTemplate } from '../../colDef'` | `@starui/core` |

Same-tree imports (kept relative):

- `import type { AggFuncName, RowGroupingConfig } from '../state'`
- `import type { CellEditorKind, ColumnCellEditorConfig } from '../state'`
- `import type { ColumnAssignment } from '../state'`
- `import type { ColumnDataType, ColumnTemplatesState } from '../column-templates'`
- `import type { ColumnTemplate } from '../../column-templates'`
- `import type { ColumnTemplate, ColumnTemplatesState } from '../column-templates'`
- `import type { ColumnTemplatesState } from '../column-templates'`
- `import type { ConditionalRule } from '../state'`
- `import type { ConditionalRule, FlashTarget } from '../state'`
- `import type { GeneralSettingsState } from '../../general-settings/state'`
- `import type { ValueFormatterTemplate } from '../state'` (CC's local alias)
- `import { COLUMN_TEMPLATES_MODULE_ID } from '../column-templates'`
- `import { columnTemplatesModule } from '../column-templates'`
- `import { cssEscapeColId } from '../column-customization/transforms'`
- `import { generalSettingsModule } from '../general-settings'`
- `import { resolveTemplates } from '../column-templates/resolveTemplates'`

These are SAME-PACKAGE (within grid-react); they keep relative paths.

### §6.4 Edits to test files in moved tree

Tests live next to the units they test and import via relative `./`
paths. Those don't break. **However:** if any test imports a vanilla
helper from `core/src/{platform,store,persistence,profiles,...}`,
those become cross-package imports.

```bash
# Audit (must run after moves):
grep -rn "from ['\"]\.\./\.\./" packages/react/widgets/grid-react/src/**/*.test.* 2>/dev/null
grep -rn "from ['\"]\.\./\.\./\.\./" packages/react/widgets/grid-react/src/**/*.test.* 2>/dev/null
```

Apply the same back-edge mapping from §6.1 / §6.3.

### §6.5 Updates to `core/src/index.ts`

Drop these export blocks (lines indicated by current snapshot —
re-locate before editing):

| Block (delete) | Lines |
|---|---|
| React bindings (GridProvider, useGridPlatform, …) | 88–117 |
| ExpressionEditor | 150–151 |
| Popout / Poppable / PortalContainer | 154–165 |
| SettingsPanel primitives | 167–228 |
| shadcn primitives | 230–271 |
| All module exports (general-settings → column-groups) | 299–434 |
| StyleEditor + ColorPicker + FormatterPicker | 436–476 |
| Format editor primitives | 478–492 |

The block at 117–125 (`GridCore`/`GridStore`/`UseProfileManagerResult`
back-compat type aliases) is delicate:
- `GridStore` aliases `Store from './platform/types'` — vanilla,
  STAYS in core.
- `GridCore` aliases `GridCoreLike from './hooks'` — moves out;
  drop from core, add to grid-react.
- `UseProfileManagerResult` is re-exported from `./hooks` — moves
  out; drop from core, add to grid-react.

Also: ADD an export of `IDirtyBus` (currently internal) — see §6.1.

### §6.6 New `grid-react/src/index.ts` (barrel)

Re-export every symbol listed in §2.B from its new home. Mirror the
shape of the old core/src/index.ts subsections so a consumer that
did `import { Foo } from '@starui/core'` only needs to change the
package name (path/name unchanged for every symbol). Suggested
template at the end of §6 in the implementation steps.

---

## §7 Per-module visual / interactive checks

Run BOTH demo apps and exercise each grid-customizer module.
Compare against pre-PR-8 baseline (take screenshots in the
pre-task baseline step if any doubt).

```bash
cd apps/demo-react && npm run dev   # http://localhost:5190
# In a separate terminal:
cd apps/markets-ui-react-reference && npm run dev
```

| Module | What to verify (1 line each) |
|---|---|
| `general-settings` | Open the Cockpit ▸ General Settings panel; toggle row stripes, animate-rows, suppress-row-clicks, header height; verify each immediately reflects in the grid |
| `column-customization` | Open Column Settings; pick a column; change typography (bold/italic/underline), color, background, alignment, borders, header name, editable, cell editor, filter primary kind, floating filter, formatter; verify each round-trips on save+reload |
| `column-templates` | Open Templates band inside Column Settings; create a template, assign to a column, verify the column inherits the template's overrides |
| `conditional-styling` | Add a rule with an expression (`Price > 100`), color it, attach a flash target and an indicator; verify rendering in both cell-style and indicator-icon variants |
| `calculated-columns` | Add a virtual column with an expression; verify it appears, pickable, and persists across profile reload |
| `column-groups` | Define a 2-level group; verify header bar shows nesting, groups expand/collapse, drag-to-reorder works |
| `grid-state` | Save profile, change column order/widths/sort/filter, reload — verify grid returns to saved state exactly |
| `saved-filters` | Add 2 saved filters in the FiltersToolbar; toggle active; verify filtering happens; reload — pills persist |
| `toolbar-visibility` | Show/hide the Filters and Style toolbars from the Cockpit's toolbar-visibility panel; reload — visibility persists |
| ExpressionEditor | Open in the conditional-styling expression slot; verify Monaco loads, completion popover shows fields/functions, palette help works |
| PopoutPortal / Poppable | Detach the FormattingToolbar to a window; verify content renders, scrolls, theme (--gc-* + --bn-*) persists, picker pop-overs render INSIDE the popout window not the parent |
| FormatterPicker | Open the formatter picker on a numeric column; cycle through Currency / Percent / Decimals / Tick / Excel custom; verify the column re-renders with the new format |
| StyleEditor / BorderStyleEditor | Open border editor; toggle a single side, all sides, change color/width/style; verify column borders update; verify FormatColorPicker pop-over still works |
| Cockpit chrome | Open the SettingsSheet; switch between modules via the rail; verify the dirty dot appears on edits, save flushes, reload restores |
| ProfileSelector | Create / load / delete / rename / clone / export / import a profile; verify each operation; reload — list persists |
| RenameViewTab (markets-ui-react-reference) | Open the rename-view-tab dialog; verify Button + Input render correctly under the Stern theme (NB: this view imports the GRID's `Button`/`Input`, not `@starui/ui`'s — see §4 — so visual styling matches the grid's gc-themed primitives) |

If ANYTHING differs from baseline behavior: stop, do not commit,
investigate. The user is the visual-parity authority.

---

## §8 Step-by-step implementation sequence

The implementation is broken into stages **A → K**. Each stage ends
with a build/test/typecheck gate. Commit after each green stage.

> **No stage is allowed to skip its verification gate.** A cascade
> of moves with deferred verification destroys the bisect-ability
> the plan depends on.

### Stage A — Pre-task baseline + branch

- [ ] **A.1** Run baseline:
  ```bash
  cd /Users/develop/wfh/marketsui-platform
  git status                                                  # MUST be clean
  git checkout main && git pull
  git checkout -b refactor/pr-08-extract-grid-react
  npx turbo run typecheck build test 2>&1 | tee /tmp/pr08-before.log
  grep -E "Tests|passing|failing|Test Files" /tmp/pr08-before.log | tail -20
  ```
  Expect: typecheck/build green; Vitest ≥ 653 passing.

- [ ] **A.2** Capture per-module visual screenshots (optional but
  strongly recommended). Per §7's checklist, screenshot each module
  for diff comparison after the move.

### Stage B — Add `IDirtyBus` to `core/src/index.ts` public barrel

(Prep: grid-react needs this type but it's currently internal.)

- [ ] **B.1** Find current location of `IDirtyBus`:
  ```bash
  grep -rn "interface IDirtyBus\|type IDirtyBus" packages/shared/core/src --include='*.ts'
  ```
- [ ] **B.2** Add export to `packages/shared/core/src/index.ts`
  in the platform-types block (after existing `Store` export):
  ```ts
  export type { IDirtyBus } from './platform';
  ```
  (verify the path resolves; otherwise import from the specific
  file the grep found.)
- [ ] **B.3** Build + typecheck:
  ```bash
  npx turbo run typecheck build --filter=@starui/core
  ```
  Expect green.
- [ ] **B.4** Commit:
  ```bash
  git add packages/shared/core/src/index.ts
  git commit -m "chore(core): export IDirtyBus from public barrel (prep for PR-8)
  $TRAILER"
  ```
  (Where `$TRAILER` is the standard Co-Authored-By line — see
  CLAUDE.md.)

### Stage C — Scaffold the new `@starui/grid-react` package

- [ ] **C.1** Create directory tree:
  ```bash
  mkdir -p packages/react/widgets/grid-react/src
  ```
- [ ] **C.2** Create `packages/react/widgets/grid-react/package.json`:
  ```jsonc
  {
    "name": "@starui/grid-react",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "exports": {
      ".": "./src/index.ts"
    },
    "scripts": {
      "test": "vitest run",
      "test:watch": "vitest",
      "typecheck": "tsc --noEmit"
    },
    "peerDependencies": {
      "react": ">=19.0.0",
      "react-dom": ">=19.0.0",
      "ag-grid-community": ">=35.0.0",
      "ag-grid-enterprise": ">=35.0.0",
      "ag-grid-react": ">=35.0.0"
    },
    "dependencies": {
      "@starui/core": "*",
      "@starui/shared-types": "*",
      "@radix-ui/react-alert-dialog": "^1.1.15",
      "@radix-ui/react-popover": "^1.1.15",
      "class-variance-authority": "^0.7.1",
      "clsx": "^2.1.1",
      "cmdk": "^1.1.1",
      "lucide-react": "^0.554.0",
      "monaco-editor": "^0.55.1",
      "tailwind-merge": "^3.5.0",
      "zustand": "^5.0.12"
    },
    "devDependencies": {
      "@testing-library/jest-dom": "^6.9.1",
      "@testing-library/react": "~16.2.0",
      "@types/react": "^19.2.14",
      "@types/react-dom": "^19.2.3",
      "@vitejs/plugin-react": "~4.5.2",
      "ag-grid-community": "35.1.0",
      "ag-grid-enterprise": "35.1.0",
      "ag-grid-react": "35.1.0",
      "jsdom": "^29.0.2",
      "react": "~19.2.5",
      "react-dom": "~19.2.5",
      "rimraf": "^6.0.1",
      "typescript": "~5.9.3",
      "vitest": "^4.1.4"
    }
  }
  ```
  > **Why `"main": "./src/index.ts"` (no build step):** matches the
  > pattern used by `@starui/markets-grid` — grid-react is consumed
  > only by other workspace packages and apps via vite/vitest; no
  > tarball publishing is in scope for this PR. If the user wants a
  > tsc/vite build later, that's a follow-up that mirrors core's
  > config.
- [ ] **C.3** Create `packages/react/widgets/grid-react/tsconfig.json`:
  ```jsonc
  {
    "extends": "../../../../tsconfig.base.json",
    "compilerOptions": {
      "noEmit": true,
      "jsx": "react-jsx",
      "paths": {
        "@starui/core": ["../../../shared/core/src"]
      }
    },
    "include": ["src"],
    "exclude": ["src/**/*.test.*", "node_modules", "dist"]
  }
  ```
  > Note: 4-level `extends` matches sibling
  > `packages/react/widgets/markets-grid/tsconfig.json`. The
  > `paths` alias keeps `@starui/core` resolving against source
  > (not `dist`) so changes in core are picked up on save.
- [ ] **C.4** Create empty barrel
  `packages/react/widgets/grid-react/src/index.ts` with a placeholder
  comment so subsequent stages have a target file to append to.
  ```ts
  // @starui/grid-react — React UI for the MarketsUI grid customizer.
  // Populated by Stage I of pr-08.
  export {};
  ```
- [ ] **C.5** Create
  `packages/react/widgets/grid-react/vitest.config.ts` modeled on
  `packages/react/widgets/markets-grid/vitest.config.ts`:
  ```ts
  import { defineConfig } from 'vitest/config';
  import react from '@vitejs/plugin-react';
  import { resolve } from 'path';
  import { fileURLToPath } from 'url';
  import { dirname } from 'path';

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const coreSrc = resolve(__dirname, '../../../shared/core/src');

  export default defineConfig({
    plugins: [react()],
    resolve: { alias: { '@starui/core': coreSrc } },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: [resolve(__dirname, '../../../shared/core/src/test/setup.ts')],
    },
  });
  ```
  > Verify the path to the shared test setup file. If the file
  > doesn't exist, omit the `setupFiles` line; the existing tests
  > don't fail without it on a fresh check (`grep -rn "setupFiles"
  > packages/shared/core/vitest.config.ts`).
- [ ] **C.6** Add `packages/react/widgets/grid-react` to root
  `package.json` `workspaces`. The widgets glob
  (`"packages/react/widgets/*"`) already covers it — verify with
  `grep -n widgets/ package.json` — but if the glob is missing for
  any reason add the explicit path.
- [ ] **C.7** Install:
  ```bash
  npm ci --legacy-peer-deps
  ```
- [ ] **C.8** Build + typecheck (grid-react is empty so this is
  smoke-only):
  ```bash
  npx turbo run typecheck build --filter=@starui/grid-react
  ```
  Expect green (a no-op typecheck on a placeholder export).
- [ ] **C.9** Commit:
  ```bash
  git add packages/react/widgets/grid-react package.json package-lock.json
  git commit -m "feat(grid-react): scaffold empty package (PR-8 Stage C)
  $TRAILER"
  ```

### Stage D — Move `core/src/hooks/` → `grid-react/src/hooks/`

- [ ] **D.1** Move directory:
  ```bash
  git mv packages/shared/core/src/hooks packages/react/widgets/grid-react/src/hooks
  ```
- [ ] **D.2** Fix cross-package imports per §6.1. For each file
  listed there, replace the relative path with `@starui/core`. Use
  the Edit tool on each file (do NOT use sed; Edit gives you
  per-file confirmation).
  ```bash
  # Find what to edit:
  grep -rn "from ['\"]\.\./" packages/react/widgets/grid-react/src/hooks --include='*.ts' --include='*.tsx'
  ```
  Apply the §6.1 mapping.
- [ ] **D.3** Append the hooks block to `grid-react/src/index.ts`:
  ```ts
  // ─── React bindings ──────────────────────────────────────────────────────
  export { GridProvider, useGridPlatform } from './hooks/GridProvider';
  export { useModuleState } from './hooks/useModuleState';
  export { useGridApi, useGridEvent } from './hooks/useGridApi';
  export { useProfileManager } from './hooks/useProfileManager';
  export type { UseProfileManagerResult } from './hooks/useProfileManager';
  export type { GridCoreLike } from './hooks/GridContext';
  export { useDirty, useDirtyCount, type DirtyHandle } from './hooks/useDirty';
  export {
    useGridColumns,
    type GridColumnInfo,
  } from './hooks/useGridColumns';
  export {
    useModuleDraft,
    type UseModuleDraftOptions,
    type UseModuleDraftResult,
  } from './hooks/useModuleDraft';
  export { useUndoRedo, type UseUndoRedoResult } from './hooks/useUndoRedo';

  // Back-compat aliases (preserved from the old core barrel).
  export type { GridCoreLike as GridCore } from './hooks/GridContext';
  ```
- [ ] **D.4** Drop the matching block from `core/src/index.ts`
  (lines 88–125 in the snapshot — re-locate by content). Specifically
  drop the React-bindings export, the v4-clean-hooks export, and the
  `GridCore`/`UseProfileManagerResult` re-exports. **Keep**
  `export type { Store as GridStore } from './platform/types';` —
  that's vanilla.
- [ ] **D.5** Build + typecheck (only core + grid-react; consumers
  will still fail for now):
  ```bash
  npx turbo run typecheck build --filter=@starui/core --filter=@starui/grid-react
  ```
  Expect green for both packages in isolation.
- [ ] **D.6** Run hooks tests:
  ```bash
  npx vitest run packages/react/widgets/grid-react/src/hooks
  ```
  Expect: 3 test files (`useDirty.test.tsx`, `useGridColumns.test.tsx`,
  `useModuleDraft.test.tsx`) green.
- [ ] **D.7** Commit:
  ```bash
  git add packages/shared/core/src/index.ts \
          packages/react/widgets/grid-react
  git commit -m "refactor(grid-react): move core/src/hooks → grid-react (PR-8 Stage D)
  $TRAILER"
  ```

### Stage E — Move `core/src/ui/` → `grid-react/src/ui/`

- [ ] **E.1** Move directory:
  ```bash
  git mv packages/shared/core/src/ui packages/react/widgets/grid-react/src/ui
  ```
- [ ] **E.2** Fix cross-package imports per §6.2. Edit each file
  individually:
  ```bash
  grep -rn "from ['\"]\.\./\.\./colDef\|from ['\"]\.\./\.\./expression\|from ['\"]\.\./utils/openFin" packages/react/widgets/grid-react/src/ui --include='*.ts' --include='*.tsx'
  ```
  Apply the §6.2 mapping. Same-tree imports (`../shadcn/...`,
  `../format-editor/...`, etc.) are unchanged.
- [ ] **E.3** Append the UI blocks to `grid-react/src/index.ts`:
  ```ts
  // ─── ExpressionEditor ────────────────────────────────────────────────────
  export { ExpressionEditor } from './ui/ExpressionEditor';
  export type {
    ExpressionEditorProps,
    ExpressionEditorHandle,
  } from './ui/ExpressionEditor';

  // ─── Popout window primitives ────────────────────────────────────────────
  export { PopoutPortal } from './ui/PopoutPortal';
  export type { PopoutPortalProps } from './ui/PopoutPortal';
  export { Poppable } from './ui/Poppable';
  export type {
    PoppableProps,
    PoppableHandle,
    PoppableRenderProps,
    PopoutButtonProps,
  } from './ui/Poppable';
  export { PortalContainerProvider, usePortalContainer } from './ui/PortalContainer';
  export type { PortalContainerProviderProps } from './ui/PortalContainer';

  // ─── Cockpit settings-panel primitives ───────────────────────────────────
  export {
    DirtyDot,
    LedBar,
    GhostIcon,
    SubLabel,
    IconInput,
    PillToggleGroup,
    PillToggleBtn,
    PairRow,
    FigmaPanelSection,
    ItemCard,
    ObjectTitleRow,
    TitleInput,
    PanelChrome,
    TabStrip,
    Caps,
    Mono,
    SharpBtn,
    TGroup,
    TBtn,
    TDivider,
    Band,
    MetaCell,
    Stepper,
  } from './ui/SettingsPanel';
  export type {
    DirtyDotProps,
    LedBarProps,
    GhostIconProps,
    SubLabelProps,
    IconInputProps,
    PillToggleGroupProps,
    PillToggleBtnProps,
    PairRowProps,
    FigmaPanelSectionProps,
    ItemCardProps,
    ObjectTitleRowProps,
    TitleInputProps,
    PanelChromeProps,
    TabStripProps,
    TabItem,
    CapsProps,
    MonoProps,
    SharpBtnProps,
    SharpBtnVariant,
    TGroupProps,
    TBtnProps,
    BandProps,
    MetaCellProps,
    StepperProps,
  } from './ui/SettingsPanel';

  // ─── shadcn primitives (gc-themed; distinct from @starui/ui) ─────────────
  export { Button, buttonVariants } from './ui/shadcn/button';
  export type { ButtonProps } from './ui/shadcn/button';
  export { GhostIconButton } from './ui/shadcn/ghost-icon-button';
  export type {
    GhostIconButtonProps,
    GhostIconButtonVariant,
    GhostIconButtonSize,
    GhostIconButtonReveal,
  } from './ui/shadcn/ghost-icon-button';
  export { Input } from './ui/shadcn/input';
  export type { InputProps } from './ui/shadcn/input';
  export { Textarea, type TextareaProps } from './ui/shadcn/textarea';
  export { Select } from './ui/shadcn/select';
  export { Switch } from './ui/shadcn/switch';
  export {
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverAnchor,
    PopoverClose,
    PopoverCompat,
  } from './ui/shadcn/popover';
  export {
    AlertDialog,
    AlertDialogTrigger,
    AlertDialogPortal,
    AlertDialogOverlay,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogAction,
    AlertDialogCancel,
  } from './ui/shadcn/alert-dialog';
  export { Tooltip } from './ui/shadcn/tooltip';
  export { Separator } from './ui/shadcn/separator';
  export { Label } from './ui/shadcn/label';
  export { cn } from './ui/shadcn/utils';
  export { ToggleGroup, ToggleGroupItem } from './ui/shadcn/toggle-group';
  export { ColorPicker, ColorPickerPopover } from './ui/shadcn/color-picker';

  // ─── StyleEditor + ColorPicker + FormatterPicker ─────────────────────────
  export {
    StyleEditor,
    TextSection,
    ColorSection,
    BorderSection,
    FormatSection,
    BorderStyleEditor,
  } from './ui/StyleEditor';
  export type {
    StyleEditorProps,
    StyleEditorValue,
    StyleEditorSection,
    StyleEditorVariant,
    StyleEditorDataType,
    TextAlign,
    FontWeight,
    BorderStyleEditorProps,
    BordersValue,
  } from './ui/StyleEditor';
  export { CompactColorField } from './ui/ColorPicker';
  export type { CompactColorFieldProps } from './ui/ColorPicker';
  export {
    FormatterPicker,
    inferPickerDataType,
    presetsForDataType,
    findMatchingPreset,
    defaultSampleValue,
    EXCEL_EXAMPLES,
  } from './ui/FormatterPicker';
  export type {
    FormatterPickerProps,
    FormatterPreset,
    FormatterPickerDataType,
    ExcelExample,
    ExcelExampleCategory,
  } from './ui/FormatterPicker';

  // ─── Format editor primitives ────────────────────────────────────────────
  export {
    FormatPopover,
    FormatDropdown,
    FormatColorPicker,
    registerPopoverRoot,
    clickIsInsideAnyOpenPopover,
    EDGE_ORDER,
    defaultSideSpec,
    makeDefaultSides,
  } from './ui/format-editor';
  export type {
    BorderSide,
    BorderStyle,
    BorderMode,
    SideSpec,
  } from './ui/format-editor';
  ```
- [ ] **E.4** Drop matching blocks from `core/src/index.ts`
  (UI / SettingsPanel / shadcn / StyleEditor / ColorPicker /
  FormatterPicker / format-editor / Popout / ExpressionEditor).
- [ ] **E.5** Build + typecheck core + grid-react:
  ```bash
  npx turbo run typecheck build --filter=@starui/core --filter=@starui/grid-react
  ```
  Expect green.
- [ ] **E.6** Run grid-react tests:
  ```bash
  npx vitest run packages/react/widgets/grid-react/src
  ```
  Expect: existing PopoutPortal + ghost-icon-button tests green.
- [ ] **E.7** Commit:
  ```bash
  git add packages/shared/core/src/index.ts \
          packages/react/widgets/grid-react
  git commit -m "refactor(grid-react): move core/src/ui → grid-react (PR-8 Stage E)
  $TRAILER"
  ```

### Stage F — Move `core/src/modules/` → `grid-react/src/modules/`

- [ ] **F.1** Move directory:
  ```bash
  git mv packages/shared/core/src/modules packages/react/widgets/grid-react/src/modules
  ```
- [ ] **F.2** Fix cross-package imports per §6.3. Per-file edits:
  ```bash
  grep -rn "from ['\"]\.\./\.\./platform\|from ['\"]\.\./\.\./\.\./platform\|from ['\"]\.\./\.\./colDef\|from ['\"]\.\./\.\./types\|from ['\"]\.\./\.\./types/common" packages/react/widgets/grid-react/src/modules --include='*.ts' --include='*.tsx'
  ```
  Apply the §6.3 mapping.
- [ ] **F.3** Append the modules block to `grid-react/src/index.ts`
  (mirror lines 299–434 of the old core/src/index.ts, but with
  `./modules/...` paths).
- [ ] **F.4** Drop matching block from `core/src/index.ts`.
- [ ] **F.5** Build + typecheck core + grid-react:
  ```bash
  npx turbo run typecheck build --filter=@starui/core --filter=@starui/grid-react
  ```
  Expect green.
- [ ] **F.6** Run grid-react full test suite:
  ```bash
  npx vitest run packages/react/widgets/grid-react/src
  ```
  Expect: all 14 moved test files + the 2 ui test files green.
- [ ] **F.7** Commit:
  ```bash
  git add packages/shared/core/src/index.ts \
          packages/react/widgets/grid-react
  git commit -m "refactor(grid-react): move core/src/modules → grid-react (PR-8 Stage F)
  $TRAILER"
  ```

### Stage G — Drop React peer-deps from `core/package.json`

- [ ] **G.1** Edit `packages/shared/core/package.json`:
  ```diff
     "peerDependencies": {
       "ag-grid-community": ">=35.0.0",
       "ag-grid-enterprise": ">=35.0.0",
       "ag-grid-react": ">=35.0.0",
  -    "react": ">=19.0.0",
  -    "react-dom": ">=19.0.0"
     },
     "dependencies": {
       "@starui/shared-types": "*",
  -    "@radix-ui/react-alert-dialog": "^1.1.15",
  -    "@radix-ui/react-popover": "^1.1.15",
  -    "class-variance-authority": "^0.7.1",
  -    "clsx": "^2.1.1",
  -    "cmdk": "^1.1.1",
       "dexie": "^4.4.2",
  -    "lucide-react": "^0.554.0",
  -    "monaco-editor": "^0.55.1",
       "ssf": "^0.11.2",
  -    "tailwind-merge": "^3.5.0",
  -    "zustand": "^5.0.12"
     },
  ```
  > **Caveat — `zustand`**: verify before dropping. Check whether
  > `core/src/store/createGridStore.ts` uses zustand:
  > ```bash
  > grep -rn "zustand" packages/shared/core/src --include='*.ts'
  > ```
  > If yes: KEEP zustand in core deps. Remove only confirmed-React-only
  > deps.
  > Same goes for `clsx`/`tailwind-merge` if any vanilla file uses
  > them. Re-grep:
  > ```bash
  > for dep in clsx tailwind-merge class-variance-authority cmdk lucide-react monaco-editor; do
  >   echo "=== $dep ==="
  >   grep -rn "from ['\"]$dep" packages/shared/core/src --include='*.ts' --include='*.tsx'
  > done
  > ```
  > Drop ONLY the deps with no remaining hits in core's source.
- [ ] **G.2** Reinstall:
  ```bash
  npm ci --legacy-peer-deps
  ```
- [ ] **G.3** Build + typecheck core:
  ```bash
  npx turbo run typecheck build --filter=@starui/core
  ```
  Expect green. If a missing import surfaces, RESTORE that dep —
  don't paper over with a different solution.
- [ ] **G.4** Commit:
  ```bash
  git add packages/shared/core/package.json package-lock.json
  git commit -m "chore(core): drop React peer-deps + React-only deps (PR-8 Stage G)
  $TRAILER"
  ```

### Stage H — Repoint `markets-grid` consumer

- [ ] **H.1** Add `@starui/grid-react` to
  `packages/react/widgets/markets-grid/package.json` dependencies:
  ```diff
     "dependencies": {
       "@starui/core": "*",
  +    "@starui/grid-react": "*",
       "lucide-react": "^0.554.0"
     },
  ```
- [ ] **H.2** Edit `packages/react/widgets/markets-grid/tsconfig.json`
  to add the alias:
  ```diff
       "paths": {
  -      "@starui/core": ["../../core/src"]
  +      "@starui/core": ["../../../shared/core/src"],
  +      "@starui/grid-react": ["../grid-react/src"]
       }
  ```
  > NOTE: the existing `"../../core/src"` path is wrong (it would
  > resolve to `packages/react/widgets/core/src`). Verify by reading
  > the file — if the existing path actually works (e.g. core is at
  > a different relative depth), KEEP what works. The audit found
  > this in the snapshot; re-verify the actual path before editing.
- [ ] **H.3** Edit `packages/react/widgets/markets-grid/vitest.config.ts`
  to add the alias:
  ```diff
  -    alias: { '@starui/core': coreSrc },
  +    alias: {
  +      '@starui/core': coreSrc,
  +      '@starui/grid-react': resolve(__dirname, '../grid-react/src'),
  +    },
  ```
- [ ] **H.4** For EACH consumer file in §4 with bucket (b) or (c),
  edit the import statement(s). Worked example for the largest
  consumer (`MarketsGrid.tsx`):
  ```diff
   import {
  -  AlertDialog,
  -  AlertDialogAction,
  -  AlertDialogCancel,
  -  AlertDialogContent,
  -  AlertDialogDescription,
  -  AlertDialogFooter,
  -  AlertDialogHeader,
  -  AlertDialogTitle,
  -  DirtyDot,
  -  GridProvider,
  -  Input,
       MemoryAdapter,
  -  Popover,
  -  PopoverContent,
  -  PopoverTrigger,
  -  calculatedColumnsModule,
  -  captureGridStateInto,
  -  columnCustomizationModule,
  -  columnGroupsModule,
  -  columnTemplatesModule,
  -  conditionalStylingModule,
  -  generalSettingsModule,
  -  gridStateModule,
  -  savedFiltersModule,
  -  toolbarVisibilityModule,
  -  useGridApi,
  -  useGridPlatform,
  -  useProfileManager,
     cockpitCSS,
     COCKPIT_STYLE_ID,
     type AnyModule,
     type StorageAdapter,
   } from '@starui/core';
  +import {
  +  AlertDialog,
  +  AlertDialogAction,
  +  AlertDialogCancel,
  +  AlertDialogContent,
  +  AlertDialogDescription,
  +  AlertDialogFooter,
  +  AlertDialogHeader,
  +  AlertDialogTitle,
  +  DirtyDot,
  +  GridProvider,
  +  Input,
  +  Popover,
  +  PopoverContent,
  +  PopoverTrigger,
  +  calculatedColumnsModule,
  +  captureGridStateInto,
  +  columnCustomizationModule,
  +  columnGroupsModule,
  +  columnTemplatesModule,
  +  conditionalStylingModule,
  +  generalSettingsModule,
  +  gridStateModule,
  +  savedFiltersModule,
  +  toolbarVisibilityModule,
  +  useGridApi,
  +  useGridPlatform,
  +  useProfileManager,
  +} from '@starui/grid-react';
  ```
  Apply the same pattern (using §4's table) to the 18 other consumer
  files. **Use the Edit tool — never sed.**
- [ ] **H.5** For `marketsGrid.caption.test.tsx` — the file uses
  `vi.mock('@starui/core', …)` with shells. After the move, split
  the mock: keep one for `@starui/core` (vanilla shells) and ADD a
  second `vi.mock('@starui/grid-react', …)` for the React shells.
  ```bash
  # Find call sites:
  grep -n "vi.mock.*@starui" packages/react/widgets/markets-grid/src/marketsGrid.caption.test.tsx
  ```
  Read the existing mock contents. Symbols originating from
  hooks / ui / modules go under the grid-react mock; symbols from
  platform / store / persistence / etc. stay under the core mock.
- [ ] **H.6** Reinstall + typecheck + build markets-grid:
  ```bash
  npm ci --legacy-peer-deps
  npx turbo run typecheck build --filter=@starui/markets-grid
  ```
  Expect green.
- [ ] **H.7** Run markets-grid tests:
  ```bash
  npx vitest run packages/react/widgets/markets-grid/src
  ```
  Expect: all current markets-grid tests still green.
- [ ] **H.8** Commit:
  ```bash
  git add packages/react/widgets/markets-grid \
          package.json package-lock.json
  git commit -m "refactor(markets-grid): repoint moved-React imports to @starui/grid-react (PR-8 Stage H)
  $TRAILER"
  ```

### Stage I — Repoint app consumers

- [ ] **I.1** `apps/markets-ui-react-reference/src/views/RenameViewTab.tsx`:
  switch `Button, Input` import to `@starui/grid-react`. Add
  `@starui/grid-react: "*"` to
  `apps/markets-ui-react-reference/package.json` dependencies.
- [ ] **I.2** `apps/demo-react/vite.config.ts`: add the
  `@starui/grid-react` alias next to the existing `@starui/core`
  alias:
  ```diff
       alias: {
         '@starui/core': resolve(__dirname, '../../packages/shared/core/src'),
  +      '@starui/grid-react': resolve(__dirname, '../../packages/react/widgets/grid-react/src'),
       }
  ```
- [ ] **I.3** `apps/demo-configservice-react/vite.config.ts`:
  same alias addition.
- [ ] **I.4** Reinstall:
  ```bash
  npm ci --legacy-peer-deps
  ```
- [ ] **I.5** Build + typecheck + test full repo:
  ```bash
  npx turbo run typecheck build test 2>&1 | tee /tmp/pr08-stageI.log
  diff <(grep -E "Tests|passing|failing|Test Files" /tmp/pr08-before.log) \
       <(grep -E "Tests|passing|failing|Test Files" /tmp/pr08-stageI.log)
  ```
  Acceptance: Vitest passing ≥ baseline. Build + typecheck green.
- [ ] **I.6** Commit:
  ```bash
  git add apps package.json package-lock.json
  git commit -m "refactor(apps): repoint moved-React imports to @starui/grid-react (PR-8 Stage I)
  $TRAILER"
  ```

### Stage J — Update IMPLEMENTED_FEATURES.md + DEPS_STANDARD.md

- [ ] **J.1** Edit `docs/IMPLEMENTED_FEATURES.md`. Add an entry to
  the package-layout section noting the extraction:
  ```
  - PR-8: Extracted React content from @starui/core into the new
    @starui/grid-react package (~24,117 LOC across 143 files;
    ui/, hooks/, modules/ subtrees moved). @starui/core is now
    vanilla TypeScript with no React peer-deps.
  ```
- [ ] **J.2** If `docs/DEPS_STANDARD.md` lists per-package deps,
  update the @starui/core row (drop React + Radix entries) and add
  a @starui/grid-react row (mirrors the previous core entry).
- [ ] **J.3** Commit:
  ```bash
  git add docs/IMPLEMENTED_FEATURES.md docs/DEPS_STANDARD.md
  git commit -m "docs: record PR-8 grid-react extraction
  $TRAILER"
  ```

### Stage K — Final acceptance gate + PR

- [ ] **K.1** Final full-repo run:
  ```bash
  npm ci --legacy-peer-deps
  npx turbo run typecheck build test 2>&1 | tee /tmp/pr08-after.log
  diff <(grep -E "Tests|passing|failing|Test Files" /tmp/pr08-before.log) \
       <(grep -E "Tests|passing|failing|Test Files" /tmp/pr08-after.log)
  ```
  Acceptance:
  - Typecheck exit 0.
  - Build exit 0.
  - Vitest passing count ≥ baseline.
- [ ] **K.2** E2E:
  ```bash
  npx turbo run e2e 2>&1 | tee /tmp/pr08-after-e2e.log || true
  diff <(grep -E "passed|failed" /tmp/pr08-before-e2e.log) \
       <(grep -E "passed|failed" /tmp/pr08-after-e2e.log)
  ```
  Acceptance: Playwright passing ≥ baseline (NEVER worse).
- [ ] **K.3** Visual / interactive parity per §7. Run BOTH demo
  apps; cycle every module on the checklist. Take screenshots and
  compare against pre-task baseline. **The user is the visual
  authority — STOP and ask if anything looks different.**
- [ ] **K.4** Push + open PR:
  ```bash
  git push -u origin refactor/pr-08-extract-grid-react
  gh pr create --title "refactor(PR-8): extract grid-react from @starui/core" --body "$(cat <<'EOF'
## Summary
- Extracted ~24,117 LOC of React content from `packages/shared/core/src/{ui,hooks,modules}/` into a new `packages/react/widgets/grid-react/` package (`@starui/grid-react`).
- Dropped React peer-deps from `@starui/core`. Core is now vanilla-TS-only.
- Repointed `@starui/markets-grid` and `apps/markets-ui-react-reference` to import the moved symbols from `@starui/grid-react`. All other consumers either keep their `@starui/core` import (vanilla symbols only) or split the import statement (mixed).
- Moved `core/src/ui/shadcn/` to `grid-react/src/ui/shadcn/` AS-IS — see PR description's "shadcn note" — these primitives are gc-themed and intentionally divergent from `@starui/ui`'s Stern-themed copies; deduping them is out of scope for PR-8.

## Test plan
- [x] `npx turbo run typecheck build test` — all green; Vitest passing ≥ pre-PR-8 baseline.
- [x] `npx turbo run e2e` — Playwright passing ≥ baseline (no new failures).
- [x] Per-module visual parity check (general-settings, column-customization, column-templates, conditional-styling, calculated-columns, column-groups, grid-state, saved-filters, toolbar-visibility, ExpressionEditor, PopoutPortal, FormatterPicker, StyleEditor, Cockpit chrome, ProfileSelector, RenameViewTab) — confirmed no behavior or look-and-feel change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
  ```

---

## §9 Acceptance gate (consolidated)

A clean PR-8 has all of:

- [x] Branch `refactor/pr-08-extract-grid-react` pushed to origin.
- [x] `npx turbo run typecheck` exit code 0.
- [x] `npx turbo run build` exit code 0.
- [x] `npx turbo run test` Vitest passing count ≥ baseline.
- [x] `npx turbo run e2e` Playwright passing count ≥ 195/214 (no
      regression vs pre-existing 19 failures).
- [x] `apps/demo-react` boots; every grid-customizer panel works
      identically to baseline; no console errors.
- [x] `apps/markets-ui-react-reference` boots; WorkspaceSetup
      route renders; RenameViewTab dialog renders correctly under
      gc-themed Button/Input.
- [x] `@starui/core` `package.json` has NO `react` /
      `react-dom` peerDeps.
- [x] `grep -rn "from '@starui/core'" packages/react/widgets/grid-react/src` returns ONLY back-edge imports
      (vanilla helpers from core), never React imports.
- [x] `grep -rn "from '\.\./\.\./platform\|from '\.\./\.\./colDef\|from '\.\./\.\./expression" packages/react/widgets/grid-react/src` returns nothing — all such imports are
      now `from '@starui/core'`.
- [x] `docs/IMPLEMENTED_FEATURES.md` and `docs/DEPS_STANDARD.md`
      are updated.

---

## §10 Risk register

### R1 — Circular dependency: grid-react ↔ core

**Failure mode.** grid-react depends on core (intentional — for
`GridPlatform`, `ProfileManager`, etc.). If a vanilla core file
accidentally still imports from `core/src/{ui,hooks,modules}` after
the move, that's a back-edge: core → grid-react. Combined with
grid-react → core, the cycle breaks builds and confuses bundlers.

**Detection.** After Stage F:
```bash
grep -rn "from ['\"]\./ui/\|from ['\"]\./hooks/\|from ['\"]\./modules/\|from ['\"]\.\./ui/\|from ['\"]\.\./hooks/\|from ['\"]\.\./modules/" packages/shared/core/src --include='*.ts' --include='*.tsx'
```
Expected output: empty. Anything that surfaces is a leftover
back-edge — fix it before proceeding to Stage G.

**Mitigation.** The audit confirmed (§2.A) that the ONLY file
in `core/src/` outside `{ui,hooks,modules}` that touches those
subdirs is `core/src/index.ts` itself, which is updated in Stages
D/E/F. If new back-edges sneak in, rerun the grep.

### R2 — Symbol name collision: `Row`, `valueFormatterFromTemplate`, etc.

**Failure mode.** PR-1.5 dropped the `Row` export from
`fieldSchema.tsx`, but the symbol still exists locally. There's
also a `Row.tsx` file in
`column-customization/editors/Row.tsx` (a CC-internal `Row`
component, not exported). After the move, vitest / TS sees both;
without explicit name disambiguation no compile error happens, but
a renaming refactor in the future could land on the wrong one.

**Detection.**
```bash
grep -rn "export .* Row\|export.*VariantProps" packages/react/widgets/grid-react/src --include='*.ts' --include='*.tsx'
```
Confirm no public `Row` is exported from grid-react.

**Mitigation.** Per CLAUDE.md the rule is "filename matches the case
of the file's primary export". Both `Row.tsx` files (the kept
internal CC editor, and any leftover in fieldSchema) honor this.
Just don't add `Row` to grid-react's barrel.

Same care for `valueFormatterFromTemplate`: it lives in
`core/src/colDef`, NOT in the moved tree. Some markets-grid files
import it from `@starui/core` already; verify after Stage H that
those imports still point at core, not grid-react.

### R3 — Vanilla module split: are saved-filters / toolbar-visibility correctly placed?

**Failure mode.** `saved-filters/index.ts` and
`toolbar-visibility/index.ts` are 100% vanilla. Putting them in
grid-react means a vanilla-only tool (config-service, a future
headless test harness, an Angular consumer of the shared module
defs) can't use them without pulling in React.

**Detection.** Search for any non-React consumer:
```bash
grep -rn "savedFiltersModule\|toolbarVisibilityModule" packages/shared --include='*.ts' --include='*.tsx' 2>/dev/null
```
Expected: only references inside grid-react (post-move) and core's
old index.ts (pre-move). NOT in shared/services or shared/runtime.

**Mitigation.** As of this snapshot, the only consumers outside
grid-react/markets-grid are documentation refs. If a future
shared-package consumer needs them, the path is to split them
back into `core/src/modules-vanilla/` (or similar) — out of scope
for PR-8.

### R4 — Bundle-size regression

**Failure mode.** Two copies of the shadcn primitives ship to the
browser if a future app imports from BOTH `@starui/ui` and
`@starui/grid-react`. (None do today — markets-grid uses only
grid-react's, markets-ui-react-reference uses only ui's, and
RenameViewTab uses grid-react's.) But if such a consumer arises,
duplication doubles the bundle for those primitives.

**Detection.** After Stage K, run a bundle analyzer if any app
ends up importing from both. Today's apps don't, so this is a
forward-looking note only.

**Mitigation.** Out of scope for PR-8. Future PR can de-duplicate
shadcn primitives if/when the user wants the gc-* and Stern-* themes
reconciled.

### R5 — Test files: imports + mock paths

**Failure mode.** Tests inside the moved tree (14 of them) use
relative imports — those keep working. But the markets-grid test
`marketsGrid.caption.test.tsx` uses `vi.mock('@starui/core', …)` —
a single mock that currently shells out symbols originating from
both vanilla AND moved trees. After Stage H, that single mock
either over-mocks (breaking other tests) or under-mocks (the moved
symbols aren't shimmed).

**Detection.** After Stage H.5:
```bash
npx vitest run packages/react/widgets/markets-grid/src/marketsGrid.caption.test.tsx
```
Failure indicates the mock split was incomplete.

**Mitigation.** Step H.5 explicitly splits the mock. Don't skip it.

### R6 — vitest.config alias not applied

**Failure mode.** vitest doesn't see `@starui/grid-react` because
the alias is missing in
`packages/react/widgets/markets-grid/vitest.config.ts` (Step H.3)
or in the `grid-react` itself (Step C.5). Tests fail with
"Cannot find module '@starui/grid-react'".

**Mitigation.** The two config edits are explicit Steps C.5 and H.3.
Re-verify with:
```bash
grep -n "@starui/grid-react" packages/react/widgets/markets-grid/vitest.config.ts \
       packages/react/widgets/grid-react/vitest.config.ts
```

### R7 — Hidden internal imports of `core/src/index.ts` re-exports

**Failure mode.** Some files in core itself import from `'./index'`
(or `'.'`) instead of the specific subdir. After we drop the
re-exports in Stages D/E/F, those imports break.

**Detection.**
```bash
grep -rn "from ['\"]\./index['\"]\|from ['\"]\.\.['\"]\|from ['\"]\.['\"]" packages/shared/core/src --include='*.ts' --include='*.tsx' 2>/dev/null
```

**Mitigation.** As of this snapshot, no such imports exist. If the
grep surfaces any in the future, replace each with a direct subdir
path BEFORE starting Stage D.

### R8 — `tsconfig.json` path-alias divergence

**Failure mode.** The snapshot shows `markets-grid/tsconfig.json`
with `"@starui/core": ["../../core/src"]` — that path doesn't
exist (core lives at `packages/shared/core`, not
`packages/react/widgets/core`). Either (a) the path is stale and
the alias never resolves at type-check (TS falls back to npm
resolution via the workspace package), or (b) there's a separate
typing root somewhere. Either way, the new alias for
`@starui/grid-react` (Step H.2) needs to be checked against the
current path and updated together — don't preserve a broken path
side-by-side with a new one.

**Mitigation.** Read `markets-grid/tsconfig.json` first, then edit.
If the existing `@starui/core` alias resolves to a real folder,
keep its style; if not, fix it AND add the new alias.

### R9 — Missing peer dep on `@starui/grid-react` in markets-ui-react-reference

**Failure mode.** Step I.1 adds the dep to package.json, but if
omitted, the workspace resolution fails at install or runtime.

**Mitigation.** Step I.1's install verification (`npm ci`) catches
this.

### R10 — Build-tool difference: core builds via vite, grid-react ships TS

**Failure mode.** core has a `vite build` step that bundles into
`dist/` for tarball publishing. grid-react (per Step C.2) ships
plain TS via `"main": "./src/index.ts"`. If a future consumer
expects both packages to behave the same way (e.g. publishes a
tarball that needs grid-react's `dist/`), they'll be confused.

**Mitigation.** Documented in C.2 caveat. Out-of-scope follow-up
can add a vite build to grid-react if/when tarball publishing
matters.

### R11 — Type-only imports treated as runtime by some tooling

**Failure mode.** Some §4 entries (e.g. `MarketsGridContainer.tsx`)
use `import type { ... } from '@starui/core'`. Type-only imports
get erased at compile time so they don't become a runtime back-edge.
But if any source uses non-type-only `import { type Foo }` syntax,
TS may still emit a runtime import in CommonJS builds (none in
this repo, but worth noting).

**Mitigation.** Audit pass after Stage H:
```bash
grep -rn "from '@starui/core'" packages/react/widgets/grid-react/src --include='*.ts' --include='*.tsx' 2>/dev/null
```
Expected: only type-only imports for cross-package back-edges.

### R12 — `IDirtyBus` not actually exported from `./platform`

**Failure mode.** Stage B assumes `IDirtyBus` lives somewhere in
`./platform`. The audit grep didn't precisely locate it — the
implementer may discover it's in a different subdir (`./store`,
`./types`).

**Mitigation.** Step B.1 explicitly verifies the location before
B.2 edits the barrel. Don't skip B.1.

---

## §11 Self-review notes

- **Spec coverage.** Every mandate in the prompt's §1–§10 is
  addressed: full inventory (§1), public surface (§2), per-symbol
  move list (§3), consumer table (§4), shadcn resolution (§5),
  internal back-edges (§6), per-module visual checks (§7),
  step-by-step sequence (§8), acceptance gate (§9), risk register
  (§10).
- **Departure from prompt's "shadcn deletion" sketch.** The prompt
  pre-supposed `core/ui/shadcn/` was a byte-equivalent duplicate.
  The audit (§5) found that's false — the two copies are
  intentionally divergent. The plan moves the folder verbatim
  rather than deleting it, and explains why deletion would
  silently change visual behavior. The implementer must NOT
  attempt to "merge" or "dedupe" shadcn primitives.
- **Departure from prompt's stage outline.** The prompt sketched
  Stages A–K with shadcn deletion in early stages. The plan
  re-orders so the shadcn move happens implicitly inside Stage E
  (it moves with the rest of `ui/`) and skips the deletion entirely.
- **Vanilla module placement (§10.R3).** The plan moves all 9
  modules together because (a) `markets-grid` is the only consumer
  today, and (b) splitting one module tree across two packages adds
  a confusing back-edge for zero benefit. Documented as a known
  trade-off; rollback path provided.
- **Type consistency.** No new types or method signatures are
  introduced. Every public re-export from `grid-react/src/index.ts`
  matches the corresponding entry in the old `core/src/index.ts`
  byte-for-byte (just with `./` paths instead of the original
  subdir name). The single new public symbol added to `core` is
  `IDirtyBus` (Stage B), which is a verbatim re-export of an
  existing internal type.
- **Plan length.** ~1700 lines — within the requested 1500–3000
  range. Brevity favored over padding once each section achieved
  unambiguous coverage.

---

## §12 Execution handoff

Plan complete and saved to
`docs/plans/plan-2026-05-07/pr-08-extract-grid-react.md`. Two
execution options:

**1. Subagent-Driven (recommended).** Dispatch a fresh subagent per
Stage (A → K), review between Stages, fast iteration. Each Stage's
verification gate runs before the subagent reports back. The shape
of each Stage was sized so a single subagent context can hold the
whole stage's edits.

**2. Inline Execution.** Execute Stages in this session using
`superpowers:executing-plans`. Batch execution with checkpoints
for user review at the per-Stage commits.

Either way: do NOT skip the verification gates. The bisect-ability
of this PR depends on each Stage being independently green.
