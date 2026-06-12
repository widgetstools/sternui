/**
 * Tailwind preset for app tailwind.config.* — loaded by PostCSS/jiti (not Vite).
 * Resolves from installed @starui/design-system or monorepo dist after build:packages.
 */
const { resolve } = require('node:path');
const { existsSync } = require('node:fs');
const { createRequire } = require('node:module');

const REPO_ROOT = resolve(__dirname, '..');

function appsRequire() {
  const appsTailwindPkg = resolve(REPO_ROOT, 'apps/node_modules/tailwindcss/package.json');
  if (existsSync(appsTailwindPkg)) {
    return createRequire(appsTailwindPkg);
  }
  return createRequire(resolve(REPO_ROOT, 'package.json'));
}

function loadViaJiti(modulePath) {
  const jitiPath = resolve(REPO_ROOT, 'apps/node_modules/jiti/lib/index.js');
  if (!existsSync(jitiPath)) {
    throw new Error('apps/node_modules/jiti not found — run npm install --prefix apps');
  }
  const jiti = require(jitiPath);
  const load = jiti(__filename, { interopDefault: true });
  const mod = load(modulePath);
  return mod?.tailwindPreset ?? mod?.default?.tailwindPreset ?? mod;
}

function loadTailwindPreset() {
  const req = appsRequire();

  try {
    const mod = req('@starui/design-system/tailwind');
    if (mod?.tailwindPreset) return mod.tailwindPreset;
  } catch {
    /* tarball not installed — use monorepo dist */
  }

  const distPath = resolve(
    REPO_ROOT,
    'packages/design-system/design-system/dist/adapters/tailwind.js',
  );
  if (!existsSync(distPath)) {
    throw new Error(
      'Cannot load StarUI Tailwind preset. Run: npm run build:packages (and npm run install:apps for tarball-only apps).',
    );
  }

  return loadViaJiti(distPath);
}

module.exports = { tailwindPreset: loadTailwindPreset() };
