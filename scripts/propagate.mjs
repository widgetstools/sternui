#!/usr/bin/env node
/**
 * propagate.mjs — pack changed workspace libraries with content-hashed
 * filenames, then sync `apps/*` `package.json` + `node_modules` so
 * consumer apps pick up the new bits without npm's cache helping
 * the wrong version stick around.
 *
 * Why this script exists
 * ----------------------
 * Reference apps (apps/demo-react today) consume libs via `file:` tarball
 * deps so packaging bugs surface during local dev — same shape consumers
 * see (code-organization.md Decision 13). That's good. The trap: npm
 * caches `file:` extractions keyed by **(path, integrity)**. When you
 * repack to the same path with new content, npm will either:
 *   - silently reuse the cached extraction (stale bits, looks like the
 *     fix didn't land), or
 *   - fail with EINTEGRITY because `package-lock.json` still has the
 *     old hash.
 * Workarounds like `npm install --save file:...` recompute the integrity
 * but are easy to forget and slow to discover.
 *
 * Fix: every pack writes a tarball whose filename includes a short hash
 * of its CONTENTS:
 *     libs/starui-grid-react-0.1.0-<sha8>.tgz
 * Consumer `package.json` `file:` deps are rewritten in-place to point
 * at the new filename. Different content → different filename → npm has
 * nothing cached against that path → fresh extract every time, by
 * construction.
 *
 * Usage
 * -----
 *   npm run propagate                       # pack ALL workspace libraries, sync apps
 *   npm run propagate -- grid-react         # pack just these packages (short or scoped names)
 *   npm run propagate -- @starui/grid-react @starui/markets-grid
 *   npm run propagate -- --dry-run          # show plan, write nothing
 *   npm run propagate -- --gc               # also delete orphaned tarballs in libs/
 *   npm run propagate -- --no-install       # skip the per-app `npm install` step
 *   npm run propagate -- --no-build         # skip per-package build (use existing dist/)
 *   npm run propagate -- --refresh-lockfile # regenerate root package-lock.json if drift found
 *   npm run propagate -- --skip-drift-check # bypass pre-flight lockfile drift check
 *
 * Lockfile drift
 * --------------
 * Tarballs in libs/ are integrity-tracked in the root package-lock.json. If
 * a tarball is overwritten (by the legacy `pack:libs` script, by hand, or by
 * a partial propagate run that crashed mid-flight) its sha512 drifts away
 * from what the lockfile records. From then on, `npm ci` and `npm install`
 * both fail with EINTEGRITY — including the per-app installs that propagate
 * itself fires, which means propagate can't recover on its own.
 *
 * This script's pre-flight pass detects that drift and fails fast with a
 * named list of mismatched tarballs. Pass `--refresh-lockfile` to fix it in
 * the same run (deletes + regenerates package-lock.json before packing).
 * The post-flight root install is a final converge step that absorbs
 * integrity for any tarball we just repacked.
 *
 * Output
 * ------
 *   libs/<scope>-<name>-<version>-<sha8>.tgz   (per packed library)
 *   libs/manifest.json                          (package → {filename, version, sha, packedAt})
 *
 * Per-package build, not workspace-wide
 * -------------------------------------
 * Each library is built individually (its own `build` script, if any).
 * An unrelated package with a broken build no longer blocks packing the
 * one you actually changed — the cause of every `pack:libs` failure on
 * this repo to date.
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
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
const LIBS_DIR = join(REPO_ROOT, 'libs');
const MANIFEST_PATH = join(LIBS_DIR, 'manifest.json');

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
  process.stdout.write(readFileSync(import.meta.filename, 'utf8').slice(0, 2200));
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────
// Workspace discovery (same shape as pack-libs.mjs)
// ────────────────────────────────────────────────────────────────────────

function isDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function hasPackageJson(dir) {
  try { statSync(join(dir, 'package.json')); return true; } catch { return false; }
}

function expandGlob(glob) {
  if (!glob.endsWith('/*')) {
    const abs = join(REPO_ROOT, glob);
    return isDirectory(abs) && hasPackageJson(abs) ? [abs] : [];
  }
  const parent = join(REPO_ROOT, glob.slice(0, -2));
  let entries;
  try { entries = readdirSync(parent, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => join(parent, e.name))
    .filter(hasPackageJson);
}

function loadRootPackage() {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
}

function discoverPackages() {
  const globs = loadRootPackage().workspaces ?? [];
  const dirs = new Set();
  for (const glob of globs) for (const dir of expandGlob(glob)) dirs.add(dir);
  return [...dirs]
    .sort()
    .map((dir) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      return {
        dir,
        rel: relative(REPO_ROOT, dir),
        name: pkg.name,
        version: pkg.version,
        scripts: pkg.scripts ?? {},
        isLibrary: relative(REPO_ROOT, dir).startsWith('packages/'),
      };
    });
}

// ────────────────────────────────────────────────────────────────────────
// Target selection
// ────────────────────────────────────────────────────────────────────────

/**
 * Match a CLI-supplied package name against a discovered package. The
 * user can pass:
 *   - the exact scoped name:    @starui/grid-react
 *   - the bare short name:      grid-react
 *   - a directory-name suffix:  widgets/grid-react   (rare; supported for muscle memory)
 */
function matchesTarget(pkg, target) {
  if (!pkg.name) return false;
  if (target === pkg.name) return true;
  const short = pkg.name.includes('/') ? pkg.name.split('/').pop() : pkg.name;
  if (target === short) return true;
  if (pkg.rel.endsWith(`/${target}`)) return true;
  return false;
}

function selectTargets(packages, requestedNames) {
  if (requestedNames.length === 0) {
    return packages.filter((p) => p.isLibrary);
  }
  const selected = [];
  const unmatched = new Set(requestedNames);
  for (const pkg of packages) {
    if (!pkg.isLibrary) continue;
    if (requestedNames.some((n) => matchesTarget(pkg, n))) {
      selected.push(pkg);
      for (const n of [...unmatched]) {
        if (matchesTarget(pkg, n)) unmatched.delete(n);
      }
    }
  }
  if (unmatched.size > 0) {
    die(`unknown package(s): ${[...unmatched].join(', ')}`);
  }
  return selected;
}

// ────────────────────────────────────────────────────────────────────────
// Build + pack
// ────────────────────────────────────────────────────────────────────────

function buildPackage(pkg) {
  if (args.noBuild) return;
  if (!pkg.scripts.build) {
    log(`build: ${pkg.name} — no build script, skipping`);
    return;
  }
  log(`build: ${pkg.name}`);
  if (args.dryRun) return;
  execSync(`npm run build --workspace="${pkg.name}"`, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

/**
 * The filename `npm pack` WOULD produce, without actually packing.
 * Matches npm's own scheme: `<scope-name>-<version>.tgz` for scoped
 * packages, `<name>-<version>.tgz` for bare ones.
 */
function rawPackFilename(pkg) {
  const base = pkg.name.startsWith('@')
    ? pkg.name.slice(1).replace('/', '-')
    : pkg.name;
  return `${base}-${pkg.version}.tgz`;
}

function rawPack(pkg) {
  // npm pack --json prints a JSON array; warnings go to stderr.
  const stdout = execSync(
    `npm pack --pack-destination "${LIBS_DIR}" --json`,
    { cwd: pkg.dir, stdio: ['ignore', 'pipe', 'inherit'] },
  ).toString();
  const jsonStart = stdout.indexOf('[');
  if (jsonStart === -1) throw new Error(`npm pack produced no JSON for ${pkg.name}`);
  const arr = JSON.parse(stdout.slice(jsonStart));
  const filename = arr[0]?.filename;
  if (!filename) throw new Error(`npm pack returned no filename for ${pkg.name}`);
  return filename;
}

function sha8OfFile(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex').slice(0, 8);
}

/**
 * Pack `pkg`, then rename the resulting tarball to include a short hash
 * of its contents. Returns the new filename. Idempotent: if the SAME
 * content was already packed (same hash), reuses the existing file and
 * deletes the freshly-packed duplicate.
 */
function packWithHash(pkg) {
  if (args.dryRun) {
    // Synthesise a plausible filename so the downstream app-sync /
    // install-plan steps can still show what they WOULD do. The
    // synthetic SHA is obviously distinct from any real hash so a
    // dry-run output is never mistaken for a real run.
    const flat = rawPackFilename(pkg);
    const hashedName = flat.replace(/\.tgz$/, `-DRYRUN0.tgz`);
    log(`pack: ${pkg.name}@${pkg.version} → ${hashedName} (dry-run)`);
    return { filename: hashedName, sha: 'DRYRUN0', version: pkg.version };
  }
  const flatName = rawPack(pkg);
  const flatPath = join(LIBS_DIR, flatName);
  const sha = sha8OfFile(flatPath);
  // `npm pack` produces `<scope>-<name>-<version>.tgz`. Append `-<sha8>`
  // before the `.tgz`. Robust against versions containing dots / dashes.
  const hashedName = flatName.replace(/\.tgz$/, `-${sha}.tgz`);
  const hashedPath = join(LIBS_DIR, hashedName);
  if (existsSync(hashedPath)) {
    // Identical content already on disk — drop the duplicate.
    unlinkSync(flatPath);
    log(`pack: ${pkg.name}@${pkg.version} → ${hashedName} (unchanged)`);
  } else {
    renameSync(flatPath, hashedPath);
    log(`pack: ${pkg.name}@${pkg.version} → ${hashedName}`);
  }
  return { filename: hashedName, sha, version: pkg.version };
}

// ────────────────────────────────────────────────────────────────────────
// Lockfile drift detection + recovery
// ────────────────────────────────────────────────────────────────────────

const LOCKFILE_PATH = join(REPO_ROOT, 'package-lock.json');

function readLockfile() {
  if (!existsSync(LOCKFILE_PATH)) return null;
  try { return JSON.parse(readFileSync(LOCKFILE_PATH, 'utf8')); } catch { return null; }
}

function sha512Base64(path) {
  return createHash('sha512').update(readFileSync(path)).digest('base64');
}

/**
 * Walk package-lock.json. For every entry whose `resolved` points at a
 * `file:` tarball under libs/, compute the on-disk sha512 and compare to
 * the recorded `integrity`. Returns mismatches keyed by tarball filename
 * (one record per filename — same tarball can appear in many lock
 * entries, all sharing the same integrity).
 */
function detectLockfileDrift() {
  const lock = readLockfile();
  if (!lock) return [];
  const seen = new Map(); // filename → { file, expected, actual, reason, refs }
  const packages = lock.packages ?? {};
  for (const [pkgKey, entry] of Object.entries(packages)) {
    const resolved = entry?.resolved;
    if (typeof resolved !== 'string' || !resolved.startsWith('file:')) continue;
    // npm lockfileVersion 3 records the resolution as one of:
    //   file:libs/foo.tgz           (workspace-root-relative)
    //   file:../../libs/foo.tgz     (workspace-relative from a nested ws)
    //   file:/abs/path/libs/foo.tgz (absolute, rarer)
    // Strip the `file:` prefix and then match the trailing `libs/<x>.tgz`.
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
    if (!recorded) continue; // no integrity recorded — npm will compute it; not drift
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
  // Remove the lockfile only — leave node_modules in place so the
  // subsequent install is incremental rather than a full reseed.
  if (existsSync(LOCKFILE_PATH)) unlinkSync(LOCKFILE_PATH);
  execSync('npm install', { cwd: REPO_ROOT, stdio: 'inherit' });
}

function syncRootLockfile() {
  if (args.noInstall) {
    log('root install: skipped (--no-install) — lockfile may still reflect pre-pack integrity');
    return;
  }
  if (args.dryRun) {
    log('root install: would run `npm install` to converge root lockfile (dry-run)');
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
    // Lift old string-valued entries (pre-hash format) to the new shape.
    const lifted = {};
    for (const [name, val] of Object.entries(raw)) {
      lifted[name] = typeof val === 'string'
        ? { filename: val, version: null, sha: null, packedAt: null }
        : val;
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
  writeFileSync(MANIFEST_PATH, JSON.stringify(sorted, null, 2) + '\n');
  log(`wrote: libs/manifest.json (${Object.keys(sorted).length} entries)`);
}

// ────────────────────────────────────────────────────────────────────────
// Sync apps/* package.json file: deps to the new tarball filenames
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
    // One level of nesting (e.g. apps/demo-apps/<app>) so the propagate
    // flow reaches grouped reference apps without dragging every
    // directory under `apps/` into the sync.
    const nestedRoot = join(appsDir, entry.name);
    for (const child of readdirSync(nestedRoot, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      const nested = join(nestedRoot, child.name, 'package.json');
      if (existsSync(nested)) out.push(nested);
    }
  }
  return out;
}

/**
 * Rewrite every `file:..libs/<oldfile>` dep in `appPkgPath` that points
 * at a package present in `updates` so it points at the new filename.
 * Returns the list of dep names that were rewritten — the caller uses
 * this to scope the per-app reinstall.
 */
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
    // Preserve the trailing newline if the original had one — keeps
    // diffs minimal on git review.
    const suffix = original.endsWith('\n') ? '\n' : '';
    writeFileSync(appPkgPath, JSON.stringify(pkg, null, 2) + suffix);
  }
  const rel = relative(REPO_ROOT, appPkgPath);
  log(`sync: ${rel} ← ${rewritten.length} dep(s) rewritten: ${rewritten.join(', ')}`);
  return rewritten;
}

function installApp(appDir, depsToRefresh) {
  if (args.noInstall) {
    log(`install: ${relative(REPO_ROOT, appDir)} — skipped (--no-install)`);
    return;
  }
  // The cache trap: npm keys `file:` extractions by (path, integrity).
  // Even when package.json now references a new filename, an orphaned
  // `node_modules/<pkg>` from the prior install can confuse Vite's
  // pre-bundle pass. Belt-and-braces: drop each refreshed dep's tree
  // AND the Vite cache before installing.
  for (const dep of depsToRefresh) {
    const path = join(appDir, 'node_modules', dep);
    if (existsSync(path)) {
      if (args.dryRun) {
        log(`  would remove: node_modules/${dep}`);
      } else {
        rmSync(path, { recursive: true, force: true });
      }
    }
  }
  const viteCache = join(appDir, 'node_modules', '.vite');
  if (existsSync(viteCache)) {
    if (args.dryRun) {
      log(`  would remove: node_modules/.vite`);
    } else {
      rmSync(viteCache, { recursive: true, force: true });
    }
  }
  log(`install: ${relative(REPO_ROOT, appDir)}`);
  if (args.dryRun) return;
  execSync('npm install', { cwd: appDir, stdio: 'inherit' });
}

// ────────────────────────────────────────────────────────────────────────
// GC
// ────────────────────────────────────────────────────────────────────────

/**
 * Remove tarballs in libs/ that no rewritten app package.json references
 * AND that aren't listed in the current manifest. We never delete the
 * manifest's current entry — that's the source of truth for downstream
 * consumers (CI, fresh checkouts) until the next propagate run replaces
 * it.
 */
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
  for (const entry of readdirSync(LIBS_DIR)) {
    if (!entry.endsWith('.tgz')) continue;
    if (referenced.has(entry)) continue;
    const path = join(LIBS_DIR, entry);
    if (args.dryRun) {
      log(`gc: would remove ${entry}`);
    } else {
      unlinkSync(path);
      log(`gc: removed ${entry}`);
    }
    removed++;
  }
  if (removed === 0) log('gc: no orphaned tarballs');
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────

function main() {
  log(`repo root: ${REPO_ROOT}`);
  if (args.dryRun) log('DRY RUN — no files will be written');
  if (!isDirectory(LIBS_DIR)) {
    if (args.dryRun) {
      log(`would create: libs/`);
    } else {
      mkdirSync(LIBS_DIR, { recursive: true });
    }
  }

  // Pre-flight: detect lockfile drift BEFORE we pack anything. Drift in any
  // referenced tarball will make the per-app `npm install` step at the end
  // abort with EINTEGRITY — even for tarballs we aren't repacking this run.
  // Better to fail (or self-heal) up front than half-way through.
  if (!args.skipDriftCheck) {
    const drift = detectLockfileDrift();
    if (drift.length > 0) {
      log(`lockfile drift: ${drift.length} tarball(s) in libs/ no longer match package-lock.json integrity`);
      for (const d of drift) {
        const detail = d.reason === 'missing' ? '(tarball missing on disk)' : '(sha512 mismatch)';
        log(`  - ${d.file} ${detail}`);
      }
      if (args.refreshLockfile) {
        refreshRootLockfile();
      } else {
        die(
          'package-lock.json is stale relative to libs/. Re-run with `--refresh-lockfile`\n' +
          '       to regenerate the lockfile in this same propagate run, or fix the drift\n' +
          '       manually before re-running. Use `--skip-drift-check` to bypass this guard.',
        );
      }
    } else {
      log('lockfile drift: none');
    }
  }

  const packages = discoverPackages();
  const targets = selectTargets(packages, args.names);
  if (targets.length === 0) {
    log('no library packages selected');
    return;
  }
  log(`targets: ${targets.length} (${targets.map((p) => p.name).join(', ')})`);

  // Build + pack, accumulating per-package manifest entries.
  const manifest = readManifest();
  const updates = {};
  const now = new Date().toISOString();
  for (const pkg of targets) {
    try {
      buildPackage(pkg);
    } catch (err) {
      die(`build failed for ${pkg.name}: ${err.message ?? err}`);
    }
    const result = packWithHash(pkg);
    if (!result) continue; // dry run
    const prev = manifest[pkg.name];
    if (prev?.filename && prev.filename !== result.filename) {
      log(`  prev: ${prev.filename}`);
    }
    manifest[pkg.name] = {
      filename: result.filename,
      version: result.version,
      sha: result.sha,
      packedAt: now,
    };
    updates[pkg.name] = manifest[pkg.name];
  }

  writeManifest(manifest);

  // Sync every apps/* package.json that references one of the updated
  // packages, then reinstall in each app where something actually
  // changed.
  const appPkgPaths = findAppPackageJsons();
  const affectedApps = new Map(); // appDir → Set<depName>
  for (const appPkgPath of appPkgPaths) {
    const rewritten = syncAppPackageJson(appPkgPath, updates);
    if (rewritten.length > 0) {
      const appDir = resolve(appPkgPath, '..');
      const existing = affectedApps.get(appDir);
      if (existing) {
        for (const r of rewritten) existing.add(r);
      } else {
        affectedApps.set(appDir, new Set(rewritten));
      }
    }
  }
  if (affectedApps.size === 0) {
    log('no apps reference the propagated packages — nothing to install');
  } else {
    for (const [appDir, deps] of affectedApps) {
      installApp(appDir, deps);
    }
  }

  // Per-app `npm install` updates the root lockfile in workspace mode, but
  // running an explicit root-level install at the end is the cheapest way
  // to guarantee the lockfile is fully consistent — including for any
  // tarball we just rewrote whose integrity hasn't been re-recorded.
  // Idempotent when there's nothing to do.
  if (Object.keys(updates).length > 0) {
    syncRootLockfile();
  }

  if (args.gc) gcOrphanedTarballs(manifest, appPkgPaths);

  // Final assertion: drift must be clean by the end of the run. If a
  // refresh was promised but didn't actually take, surface it loudly
  // rather than letting CI discover it later.
  if (!args.skipDriftCheck && !args.dryRun) {
    const drift = detectLockfileDrift();
    if (drift.length > 0) {
      log(`WARNING: lockfile drift still present after propagate (${drift.length} tarball(s)):`);
      for (const d of drift) log(`  - ${d.file} (${d.reason})`);
      log('         `npm ci` from a fresh clone will fail. Investigate before committing.');
    }
  }

  log(`done — packed ${Object.keys(updates).length}, ${affectedApps.size} app(s) synced`);
}

main();
