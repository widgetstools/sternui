/**
 * OpenFin Event Topics and Types — type-safe IAB custom events.
 */

export enum OpenFinCustomEvents {
  THEME_CHANGE = 'stern-platform:theme-change',
  CONFIG_UPDATED = 'stern-platform:config-updated',
  DATA_REFRESH = 'stern-platform:data-refresh',
  BLOTTER_UPDATE = 'stern-platform:blotter-update',
  PROVIDER_STATUS = 'stern-platform:provider-status',
  APPDATA_UPDATED = 'stern-platform:appdata-updated',
}

export enum OpenFinPlatformEvents {
  WORKSPACE_SAVED = 'workspace-saved',
  WORKSPACE_LOADED = 'workspace-loaded',
  VIEW_CLOSED = 'view-closed',
  VIEW_FOCUSED = 'view-focused',
  VIEW_BLURRED = 'view-blurred',
  WINDOW_CLOSED = 'window-closed',
  WINDOW_FOCUSED = 'window-focused',
  PAGE_CHANGED = 'page-changed',
  LAYOUT_READY = 'layout-ready',
}

export interface ThemeChangeEvent { theme: 'light' | 'dark'; }
export interface ConfigUpdatedEvent { configId: string; componentType: string; componentSubType?: string; timestamp: number; }
export interface DataRefreshEvent { source: string; timestamp: number; }
export interface BlotterUpdateEvent { blotterId: string; updateType: 'insert' | 'update' | 'delete'; rowCount: number; }
export interface ProviderStatusEvent { providerId: string; status: 'connected' | 'connecting' | 'disconnected' | 'error'; message?: string; }
export interface AppDataUpdatedEvent { providerId: string; providerName: string; variables: Record<string, any>; updatedKeys: string[]; timestamp: number; }

export interface OpenFinEventMap {
  [OpenFinCustomEvents.THEME_CHANGE]: ThemeChangeEvent;
  [OpenFinCustomEvents.CONFIG_UPDATED]: ConfigUpdatedEvent;
  [OpenFinCustomEvents.DATA_REFRESH]: DataRefreshEvent;
  [OpenFinCustomEvents.BLOTTER_UPDATE]: BlotterUpdateEvent;
  [OpenFinCustomEvents.PROVIDER_STATUS]: ProviderStatusEvent;
  [OpenFinCustomEvents.APPDATA_UPDATED]: AppDataUpdatedEvent;
}

export type OpenFinCustomEventTopic = keyof OpenFinEventMap;
export type OpenFinEventHandler<E extends OpenFinCustomEventTopic> = (data: OpenFinEventMap[E]) => void;
export type UnsubscribeFunction = () => void;
