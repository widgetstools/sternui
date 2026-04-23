/**
 * Component identity resolution — pure TypeScript, no framework dependency.
 *
 * Implements the component lifecycle from the design doc (§6.4):
 *   Step 1: Read customData from OpenFin (instanceId, templateId, etc.)
 *   Step 2: Check if config exists (restore) or clone template (fresh launch)
 *   Step 3: Return config from Dexie (instant, offline-capable)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import type { ComponentIdentity, AppConfigRow } from "./types";
import type { ConfigManager } from "@marketsui/config-service";
import { generateTemplateConfigId } from "@markets/openfin-workspace";

// ─── Step 1: Read identity from OpenFin ─────────────────────────────

/**
 * Read component identity from OpenFin's customData.
 *
 * Returns null when running outside OpenFin (dev mode).
 * The customData is passed by the Registry Editor's testComponent()
 * or by the workspace when restoring a saved layout.
 */
export async function readCustomData(): Promise<ComponentIdentity | null> {
  if (typeof fin === "undefined") return null;

  try {
    // For views created via platform.createView(), customData is on fin.me
    const options = await fin.me.getOptions();
    const data = options?.customData;

    if (!data || !data.componentType) return null;

    return {
      instanceId: data.instanceId || crypto.randomUUID(),
      templateId: data.templateId || "",
      componentType: data.componentType,
      componentSubType: data.componentSubType || "",
    };
  } catch {
    return null;
  }
}

// ─── Step 2: Resolve config (restore vs fresh launch) ───────────────

/**
 * Resolve the component's config from the config service.
 *
 * Three cases (per design doc §6.5):
 *   1. Config exists for instanceId → workspace restore → load it
 *   2. No config, template exists → fresh launch → clone template
 *   3. No config, no template → fresh launch → return null (use defaults)
 */
export async function resolveInstanceId(
  identity: ComponentIdentity,
  configManager: ConfigManager,
): Promise<{ config: AppConfigRow | null; isNew: boolean }> {
  // Case 1: Workspace restore — config already saved
  // getConfig returns undefined when not found; normalise to null for downstream types
  const existing = (await configManager.getConfig(identity.instanceId)) ?? null;
  if (existing) {
    return { config: existing, isNew: false };
  }

  // Case 2: Fresh launch — try to clone the template
  const templateId = identity.templateId
    || generateTemplateConfigId(identity.componentType, identity.componentSubType);

  const template = (await configManager.getConfig(templateId)) ?? null;
  if (template) {
    const now = new Date().toISOString();
    const cloned: AppConfigRow = {
      ...template,
      configId: identity.instanceId,
      isTemplate: false,
      createdAt: now,
      updatedAt: now,
    };
    await configManager.saveConfig(cloned);
    return { config: cloned, isNew: true };
  }

  // Case 3: No template — component starts with defaults
  return { config: null, isNew: true };
}

// ─── Dev-mode fallback ──────────────────────────────────────────────

/**
 * Build a fallback identity for development outside OpenFin.
 * Generates a random instanceId so the component can still use
 * ConfigManager (writes to browser IndexedDB via Dexie).
 */
export function buildFallbackIdentity(
  componentType = "UNKNOWN",
  componentSubType = "",
): ComponentIdentity {
  return {
    instanceId: crypto.randomUUID(),
    templateId: generateTemplateConfigId(componentType, componentSubType),
    componentType,
    componentSubType,
  };
}
