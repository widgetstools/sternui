/**
 * Bundle the default SharedWorker entry into a single ESM asset.
 *
 * tsc emits `defaultEntry.js` with bare `@starui/*` imports that the
 * browser cannot resolve when loaded as a standalone worker script.
 * esbuild inlines host-data, host-config, dexie, and optional stomp
 * into `dist/assets/data-services-worker.mjs` for Vite `?url` imports.
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const outDir = path.join(pkgRoot, 'dist', 'assets');
const outfile = path.join(outDir, 'data-services-worker.mjs');

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(pkgRoot, 'src/runtime/worker/defaultEntry.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  logLevel: 'info',
  packages: 'bundle',
  mainFields: ['module', 'main'],
  conditions: ['import', 'module', 'browser', 'default'],
  legalComments: 'none',
});
