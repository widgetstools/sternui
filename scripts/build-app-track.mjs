#!/usr/bin/env node
/**
 * Build or typecheck every app under apps/workspace/ or apps/tarball/.
 * Runs each app's script from its directory (avoids npm duplicate workspace names
 * when both tracks share similar package names).
 *
 *   node scripts/build-app-track.mjs tarball build
 *   node scripts/build-app-track.mjs workspace typecheck
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const APPS_ROOT = join(REPO_ROOT, 'apps');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const track = process.argv[2];
const task = process.argv[3] ?? 'build';

if (track !== 'workspace' && track !== 'tarball') {
  process.stderr.write('Usage: node scripts/build-app-track.mjs <workspace|tarball> [build|typecheck]\n');
  process.exit(1);
}
if (task !== 'build' && task !== 'typecheck') {
  process.stderr.write(`Unknown task: ${task}\n`);
  process.exit(1);
}

const trackDir = join(APPS_ROOT, track);
if (!existsSync(trackDir)) {
  process.stderr.write(`Missing ${trackDir}\n`);
  process.exit(1);
}

/** @type {{ dir: string, name: string }[]} */
const apps = [];
for (const entry of readdirSync(trackDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'node_modules') continue;
  const appDir = join(trackDir, entry.name);
  const pkgPath = join(appDir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts?.[task]) continue;
  apps.push({ dir: entry.name, name: pkg.name ?? entry.name });
}
apps.sort((a, b) => a.dir.localeCompare(b.dir));

if (apps.length === 0) {
  process.stderr.write(`No apps with "${task}" under apps/${track}/\n`);
  process.exit(1);
}

process.stdout.write(`[build-app-track] ${task} ${apps.length} app(s) in apps/${track}/\n`);

let failed = 0;
for (const { dir, name } of apps) {
  const appDir = join(trackDir, dir);
  process.stdout.write(`\n▶ ${name} (apps/${track}/${dir})\n`);
  try {
    execSync(`${npmCmd} run ${task}`, {
      cwd: appDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(track === 'workspace' ? { STARUI_DEV_SOURCE: '1' } : {}),
      },
    });
  } catch {
    failed++;
    process.stderr.write(`✗ ${name}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\n[build-app-track] ${failed}/${apps.length} failed\n`);
  process.exit(1);
}
process.stdout.write(`\n[build-app-track] ${task} OK — ${apps.length} app(s)\n`);
