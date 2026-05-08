#!/usr/bin/env node
/**
 * pack-libs.mjs — produce tarballs for every workspace library package.
 *
 * Per docs/plans/plan-2026-05-07/code-organization.md Decision 13 and
 * code-organization-implementation.md Task 12 (PR-11): new reference
 * apps consume libraries via .tgz tarballs (`file:` deps in their
 * package.json) rather than via workspace symlinks, so packaging bugs
 * surface during local dev — same shape consumers see.
 *
 * Usage:
 *   npm run pack:libs
 *
 * Output:
 *   /lib/<scope>-<name>-<version>.tgz   (one per workspace library)
 *   /lib/manifest.json                   (package-name → tarball-filename map)
 *
 * Reference app deps then look like:
 *   "@starui/markets-grid-react": "file:../../lib/starui-markets-grid-react-1.0.0.tgz"
 * plus an `overrides` block enumerating every transitive workspace dep
 * (the manifest makes that block trivial to generate).
 *
 * Apps (private packages whose name does not start with @starui/) are
 * skipped — only publishable libraries are packed.
 *
 * Idempotent and safe to re-run; the lib/ directory is wiped on each run.
 */

import { execSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const LIB_DIR = join(REPO_ROOT, 'lib');

function log(msg) {
  process.stdout.write(`[pack-libs] ${msg}\n`);
}

function loadRootWorkspaces() {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  return pkg.workspaces ?? [];
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function hasPackageJson(dir) {
  try {
    statSync(join(dir, 'package.json'));
    return true;
  } catch {
    return false;
  }
}

// Workspace globs in this repo use a single trailing /* segment (npm 10
// does not honor /**). A literal path with no glob is also supported.
function expandGlob(glob) {
  if (!glob.endsWith('/*')) {
    const abs = join(REPO_ROOT, glob);
    return isDirectory(abs) && hasPackageJson(abs) ? [abs] : [];
  }
  const parent = join(REPO_ROOT, glob.slice(0, -2));
  let entries;
  try {
    entries = readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => join(parent, e.name))
    .filter(hasPackageJson);
}

function discoverPackages() {
  const globs = loadRootWorkspaces();
  const dirs = new Set();
  for (const glob of globs) {
    for (const dir of expandGlob(glob)) {
      dirs.add(dir);
    }
  }
  return [...dirs].sort();
}

function readPackageInfo(dir) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  // Library packages live under packages/. Anything else (apps/*, the
  // e2e-openfin test harness) is not a publishable library and is skipped.
  // Many of our libs are marked `private: true` because they are not
  // published to a registry, so `private` is not a reliable signal.
  const rel = relative(REPO_ROOT, dir);
  const isLibrary = rel.startsWith('packages/');
  return { dir, name: pkg.name, version: pkg.version, isLibrary };
}

function packToTarball(dir) {
  // npm pack --json prints a JSON array of { id, name, version, filename, ... }
  // on stdout; warnings go to stderr (inherited).
  const stdout = execSync(
    `npm pack --pack-destination "${LIB_DIR}" --json`,
    { cwd: dir, stdio: ['ignore', 'pipe', 'inherit'] },
  ).toString();
  // Some npm versions prepend non-JSON noise; locate the first '['.
  const jsonStart = stdout.indexOf('[');
  if (jsonStart === -1) {
    throw new Error(`npm pack produced no JSON output (cwd: ${dir})`);
  }
  const arr = JSON.parse(stdout.slice(jsonStart));
  return arr[0]?.filename;
}

function main() {
  log(`repo root: ${REPO_ROOT}`);
  log(`lib dir:   ${LIB_DIR}`);

  // Step 1 — ensure every package's dist/ is fresh.
  log('running: npx turbo run build');
  execSync('npx turbo run build', { cwd: REPO_ROOT, stdio: 'inherit' });

  // Step 2 — wipe and recreate lib/.
  log('recreating lib/ directory');
  rmSync(LIB_DIR, { recursive: true, force: true });
  mkdirSync(LIB_DIR, { recursive: true });

  // Step 3 — discover and pack each workspace library.
  const packages = discoverPackages().map(readPackageInfo);
  log(`discovered ${packages.length} workspace package.json files`);

  const manifest = {};
  let packed = 0;
  let skipped = 0;
  for (const { dir, name, version, isLibrary } of packages) {
    const rel = relative(REPO_ROOT, dir);
    if (!name) {
      log(`SKIP: ${rel} (no package name)`);
      skipped++;
      continue;
    }
    if (!isLibrary) {
      log(`SKIP: ${name} (${rel} — not under packages/, treated as app)`);
      skipped++;
      continue;
    }
    const filename = packToTarball(dir);
    if (!filename) {
      throw new Error(`npm pack returned no filename for ${name} (${rel})`);
    }
    manifest[name] = filename;
    log(`packed: ${name}@${version} → ${filename}`);
    packed++;
  }

  // Step 4 — write manifest.json (sorted for stable diffs).
  const sortedManifest = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
  );
  const manifestPath = join(LIB_DIR, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(sortedManifest, null, 2) + '\n');
  log(`wrote: lib/manifest.json (${Object.keys(sortedManifest).length} entries)`);

  log(`done — packed ${packed}, skipped ${skipped}`);
}

main();
