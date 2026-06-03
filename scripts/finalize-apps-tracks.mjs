#!/usr/bin/env node
/**
 * Post-migrate: path depth fixes, workspace/tarball package names, dev scripts.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');

/** workspace folder name -> workspace npm name suffix */
const WORKSPACE_NAME_SUFFIX = '-workspace';

/** tarball name (without @starui/) -> workspace package name when both share a base */
const PAIRED_APPS = [
  'demo-react',
  'demo-configservice-react',
  'demo-angular',
  'markets-ui-react-reference',
  'markets-grid-lab',
  'stomp-marketsgrid-minimal',
  'demo-stomp-markets-grid',
  'platform-hooks-demo',
  'e2e-browser-blotter',
  'e2e-openfin-workspace',
  'stomp-view-server',
];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(p, out);
    } else if (
      entry.name === 'package.json' ||
      entry.name.endsWith('.config.ts') ||
      entry.name.endsWith('.config.js') ||
      entry.name === 'launch.mjs' ||
      entry.name === 'README.md'
    ) {
      out.push(p);
    }
  }
  return out;
}

function depthToRepo(relFromRepo) {
  const parts = relFromRepo.split('/').filter(Boolean);
  return parts.length;
}

function fixPaths(text, depth) {
  const libsPrefix = `file:${'../'.repeat(depth)}libs/`;
  const scriptsPrefix = `${'../'.repeat(depth)}scripts/`;
  let next = text;
  next = next.replace(/file:(?:\.\.\/)+libs\//g, libsPrefix);
  next = next.replace(/from ['"](?:\.\.\/)+scripts\//g, `from '${scriptsPrefix}`);
  return next;
}

function patchPackage(pkgPath, track) {
  const relDir = relative(REPO_ROOT, join(pkgPath, '..')).replace(/\\/g, '/');
  const depth = depthToRepo(relDir);
  const folder = relDir.split('/').pop();
  const original = readFileSync(pkgPath, 'utf8');
  let text = fixPaths(original, depth);
  const pkg = JSON.parse(text);

  const baseName = pkg.name?.replace(/^@starui\//, '') ?? folder;
  const isPaired = PAIRED_APPS.includes(folder);

  if (track === 'workspace') {
    if (folder === 'e2e-openfin-workspace') {
      pkg.name = '@starui/e2e-openfin-workspace-ws';
    } else if (isPaired && !baseName.endsWith(WORKSPACE_NAME_SUFFIX)) {
      pkg.name = `@starui/${baseName}${WORKSPACE_NAME_SUFFIX}`;
    }
    const dev = pkg.scripts?.dev ?? '';
    if (dev && !dev.includes('STARUI_DEV_SOURCE')) {
      pkg.scripts.dev = dev.startsWith('cross-env')
        ? dev.replace('cross-env ', 'cross-env STARUI_DEV_SOURCE=1 ')
        : `cross-env STARUI_DEV_SOURCE=1 ${dev}`;
    }
  } else if (track === 'tarball' && isPaired) {
    const dev = pkg.scripts?.dev ?? '';
    if (dev.includes('STARUI_DEV_SOURCE')) {
      pkg.scripts.dev = dev
        .replace(/STARUI_DEV_SOURCE=1\s*/g, '')
        .replace(/cross-env\s+cross-env/g, 'cross-env')
        .trim();
      if (pkg.scripts.dev === 'cross-env vite') pkg.scripts.dev = 'vite';
      if (pkg.scripts.dev === 'cross-env ng serve') pkg.scripts.dev = 'ng serve';
    }
  }

  const next = `${JSON.stringify(pkg, null, 2)}\n`;
  if (next !== original) {
    writeFileSync(pkgPath, next);
    console.log(`package: ${relDir} (${pkg.name})`);
  }

  return relDir;
}

for (const track of ['workspace', 'tarball']) {
  const root = join(REPO_ROOT, 'apps', track);
  for (const pkgPath of walk(root).filter((p) => p.endsWith('package.json'))) {
    patchPackage(pkgPath, track);
  }
  for (const filePath of walk(root).filter((p) => !p.endsWith('package.json'))) {
    const rel = relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    const depth = depthToRepo(rel.split('/').slice(0, 3).join('/'));
    const original = readFileSync(filePath, 'utf8');
    const updated = fixPaths(original, depth);
    if (updated !== original) writeFileSync(filePath, updated);
  }
}

console.log('finalize-apps-tracks done');
