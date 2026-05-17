import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  type?: "module" | "commonjs";
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  workspaces?: string[];
  [k: string]: unknown;
}

export function readPkg(dir: string): PackageJson {
  const path = join(dir, "package.json");
  if (!existsSync(path)) {
    throw new Error(`No package.json at ${dir}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

export function writePkg(dir: string, pkg: PackageJson): void {
  const path = join(dir, "package.json");
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
}

export function ensureDep(
  pkg: PackageJson,
  name: string,
  version: string,
  field: "dependencies" | "devDependencies" = "dependencies",
): boolean {
  pkg[field] ??= {};
  const existing = pkg[field]![name];
  if (existing === version) return false;
  pkg[field]![name] = version;
  return true;
}

export function ensureScript(
  pkg: PackageJson,
  name: string,
  command: string,
): boolean {
  pkg.scripts ??= {};
  if (pkg.scripts[name] === command) return false;
  pkg.scripts[name] = command;
  return true;
}
