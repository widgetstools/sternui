#!/usr/bin/env node
/**
 * bootstrap.mjs — full monorepo install when libs/*.tgz are missing (gitignored).
 *
 *   1. npm install          — packages/* at repo root (generates a local lock)
 *   2. build:packages + propagate — writes libs/*.tgz (local only)
 *   3. npm install --prefix apps — consumer apps from tarballs
 *
 * Lockfiles are intentionally NOT committed (see .gitignore): they pin a
 * registry host a corporate-Artifactory client cannot reach. Every install
 * uses `npm install`, so a fresh clone regenerates its own lock against
 * whatever registry its .npmrc points at. The required bucket-tarball list is
 * derived from the committed app package.json `file:` deps, not from a lock.
 *
 * Usage:
 *   npm run bootstrap
 *   npm run bootstrap -- --force        # rebuild libs/ even when tarballs exist
 *   npm run bootstrap -- --no-install   # pack only, skip npm install steps
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const LIBS_DIR = join(REPO_ROOT, 'libs');
const APPS_ROOT = join(REPO_ROOT, 'apps');

const force = process.argv.includes('--force');
const noCi = process.argv.includes('--no-install') || process.argv.includes('--no-ci');

function log(msg) {
  process.stdout.write(`[bootstrap] ${msg}\n`);
}

function die(msg) {
  process.stderr.write(`[bootstrap] ERROR: ${msg}\n`);
  process.exit(1);
}

function run(cmd) {
  log(`> ${cmd}`);
  execSync(cmd, { cwd: REPO_ROOT, stdio: 'inherit' });
}

function collectTarballsFromAppPackageJsons() {
  const files = new Set();
  if (!existsSync(APPS_ROOT)) return files;

  const addFromSpec = (spec) => {
    if (typeof spec !== 'string') return;
    const m = spec.match(/libs\/([^/]+\.tgz)$/);
    if (m) files.add(m[1]);
  };

  const walk = (dir) => {
    if (dir.split(/[\\/]/).includes('node_modules')) return;
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      let pkg = null;
      try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { pkg = null; }
      if (pkg) {
        for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
          const deps = pkg[section];
          if (deps && typeof deps === 'object') {
            for (const spec of Object.values(deps)) addFromSpec(spec);
          }
        }
      }
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
    }
  };

  walk(APPS_ROOT);
  return files;
}

function requiredTarballs() {
  // Derived from committed app package.json `file:` deps — no lockfile needed.
  const files = collectTarballsFromAppPackageJsons();
  if (files.size === 0) {
    die('no `file:…/libs/*.tgz` deps found in apps/** package.json files');
  }
  return [...files].sort();
}

function libsReady() {
  const required = requiredTarballs();
  const missing = required.filter((f) => !existsSync(join(LIBS_DIR, f)));
  if (missing.length === 0) {
    log(`libs/ OK (${required.length} bucket tarball(s))`);
    return true;
  }
  log(`libs/ missing ${missing.length}/${required.length} tarball(s) — will run propagate`);
  for (const f of missing.slice(0, 8)) log(`  - ${f}`);
  return false;
}

function main() {
  const needsPack = force || !libsReady();

  if (!noCi) {
    run('npm install');
  }

  if (needsPack) {
    log('packing libs/ from packages/ (not committed to git)');
    run('npm run build:packages');
    run('node scripts/propagate.mjs --skip-drift-check');
  }

  if (!noCi) {
    run('npm install --prefix apps');
  }

  log('done');
}

main();
