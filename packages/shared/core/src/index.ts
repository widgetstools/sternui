/**
 * @starui/core — vanilla-only after PR-8.
 *
 *   platform/      framework-agnostic runtime (GridPlatform, store, events, api hub)
 *   expression/    CSP-safe expression engine
 *   layouts/       LayoutManager (storage-agnostic state machine)
 *   persistence/   StorageAdapter implementations (Memory, Dexie)
 *   security/      expression-policy (CSP gate)
 *   history/       framework-agnostic undo/redo stack
 *   colDef/        AG-Grid column-def helpers (formatters, style→ag mappers)
 *   css/           CSS injection utilities (injectEditorStyles)
 *   types/         shared TypeScript types
 *   utils/         openFin shim + small helpers
 *
 * Every React UI primitive, hook, and module panel that previously lived
 * here was extracted into `@starui/grid-react` in PR-8. Apps that
 * consumed React surfaces from `@starui/core` should switch their
 * import to `@starui/grid-react` (path/name unchanged for every symbol).
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
  DexieAdapter,
  RESERVED_DEFAULT_LAYOUT_ID,
  activeLayoutKey,
  legacyActiveLayoutKey,
  type LayoutSnapshot,
  type StorageAdapter,
} from './persistence';

// ─── Layout manager ─────────────────────────────────────────────────────────
export { LayoutManager } from './layouts';
export type {
  ActiveIdSource,
  LayoutManagerOptions,
  LayoutManagerState,
  LayoutMeta,
  ExportedLayoutPayload,
} from './layouts';

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

// ─── OpenFin shim ───────────────────────────────────────────────────────────
export { openFinWindowOpener, isOpenFin } from './utils/openFin';

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
  PresetId,
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
} from './colDef';
