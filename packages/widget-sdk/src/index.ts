// @marketsui/widget-sdk — Stern Widget Framework SDK

// ============================================================================
// Type Definitions
// ============================================================================
export type {
  WidgetConfig,
  WidgetProps,
  WidgetContext,
  WidgetHostProps,
} from './types/widget.js';

export type {
  PlatformAdapter,
  ParentIdentity,
} from './types/platform.js';

export type {
  SettingsScreenContext,
  SettingsScreenDefinition,
} from './types/settings.js';

export type {
  SlotContent,
  WidgetEnhancer,
  ActionContext,
  WidgetExtensionConfig,
} from './types/slots.js';

// ============================================================================
// Registry
// ============================================================================
export { WidgetRegistry } from './registry/WidgetRegistry.js';

// ============================================================================
// Providers
// ============================================================================
export { WidgetHost, useWidgetHost } from './providers/WidgetHost.js';

// ============================================================================
// Hooks
// ============================================================================
export { useWidget } from './hooks/useWidget.js';
export { useSettingsScreen } from './hooks/useSettingsScreen.js';

// ============================================================================
// Adapters
// ============================================================================
export { BrowserAdapter } from './adapters/BrowserAdapter.js';

// ============================================================================
// Layout helpers (thin functions over the unified ConfigClient)
// ============================================================================
export {
  getLayouts,
  saveLayout,
  loadLayout,
  deleteLayout,
} from './services/widgetLayouts.js';

// ============================================================================
// Config service re-exports
// ============================================================================
// For convenience — same client that useWidgetHost() provides.
export { createConfigClient } from '@marketsui/config-service';
export type {
  ConfigClient,
  CreateConfigClientOptions,
} from '@marketsui/config-service';

// ============================================================================
// Extensibility
// ============================================================================
export { renderSlot } from './extensibility/renderSlot.js';
export { createExtendedWidget } from './extensibility/createExtendedWidget.js';
export { compose } from './extensibility/compose.js';
