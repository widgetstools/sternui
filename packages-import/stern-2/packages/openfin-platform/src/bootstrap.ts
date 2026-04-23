/// <reference path="./types/openfin.d.ts" />
/**
 * bootstrapPlatform — single entry point for OpenFin platform initialization.
 * Implements MarketsUI Lean Spec v1.3 §4.
 *
 * The dock module (openfinDock.ts) lives in the reference app to avoid a
 * circular package dependency. Callers inject it via opts.dockActions.
 */

import { init } from '@openfin/workspace-platform';
import type { WorkspacePlatformOverrideCallback } from '@openfin/workspace-platform';
import { createConfigService } from '@stern/widget-sdk';
import type { ConfigService, ConfigRow } from '@stern/shared-types';
import { ConfigId } from '@stern/shared-types';
import { dataProviderConfigService } from '@stern/widgets';
import { THEME_PALETTES } from './platform/openfinThemePalettes.js';
import { buildUrl } from './utils/urlHelper.js';
import { registerConfigLookupCallback } from './platform/menuLauncher.js';
import type { DockMenuItem } from './types/dockConfig.js';
import { createMenuItem } from './types/dockConfig.js';

// ============================================================================
// AppContext
// ============================================================================

export interface AppConfig {
  appId: string;
  env: 'development' | 'staging' | 'production';
  config: {
    enabled: boolean;   // false → IndexedDB only; true → REST + mirror
    baseUrl?: string;
  };
  userId?: string;
}

export class AppContext {
  static instance: AppConfig;

  /** Read config from OpenFin manifest customData. */
  static async init(): Promise<void> {
    try {
      const app = fin.Application.getCurrentSync();
      const info = await app.getInfo();
      const customData = (info.initialOptions as any)?.customData ?? {};
      AppContext.instance = {
        appId:  customData.appId  ?? 'stern-platform',
        env:    customData.env    ?? 'development',
        userId: customData.userId ?? 'default-user',
        config: {
          enabled: customData.config?.enabled ?? false,
          baseUrl: customData.config?.baseUrl,
        },
      };
    } catch {
      AppContext.instance = {
        appId:  'stern-platform',
        env:    'development',
        userId: 'default-user',
        config: { enabled: false },
      };
    }
  }

  /** Override for browser/test environments. */
  static configure(cfg: AppConfig): void {
    AppContext.instance = cfg;
  }
}

// ============================================================================
// resolveInstanceId — clone detection (§5)
// ============================================================================

export async function resolveInstanceId(): Promise<string> {
  const urlId = new URLSearchParams(location.search).get('id');
  if (!urlId) return '';

  try {
    const info = await fin.me.getInfo();
    const windowName = (info as any).name as string;
    if (windowName === urlId) return urlId;

    // Clone detected — create new instance from source
    const inst = AppContext.instance ?? { appId: 'stern-platform', userId: 'default-user' };
    const cs = createConfigService({ mode: 'indexeddb', appId: inst.appId, userId: inst.userId ?? 'default-user' });
    const { configType, configSubType } = ConfigId.parse(urlId);
    const newId = ConfigId.instance(configType, configSubType);
    await cs.clone(urlId, newId);
    await (fin.me as any).updateOptions({ name: newId, customData: { instanceId: newId } });
    history.replaceState(null, '', `?id=${encodeURIComponent(newId)}`);
    return newId;
  } catch {
    return urlId;
  }
}

// ============================================================================
// DockActions — injected to avoid circular package dependency
// ============================================================================

export interface DockActions {
  register(config: {
    id: string; title: string; icon: string;
    menuItems?: DockMenuItem[];
  }): Promise<unknown>;
  updateConfig(config: { menuItems?: DockMenuItem[] }): Promise<void>;
  show(): Promise<void>;
  deregister(): Promise<void>;
  isDockAvailable(): boolean;
  dockGetCustomActions(): Record<string, (...args: any[]) => Promise<void>>;
  setQuitting(): void;
}

// ============================================================================
// Seed helpers
// ============================================================================

export interface RegistrationEntry {
  configType: string;
  configSubType: string;
  url: string;
  width?: number;
  height?: number;
  label?: string;
  icon?: string;
}

async function seedAdminComponents(
  cs: ConfigService,
  appId: string,
  registrations: RegistrationEntry[],
  defaultDockItems: DockMenuItem[],
): Promise<void> {
  for (const reg of registrations) {
    const regId  = ConfigId.registration(reg.configType, reg.configSubType);
    const existing = await cs.get(regId);
    if (!existing) {
      await cs.save({
        id: regId,
        appId,
        configType: reg.configType,
        configSubType: reg.configSubType,
        type: 'registration',
        config: {
          displayName: reg.label ?? `${reg.configType}/${reg.configSubType}`,
          url: reg.url,
          width: reg.width ?? 1200,
          height: reg.height ?? 800,
          iconUrl: reg.icon ?? '',
        },
      });
      await cs.save({
        id: ConfigId.template(reg.configType, reg.configSubType),
        appId,
        configType: reg.configType,
        configSubType: reg.configSubType,
        type: 'template',
        config: {},
      });
    }
  }

  const treeRow = await cs.get('DOCK_MENU_TREE');
  if (!treeRow) {
    await cs.save({
      id: 'DOCK_MENU_TREE',
      appId,
      configType: 'DOCK',
      configSubType: 'MENU_TREE',
      type: 'template',
      config: { items: defaultDockItems },
    });
  }
}

// ============================================================================
// launch()
// ============================================================================

async function launch(
  configType: string,
  configSubType: string,
  cs: ConfigService,
  appId: string,
): Promise<string> {
  const regId = ConfigId.registration(configType, configSubType);
  const reg = await cs.get(regId);
  if (!reg) throw new Error(`launch: not registered — ${regId}`);

  const instanceId = ConfigId.instance(configType, configSubType);
  await cs.clone(ConfigId.template(configType, configSubType), instanceId);

  const regCfg = reg.config as { url: string; width?: number; height?: number };
  const url = `${buildUrl(regCfg.url)}?id=${encodeURIComponent(instanceId)}`;

  await fin.Window.create({
    name: instanceId,
    url,
    defaultWidth:    regCfg.width  ?? 1200,
    defaultHeight:   regCfg.height ?? 800,
    defaultCentered: true,
    autoShow: true,
    frame: true,
    resizable: true,
    saveWindowState: false,
    customData: { instanceId, appId },
  } as any);

  return instanceId;
}

// ============================================================================
// bootstrapPlatform
// ============================================================================

export interface BootstrapPlatformOptions {
  dock: { title: string; icon: string };
  /** Injected dock module (openfinDock.ts) — avoids circular package dep. */
  dockActions: DockActions;
  /** Component registrations to seed on first launch. */
  registrations?: RegistrationEntry[];
  /** Default dock menu items (used if DOCK_MENU_TREE row absent). */
  defaultDockItems?: DockMenuItem[];
  onReady?: () => void;
}

export async function bootstrapPlatform(opts: BootstrapPlatformOptions): Promise<void> {
  const { dockActions: d } = opts;

  const analyticsErrorHandler = (event: PromiseRejectionEvent) => {
    if (
      event.reason?.message?.includes('system topic payload') ||
      event.reason?.message?.includes('registerUsage')
    ) {
      event.preventDefault();
    }
  };
  window.addEventListener('unhandledrejection', analyticsErrorHandler);

  try {
    await AppContext.init();
    const cfg = AppContext.instance;

    const apiUrl = await getManifestApiUrl();
    if (apiUrl) dataProviderConfigService.configure({ apiUrl });

    const baseUrl = cfg.config.baseUrl ?? `${apiUrl ?? 'http://localhost:3001'}/api/v1`;
    const cs = createConfigService({
      mode:    cfg.config.enabled ? 'rest' : 'indexeddb',
      appId:   cfg.appId,
      userId:  cfg.userId ?? 'default-user',
      baseUrl: cfg.config.enabled ? baseUrl : undefined,
    });

    const defaultDockItems: DockMenuItem[] = opts.defaultDockItems ?? (opts.registrations ?? []).map((r, i) =>
      createMenuItem({
        id:       `${r.configType}-${r.configSubType}`.toLowerCase(),
        caption:  r.label ?? `${r.configType}/${r.configSubType}`,
        url:      r.url,
        openMode: 'view',
        order:    i,
      })
    );

    await seedAdminComponents(cs, cfg.appId, opts.registrations ?? [], defaultDockItems);

    // Register launch() as config lookup callback for dock menu items
    registerConfigLookupCallback(async (itemId) => {
      const parts = itemId.toUpperCase().split('-');
      if (parts.length >= 2) {
        try {
          const instanceId = await launch(parts[0], parts.slice(1).join('_'), cs, cfg.appId);
          return { configId: instanceId, isExisting: false };
        } catch { /* not a registered component — use direct URL */ }
      }
      return { configId: itemId, isExisting: true };
    });

    // Platform override: closeWindow/quit guard + workspace save/restore
    let closingWindowCount = 0;
    const overrideCallback: WorkspacePlatformOverrideCallback = async (WorkspacePlatformProvider) => {
      class SternPlatformProvider extends WorkspacePlatformProvider {
        async closeWindow(
          ...args: Parameters<InstanceType<typeof WorkspacePlatformProvider>['closeWindow']>
        ) {
          closingWindowCount++;
          try { return await super.closeWindow(...args); }
          finally { closingWindowCount--; }
        }

        async quit(
          ...args: Parameters<InstanceType<typeof WorkspacePlatformProvider>['quit']>
        ) {
          if (closingWindowCount > 0) return;
          d.setQuitting();
          return super.quit(...args);
        }

        async createSavedWorkspace(req: any) {
          try {
            const snapshot = await fin.Platform.getCurrentSync().getSnapshot();
            const instanceIds: string[] = [];
            for (const w of (snapshot.windows ?? [])) {
              collectIds(w, instanceIds);
            }
            await cs.save({
              appId: cfg.appId,
              configType: 'WORKSPACE',
              configSubType: 'SNAPSHOT',
              type: 'workspace',
              config: {
                name: req?.workspace?.title ?? 'Workspace',
                openfinSnapshot: req,
                instanceIds,
              },
            });
          } catch { /* best-effort */ }
          return super.createSavedWorkspace(req);
        }

        async getSavedWorkspace(id: string) {
          try {
            const row: ConfigRow | null = await cs.get(`WS_${id}`);
            if (row?.config?.openfinSnapshot) return row.config.openfinSnapshot as any;
          } catch { /* fall through */ }
          return super.getSavedWorkspace(id);
        }
      }
      return new SternPlatformProvider();
    };

    try {
      await init({
        browser: {
          defaultWindowOptions: {
            icon: opts.dock.icon,
            workspacePlatform: { pages: [], favicon: opts.dock.icon },
          },
        },
        theme: [{ label: 'Stern Theme', default: 'dark', palettes: THEME_PALETTES as any }],
        customActions: d.dockGetCustomActions(),
        overrideCallback,
      } as any);
    } catch (e: unknown) {
      if (!(e as Error)?.message?.includes('system topic payload')) throw e;
      console.warn('[bootstrap] Analytics error during init (non-fatal)');
    }

    fin.Platform.getCurrentSync().once('platform-api-ready', async () => {
      try {
        await new Promise<void>((r) => setTimeout(r, 500));

        if (d.isDockAvailable()) {
          try {
            const treeRow = await cs.get('DOCK_MENU_TREE');
            const rawItems = treeRow?.config?.items;
            const items: DockMenuItem[] = Array.isArray(rawItems) ? rawItems : defaultDockItems;
            await d.register({ id: `${cfg.appId}-dock`, title: opts.dock.title, icon: opts.dock.icon, menuItems: items });
          } catch (e: any) {
            if (!e?.message?.includes('system topic payload')) throw e;
          }
          await d.show();
        }

        const providerWindow = fin.Window.getCurrentSync();
        await providerWindow.hide();
        providerWindow.once('close-requested', async () => {
          try { await d.deregister(); } catch { /* ignore */ }
          try { await providerWindow.close(true); } catch { /* ignore */ }
        });

        // IAB: dock editor
        await fin.InterApplicationBus.subscribe(
          { uuid: fin.me.uuid },
          'stern:dock-editor:request-config',
          async () => {
            const treeRow = await cs.get('DOCK_MENU_TREE');
            const rawItems = treeRow?.config?.items;
            const items: DockMenuItem[] = Array.isArray(rawItems) ? rawItems : defaultDockItems;
            await fin.InterApplicationBus.publish('stern:dock-editor:config', { menuItems: items });
          },
        );

        await fin.InterApplicationBus.subscribe(
          { uuid: fin.me.uuid },
          'stern:dock-editor:apply',
          async (_sender: unknown, data: { menuItems: DockMenuItem[] }) => {
            await d.updateConfig({ menuItems: data.menuItems });
            await cs.save({
              id: 'DOCK_MENU_TREE',
              appId: cfg.appId,
              configType: 'DOCK',
              configSubType: 'MENU_TREE',
              type: 'template',
              config: { items: data.menuItems },
            });
          },
        );

        opts.onReady?.();
      } catch (error) {
        console.error('[bootstrap] Failed during platform-api-ready', error);
      }
    });
  } finally {
    window.removeEventListener('unhandledrejection', analyticsErrorHandler);
  }
}

// ============================================================================
// Helpers
// ============================================================================

function collectIds(windowOrView: any, out: string[]): void {
  const url = windowOrView.url ?? '';
  if (url) {
    try {
      const id = new URLSearchParams(new URL(url, location.href).search).get('id');
      if (id) out.push(id);
    } catch { /* invalid URL */ }
  }
  for (const child of windowOrView.childWindows ?? []) {
    for (const view of child.views ?? []) collectIds(view, out);
  }
}

async function getManifestApiUrl(): Promise<string | undefined> {
  try {
    const manifest = await fin.Application.getCurrent().then((a) => a.getManifest()) as any;
    return manifest?.platform?.defaultWindowOptions?.customData?.platformContext?.apiUrl;
  } catch {
    return undefined;
  }
}
