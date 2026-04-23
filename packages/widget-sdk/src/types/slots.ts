import type { WidgetProps } from './widget.js';

/**
 * SlotContent — a slot can be a static React node or a render function.
 * The generic `C` is the context passed to render functions.
 */
export type SlotContent<C = Record<string, unknown>> = React.ReactNode | ((context: C) => React.ReactNode);

/**
 * WidgetEnhancer — a higher-order component that wraps a widget.
 * Must preserve the base WidgetProps signature.
 */
export type WidgetEnhancer<P extends WidgetProps = WidgetProps> =
  (Component: React.ComponentType<P>) => React.ComponentType<P>;

/**
 * ActionContext — context passed to toolbar action handlers.
 */
export interface ActionContext {
  selectedRows: Record<string, unknown>[];
  selectedRow: Record<string, unknown> | null;
  configId: string;
  userId: string;
  [key: string]: unknown;
}

/**
 * WidgetExtensionConfig — configuration for createExtendedWidget().
 * Defines slots, toolbar actions, and wrapper components.
 */
export interface WidgetExtensionConfig<S = Record<string, SlotContent>> {
  displayName?: string;
  slots?: S;
  toolbarActions?: Record<string, (ctx: ActionContext) => void>;
  wrappers?: React.ComponentType<{ children: React.ReactNode }>[];
}
