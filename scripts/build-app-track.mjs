#!/usr/bin/env node
/**
 * Build or typecheck every app under apps/demos/ in one of two MODES:
 *
 *   installed — resolve @starui/* from the installed file:libs/*.tgz tarballs
 *               (consumer / future-publish parity). Runs `<task>`.
 *   source    — STARUI_DEV_SOURCE=1 so Vite aliases @starui/* to packages/
 *               source. Runs `<task>:source` when present, else falls back to
 *               `<task>` (so Angular / node apps still build under a source run).
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

/** Pick the script to run for an app: source mode prefers `<task>:source`. */
function resolveScript(scripts) {
  if (mode === 'source' && scripts?.[`${task}:source`]) return `${task}:source`;
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
        ...(mode === 'source' ? { STARUI_DEV_SOURCE: '1' } : {}),
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
