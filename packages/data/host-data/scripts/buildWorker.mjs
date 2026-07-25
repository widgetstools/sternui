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

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [
    path.join(pkgRoot, 'src/runtime/worker/defaultEntry.ts'),
    path.join(pkgRoot, 'src/runtime/worker/fanOutWorkerEntry.ts'),
    path.join(pkgRoot, 'src/runtime/ssrm/worker/ssrmWorkerEntry.ts'),
  ],
  outdir: outDir,
  entryNames: '[name]',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  logLevel: 'info',
  packages: 'bundle',
  mainFields: ['module', 'import', 'main'],
  conditions: ['import', 'module', 'default'],
  alias: {
    '@stomp/stompjs': path.join(pkgRoot, '../../../node_modules/@stomp/stompjs/esm6/index.js'),
  },
  legalComments: 'none',
});

// Stable public names for Vite ?url imports.
const RENAMES = [
  ['defaultEntry.js', 'data-services-worker.mjs'],
  ['fanOutWorkerEntry.js', 'data-services-fanout-worker.mjs'],
  ['ssrmWorkerEntry.js', 'data-services-ssrm-worker.mjs'],
];

for (const [srcName, destName] of RENAMES) {
  publishWorkerAsset(outDir, srcName, destName);
}

// The SSRM worker hosts the Perspective server + a loopback client; it
// fetches both wasm binaries at runtime as SIBLINGS of its own script
// URL (see perspectiveBoot.ts). Copy them next to the bundled asset.
const PSP_DIST = path.join(
  path.dirname(
    // Resolve via the package entry: works for hoisted and nested installs.
    import.meta.resolve
      ? fileURLToPath(import.meta.resolve('@finos/perspective/package.json'))
      : path.join(pkgRoot, '../../../node_modules/@finos/perspective/package.json'),
  ),
  'dist/wasm',
);

for (const wasmName of ['perspective-server.wasm', 'perspective-js.wasm']) {
  fs.copyFileSync(path.join(PSP_DIST, wasmName), path.join(outDir, wasmName));
}

// tsc emits `dist/runtime/ssrm/worker/*.js` that imports the vendor
// bridge `./perspectiveVendor.mjs` — a plain-JS module tsc does not
// copy (allowJs off). Keep dist self-consistent for any consumer that
// bundles the worker from dist instead of using the prebuilt asset.
const VENDOR_BRIDGE_DIR = path.join(pkgRoot, 'src/runtime/ssrm/worker');
const VENDOR_BRIDGE_OUT = path.join(pkgRoot, 'dist/runtime/ssrm/worker');
fs.mkdirSync(VENDOR_BRIDGE_OUT, { recursive: true });
for (const bridgeName of ['perspectiveVendor.mjs', 'perspectiveVendor.d.mts']) {
  fs.copyFileSync(
    path.join(VENDOR_BRIDGE_DIR, bridgeName),
    path.join(VENDOR_BRIDGE_OUT, bridgeName),
  );
}

/**
 * Rename an esbuild output to the stable public asset name and fix the
 * `sourceMappingURL` comment so Vite can resolve the sibling `.map`.
 */
function publishWorkerAsset(outDir, srcName, destName) {
  const srcPath = path.join(outDir, srcName);
  const destPath = path.join(outDir, destName);
  if (!fs.existsSync(srcPath)) return;

  const destMapName = `${destName}.map`;
  let code = fs.readFileSync(srcPath, 'utf8');
  code = code.replace(
    /\/\/# sourceMappingURL=.+$/m,
    `//# sourceMappingURL=${destMapName}`,
  );
  fs.writeFileSync(destPath, code);
  fs.unlinkSync(srcPath);

  const srcMapPath = `${srcPath}.map`;
  const destMapPath = path.join(outDir, destMapName);
  if (fs.existsSync(srcMapPath)) {
    const map = JSON.parse(fs.readFileSync(srcMapPath, 'utf8'));
    map.file = destName;
    fs.writeFileSync(destMapPath, JSON.stringify(map));
    fs.unlinkSync(srcMapPath);
  }
}
