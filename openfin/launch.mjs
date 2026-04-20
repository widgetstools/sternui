#!/usr/bin/env node
// @ts-check
/**
 * Small cross-platform launcher for OpenFin RVM.
 *
 * Why this exists instead of shelling out to an npm CLI package:
 *   - `openfin-cli` is unmaintained and crashes on Node >= 17 (its
 *     transitive `graceful-fs` uses the removed `primordials`).
 *   - `@openfin/cli` isn't published to the public npm registry.
 *   - The RVM is a native binary the user has already installed
 *     (from https://install.openfin.co). We only need to find it
 *     and invoke it with a `--config=<manifest-url>` flag.
 *
 * Checked install locations (installer defaults):
 *   macOS:   /Applications/OpenFin RVM.app  or  ~/Applications/...
 *   Windows: %LOCALAPPDATA%\OpenFin\OpenFinRVM.exe
 *            Program Files (x86)\OpenFin\OpenFinRVM.exe
 *            Program Files\OpenFin\OpenFinRVM.exe
 *
 * Usage:
 *   node openfin/launch.mjs <manifest-url>
 *     e.g. node openfin/launch.mjs http://localhost:5190/openfin/manifest.json
 *
 * Exits with a clear error message if the RVM isn't installed, so
 * the user can install it and retry without digging through logs.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const [, , manifestUrlArg] = process.argv;
const manifestUrl = manifestUrlArg ?? 'http://localhost:5190/openfin/manifest.json';

function findMacRvm() {
  const candidates = [
    '/Applications/OpenFin RVM.app/Contents/MacOS/OpenFinRVM',
    join(homedir(), 'Applications/OpenFin RVM.app/Contents/MacOS/OpenFinRVM'),
  ];
  return candidates.find(existsSync);
}

function findWinRvm() {
  const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  const candidates = [
    join(localAppData, 'OpenFin', 'OpenFinRVM.exe'),
    'C:\\Program Files (x86)\\OpenFin\\OpenFinRVM.exe',
    'C:\\Program Files\\OpenFin\\OpenFinRVM.exe',
  ];
  return candidates.find(existsSync);
}

const plat = platform();
let rvmPath;
if (plat === 'darwin') rvmPath = findMacRvm();
else if (plat === 'win32') rvmPath = findWinRvm();

if (!rvmPath) {
  const hint = plat === 'darwin'
    ? '/Applications/OpenFin RVM.app'
    : plat === 'win32'
      ? '%LOCALAPPDATA%\\OpenFin\\OpenFinRVM.exe'
      : '(OpenFin only supports macOS + Windows)';
  console.error(`
┌──────────────────────────────────────────────────────────────────┐
│  OpenFin RVM not found                                           │
│                                                                  │
│  Install it from https://install.openfin.co then re-run this    │
│  command. This launcher checks the standard install paths:      │
│    ${hint.padEnd(60, ' ')}│
│                                                                  │
│  Once installed, you can also launch manually:                  │
│    OpenFinRVM --config=${manifestUrl}
└──────────────────────────────────────────────────────────────────┘
`.trim());
  process.exit(1);
}

console.log(`[openfin] RVM:      ${rvmPath}`);
console.log(`[openfin] Manifest: ${manifestUrl}`);

const rvm = spawn(rvmPath, [`--config=${manifestUrl}`], {
  stdio: 'inherit',
  detached: false,
});

// Propagate Ctrl-C so the whole vite+openfin pipeline shuts down
// cleanly when the user hits it in the shell running dev:openfin.
const forwardSignal = (sig) => () => {
  try { rvm.kill(sig); } catch { /* already gone */ }
};
process.on('SIGINT', forwardSignal('SIGINT'));
process.on('SIGTERM', forwardSignal('SIGTERM'));

rvm.on('exit', (code) => {
  process.exit(code ?? 0);
});
rvm.on('error', (err) => {
  console.error('[openfin] failed to spawn RVM:', err.message);
  process.exit(1);
});
