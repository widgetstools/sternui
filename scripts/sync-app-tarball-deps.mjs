#!/usr/bin/env node
/**
 * sync-app-tarball-deps.mjs — rewrite app @starui/* deps to bucket tarballs in libs/.
 *
 * Apps keep importing member packages (@starui/app, @starui/grid, …). Dependencies
 * list the architecture buckets (@starui/react-core, @starui/shared, …) as file:
 * tarballs. Vite aliases (staruiConsumerAliases.mjs) + bucket exports resolve members.
 *
 *   npm run sync:app-deps
 *   npm run sync:app-deps -- demo-react
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const LIBS_DIR = join(REPO_ROOT, 'libs');
const MANIFEST_PATH = join(LIBS_DIR, 'manifest.json');
const APPS_ROOT = join(REPO_ROOT, 'apps');

function log(msg) {
  process.stdout.write(`[sync-app-deps] ${msg}\n`);
}

function die(msg) {
  process.stderr.write(`[sync-app-deps] ERROR: ${msg}\n`);
  process.exit(1);
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    die('libs/manifest.json missing — run `npm run propagate` first');
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function buildMemberIndex(manifest) {
  const memberToBucket = new Map();
  for (const [bucketPkg, entry] of Object.entries(manifest)) {
    if (!entry?.filename || !entry?.members?.length) continue;
    memberToBucket.set(bucketPkg, { bucketPkg, ...entry });
    for (const member of entry.members) {
      memberToBucket.set(member, { bucketPkg, ...entry });
    }
  }
  return memberToBucket;
}

function findAppPackageJsons() {
  const out = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (!statSync(p).isDirectory()) continue;
      const pkgPath = join(p, 'package.json');
      if (existsSync(pkgPath)) out.push(pkgPath);
      else walk(p);
    }
  }
  walk(APPS_ROOT);
  return out;
}

function libsPrefixFromApp(appPkgPath) {
  const rel = relative(dirname(appPkgPath), LIBS_DIR);
  return rel.split(sep).join('/');
}

function matchesFilter(appPkgPath, filterNames) {
  if (filterNames.length === 0) return true;
  const pkg = JSON.parse(readFileSync(appPkgPath, 'utf8'));
  const short = pkg.name?.split('/').pop() ?? '';
  const rel = relative(APPS_ROOT, dirname(appPkgPath));
  return filterNames.some(
    (f) => f === short || f === pkg.name || rel === f || rel.endsWith(`/${f}`),
  );
}

function syncApp(appPkgPath, manifest, memberIndex) {
  const original = readFileSync(appPkgPath, 'utf8');
  const pkg = JSON.parse(original);

  const libsPrefix = libsPrefixFromApp(appPkgPath);
  const bucketsNeeded = new Map();

  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (!name.startsWith('@starui/')) continue;
      const entry = memberIndex.get(name);
      if (!entry) {
        die(`no bucket tarball for ${name} (app: ${pkg.name}) — run propagate or add to a bucket`);
      }
      bucketsNeeded.set(entry.bucketPkg, entry);
    }
  }

  if (bucketsNeeded.size === 0) return { changed: false, buckets: [] };

  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (name.startsWith('@starui/')) delete deps[name];
    }
    if (Object.keys(deps).length === 0) delete pkg[section];
  }

  if (!pkg.dependencies) pkg.dependencies = {};
  for (const entry of bucketsNeeded.values()) {
    pkg.dependencies[entry.bucketPkg] = `file:${libsPrefix}/${entry.filename}`;
  }

  const sortedDeps = Object.fromEntries(
    Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
  );
  pkg.dependencies = sortedDeps;

  const next = `${JSON.stringify(pkg, null, 2)}\n`;
  if (next === original) {
    return { changed: false, buckets: [...bucketsNeeded.keys()] };
  }
  writeFileSync(appPkgPath, next);
  log(`${relative(REPO_ROOT, appPkgPath)} ← ${[...bucketsNeeded.keys()].join(', ')}`);
  return { changed: true, buckets: [...bucketsNeeded.keys()] };
}

const filterNames = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const manifest = readManifest();
const memberIndex = buildMemberIndex(manifest);
const apps = findAppPackageJsons().filter((p) => matchesFilter(p, filterNames));

let changedApps = 0;
for (const appPkgPath of apps) {
  const result = syncApp(appPkgPath, manifest, memberIndex);
  if (result.changed) changedApps++;
}

log(`done — ${changedApps} app(s) updated, ${apps.length} scanned`);
