#!/usr/bin/env node
/**
 * Copies the built SPA from `apps/config-admin-web/dist` into this
 * server's `dist/admin-web/`. Runs after `tsc` so the static bundle
 * sits next to the compiled JS that imports it.
 *
 * Cross-platform replacement for `cp -r`. Idempotent — wipes the
 * destination first so stale assets don't accumulate across rebuilds.
 */

import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../config-admin-web/dist');
const dst = resolve(here, '../dist/admin-web');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(src))) {
    console.error(
      `[config-service-server] admin-web bundle not found at ${src}.\n` +
        'Run `npm --workspace @starui/config-admin-web run build` first, ' +
        'or use turbo (the build task depends on it).',
    );
    process.exit(1);
  }
  await rm(dst, { recursive: true, force: true });
  await mkdir(dirname(dst), { recursive: true });
  await cp(src, dst, { recursive: true });
  console.log(`[config-service-server] copied admin-web bundle → ${dst}`);
}

main().catch((err) => {
  console.error('[config-service-server] copy-admin-web failed:', err);
  process.exit(1);
});
