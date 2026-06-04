#!/usr/bin/env node
/**
 * bootstrap.mjs — full monorepo install when libs/*.tgz are missing (gitignored).
 *
 *   1. npm ci              — packages/* at repo root
 *   2. build:packages + propagate — writes libs/*.tgz (local only)
 *   3. npm ci --prefix apps — consumer apps from tarballs
 *
 * Usage:
 *   npm run bootstrap
 *   npm run bootstrap -- --force     # rebuild libs/ even when tarballs exist
 *   npm run bootstrap -- --no-ci     # pack only, skip npm ci steps
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const LIBS_DIR = join(REPO_ROOT, 'libs');
const APPS_LOCKFILE = join(REPO_ROOT, 'apps', 'package-lock.json');

const force = process.argv.includes('--force');
const noCi = process.argv.includes('--no-ci');

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

function collectTarballsFromLock(lockPath) {
  const files = new Set();
  if (!existsSync(lockPath)) return files;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

  const addFromSpec = (spec) => {
    if (typeof spec !== 'string') return;
    const m = spec.match(/libs\/([^/]+\.tgz)$/);
    if (m) files.add(m[1]);
  };

  for (const entry of Object.values(lock.packages ?? {})) {
    if (!entry || typeof entry !== 'object') continue;
    // Installed-node form: "resolved": "file:.../libs/<bucket>.tgz".
    addFromSpec(entry.resolved);
    // Dependency-specifier form. When every demo app references the SAME bucket
    // tarball (single apps/demos tree), npm hoists it to one node recorded as
    // version-only with no `resolved`; the `file:` spec then only survives on
    // the consuming app's dependency edge. Scan those too so detection is
    // independent of npm's hoisting decisions.
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = entry[section];
      if (deps && typeof deps === 'object') {
        for (const spec of Object.values(deps)) addFromSpec(spec);
      }
    }
  }
  return files;
}

function requiredTarballs() {
  const files = collectTarballsFromLock(APPS_LOCKFILE);
  if (files.size === 0) {
    die('apps/package-lock.json has no file:libs/*.tgz entries');
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
    run('npm ci');
  }

  if (needsPack) {
    log('packing libs/ from packages/ (not committed to git)');
    run('npm run build:packages');
    run('node scripts/propagate.mjs --skip-drift-check');
  }

  if (!noCi) {
    run('npm ci --prefix apps');
  }

  log('done');
}

main();
