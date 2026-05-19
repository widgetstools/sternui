/**
 * @stargrid/engine — vanilla grid platform (ported from @starui/core).
 *
 *   platform/      GridPlatform, store, events, api hub
 *   expression/    CSP-safe expression engine
 *   profiles/      ProfileManager
 *   persistence/   StorageAdapter implementations
 *   security/      expression-policy (CSP gate)
 *   history/       undo/redo stack
 *   colDef/        AG-Grid column-def helpers
 *   css/           CSS injection utilities
 *
 * React UI lives in `@stargrid/grid` (phase 3). OpenFin utilities removed
 * from engine — they belong in `@stargrid/host-openfin` or `@stargrid/grid`.
 */

// ─── Platform runtime (framework-agnostic) ──────────────────────────────────
export {
  GridPlatform,
  EventBus,
  topoSortModules,
  ApiHub,
  ResourceScope,
  CssInjector,
  PipelineRunner,
} from './platform';
export type {
  GridPlatformOptions,
  AnyColDef,
  AnyModule,
  ApiEventName,
  AppDataLookup,
  CssHandle,
  EditorPaneProps,
  ExpressionEngineLike,
  GridApi,
  GridOptions,
  GetRowIdFunc,
  GetRowIdParams,
  IDirtyBus,
  ListPaneProps,
  Module,
  PlatformEventMap,
  PlatformHandle,
  SerializedState,
  SettingsPanelProps,
  Store,
  TransformContext,
} from './platform';

// ─── Store + auto-save ──────────────────────────────────────────────────────
export { createGridStore } from './store/createGridStore';
export type { CreateStoreOptions } from './store/createGridStore';
export { startAutoSave } from './store/autosave';
export type { AutoSaveHandle, AutoSaveOptions } from './store/autosave';

// ─── Persistence adapters ───────────────────────────────────────────────────
export {
  MemoryAdapter,
  LocalStorageBundleAdapter,
  marketsGridLocalStorageBundleKey,
  RESERVED_DEFAULT_PROFILE_ID,
  activeProfileKey,
  type MarketsGridLocalStorageConfig,
  type ProfileSnapshot,
  type StorageAdapter,
} from './persistence';

// ─── Profile manager ────────────────────────────────────────────────────────
export { ProfileManager } from './profiles';
export type {
  ActiveIdSource,
  ProfileManagerOptions,
  ProfileManagerState,
  ProfileMeta,
  ExportedProfilePayload,
} from './profiles';

// ─── Security policy ────────────────────────────────────────────────────────
//
// Runtime gate for the `kind: 'expression'` valueFormatter escape hatch
// (compiled via `new Function`, therefore CSP-unsafe). Set to `'strict'`
// at boot when running under a `script-src` CSP that forbids
// `unsafe-eval`. See docs in `./security/expressionPolicy.ts`.
export {
  configureExpressionPolicy,
  getExpressionPolicy,
} from './security/expressionPolicy';
export type {
  ExpressionPolicy,
  ExpressionPolicyMode,
  ExpressionPolicyViolation,
} from './security/expressionPolicy';

// ─── History (framework-agnostic; the non-React core of useUndoRedo) ────────
export { HistoryStack, type HistoryStackOptions } from './history/HistoryStack';

// `GridStore` is a back-compat alias for `Store` — vanilla, stays here.
export type { Store as GridStore } from './platform/types';

// ─── Expression Engine ──────────────────────────────────────────────────────
export {
  ExpressionEngine,
  tokenize,
  parse,
  Evaluator,
  tryCompileToAgString,
} from './expression';
export type {
  ExpressionNode,
  EvaluationContext,
  ValidationResult,
  FunctionDefinition,
} from './expression';
export { migrateExpressionSyntax, migrateExpressionsInObject } from './expression/migrate';

// ─── Types ──────────────────────────────────────────────────────────────────
export type { CellStyleProperties, ThemeAwareStyle } from './types/common';

// ─── Shared CSS utilities ────────────────────────────────────────────────────
export { injectEditorStyles } from './css';

// ─── Shared colDef types + helpers ─────────────────────────────────────────
//
// `ColumnAssignment` exported here is the BASE shape (with `unknown`
// `filter` / `rowGrouping` slots) — exposed as `BaseColumnAssignment`
// because the NARROWED variant lives next to its consumers in
// `@starui/grid-react`'s column-customization module.
export type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment as BaseColumnAssignment,
  ColumnDataType,
  GridThemeMode,
  PresetId,
  ThemedCellStyleOverrides,
  TickToken,
  ValueFormatterTemplate,
} from './colDef';
export {
  valueFormatterFromTemplate,
  excelFormatter,
  excelFormatColorResolver,
  isValidExcelFormat,
  tickFormatter,
  presetToExcelFormat,
  cellStyleToAgStyle,
  getActiveTheme,
  mergeThemedStyle,
  migrateThemedStyle,
  patchActiveStyle,
  resolveActiveStyle,
} from './colDef';
