/**
 * @grid-customizer/core — shared primitives used by core-v2 and the
 * markets-grid-v2 host.
 *
 * v2-only since the v1 code was removed. Exposes:
 *   - The CSP-safe ExpressionEngine + Monaco-based ExpressionEditor
 *   - shadcn UI primitives (Button, Popover, AlertDialog, Switch, Select,
 *     Tooltip, ToggleGroup, ColorPicker, Separator, Label, cn, …)
 *   - Format-editor primitives (FormatPopover, FormatDropdown,
 *     FormatColorPicker, FormatSwatch, BorderSidesEditor, …)
 *   - Shared style / cockpit CSS
 *   - The minimal type surface v2 modules need (CellStyleProperties,
 *     ThemeAwareStyle, ExpressionNode)
 */

// ─── Expression Engine ───────────────────────────────────────────────────────
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

// ─── Expression Editor (Monaco-based, reusable across all panels) ───────────
export { ExpressionEditor } from './ui/ExpressionEditor';
export type { ExpressionEditorProps, ExpressionEditorHandle } from './ui/ExpressionEditor';

// ─── Types ───────────────────────────────────────────────────────────────────
export type { CellStyleProperties, ThemeAwareStyle } from './types/common';

// ─── Shared CSS / cockpit tokens ────────────────────────────────────────────
export { settingsCSS, STYLE_ID } from './ui/styles';

// ─── Shadcn UI primitives ────────────────────────────────────────────────────
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

// ─── Format Editor primitives (Figma-inspired, portal-based) ────────────────
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
