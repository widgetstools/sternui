#!/usr/bin/env node
/**
 * pack.mjs — bundle the StarUI MCP server into a single npx-runnable tarball.
 *
 *   1. Mirror /libs/*.tgz + manifest.json → /mcp/libs/
 *   2. Mirror /apps/stomp-view-server/{package.json,tsconfig.json,src,README.md} → /mcp/stomp-view-server/
 *   3. Mirror /docs/{ARCHITECTURE_GUIDE,IMPLEMENTED_FEATURES}.md → /mcp/src/resources/
 *   4. Mirror /appConfig.json → /mcp/appConfig.json (seed config dropped into every scaffolded app)
 *   5. Build TypeScript (rimraf dist && tsc)
 *   6. npm pack → rename with content-hash suffix → move to /mcp-dist/
 *
 * The output filename uses the same content-hash convention as /libs/:
 *   starui-mcp-server-<version>-<sha8>.tgz
 *
 * Idempotent. Safe to re-run.
 */

import { execSync } from "node:child_process";
import {
  copyFileSync,
  createReadStream,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MCP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(MCP_DIR, "..");
const LIBS_SRC = join(REPO_ROOT, "starui-platform", "libs");
const LIBS_DEST = join(MCP_DIR, "libs");
const STOMP_SRC = join(REPO_ROOT, "starui-platform", "apps", "stomp-view-server");
const STOMP_DEST = join(MCP_DIR, "stomp-view-server");
const DOCS_SRC = join(REPO_ROOT, "docs");
const RESOURCES_DEST = join(MCP_DIR, "src", "resources");
const APP_CONFIG_SRC = join(REPO_ROOT, "appConfig.json");
const APP_CONFIG_DEST = join(MCP_DIR, "appConfig.json");
const DIST = join(REPO_ROOT, "mcp-dist");

function log(msg) {
  process.stdout.write(`[mcp:pack] ${msg}\n`);
}

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

function copyDir(srcDir, destDir, filter = () => true) {
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    if (!filter(e.name)) continue;
    const s = join(srcDir, e.name);
    const d = join(destDir, e.name);
    if (e.isDirectory()) {
      copyDir(s, d, filter);
    } else if (e.isFile()) {
      copyFileSync(s, d);
    }
  }
}

function copyFlat(srcDir, destDir, names) {
  mkdirSync(destDir, { recursive: true });
  for (const name of names) {
    const s = join(srcDir, name);
    if (!exists(s)) {
      log(`SKIP (missing): ${s}`);
      continue;
    }
    copyFileSync(s, join(destDir, name));
  }
}

function sha8OfFile(path) {
  const h = createHash("sha256");
  const buf = readFileSync(path);
  h.update(buf);
  return h.digest("hex").slice(0, 8);
}

function step1MirrorLibs() {
  if (!exists(LIBS_SRC)) {
    throw new Error(`Missing starui-platform/libs. Run 'npm run propagate --workspace=starui-platform' first.`);
  }
  log(`mirroring libs from ${LIBS_SRC}`);
  rmSync(LIBS_DEST, { recursive: true, force: true });
  mkdirSync(LIBS_DEST, { recursive: true });
  const entries = readdirSync(LIBS_SRC, { withFileTypes: true });
  let copied = 0;
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith(".tgz") && e.name !== "manifest.json") continue;
    copyFileSync(join(LIBS_SRC, e.name), join(LIBS_DEST, e.name));
    copied++;
  }
  log(`mirrored ${copied} files from /libs → /mcp/libs`);
}

function step2MirrorStomp() {
  if (!exists(STOMP_SRC)) {
    throw new Error(`Missing starui-platform/apps/stomp-view-server.`);
  }
  log(`mirroring stomp-view-server from ${STOMP_SRC}`);
  copyDir(STOMP_SRC, STOMP_DEST, (name) => {
    return (
      name !== "node_modules" &&
      name !== "dist" &&
      name !== ".turbo" &&
      !name.startsWith(".") || name === ".gitignore"
    );
  });
  log(`mirrored stomp-view-server → /mcp/stomp-view-server`);
}

function step3MirrorDocs() {
  log(`mirroring architecture docs from ${DOCS_SRC}`);
  copyFlat(DOCS_SRC, RESOURCES_DEST, [
    "ARCHITECTURE_GUIDE.md",
    "IMPLEMENTED_FEATURES.md",
  ]);
  const paritySrc = join(REPO_ROOT, "starui-platform", "docs", "PARITY.md");
  if (exists(paritySrc)) {
    copyFileSync(paritySrc, join(RESOURCES_DEST, "PARITY.md"));
  }
  log(`mirrored docs → /mcp/src/resources`);
}

function step4MirrorAppConfig() {
  if (!exists(APP_CONFIG_SRC)) {
    throw new Error(
      `Missing /appConfig.json at repo root. Add it before packing — it is shipped into every scaffolded app.`,
    );
  }
  log(`mirroring appConfig.json from ${APP_CONFIG_SRC}`);
  copyFileSync(APP_CONFIG_SRC, APP_CONFIG_DEST);
  log(`mirrored appConfig.json → /mcp/appConfig.json`);
}

function step5Build() {
  if (!exists(join(MCP_DIR, "node_modules"))) {
    log(`installing /mcp dependencies (one-time setup)`);
    execSync("npm install --no-audit --no-fund", { cwd: MCP_DIR, stdio: "inherit" });
  }
  log(`building TypeScript`);
  execSync("npm run build", { cwd: MCP_DIR, stdio: "inherit" });
}

function step6Pack() {
  log(`running npm pack`);
  const out = execSync("npm pack --json", {
    cwd: MCP_DIR,
    stdio: ["ignore", "pipe", "inherit"],
  }).toString();
  const jsonStart = out.indexOf("[");
  if (jsonStart === -1) {
    throw new Error(`npm pack produced no JSON output`);
  }
  const meta = JSON.parse(out.slice(jsonStart));
  const original = meta[0]?.filename;
  if (!original) {
    throw new Error(`npm pack returned no filename`);
  }
  const tempPath = join(MCP_DIR, original);
  if (!exists(tempPath)) {
    throw new Error(`expected tarball not found: ${tempPath}`);
  }
  const sha = sha8OfFile(tempPath);
  const pkg = JSON.parse(readFileSync(join(MCP_DIR, "package.json"), "utf8"));
  const hashed = `starui-mcp-server-${pkg.version}-${sha}.tgz`;
  mkdirSync(DIST, { recursive: true });
  // Garbage-collect older tarballs of the same package — keeps /mcp-dist
  // clean so consumers can `ls -t /mcp-dist/*.tgz | head -1` reliably.
  for (const entry of readdirSync(DIST)) {
    if (entry.startsWith("starui-mcp-server-") && entry.endsWith(".tgz")) {
      rmSync(join(DIST, entry), { force: true });
    }
  }
  const dest = join(DIST, hashed);
  renameSync(tempPath, dest);
  log(`packed → ${dest}`);

  const manifestPath = join(DIST, "manifest.json");
  const manifest = {
    "@starui/mcp-server": {
      filename: hashed,
      version: pkg.version,
      sha,
      packedAt: new Date().toISOString(),
    },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  log(`wrote ${manifestPath}`);
}

function main() {
  log(`mcp dir:  ${MCP_DIR}`);
  log(`repo:     ${REPO_ROOT}`);
  log(`out dir:  ${DIST}`);

  step1MirrorLibs();
  step2MirrorStomp();
  step3MirrorDocs();
  step4MirrorAppConfig();
  step5Build();
  step6Pack();

  log("done");
}

main();
