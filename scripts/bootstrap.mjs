#!/usr/bin/env node
/**
 * bootstrap.mjs — repair install when libs/*.tgz are missing locally.
 *
 * Tarball-track apps live under apps/ (nested workspace). Root `npm ci`
 * installs packages only; apps install via `npm ci --prefix apps`.
 *
 * Usage:
 *   npm run bootstrap
 *   npm run bootstrap -- --force
 *   npm run bootstrap -- --no-ci
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

function collectTarballsFromLock(lockPath) {
  const files = new Set();
  if (!existsSync(lockPath)) return files;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  for (const entry of Object.values(lock.packages ?? {})) {
    const resolved = entry?.resolved;
    if (typeof resolved !== 'string' || !resolved.startsWith('file:')) continue;
    const m = resolved.match(/libs\/([^/]+\.tgz)$/);
    if (m) files.add(m[1]);
  }
  return files;
}

function requiredTarballsFromLockfiles() {
  const files = collectTarballsFromLock(LOCKFILE_PATH);
  for (const f of collectTarballsFromLock(join(REPO_ROOT, 'apps', 'package-lock.json'))) {
    files.add(f);
  }
  if (files.size === 0) {
    const manifestPath = join(LIBS_DIR, 'manifest.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      for (const entry of Object.values(manifest)) {
        if (entry?.filename) files.add(entry.filename);
      }
    }
  }
  if (files.size === 0) {
    die('no libs/*.tgz in lockfiles or libs/manifest.json');
  }
  return [...files].sort();
}

function missingTarballs() {
  return requiredTarballsFromLockfiles().filter((f) => !existsSync(join(LIBS_DIR, f)));
}

function libsReady() {
  const required = requiredTarballsFromLockfiles();
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
    log('tarballs present — installing packages + apps');
    if (!noCi) {
      run('npm ci');
      run('npm ci --prefix apps');
    }
    return;
  }

  log('building bucket tarballs before workspace install');
  run('npm ci --workspaces=false --ignore-scripts');
  run('npm run build:packages');
  run('node scripts/propagate.mjs --skip-drift-check');

  if (noCi) {
    log('done (--no-ci)');
    return;
  }

  run('npm ci');
  run('npm ci --prefix apps');
  log('done');
}

main();
