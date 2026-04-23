// @stern/widgets — Stern Widget Components

// ─── SimpleBlotter ────────────────────────────────
export { SimpleBlotter } from './blotter/SimpleBlotter.js';
export type { SimpleBlotterProps } from './blotter/SimpleBlotter.js';

export { BlotterGrid } from './blotter/BlotterGrid.js';
export type { BlotterGridProps } from './blotter/BlotterGrid.js';

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

// ─── Provider Editor ────────────────────────────
export * from './provider-editor/index.js';

// ─── Dock Configurator ───────────────────────────
export { DockConfigurator } from './dock/DockConfigurator.js';
export type { DockConfiguratorProps } from './dock/DockConfigurator.js';

// ─── OpenFin Hooks ───────────────────────────────
export { useOpenfinTheme } from './hooks/openfin/useOpenfinTheme.js';
export { useViewManager } from './hooks/openfin/useViewManager.js';
export type { UseViewManagerReturn } from './hooks/openfin/useViewManager.js';
export { useOpenFinEvents } from './hooks/openfin/useOpenFinEvents.js';
export type { UseOpenFinEventsReturn } from './hooks/openfin/useOpenFinEvents.js';
