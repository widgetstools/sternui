/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
import type OpenFin from "@openfin/core";
import type { App } from "@openfin/workspace";
import { AppManifestType, getCurrentSync } from "@openfin/workspace-platform";
import { loadRegistryConfig } from "./db";
import { generateTemplateConfigId } from "./registry-config-types";

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

  // Build customData identically to registry-editor's testComponent so
  // downstream consumers (MarketsGrid, etc.) see the same shape
  // regardless of whether the launch originated from the registry's
  // test button or a dock menu item.
  const customData = {
    instanceId:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    templateId:
      entry.configId ||
      generateTemplateConfigId(entry.componentType, entry.componentSubType),
    componentType: entry.componentType,
    componentSubType: entry.componentSubType,
    appId: entry.appId,
    configServiceUrl: entry.configServiceUrl,
  };

  if (opts.asWindow) {
    // Standalone OpenFin Window — detached from the current Platform layout.
    return fin.Window.create({
      url: entry.hostUrl,
      name: `registered-${entry.id}-${customData.instanceId}`,
      defaultWidth: 1200,
      defaultHeight: 800,
      autoShow: true,
      customData,
    });
  }

  // Default: create a View inside the current Platform — consistent
  // with registry-editor/testComponent().
  const platform = getCurrentSync();
  return platform.createView({
    url: entry.hostUrl,
    customData,
  } as unknown as Parameters<ReturnType<typeof getCurrentSync>["createView"]>[0]);
}
