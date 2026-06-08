#!/usr/bin/env node
/**
 * Build or typecheck every app under apps/demos/ in one of two MODES:
 *
 *   source    — default: Vite aliases @starui/* to packages/ source
 *   installed — STARUI_USE_TARBALLS=1: resolve from file:libs/*.tgz tarballs
 *               (consumer / publish parity). Runs `<task>` or `<task>:installed`.
 *
 *   node scripts/build-app-track.mjs installed build
 *   node scripts/build-app-track.mjs source typecheck
 *
 * Runs each app's script from its own directory (avoids npm workspace-name
 * collisions and keeps cwd-relative config correct).
 */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const APPS_ROOT = join(REPO_ROOT, 'apps', 'demos');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const mode = process.argv[2];
const task = process.argv[3] ?? 'build';

if (mode !== 'installed' && mode !== 'source') {
  process.stderr.write('Usage: node scripts/build-app-track.mjs <installed|source> [build|typecheck]\n');
  process.exit(1);
}
if (task !== 'build' && task !== 'typecheck') {
  process.stderr.write(`Unknown task: ${task}\n`);
  process.exit(1);
}
if (!existsSync(APPS_ROOT)) {
  process.stderr.write(`Missing ${APPS_ROOT}\n`);
  process.exit(1);
}

/** Pick the script to run for an app. Installed mode prefers `<task>:installed`. */
function resolveScript(scripts) {
  if (mode === 'installed' && scripts?.[`${task}:installed`]) return `${task}:installed`;
  if (scripts?.[task]) return task;
  return null;
}

/** @type {{ dir: string, name: string, script: string }[]} */
const apps = [];
for (const entry of readdirSync(APPS_ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'node_modules') continue;
  const pkgPath = join(APPS_ROOT, entry.name, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const script = resolveScript(pkg.scripts);
  if (!script) continue;
  apps.push({ dir: entry.name, name: pkg.name ?? entry.name, script });
}
apps.sort((a, b) => a.dir.localeCompare(b.dir));

if (apps.length === 0) {
  process.stderr.write(`No apps with "${task}" under apps/demos/\n`);
  process.exit(1);
}

process.stdout.write(`[build-app-track] ${mode} ${task} — ${apps.length} app(s) in apps/demos/\n`);

let failed = 0;
for (const { dir, name, script } of apps) {
  const appDir = join(APPS_ROOT, dir);
  process.stdout.write(`\n▶ ${name} (apps/demos/${dir}) → npm run ${script}\n`);
  try {
    execSync(`${npmCmd} run ${script}`, {
      cwd: appDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(mode === 'installed' ? { STARUI_USE_TARBALLS: '1' } : {}),
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
process.stdout.write(`\n[build-app-track] ${mode} ${task} OK — ${apps.length} app(s)\n`);
