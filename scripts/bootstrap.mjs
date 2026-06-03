#!/usr/bin/env node
/**
 * bootstrap.mjs — repair install when libs/*.tgz are missing locally.
 *
 * Tarball-track apps use `file:../../libs/starui-*.tgz` (see package-lock.json).
 * libs/ is normally committed; use this script only if tarballs were deleted or
 * never generated on your machine.
 *
 * This script breaks the cycle:
 *   1. npm ci --workspaces=false  (root devDependencies only — turbo, tsc, …)
 *   2. npm run build:packages
 *   3. node scripts/propagate.mjs --skip-drift-check
 *   4. npm ci                       (full workspace with tarballs on disk)
 *
 * Usage:
 *   npm run bootstrap
 *   npm run bootstrap -- --force     # rebuild libs/ even when tarballs exist
 *   npm run bootstrap -- --no-ci     # stop after propagate (lockfile may drift)
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const LIBS_DIR = join(REPO_ROOT, 'libs');
const LOCKFILE_PATH = join(REPO_ROOT, 'package-lock.json');

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

function requiredTarballsFromLockfile() {
  if (!existsSync(LOCKFILE_PATH)) {
    die('package-lock.json missing — cannot determine required libs/*.tgz');
  }
  const lock = JSON.parse(readFileSync(LOCKFILE_PATH, 'utf8'));
  const files = new Set();
  for (const entry of Object.values(lock.packages ?? {})) {
    const resolved = entry?.resolved;
    if (typeof resolved !== 'string' || !resolved.startsWith('file:')) continue;
    const m = resolved.match(/libs\/([^/]+\.tgz)$/);
    if (m) files.add(m[1]);
  }
  return [...files].sort();
}

function missingTarballs() {
  return requiredTarballsFromLockfile().filter((f) => !existsSync(join(LIBS_DIR, f)));
}

function libsReady() {
  const required = requiredTarballsFromLockfile();
  if (required.length === 0) {
    die('package-lock.json has no file:libs/*.tgz resolved entries — cannot verify libs/');
  }
  const missing = missingTarballs();
  if (missing.length === 0) {
    log(`libs/ OK (${required.length} bucket tarball(s) on disk)`);
    return true;
  }
  log(`libs/ incomplete — missing ${missing.length} tarball(s):`);
  for (const f of missing.slice(0, 10)) log(`  - ${f}`);
  if (missing.length > 10) log(`  … and ${missing.length - 10} more`);
  return false;
}

function main() {
  const needsPack = force || !libsReady();

  if (!needsPack) {
    log('tarballs present — running full workspace install only');
    if (!noCi) run('npm ci');
    return;
  }

  log('fresh or incomplete libs/ — building bucket tarballs before workspace install');
  log('(producing tarballs via propagate — commit libs/ when refreshing for remote)');

  run('npm ci --workspaces=false --ignore-scripts');
  run('npm run build:packages');
  run('node scripts/propagate.mjs --skip-drift-check');

  if (noCi) {
    log('done (--no-ci) — run `npm ci` when ready');
    return;
  }

  run('npm ci');
  log('done — workspace installed; use `npm ci` on later pulls when libs/ is intact');
}

main();
