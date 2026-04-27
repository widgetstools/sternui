/**
 * Auto-discover every `@marketsui/*` workspace package and produce
 * Vite alias entries that map them — and every subpath export they
 * declare — to their `src/` directory.
 *
 * Why this exists:
 *   Packages publish their public surface through `package.json`
 *   `exports`, which point at compiled `./dist/...` files. The Vite
 *   dev server resolves through that exports map by default, so a
 *   source-side change isn't visible until the package is rebuilt
 *   into `dist/`. Symptoms: new console logs don't show up, old
 *   imports keep working after a refactor that removed them, etc.
 *
 *   Hand-maintaining alias entries per subpath got noisy (one entry
 *   per `./v2`, per `./v2/client`, …) and is also easy to forget
 *   when a new export lands. This helper walks the workspace once
 *   at Vite startup, reads each package's exports map, and turns
 *   every entry into a source-path alias.
 *
 * Algorithm per package:
 *   1. Skip if its `name` doesn't start with `@marketsui/`.
 *   2. Skip if it has no `src/` directory (compiled-only / asset
 *      packages).
 *   3. For each entry in `exports`:
 *        a. Read the `import` (or `default`) target — a relative
 *           path like `./dist/foo/index.js`.
 *        b. Rewrite `./dist/` to `./src/` and strip the `.js`
 *           extension to get a candidate source path.
 *        c. Probe `.ts`, `.tsx`, `/index.ts`, `/index.tsx` until
 *           a real file is found. If none exist (typically because
 *           the package has a bespoke build output that doesn't
 *           mirror the source layout), skip — caller can still
 *           drop in an explicit alias for that one entry.
 *        d. Emit `${pkgName}` (for `.`) or `${pkgName}${subpath}`
 *           (for `./foo`) → resolved source path.
 *
 * Caller can layer explicit aliases on top of the result; Vite's
 * resolver picks the first match, so explicit entries WIN over the
 * auto-discovered ones. Use that to override quirky packages
 * (e.g. one that ships Monaco worker chunks via dynamic
 * `new Worker(new URL(...))` from its dist that doesn't survive
 * source-aliasing).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

interface PackageJson {
  name?: string;
  main?: string;
  exports?: Record<string, string | { import?: string; default?: string; types?: string }>;
}

/** Read package.json safely; return null on any failure. */
function readPkgJson(path: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PackageJson;
  } catch {
    return null;
  }
}

/** Resolve the first existing candidate path. */
function probeSource(base: string): string | null {
  // Probe order matters:
  //   1. The base path verbatim — for packages whose `exports` map
  //      already points at source (e.g. `./src/index.ts`).
  //   2. Common TypeScript extensions appended.
  //   3. `index.*` inside the path (treat base as a directory).
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.mts'),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Pull the runtime target out of an export-map entry. */
function targetFromExport(entry: PackageJson['exports'] extends infer E ? E extends Record<string, infer V> ? V : never : never): string | null {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    return entry.import ?? entry.default ?? null;
  }
  return null;
}

export interface BuildAliasesOptions {
  /** Repo packages root, e.g. `<repo>/packages`. */
  packagesRoot: string;
  /** Package-name prefix to scan. Default: `@marketsui/`. */
  scope?: string;
  /**
   * Package names to skip (e.g. ones that don't survive source-
   * aliasing because they ship pre-bundled worker chunks).
   * Provide either bare names ("@marketsui/foo") or subpaths
   * ("@marketsui/foo/bar"). Caller layers explicit overrides for
   * these.
   */
  skip?: ReadonlyArray<string>;
}

/** A single Vite alias entry in array form (find/replacement pair). */
export interface AliasEntry {
  /** Regex matching the import specifier exactly (anchored ^…$). */
  find: RegExp;
  /** Absolute source path to substitute. */
  replacement: string;
}

/**
 * Build Vite alias entries by walking every `@marketsui/*` package.
 *
 * Returns the **array form** of Vite aliases (not a plain object).
 * The array form is required because Vite's object-form alias does
 * prefix matching: an alias `@marketsui/foo` would also match
 * `@marketsui/foo/bar`, replacing the prefix and producing a wrong
 * path like `<foo-src>/index.ts/bar`. Each entry uses an
 * **anchored regex** (`^@marketsui\/foo$` etc.) so an alias matches
 * its exact specifier and nothing else; subpath imports fall through
 * to their own dedicated entries (or to Vite's default resolver).
 */
export function buildPackageAliases(opts: BuildAliasesOptions): AliasEntry[] {
  const scope = opts.scope ?? '@marketsui/';
  const skip = new Set(opts.skip ?? []);
  const map: Record<string, string> = {};

  let pkgDirs: string[];
  try {
    pkgDirs = readdirSync(opts.packagesRoot);
  } catch {
    return [];
  }

  for (const dirName of pkgDirs) {
    const pkgPath = join(opts.packagesRoot, dirName);
    const pkgJsonPath = join(pkgPath, 'package.json');
    const pkg = readPkgJson(pkgJsonPath);
    if (!pkg?.name || !pkg.name.startsWith(scope)) continue;

    const srcDir = join(pkgPath, 'src');
    if (!existsSync(srcDir)) continue;

    // If `exports` isn't declared, synthesise one from `main`/`module`
    // so a plain `@marketsui/PKG` import still resolves.
    const exportsMap = pkg.exports ?? (pkg.main ? { '.': pkg.main } : null);
    if (!exportsMap) continue;

    for (const [subpath, entry] of Object.entries(exportsMap)) {
      const target = targetFromExport(entry);
      if (typeof target !== 'string') continue;

      // Rewrite ./dist/foo/index.js → ./src/foo/index (strip .js).
      const srcRelative = target
        .replace(/^\.\/dist\//, './src/')
        .replace(/^\.\/dist$/, './src')
        .replace(/\.[mc]?js$/i, '');
      const candidateBase = resolve(pkgPath, srcRelative);
      const resolvedSrc = probeSource(candidateBase);
      if (!resolvedSrc) continue;

      const aliasKey = subpath === '.'
        ? pkg.name
        : `${pkg.name}${subpath.replace(/^\.\//, '/').replace(/^\.$/, '')}`;
      if (skip.has(aliasKey)) continue;
      map[aliasKey] = resolvedSrc;
    }
  }

  // Convert to anchored-regex array form. Sort by descending key
  // length so a more specific alias is registered before a less-
  // specific one — matters even with anchored regexes if Vite ever
  // collapses identical-key inputs, and is just a good habit for
  // alias arrays in general.
  return Object.entries(map)
    .sort(([a], [b]) => b.length - a.length)
    .map(([find, replacement]) => ({
      // Escape regex specials in the package name (slashes, dots).
      find: new RegExp(`^${find.replace(/[.+*?^$()[\]{}|\\/]/g, '\\$&')}$`),
      replacement,
    }));
}
