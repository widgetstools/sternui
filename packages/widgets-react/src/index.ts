// @marketsui/widgets — Stern Widget Components

// ─── Blotter primitives ──────────────────────────
export { BlotterToolbar } from './blotter/BlotterToolbar.js';
export type { BlotterToolbarProps } from './blotter/BlotterToolbar.js';

export { LayoutSelector } from './blotter/LayoutSelector.js';
export type { LayoutSelectorProps } from './blotter/LayoutSelector.js';

// ─── Types ────────────────────────────────────────
export type {
  BlotterSlots,
  BlotterSlotContext,
  ToolbarButton,
  GridColumnConfig,
  LayoutState,
} from './blotter/types.js';

// ─── Hooks ────────────────────────────────────────
export { useBlotterDataConnection } from './blotter/hooks/useBlotterDataConnection.js';
export type { UseBlotterDataConnectionOptions, UseBlotterDataConnectionResult } from './blotter/hooks/useBlotterDataConnection.js';

export { useGridStateManager } from './blotter/hooks/useGridStateManager.js';
export type { GridStateManagerResult } from './blotter/hooks/useGridStateManager.js';

// ─── DI / Provider ───────────────────────────────
export { BlotterProvider, useBlotterDI } from './BlotterProvider.js';
export type { BlotterDependencies, BlotterProviderProps } from './BlotterProvider.js';

// ─── Interfaces ───────────────────────────────────
export type { IBlotterDataProvider, IActionRegistry } from './interfaces.js';

// ─── AG Grid Theme ───────────────────────────────
export { sternDarkTheme, sternLightTheme, useAgGridTheme } from './theme/index.js';

// ─── Provider Editor (v2) and Data Provider Selector (v2) ─────────
// The v1 mirrored editor/selector are gone; consumers import the
// v2 surfaces directly via subpath:
//   import { DataProviderEditor } from '@marketsui/widgets-react/v2/provider-editor';
//   import { DataProviderSelector } from '@marketsui/widgets-react/v2/data-provider-selector';
//   import { MarketsGridContainer } from '@marketsui/widgets-react/v2/markets-grid-container';

// ─── Dock Configurator ───────────────────────────
export { DockConfigurator } from './dock/DockConfigurator.js';
export type { DockConfiguratorProps } from './dock/DockConfigurator.js';

// ─── Hosted-feature wrappers (public API) ────────
// Subpath: '@marketsui/widgets-react/hosted'
// Re-exported here for convenience; new consumers should prefer the
// subpath import for treeshakability.
export type {
  HostedContext,
  RegisteredComponentMetadata,
  ConfigManager,
  StorageAdapterFactory,
  HostedMarketsGridProps,
} from './hosted/index.js';
export { HostedMarketsGrid } from './hosted/index.js';

// ─── OpenFin Hooks ───────────────────────────────
export { useOpenfinTheme } from './hooks/openfin/useOpenfinTheme.js';
export { useViewManager } from './hooks/openfin/useViewManager.js';
export type { UseViewManagerReturn } from './hooks/openfin/useViewManager.js';
export { useOpenFinEvents } from './hooks/openfin/useOpenFinEvents.js';
export type { UseOpenFinEventsReturn } from './hooks/openfin/useOpenFinEvents.js';
