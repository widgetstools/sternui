/**
 * @grid-customizer/core — v3.
 *
 * One package, no `-v2` suffix, no React-vs-vanilla split yet (that's a
 * future packaging decision). Keeps the layering clean internally:
 *
 *   platform/      framework-agnostic runtime (GridPlatform, store, events, api hub)
 *   expression/    CSP-safe expression engine (unchanged from v2)
 *   hooks/         thin React bindings for the platform
 *   ui/            React UI primitives (shadcn, format-editor, ExpressionEditor, …)
 *   modules/       individual modules (each exports a Module<S> + a React panel)
 *   …              shared helpers that don't need a React boundary
 *
 * Public surface kept narrow — consumers import modules by name from
 * `./modules/<moduleId>`.
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
  CssHandle,
  EditorPaneProps,
  ExpressionEngineLike,
  GridApi,
  GridOptions,
  GetRowIdFunc,
  GetRowIdParams,
  ListPaneProps,
  Module,
  PlatformEventMap,
  PlatformHandle,
  SerializedState,
  SettingsPanelProps,
  Store,
  TransformContext,
} from './platform';

// ─── Store + React bindings ─────────────────────────────────────────────────
export { createGridStore } from './store/createGridStore';
export type { CreateStoreOptions } from './store/createGridStore';
export { GridProvider, useGridPlatform, useModuleState, useGridApi, useGridEvent } from './hooks';

// ─── Expression Engine (unchanged, re-exported) ─────────────────────────────
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

// ─── Monaco ExpressionEditor (unchanged, re-exported) ───────────────────────
export { ExpressionEditor } from './ui/ExpressionEditor';
export type { ExpressionEditorProps, ExpressionEditorHandle } from './ui/ExpressionEditor';

// ─── Types ──────────────────────────────────────────────────────────────────
export type { CellStyleProperties, ThemeAwareStyle } from './types/common';

// ─── Shared CSS / cockpit tokens ────────────────────────────────────────────
export { settingsCSS, STYLE_ID } from './ui/styles';

// ─── shadcn primitives ──────────────────────────────────────────────────────
export { Button, buttonVariants } from './ui/shadcn/button';
export type { ButtonProps } from './ui/shadcn/button';
export { Input } from './ui/shadcn/input';
export { Textarea, type TextareaProps } from './ui/shadcn/textarea';
export type { InputProps } from './ui/shadcn/input';
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

// ─── Format editor primitives (unchanged) ───────────────────────────────────
export {
  FormatPopover,
  FormatDropdown,
  FormatColorPicker,
  FormatSwatch,
  BorderSidesEditor,
  registerPopoverRoot,
  clickIsInsideAnyOpenPopover,
  EDGE_ORDER,
  defaultSideSpec,
  makeDefaultSides,
} from './ui/format-editor';
export type { BorderSide, BorderStyle, BorderMode, SideSpec } from './ui/format-editor';
