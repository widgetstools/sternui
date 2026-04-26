/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import type OpenFin from "@openfin/core";
import type { App } from "@openfin/workspace";
import { AppManifestType, getCurrentSync } from "@openfin/workspace-platform";
import { loadRegistryConfig } from "./db";
import { generateTemplateConfigId, type RegistryEntry } from "./registry-config-types";

// ─── Singleton in-flight + opened registry ───────────────────────────
//
// Map of singleton configId -> the View|Window currently owning that
// singleton. Used to enforce focus-or-open semantics: a second click
// on a singleton dock item awaits the first launch's promise (handles
// rapid double-clicks) and then focuses the same window instead of
// creating a duplicate.
//
// Entries are removed on close so a closed-then-relaunched singleton
// behaves like a fresh launch (creates a new instance bound to the
// same configId so its persisted config is restored).

type SingletonOwner = OpenFin.View | OpenFin.Window;

const singletons = new Map<string, Promise<SingletonOwner>>();

function attachSingletonCleanup(configId: string, owner: SingletonOwner): void {
  try {
    // OpenFin's View and Window both expose an async on('closed', fn).
    // Cast to any so we don't pin to a specific event-shape per type.
    (owner as any).on?.('closed', () => {
      singletons.delete(configId);
    });
  } catch (err) {
    console.warn(`[launch] failed to attach singleton cleanup for '${configId}':`, err);
  }
}

async function focusSingleton(owner: SingletonOwner): Promise<void> {
  // Both View and Window expose focus()/setAsForeground(); call
  // whichever is available — Views typically need their parent
  // window brought to front, Windows can focus directly.
  try {
    const o = owner as any;
    if (typeof o.focus === 'function') await o.focus();
    if (typeof o.setAsForeground === 'function') await o.setAsForeground();
    if (typeof o.bringToFront === 'function') await o.bringToFront();
  } catch (err) {
    console.warn('[launch] failed to focus singleton owner:', err);
  }
}

export async function launchApp(
  app: App
): Promise<OpenFin.Platform | OpenFin.Identity | OpenFin.View | OpenFin.Application | undefined> {
  if (!app.manifest) {
    console.error(`No manifest was provided for type ${app.manifestType}`);
    return;
  }

  let ret: OpenFin.Platform | OpenFin.Identity | OpenFin.View | OpenFin.Application | undefined;

  console.log("Application launch requested:", app);

  switch (app.manifestType) {
    case AppManifestType.Snapshot: {
      const platform = getCurrentSync();
      ret = await platform.applySnapshot(app.manifest);
      break;
    }
    case AppManifestType.View: {
      const platform = getCurrentSync();
      ret = await platform.createView({ manifestUrl: app.manifest });
      break;
    }
    case AppManifestType.External: {
      ret = await fin.System.launchExternalProcess({ path: app.manifest, uuid: app.appId });
      break;
    }
    default: {
      ret = await fin.Application.startFromManifest(app.manifest);
      break;
    }
  }

  console.log("Finished application launch request");
  return ret;
}

// ─── Launch a registered component (by registry entry id) ────────────

export interface LaunchRegisteredComponentOptions {
  /**
   * When true, launch in a standalone OpenFin Window. When false (or
   * omitted) launch as an OpenFin View inside the current Platform —
   * matches the registry-editor's existing testComponent() default.
   */
  asWindow?: boolean;
}

/**
 * Look up `entryId` in the live Component Registry, then launch its
 * component. Fire-and-forget for error paths — logs a warning and
 * returns undefined if the id doesn't resolve, but does NOT throw.
 * Dock-menu clicks should never hard-fail because a referenced
 * registry entry was deleted.
 *
 * Runtime customData is built the same way
 * `registry-editor/testComponent()` builds it, so views launched from
 * the dock behave identically to those launched from the registry
 * editor's test button.
 */
export async function launchRegisteredComponent(
  entryId: string,
  opts: LaunchRegisteredComponentOptions = {},
): Promise<OpenFin.View | OpenFin.Window | undefined> {
  const registry = await loadRegistryConfig();
  const entry = registry?.entries.find((e) => e.id === entryId);

  if (!entry) {
    console.warn(
      `[launchRegisteredComponent] registry entry id '${entryId}' not found. ` +
      `It may have been deleted since this dock item was saved.`,
    );
    return undefined;
  }

  // ── Singleton focus-or-open ────────────────────────────────────────
  // For singleton entries, the same configId identifies BOTH the
  // persistent config row AND the running window. A second click must
  // never spawn a duplicate — it awaits the first launch's promise
  // (which also handles rapid double-clicks racing through the lookup)
  // and then focuses the existing owner.
  if (entry.singleton && entry.configId) {
    const inFlight = singletons.get(entry.configId);
    if (inFlight) {
      try {
        const owner = await inFlight;
        await focusSingleton(owner);
        return owner;
      } catch {
        // The previous launch threw — fall through and try a fresh launch
        singletons.delete(entry.configId);
      }
    }
    const launchPromise = createComponentInstance(entry, opts, /* singletonId */ entry.configId);
    singletons.set(entry.configId, launchPromise);
    try {
      const owner = await launchPromise;
      attachSingletonCleanup(entry.configId, owner);
      return owner;
    } catch (err) {
      singletons.delete(entry.configId);
      throw err;
    }
  }

  return createComponentInstance(entry, opts);
}

/**
 * Create the actual View or Window for a registry entry. Extracted from
 * launchRegisteredComponent so the singleton path can both reuse it AND
 * register the resulting promise in the singletons Map.
 *
 * When `singletonId` is provided, customData.instanceId === customData.templateId
 * === singletonId. component-host's `resolveInstanceId()` then loads the
 * existing config row at that id (case 1: workspace-restore-style). For
 * non-singleton callers the instanceId is a fresh UUID.
 */
async function createComponentInstance(
  entry: RegistryEntry,
  opts: LaunchRegisteredComponentOptions,
  singletonId?: string,
): Promise<SingletonOwner> {
  const instanceId = singletonId ??
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const customData = {
    instanceId,
    templateId:
      entry.configId ||
      generateTemplateConfigId(entry.componentType, entry.componentSubType),
    componentType: entry.componentType,
    componentSubType: entry.componentSubType,
    appId: entry.appId,
    configServiceUrl: entry.configServiceUrl,
  };

  if (opts.asWindow) {
    return fin.Window.create({
      url: entry.hostUrl,
      name: `registered-${entry.id}-${instanceId}`,
      defaultWidth: 1200,
      defaultHeight: 800,
      autoShow: true,
      customData,
    });
  }

  const platform = getCurrentSync();
  return platform.createView({
    url: entry.hostUrl,
    customData,
  } as unknown as Parameters<ReturnType<typeof getCurrentSync>["createView"]>[0]);
}
