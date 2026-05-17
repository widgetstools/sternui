import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { libsDir as bundledLibsDir, loadManifest } from "../lib/manifest.js";
import { readPkg, writePkg } from "../lib/pkgjson.js";
import { runCommand } from "../lib/exec.js";
import { emptyResult, type ToolResult } from "../types.js";

export const UpgradeLibsInput = z.object({
  path: z.string().min(1),
  packages: z.array(z.string()).optional(),
  skipInstall: z.boolean().optional(),
});

export type UpgradeLibsArgs = z.infer<typeof UpgradeLibsInput>;

export const UPGRADE_LIBS_TOOL = {
  name: "upgrade_libs",
  description:
    "Refresh bundled @starui/* tarballs in target project: copies newer .tgz from the MCP server's bundled libs, rewrites file: paths in package.json to the new hashed filenames, clears node_modules/@starui/* and node_modules/.vite, and runs npm install.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Target app directory" },
      packages: {
        type: "array",
        items: { type: "string" },
        description: "Restrict to specific @starui/* package names (default: all)",
      },
      skipInstall: { type: "boolean" },
    },
    required: ["path"],
  },
};

function resolvePath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

export async function upgradeLibs(args: UpgradeLibsArgs): Promise<ToolResult> {
  const parsed = UpgradeLibsInput.parse(args);
  const targetPath = resolvePath(parsed.path);
  const result = emptyResult();
  const libsDest = join(targetPath, "libs");

  if (!existsSync(libsDest)) {
    result.ok = false;
    result.errors.push(`No libs/ folder at ${libsDest}. Is this a starui-scaffolded app?`);
    return result;
  }

  const manifest = loadManifest();
  const requested = parsed.packages
    ? new Set(parsed.packages)
    : new Set(Object.keys(manifest));

  // Wipe old tarballs in target libs/ that belong to packages we're refreshing.
  for (const entry of readdirSync(libsDest)) {
    if (!entry.endsWith(".tgz")) continue;
    for (const [pkgName, info] of Object.entries(manifest)) {
      const scope = pkgName.startsWith("@starui/")
        ? pkgName.slice("@starui/".length)
        : pkgName;
      if (entry.startsWith(`starui-${scope}-`) && requested.has(pkgName)) {
        rmSync(join(libsDest, entry), { force: true });
        // Also remove the matching info filename if different (no-op if same)
        if (info.filename !== entry) {
          rmSync(join(libsDest, info.filename), { force: true });
        }
        break;
      }
    }
  }

  // Copy fresh tarballs
  for (const [pkgName, info] of Object.entries(manifest)) {
    if (!requested.has(pkgName)) continue;
    const src = join(bundledLibsDir(), info.filename);
    const dest = join(libsDest, info.filename);
    if (!existsSync(src)) {
      result.warnings.push(`Source tarball missing: ${src}`);
      continue;
    }
    copyFileSync(src, dest);
    result.files.written.push(dest);
  }
  copyFileSync(join(bundledLibsDir(), "manifest.json"), join(libsDest, "manifest.json"));
  result.files.written.push(join(libsDest, "manifest.json"));

  // Rewrite package.json file: paths
  const pkg = readPkg(targetPath);
  const sections: Array<"dependencies" | "devDependencies"> = [
    "dependencies",
    "devDependencies",
  ];
  let changed = false;
  for (const sec of sections) {
    const deps = pkg[sec];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!requested.has(name)) continue;
      const info = manifest[name];
      if (!info) continue;
      const next = `file:./libs/${info.filename}`;
      if (spec !== next) {
        deps[name] = next;
        changed = true;
      }
    }
  }
  if (changed) {
    writePkg(targetPath, pkg);
    result.files.patched.push(join(targetPath, "package.json"));
  }

  // Clear node_modules/@starui and .vite cache
  const nm = join(targetPath, "node_modules");
  rmSync(join(nm, "@starui"), { recursive: true, force: true });
  rmSync(join(nm, ".vite"), { recursive: true, force: true });

  if (parsed.skipInstall) {
    result.nextSteps.push("npm install");
    return result;
  }

  // Need at least minimal node_modules dir for npm install
  mkdirSync(nm, { recursive: true });

  const install = await runCommand("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: targetPath,
  });
  if (install.code !== 0) {
    result.ok = false;
    result.errors.push(
      `npm install failed (exit ${install.code}). stderr:\n${install.stderr.slice(0, 4000)}`,
    );
    return result;
  }
  result.nextSteps.push("Restart your dev server to pick up the refreshed libs.");
  return result;
}
