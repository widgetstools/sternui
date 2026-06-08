#!/usr/bin/env node
/**
 * Fresh install for the nested apps/ workspace.
 *
 * apps/package-lock.json is gitignored. If a stale lockfile is left on disk,
 * npm install fails with EINTEGRITY when libs/*.tgz content no longer matches
 * recorded sha512 hashes — even after a successful propagate.
 */
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const APPS_ROOT = join(import.meta.dirname, '..', 'apps');
const LOCKFILE = join(APPS_ROOT, 'package-lock.json');

if (existsSync(LOCKFILE)) {
  unlinkSync(LOCKFILE);
  process.stdout.write('[install:apps] removed stale apps/package-lock.json\n');
}

execSync('npm install --no-audit --no-fund', { cwd: APPS_ROOT, stdio: 'inherit' });
