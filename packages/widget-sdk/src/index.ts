// @marketsui/widget-sdk — Stern Widget Framework SDK

// ============================================================================
// Type Definitions
// ============================================================================
export type {
  WidgetConfig,
  WidgetProps,
  WidgetContext,
  WidgetHostProps
} from './types/widget.js';

export type {
  PlatformAdapter,
  ParentIdentity
} from './types/platform.js';

export type {
  SettingsScreenContext,
  SettingsScreenDefinition
} from './types/settings.js';

export type {
  SlotContent,
  WidgetEnhancer,
  ActionContext,
  WidgetExtensionConfig
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
// Services
// ============================================================================
export { ConfigClient } from './services/configClient.js';
export { createConfigService } from './config/createConfigService.js';
export type { CreateConfigServiceOptions } from './config/createConfigService.js';

// ============================================================================
// Extensibility
// ============================================================================
export { renderSlot } from './extensibility/renderSlot.js';
export { createExtendedWidget } from './extensibility/createExtendedWidget.js';
export { compose } from './extensibility/compose.js';
