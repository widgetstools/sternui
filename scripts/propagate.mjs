#!/usr/bin/env node
/**
 * propagate.mjs — build + pack architecture-bucket tarballs under libs/.
 *
 * One tarball per top-level folder under packages/ (e.g. react-core, shared,
 * design-system). Each bundle contains every workspace package in that bucket
 * and installs as `@starui/<bucket>` (see packages/angular-core/README.md).
 *
 * Layout
 * ------
 *   libs/starui-react-core-0.1.0-<sha8>.tgz   — apps install from here
 *   dist/packages/starui-react-core-0.1.0.tgz — human-readable mirror
 *   libs/manifest.json                        — bucket → { bucket, members, filename, … }
 *
 * Usage
 * -----
 *   npm run propagate                       # pack ALL buckets
 *   npm run propagate -- react-core           # one bucket (folder name)
 *   npm run propagate -- grid                 # bucket containing @starui/grid
 *   npm run propagate -- @starui/react-core
 *   npm run propagate -- --dry-run
 *   npm run propagate -- --gc                 # remove orphaned tarballs
 *   npm run propagate -- --no-install --no-build
 *   npm run propagate -- --refresh-lockfile
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');
const LIBS_DIR = join(REPO_ROOT, 'libs');
const DIST_DIR = join(REPO_ROOT, 'dist', 'packages');
const STAGING_ROOT = join(REPO_ROOT, '.propagate-staging');
const MANIFEST_PATH = join(LIBS_DIR, 'manifest.json');
const DIST_MANIFEST_PATH = join(DIST_DIR, 'manifest.json');
const LOCKFILE_PATH = join(REPO_ROOT, 'package-lock.json');

const SKIP_COPY = new Set(['node_modules', '.turbo', '.angular', '.git']);

// ────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = new Set();
  const names = [];
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a.slice(2));
    else if (a.length > 0) names.push(a);
  }
  return {
    names,
    dryRun: flags.has('dry-run'),
    gc: flags.has('gc'),
    noInstall: flags.has('no-install'),
    noBuild: flags.has('no-build'),
    refreshLockfile: flags.has('refresh-lockfile'),
    skipDriftCheck: flags.has('skip-drift-check'),
    help: flags.has('help'),
  };
}

const args = parseArgs(process.argv.slice(2));

function log(msg) {
  process.stdout.write(`[propagate] ${msg}\n`);
}

function die(msg) {
  process.stderr.write(`[propagate] ERROR: ${msg}\n`);
  process.exit(1);
}

if (args.help) {
  process.stdout.write(readFileSync(import.meta.filename, 'utf8').slice(0, 2400));
  process.exit(0);
}

function isDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function hasPackageJson(dir) {
  try { statSync(join(dir, 'package.json')); return true; } catch { return false; }
}

// ────────────────────────────────────────────────────────────────────────
// Bucket discovery
// ────────────────────────────────────────────────────────────────────────

function readMemberPackage(memberDir) {
  const pkgPath = join(memberDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return {
    dir: memberDir,
    rel: relative(REPO_ROOT, memberDir),
    folder: relative(join(PACKAGES_ROOT, relative(PACKAGES_ROOT, memberDir).split('/')[0]), memberDir).split('/').pop()
      ?? relative(PACKAGES_ROOT, memberDir).split('/').pop(),
    name: pkg.name,
    version: pkg.version ?? '0.1.0',
    scripts: pkg.scripts ?? {},
  };
}

function discoverBuckets() {
  const buckets = [];
  for (const entry of readdirSync(PACKAGES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const bucketDir = join(PACKAGES_ROOT, entry.name);
    const members = [];
    for (const child of readdirSync(bucketDir, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const memberDir = join(bucketDir, child.name);
      if (!hasPackageJson(memberDir)) continue;
      const member = readMemberPackage(memberDir);
      member.folder = child.name;
      members.push(member);
    }
    if (members.length === 0) continue;
    members.sort((a, b) => a.name.localeCompare(b.name));
    const bucketVersion = members.reduce(
      (max, m) => (m.version > max ? m.version : max),
      members[0].version,
    );
    buckets.push({
      bucket: entry.name,
      name: `@starui/${entry.name}`,
      version: bucketVersion,
      dir: bucketDir,
      members,
    });
  }
  return buckets.sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function bucketMatchesTarget(bucket, target) {
  if (target === bucket.bucket) return true;
  if (target === bucket.name) return true;
  if (bucket.members.some((m) => m.name === target)) return true;
  const short = target.includes('/') ? target.split('/').pop() : target;
  if (bucket.members.some((m) => m.name.split('/').pop() === short)) return true;
  if (bucket.members.some((m) => m.folder === target)) return true;
  return false;
}

function selectBuckets(buckets, requestedNames) {
  if (requestedNames.length === 0) return buckets;
  const selected = [];
  const unmatched = new Set(requestedNames);
  for (const bucket of buckets) {
    if (requestedNames.some((n) => bucketMatchesTarget(bucket, n))) {
      selected.push(bucket);
      for (const n of [...unmatched]) {
        if (bucketMatchesTarget(bucket, n)) unmatched.delete(n);
      }
    }
  }
  if (unmatched.size > 0) {
    die(`unknown bucket or package: ${[...unmatched].join(', ')}`);
  }
  return selected;
}

// ────────────────────────────────────────────────────────────────────────
// Build + stage + pack
// ────────────────────────────────────────────────────────────────────────

function buildMember(member) {
  if (args.noBuild) return;
  if (!member.scripts.build) {
    log(`build: ${member.name} — no build script, skipping`);
    return;
  }
  log(`build: ${member.name}`);
  if (args.dryRun) return;
  execSync(`npm run build --workspace="${member.name}"`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

function resolveExportTarget(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value.import ?? value.default ?? value.types ?? null;
  }
  return null;
}

/** Merge member package.json exports into the bucket root for npm/tsc resolution. */
function buildBucketExports(bucket) {
  const exports = {};
  for (const member of bucket.members) {
    const memberPkg = JSON.parse(readFileSync(join(member.dir, 'package.json'), 'utf8'));
    const raw = memberPkg.exports && typeof memberPkg.exports === 'object'
      ? memberPkg.exports
      : { '.': memberPkg.main ?? memberPkg.module ?? './src/index.ts' };
    const hoist = member.name === bucket.name;

    for (const [exportKey, exportVal] of Object.entries(raw)) {
      const target = resolveExportTarget(exportVal);
      if (!target) continue;
      const relTarget = target.replace(/^\.\//, '');
      const physical = `./${member.folder}/${relTarget}`;

      if (hoist) {
        exports[exportKey] = physical;
        continue;
      }

      const short = member.name.split('/').pop();
      const bucketKey = exportKey === '.' ? `./${short}` : `./${short}${exportKey.slice(1)}`;
      exports[bucketKey] = physical;
    }
  }
  if (!exports['.'] && bucket.members.length === 1) {
    const only = bucket.members[0];
    const memberPkg = JSON.parse(readFileSync(join(only.dir, 'package.json'), 'utf8'));
    const main = memberPkg.main ?? memberPkg.module ?? './src/index.ts';
    exports['.'] = `./${only.folder}/${main.replace(/^\.\//, '')}`;
  }
  return exports;
}

function writeBucketPackageJson(stageDir, bucket) {
  const memberNames = bucket.members.map((m) => m.name);
  const pkg = {
    name: bucket.name,
    version: bucket.version,
    private: true,
    type: 'module',
    description:
      `@starui/${bucket.bucket} architecture bucket — bundled tarball containing: `
      + `${memberNames.join(', ')}`,
    exports: buildBucketExports(bucket),
  };
  writeFileSync(join(stageDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
}

function copyMemberTree(srcDir, destDir) {
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(/[/\\]/);
      return !parts.some((p) => SKIP_COPY.has(p));
    },
  });
}

function stageBucket(bucket) {
  const stageDir = join(STAGING_ROOT, bucket.bucket);
  if (args.dryRun) {
    log(`stage: ${bucket.name} ← ${bucket.members.length} member(s) (dry-run)`);
    return stageDir;
  }
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });
  writeBucketPackageJson(stageDir, bucket);
  for (const member of bucket.members) {
    copyMemberTree(member.dir, join(stageDir, member.folder));
  }
  log(`stage: ${bucket.name} ← ${bucket.members.map((m) => m.folder).join(', ')}`);
  return stageDir;
}

function rawPackFilename(name, version) {
  const base = name.startsWith('@') ? name.slice(1).replace('/', '-') : name;
  return `${base}-${version}.tgz`;
}

function rawPack(cwd) {
  const stdout = execSync(
    `npm pack --pack-destination "${LIBS_DIR}" --json`,
    { cwd, stdio: ['ignore', 'pipe', 'inherit'] },
  ).toString();
  const jsonStart = stdout.indexOf('[');
  if (jsonStart === -1) throw new Error(`npm pack produced no JSON (cwd: ${cwd})`);
  const arr = JSON.parse(stdout.slice(jsonStart));
  const filename = arr[0]?.filename;
  if (!filename) throw new Error(`npm pack returned no filename (cwd: ${cwd})`);
  return filename;
}

function sha8OfFile(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex').slice(0, 8);
}

function writeDistMirror(srcPath, distFilename, prevDistFilename) {
  mkdirSync(DIST_DIR, { recursive: true });
  copyFileSync(srcPath, join(DIST_DIR, distFilename));
  if (prevDistFilename && prevDistFilename !== distFilename) {
    const oldPath = join(DIST_DIR, prevDistFilename);
    if (existsSync(oldPath)) unlinkSync(oldPath);
  }
}

function packBucketToManifest(bucket, prevEntry) {
  const distFilename = rawPackFilename(bucket.name, bucket.version);
  if (args.dryRun) {
    const hashedName = distFilename.replace(/\.tgz$/, '-DRYRUN0.tgz');
    log(`pack: ${bucket.name}@${bucket.version} → libs/${hashedName} + dist/packages/${distFilename} (dry-run)`);
    return {
      filename: hashedName,
      distFilename,
      sha: 'DRYRUN0',
      version: bucket.version,
      contentChanged: true,
    };
  }

  const stageDir = stageBucket(bucket);
  const packedFlat = rawPack(stageDir);
  const flatPath = join(LIBS_DIR, packedFlat);
  const sha = sha8OfFile(flatPath);
  const hashedName = packedFlat.replace(/\.tgz$/, `-${sha}.tgz`);
  const hashedPath = join(LIBS_DIR, hashedName);
  const contentChanged = !prevEntry || prevEntry.sha !== sha;

  if (existsSync(hashedPath)) {
    if (packedFlat !== hashedName && existsSync(flatPath)) unlinkSync(flatPath);
  } else if (packedFlat !== hashedName) {
    renameSync(flatPath, hashedPath);
  }

  writeDistMirror(hashedPath, distFilename, prevEntry?.distFilename);

  if (prevEntry?.filename && prevEntry.filename !== hashedName) {
    const oldPath = join(LIBS_DIR, prevEntry.filename);
    if (existsSync(oldPath)) {
      unlinkSync(oldPath);
      log(`  removed prior libs tarball: ${prevEntry.filename}`);
    }
  }

  rmSync(stageDir, { recursive: true, force: true });

  log(
    `pack: ${bucket.name}@${bucket.version} → libs/${hashedName} + dist/packages/${distFilename}`
      + ` [${bucket.members.length} members]${contentChanged ? '' : ' (unchanged)'}`,
  );
  return { filename: hashedName, distFilename, sha, version: bucket.version, contentChanged };
}

// ────────────────────────────────────────────────────────────────────────
// Lockfile drift detection + recovery
// ────────────────────────────────────────────────────────────────────────

function readLockfile() {
  if (!existsSync(LOCKFILE_PATH)) return null;
  try { return JSON.parse(readFileSync(LOCKFILE_PATH, 'utf8')); } catch { return null; }
}

function sha512Base64(path) {
  return createHash('sha512').update(readFileSync(path)).digest('base64');
}

function detectLockfileDrift() {
  const lock = readLockfile();
  if (!lock) return [];
  const seen = new Map();
  for (const [pkgKey, entry] of Object.entries(lock.packages ?? {})) {
    const resolved = entry?.resolved;
    if (typeof resolved !== 'string' || !resolved.startsWith('file:')) continue;
    const path = resolved.slice('file:'.length);
    const m = path.match(/(?:^|\/)libs\/([^/]+\.tgz)$/);
    if (!m) continue;
    const file = m[1];
    const fullPath = join(LIBS_DIR, file);
    if (!existsSync(fullPath)) {
      if (!seen.has(file)) {
        seen.set(file, { file, expected: entry.integrity ?? null, actual: null, reason: 'missing', refs: [] });
      }
      seen.get(file).refs.push(pkgKey || '<root>');
      continue;
    }
    const recorded = entry.integrity ?? '';
    const actual = `sha512-${sha512Base64(fullPath)}`;
    if (!recorded) continue;
    if (recorded !== actual) {
      if (!seen.has(file)) {
        seen.set(file, { file, expected: recorded, actual, reason: 'mismatch', refs: [] });
      }
      seen.get(file).refs.push(pkgKey || '<root>');
    }
  }
  return [...seen.values()];
}

function refreshRootLockfile() {
  if (args.dryRun) {
    log('lockfile: would regenerate package-lock.json (dry-run)');
    return;
  }
  log('lockfile: regenerating package-lock.json from current libs/ state');
  if (existsSync(LOCKFILE_PATH)) unlinkSync(LOCKFILE_PATH);
  execSync('npm install', { cwd: REPO_ROOT, stdio: 'inherit' });
}

function syncRootLockfile() {
  if (args.noInstall) {
    log('root install: skipped (--no-install)');
    return;
  }
  if (args.dryRun) {
    log('root install: would run `npm install` (dry-run)');
    return;
  }
  log('root install: converging root lockfile with newly-packed tarballs');
  execSync('npm install --no-audit --no-fund', { cwd: REPO_ROOT, stdio: 'inherit' });
}

// ────────────────────────────────────────────────────────────────────────
// Manifest
// ────────────────────────────────────────────────────────────────────────

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const lifted = {};
    for (const [name, val] of Object.entries(raw)) {
      if (typeof val === 'string') {
        lifted[name] = { filename: val, version: null, sha: null, packedAt: null };
      } else {
        lifted[name] = val;
      }
    }
    return lifted;
  } catch {
    return {};
  }
}

function writeManifest(manifest) {
  if (args.dryRun) return;
  const sorted = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  log(`wrote: libs/manifest.json (${Object.keys(sorted).length} bucket entries)`);

  const distView = Object.fromEntries(
    Object.entries(sorted).map(([name, entry]) => [
      name,
      {
        filename: entry.distFilename ?? entry.filename,
        bucket: entry.bucket,
        members: entry.members,
        version: entry.version,
        sha: entry.sha,
        packedAt: entry.packedAt,
        libsFilename: entry.filename,
      },
    ]),
  );
  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(DIST_MANIFEST_PATH, `${JSON.stringify(distView, null, 2)}\n`);
  log(`wrote: dist/packages/manifest.json (${Object.keys(distView).length} bucket entries)`);
}

// ────────────────────────────────────────────────────────────────────────
// Sync apps/* package.json file: deps
// ────────────────────────────────────────────────────────────────────────

function findAppPackageJsons() {
  const appsDir = join(REPO_ROOT, 'apps');
  if (!isDirectory(appsDir)) return [];
  const out = [];
  for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const direct = join(appsDir, entry.name, 'package.json');
    if (existsSync(direct)) {
      out.push(direct);
      continue;
    }
    const nestedRoot = join(appsDir, entry.name);
    for (const child of readdirSync(nestedRoot, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const nested = join(nestedRoot, child.name, 'package.json');
      if (existsSync(nested)) out.push(nested);
    }
  }
  return out;
}

function syncAppPackageJson(appPkgPath, updates) {
  const original = readFileSync(appPkgPath, 'utf8');
  const pkg = JSON.parse(original);
  const rewritten = [];
  for (const depKey of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = pkg[depKey];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string') continue;
      const m = spec.match(/^file:(.*\/libs\/)([^/]+\.tgz)$/);
      if (!m) continue;
      const upd = updates[name];
      if (!upd) continue;
      const next = `file:${m[1]}${upd.filename}`;
      if (next === spec) continue;
      deps[name] = next;
      rewritten.push(name);
    }
  }
  if (rewritten.length === 0) return [];
  if (!args.dryRun) {
    const suffix = original.endsWith('\n') ? '\n' : '';
    writeFileSync(appPkgPath, `${JSON.stringify(pkg, null, 2)}${suffix}`);
  }
  log(`sync: ${relative(REPO_ROOT, appPkgPath)} ← ${rewritten.join(', ')}`);
  return rewritten;
}

function appReferencesLibTarball(appPkgPath, packageName) {
  const pkg = JSON.parse(readFileSync(appPkgPath, 'utf8'));
  for (const depKey of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const deps = pkg[depKey];
    if (!deps || !(packageName in deps)) continue;
    const spec = deps[packageName];
    if (typeof spec === 'string' && /\/libs\/[^/]+\.tgz$/.test(spec)) return true;
  }
  return false;
}

function installApp(appDir, depsToRefresh) {
  if (args.noInstall) {
    log(`install: ${relative(REPO_ROOT, appDir)} — skipped (--no-install)`);
    return;
  }
  for (const dep of depsToRefresh) {
    const path = join(appDir, 'node_modules', dep);
    if (existsSync(path)) {
      if (args.dryRun) log(`  would remove: node_modules/${dep}`);
      else rmSync(path, { recursive: true, force: true });
    }
  }
  const viteCache = join(appDir, 'node_modules', '.vite');
  if (existsSync(viteCache)) {
    if (args.dryRun) log('  would remove: node_modules/.vite');
    else rmSync(viteCache, { recursive: true, force: true });
  }
  log(`install: ${relative(REPO_ROOT, appDir)}`);
  if (args.dryRun) return;
  execSync('npm install', { cwd: appDir, stdio: 'inherit' });
}

// ────────────────────────────────────────────────────────────────────────
// GC
// ────────────────────────────────────────────────────────────────────────

function gcOrphanedTarballs(manifest, appPkgPaths) {
  const referenced = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry?.filename) referenced.add(entry.filename);
  }
  for (const appPkgPath of appPkgPaths) {
    const pkg = JSON.parse(readFileSync(appPkgPath, 'utf8'));
    for (const depKey of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const deps = pkg[depKey];
      if (!deps) continue;
      for (const spec of Object.values(deps)) {
        if (typeof spec !== 'string') continue;
        const m = spec.match(/\/libs\/([^/]+\.tgz)$/);
        if (m) referenced.add(m[1]);
      }
    }
  }
  let removed = 0;
  if (!isDirectory(LIBS_DIR)) return;
  for (const entry of readdirSync(LIBS_DIR)) {
    if (!entry.endsWith('.tgz')) continue;
    if (referenced.has(entry)) continue;
    const path = join(LIBS_DIR, entry);
    if (args.dryRun) log(`gc: would remove ${entry}`);
    else {
      unlinkSync(path);
      log(`gc: removed ${entry}`);
    }
    removed++;
  }
  if (removed === 0) log('gc: no orphaned tarballs in libs/');
}

function gcOrphanedDist(manifest) {
  if (!isDirectory(DIST_DIR)) return;
  const referenced = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry?.distFilename) referenced.add(entry.distFilename);
  }
  let removed = 0;
  for (const entry of readdirSync(DIST_DIR)) {
    if (!entry.endsWith('.tgz')) continue;
    if (referenced.has(entry)) continue;
    const path = join(DIST_DIR, entry);
    if (args.dryRun) log(`gc: would remove dist/packages/${entry}`);
    else {
      unlinkSync(path);
      log(`gc: removed dist/packages/${entry}`);
    }
    removed++;
  }
  if (removed === 0) log('gc: no orphaned tarballs in dist/packages');
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

function main() {
  log(`repo root: ${REPO_ROOT}`);
  if (args.dryRun) log('DRY RUN — no files will be written');
  if (!isDirectory(LIBS_DIR)) {
    if (args.dryRun) log('would create: libs/');
    else mkdirSync(LIBS_DIR, { recursive: true });
  }

  if (!args.skipDriftCheck) {
    const drift = detectLockfileDrift();
    if (drift.length > 0) {
      log(`lockfile drift: ${drift.length} tarball(s) in libs/`);
      for (const d of drift) {
        log(`  - ${d.file} (${d.reason === 'missing' ? 'missing' : 'sha512 mismatch'})`);
      }
      if (args.refreshLockfile) refreshRootLockfile();
      else {
        die(
          'package-lock.json is stale relative to libs/. Re-run with `--refresh-lockfile`\n'
          + '       or `--skip-drift-check` to bypass.',
        );
      }
    } else {
      log('lockfile drift: none');
    }
  }

  const buckets = discoverBuckets();
  const targets = selectBuckets(buckets, args.names);
  if (targets.length === 0) {
    log('no architecture buckets selected');
    return;
  }
  log(`buckets: ${targets.length} (${targets.map((b) => b.bucket).join(', ')})`);

  const manifest = readManifest();
  const updates = {};
  const now = new Date().toISOString();

  for (const bucket of targets) {
    for (const member of bucket.members) {
      try {
        buildMember(member);
      } catch (err) {
        die(`build failed for ${member.name}: ${err.message ?? err}`);
      }
    }
    const prev = manifest[bucket.name];
    const result = packBucketToManifest(bucket, prev);
    manifest[bucket.name] = {
      bucket: bucket.bucket,
      members: bucket.members.map((m) => m.name),
      filename: result.filename,
      distFilename: result.distFilename,
      version: result.version,
      sha: result.sha,
      packedAt: now,
    };
    updates[bucket.name] = { ...manifest[bucket.name], contentChanged: result.contentChanged };
  }

  // Drop legacy per-package manifest entries from the pre-bucket era.
  for (const key of Object.keys(manifest)) {
    const entry = manifest[key];
    if (!entry?.bucket || !entry?.members?.length) delete manifest[key];
  }

  writeManifest(manifest);

  // Rewrite app package.json deps to bucket tarballs (member imports unchanged in source).
  if (!args.dryRun) {
    execSync('node scripts/sync-app-tarball-deps.mjs', { cwd: REPO_ROOT, stdio: 'inherit' });
  } else {
    log('sync:app-deps skipped (dry-run)');
  }

  const appPkgPaths = findAppPackageJsons();
  const affectedApps = new Map();
  for (const appPkgPath of appPkgPaths) {
    const rewritten = syncAppPackageJson(appPkgPath, updates);
    const appDir = resolve(appPkgPath, '..');
    const deps = affectedApps.get(appDir) ?? new Set();
    for (const r of rewritten) deps.add(r);
    for (const [name, entry] of Object.entries(updates)) {
      if (!entry.contentChanged) continue;
      if (appReferencesLibTarball(appPkgPath, name)) deps.add(name);
    }
    if (deps.size > 0) affectedApps.set(appDir, deps);
  }
  if (affectedApps.size === 0) {
    log('no apps reference bucket tarballs — nothing to install');
  } else {
    for (const [appDir, deps] of affectedApps) {
      installApp(appDir, deps);
    }
  }

  if (Object.keys(updates).length > 0) syncRootLockfile();

  if (args.gc) {
    gcOrphanedTarballs(manifest, appPkgPaths);
    gcOrphanedDist(manifest);
  }

  if (!args.dryRun) rmSync(STAGING_ROOT, { recursive: true, force: true });

  if (!args.skipDriftCheck && !args.dryRun) {
    const drift = detectLockfileDrift();
    if (drift.length > 0) {
      log(`WARNING: lockfile drift still present (${drift.length} tarball(s))`);
      for (const d of drift) log(`  - ${d.file}`);
    }
  }

  log(`done — packed ${Object.keys(updates).length} bucket(s), ${affectedApps.size} app(s) synced`);
}

main();
