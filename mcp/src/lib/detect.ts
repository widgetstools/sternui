import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppKind } from "../types.js";
import { readPkg } from "./pkgjson.js";

export interface DetectResult {
  kind: AppKind;
  hasManifest: boolean;
  hasOpenFinDeps: boolean;
  hasDockManager: boolean;
  hasReactRouter: boolean;
}

export function detectApp(targetDir: string): DetectResult {
  const result: DetectResult = {
    kind: "unknown",
    hasManifest: existsSync(join(targetDir, "public", "platform", "manifest.fin.json")),
    hasOpenFinDeps: false,
    hasDockManager: false,
    hasReactRouter: false,
  };

  if (!existsSync(join(targetDir, "package.json"))) {
    return result;
  }

  const pkg = readPkg(targetDir);
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  result.hasOpenFinDeps =
    "@openfin/core" in deps ||
    "@openfin/workspace" in deps ||
    "@openfin/workspace-platform" in deps;
  result.hasDockManager = "@widgetstools/react-dock-manager" in deps;
  result.hasReactRouter = "react-router-dom" in deps;

  if (result.hasManifest && result.hasOpenFinDeps) {
    result.kind = "openfin";
  } else if (result.hasDockManager) {
    result.kind = "web";
  } else if ("@starui/markets-grid" in deps || "@starui/core" in deps) {
    result.kind = "web";
  }

  return result;
}
