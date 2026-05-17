import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface LibEntry {
  filename: string;
  version: string;
  sha: string;
  packedAt: string;
}

export type LibManifest = Record<string, LibEntry>;

let cached: LibManifest | null = null;

function mcpRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function libsDir(): string {
  return join(mcpRoot(), "libs");
}

export function stompViewServerDir(): string {
  return join(mcpRoot(), "stomp-view-server");
}

export function templatesDir(): string {
  return join(mcpRoot(), "templates");
}

export function fragmentsDir(): string {
  return join(mcpRoot(), "fragments");
}

export function resourcesDir(): string {
  return join(mcpRoot(), "src", "resources");
}

export function appConfigPath(): string {
  return join(mcpRoot(), "appConfig.json");
}

export function loadManifest(): LibManifest {
  if (cached) return cached;
  const path = join(libsDir(), "manifest.json");
  const raw = readFileSync(path, "utf8");
  cached = JSON.parse(raw) as LibManifest;
  return cached;
}

export function resolveTarball(pkgName: string): string {
  const m = loadManifest();
  const entry = m[pkgName];
  if (!entry) {
    throw new Error(`Bundled tarball not found for package: ${pkgName}`);
  }
  return entry.filename;
}
