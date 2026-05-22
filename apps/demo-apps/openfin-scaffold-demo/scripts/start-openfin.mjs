#!/usr/bin/env node
/**
 * One command: start Vite on :5180, wait until HTTP is up, launch OpenFin.
 *
 *   npm run start:openfin
 *
 * Runs from the monorepo root so `concurrently` and `wait-on` resolve from
 * root devDependencies (same pattern as `npm run dev:openfin:markets-react`).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = join(appDir, '../../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const port = 5180;
const manifest = `http://127.0.0.1:${port}/platform/manifest.fin.json`;
const launchScript = join(appDir, 'launch.mjs');

const viteCmd = `${npm} run dev -w @starui/openfin-scaffold-demo -- --host 127.0.0.1 --port ${port} --strictPort --no-open`;
const openfinCmd = `npx wait-on ${manifest} -t 120000 && node ${launchScript} ${manifest}`;
const cmd = `npx concurrently -k -n vite,openfin -c cyan,magenta "${viteCmd}" "${openfinCmd}"`;

const child = spawn(cmd, {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
