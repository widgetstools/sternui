/// <reference path="../types/openfin.d.ts" />

/**
 * OpenFinAdapter — implements PlatformAdapter from @marketsui/widget-sdk.
 *
 * Maps the abstract platform interface to OpenFin Workspace APIs:
 * - openWidget → platform.createView()
 * - broadcast/subscribe → IAB (Inter-Application Bus)
 * - onPlatformSave → workspace lifecycle events
 * - openSettingsScreen → platform.createWindow() with URL
 * - getInstanceId → fin.View.getCurrentSync().identity.name
 * - getLaunchData → view customData
 */

import type { PlatformAdapter, ParentIdentity } from '@marketsui/widget-sdk';
import { iabService } from '../services/OpenfinIABService.js';
import { platformContext } from '../core/PlatformContext.js';

export interface OpenFinAdapterOptions {
  /** Base URL for constructing widget/settings URLs */
  baseUrl?: string;
  /** URL builder: given widget type, produce the full URL */
  buildWidgetUrl?: (type: string, data?: Record<string, unknown>) => string;
  /** URL builder: given screen ID + parent identity, produce the settings URL */
  buildSettingsUrl?: (screenId: string, parent: ParentIdentity, data?: Record<string, unknown>) => string;
}

export class OpenFinAdapter implements PlatformAdapter {
  readonly name = 'openfin';
  readonly isOpenFin = true;

  private instanceId: string;
  private launchData: Record<string, unknown> | null = null;
  private options: OpenFinAdapterOptions;

  constructor(options: OpenFinAdapterOptions = {}) {
    this.options = options;

    // Attempt to get instance ID from OpenFin view identity
    try {
      if (typeof window !== 'undefined' && (window as any).fin) {
        const view = fin.View.getCurrentSync();
        this.instanceId = view.identity.name || `openfin-${crypto.randomUUID()}`;
      } else {
        this.instanceId = `openfin-${crypto.randomUUID()}`;
      }
    } catch {
      this.instanceId = `openfin-${crypto.randomUUID()}`;
    }

    // Extract launch data from view customData
    this.extractLaunchData();
  }

  private async extractLaunchData(): Promise<void> {
    try {
      if (typeof window === 'undefined' || !(window as any).fin) return;

      const view = fin.View.getCurrentSync();
      const options = await view.getOptions();
      const customData = (options as any).customData;
      if (customData) {
        this.launchData = customData as Record<string, unknown>;
      }
    } catch {
      // Not in a view context, or no customData
    }
  }

  // ─── Widget Lifecycle ──────────────────────────────

  async openWidget(type: string, data?: Record<string, unknown>): Promise<string> {
    const url = this.options.buildWidgetUrl
      ? this.options.buildWidgetUrl(type, data)
      : `${this.options.baseUrl || window.location.origin}/${type}`;

    try {
      const { getCurrentSync } = await import('@openfin/workspace-platform');
      const platform = getCurrentSync();

      const viewName = `${type}-${Date.now()}`;
      await platform.createView({
        name: viewName,
        url,
        customData: { widgetType: type, ...data },
      } as any);

      platformContext.logger.info(`Opened widget: ${type}`, { viewName, url }, 'OpenFinAdapter');
      return viewName;
    } catch (error) {
      platformContext.logger.error('Failed to open widget', error, 'OpenFinAdapter');
      throw error;
    }
  }

  async closeWidget(instanceId: string): Promise<void> {
    try {
      const view = fin.View.wrapSync({ uuid: fin.me.uuid, name: instanceId });
      await (view as any).close?.();
      platformContext.logger.info(`Closed widget: ${instanceId}`, undefined, 'OpenFinAdapter');
    } catch (error) {
      platformContext.logger.error('Failed to close widget', error, 'OpenFinAdapter');
    }
  }

  // ─── Communication ────────────────────────────────

  broadcast(topic: string, data: unknown): void {
    iabService.broadcast(topic, data).catch(error => {
      platformContext.logger.error('Broadcast failed', error, 'OpenFinAdapter');
    });
  }

  subscribe(topic: string, handler: (data: unknown) => void): () => void {
    return iabService.subscribe(topic, (message) => {
      handler(message.payload);
    });
  }

  // ─── Lifecycle Hooks ──────────────────────────────

  onPlatformSave(handler: () => Promise<void>): () => void {
    // Listen for workspace save events via IAB
    return iabService.subscribe('stern-platform:workspace-save', async () => {
      try {
        await handler();
      } catch (error) {
        platformContext.logger.error('Platform save handler failed', error, 'OpenFinAdapter');
      }
    });
  }

  onPlatformDestroy(handler: () => void): () => void {
    // Listen for view close/destroy
    if (typeof window === 'undefined' || !(window as any).fin) {
      return () => {};
    }

    try {
      const view = fin.View.getCurrentSync();
      const listener = () => handler();
      view.on('destroyed', listener);
      return () => { view.removeListener('destroyed', listener); };
    } catch {
      // Fallback to beforeunload
      const listener = () => handler();
      window.addEventListener('beforeunload', listener);
      return () => window.removeEventListener('beforeunload', listener);
    }
  }

  // ─── Settings Screens ─────────────────────────────

  async openSettingsScreen(
    screenId: string,
    parentIdentity: ParentIdentity,
    data?: Record<string, unknown>
  ): Promise<void> {
    const url = this.options.buildSettingsUrl
      ? this.options.buildSettingsUrl(screenId, parentIdentity, data)
      : `${this.options.baseUrl || window.location.origin}/settings/${screenId}?` +
        `configId=${encodeURIComponent(parentIdentity.configId)}` +
        `&instanceId=${encodeURIComponent(parentIdentity.instanceId)}` +
        `&viewId=${encodeURIComponent(parentIdentity.viewId)}`;

    try {
      const { getCurrentSync } = await import('@openfin/workspace-platform');
      const platform = getCurrentSync();

      await platform.createWindow({
        name: `settings-${screenId}-${Date.now()}`,
        url,
        defaultWidth: 800,
        defaultHeight: 600,
        defaultCentered: true,
        autoShow: true,
        frame: true,
        resizable: true,
        contextMenu: true,
      } as any);

      platformContext.logger.info(`Opened settings: ${screenId}`, { parentIdentity }, 'OpenFinAdapter');
    } catch (error) {
      platformContext.logger.error('Failed to open settings screen', error, 'OpenFinAdapter');
      throw error;
    }
  }

  onSettingsResult(handler: (result: unknown) => void): () => void {
    return iabService.subscribe('stern-platform:settings-result', (message) => {
      handler(message.payload);
    });
  }

  // ─── Platform Info ────────────────────────────────

  getInstanceId(): string {
    return this.instanceId;
  }

  getLaunchData(): Record<string, unknown> | null {
    return this.launchData;
  }
}
