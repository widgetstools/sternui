/**
 * Vite resolve aliases for apps consuming @starui/* bucket tarballs.
 * Maps legacy member import paths to installed bundle subpaths.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  findReactRoot,
  findStaruiPackageRoot,
  findBucketNodeModules,
  collectStaruiInstallRoots,
  staruiTailwindContent: staruiTailwindContentImpl,
} = require('./staruiTailwindContent.cjs');

const REPO_ROOT = resolve(import.meta.dirname, '..');

/** Monorepo root where hoisted node_modules lives. Walks up from appDir. */
/** Root whose `node_modules` holds installed @starui/* bucket tarballs. */
export function monoRootFromApp(appDir) {
  return findStaruiPackageRoot(appDir);
}

/**
 * Force a single React + react-dom instance for apps that alias @starui/*
 * tarball sources.
 */
export function reactResolveConfig(appDir) {
  const reactRootDir = findReactRoot(appDir);
  const reactRoot = join(reactRootDir, 'node_modules/react');
  const reactDomRoot = join(reactRootDir, 'node_modules/react-dom');

  return {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    alias: [
      { find: /^react$/, replacement: join(reactRoot, 'index.js') },
      { find: /^react-dom$/, replacement: join(reactDomRoot, 'index.js') },
      { find: /^react-dom\/client$/, replacement: join(reactDomRoot, 'client.js') },
      { find: /^react\/jsx-runtime$/, replacement: join(reactRoot, 'jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: join(reactRoot, 'jsx-dev-runtime.js') },
    ],
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    },
  };
}

function findMemberFolder(bucket, memberName) {
  const bucketDir = join(REPO_ROOT, 'packages', bucket);
  if (!existsSync(bucketDir)) return memberName.split('/').pop();
  for (const dir of readdirSync(bucketDir)) {
    const pkgPath = join(bucketDir, dir, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.name === memberName) return dir;
  }
  return memberName.split('/').pop();
}

function resolveExportTarget(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return value.import ?? value.default ?? value.types ?? null;
  }
  return null;
}

function readMemberExports(bucket, folder) {
  const pkgPath = join(REPO_ROOT, 'packages', bucket, folder, 'package.json');
  if (!existsSync(pkgPath)) return { '.': './src/index.ts' };
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const entries = {};
  if (pkg.exports && typeof pkg.exports === 'object') {
    for (const [key, val] of Object.entries(pkg.exports)) {
      const target = resolveExportTarget(val);
      if (target) entries[key] = target;
    }
  }
  if (!entries['.']) {
    const main = pkg.types ?? pkg.main ?? './src/index.ts';
    entries['.'] = main.startsWith('./') ? main : `./${main}`;
  }
  return entries;
}

/**
 * Read member export map from an installed bucket tarball (Artifactory / libs/).
 * Returns null when the bucket is not installed as a bundled tarball.
 */
function readInstalledMemberExports(bucketPkgPath, bucketName, member) {
  if (!existsSync(bucketPkgPath)) return null;
  const bucketPkg = JSON.parse(readFileSync(bucketPkgPath, 'utf8'));
  if (!isBucketBundlePackage(bucketPkg, bucketName)) return null;

  const short = member.split('/').pop();
  const hoist = member === bucketName;
  const entries = {};
  const raw = bucketPkg.exports ?? {};

  for (const [exportKey, targetVal] of Object.entries(raw)) {
    const target = resolveExportTarget(targetVal);
    if (!target || typeof target !== 'string') continue;

    if (hoist) {
      if (exportKey === '.') entries['.'] = target;
      else if (exportKey.startsWith('./')) entries[exportKey.slice(1)] = target;
      continue;
    }

    const prefix = `./${short}`;
    if (exportKey === prefix) entries['.'] = target;
    else if (exportKey.startsWith(`${prefix}/`)) {
      entries[exportKey.slice(prefix.length)] = target;
    }
  }

  return Object.keys(entries).length > 0 ? entries : null;
}

function isBucketBundlePackage(pkgJson, bucketName) {
  return (
    pkgJson.name === bucketName &&
    typeof pkgJson.description === 'string' &&
    pkgJson.description.includes('bundled tarball')
  );
}

/** Installed path root for a member — bucket tarball vs workspace symlink. */
function installedMemberRoot(appDir, bucketName, bucketShort, memberName, folder) {
  const bucketDir = findBucketNodeModules(appDir, bucketShort);
  const nmRoot = join(bucketDir, '../..');
  const bucketPkgPath = join(bucketDir, 'package.json');
  if (existsSync(bucketPkgPath)) {
    const bucketPkg = JSON.parse(readFileSync(bucketPkgPath, 'utf8'));
    if (isBucketBundlePackage(bucketPkg, bucketName)) return join(bucketDir, folder);
    if (bucketPkg.name === memberName) return bucketDir;
  }

  const memberShort = memberName.split('/').pop();
  const memberLink = join(nmRoot, '@starui', memberShort);
  const memberPkgPath = join(memberLink, 'package.json');
  if (existsSync(memberPkgPath)) {
    const memberPkg = JSON.parse(readFileSync(memberPkgPath, 'utf8'));
    if (memberPkg.name === memberName) return memberLink;
  }

  return join(bucketDir, folder);
}

function readManifest() {
  const candidates = [
    join(REPO_ROOT, 'libs', 'manifest.json'),
    join(REPO_ROOT, 'dist', 'packages', 'manifest.json'),
  ];
  for (const manifestPath of candidates) {
    if (!existsSync(manifestPath)) continue;
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  }
  return null;
}

/**
 * @param {string} appDir absolute path to the app root (where vite.config lives)
 * @returns {{ find: string | RegExp, replacement: string }[]}
 */
export function staruiViteAliases(appDir) {
  const manifest = readManifest();
  if (!manifest) return [];

  const useDevSource = process.env.STARUI_DEV_SOURCE === '1';
  const aliases = [];
  const seen = new Set();

  function add(find, replacement) {
    const key = `${find}\0${replacement}`;
    if (seen.has(key)) return;
    seen.add(key);
    aliases.push({ find, replacement });
  }

  for (const [bucketName, entry] of Object.entries(manifest)) {
    if (!entry?.members?.length || !entry.bucket) continue;
    const bucketShort = bucketName.split('/').pop();
    const bucketDir = findBucketNodeModules(appDir, bucketShort);
    const bucketPkgPath = join(bucketDir, 'package.json');

    for (const member of entry.members) {
      const folder = findMemberFolder(entry.bucket, member);
      const short = member.split('/').pop();

      let exportEntries = null;
      let resolveRoot = bucketDir;

      if (!useDevSource) {
        exportEntries = readInstalledMemberExports(bucketPkgPath, bucketName, member);
      }
      if (!exportEntries) {
        exportEntries = readMemberExports(entry.bucket, folder);
        // Under STARUI_DEV_SOURCE=1, resolve targets to the *live* package
        // source directly. The default `installedMemberRoot` points at the
        // bucket's snapshot under `node_modules/@starui/<bucket>/<folder>/`,
        // which is a copy that goes stale the moment a developer adds a
        // file to `packages/` between `npm ci` runs. Bypassing it means
        // newly-added grid modules (alerts, etc.) load straight from source
        // without needing to re-install.
        resolveRoot = useDevSource
          ? join(REPO_ROOT, 'packages', entry.bucket, folder)
          : installedMemberRoot(appDir, bucketName, bucketShort, member, folder);
      }

      for (const [exportKey, relTarget] of Object.entries(exportEntries)) {
        const absTarget = join(resolveRoot, relTarget.replace(/^\.\//, ''));
        const suffix =
          exportKey === '.'
            ? ''
            : exportKey.startsWith('./')
              ? exportKey.slice(1)
              : exportKey.startsWith('/')
                ? exportKey
                : `/${exportKey}`;

        if (exportKey === '.') {
          const memberExact = member.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          add(new RegExp(`^${memberExact}$`), absTarget);
          if (member !== bucketName) {
            const bucketExact = `${bucketName}/${short}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            add(new RegExp(`^${bucketExact}$`), absTarget);
          }
        } else {
          add(`${member}${suffix}`, absTarget);
          if (member !== bucketName) {
            add(`${bucketName}/${short}${suffix}`, absTarget);
          }
        }
      }
    }
  }

  return aliases.sort((a, b) => String(b.find).length - String(a.find).length);
}

const HOST_DATA_WORKER_ASSET_RE =
  /^@starui\/(?:data\/)?host-data\/assets\/data-services-worker\.mjs\?url$/;

/** Resolve `@starui/host-data/assets/data-services-worker.mjs?url` for Vite. */
export function resolveHostDataWorkerAssetUrl(source, appDir) {
  if (!HOST_DATA_WORKER_ASSET_RE.test(source)) return null;

  const candidates = [
    join(REPO_ROOT, 'packages/data/host-data/dist/assets/data-services-worker.mjs'),
  ];
  for (const root of collectStaruiInstallRoots(appDir)) {
    candidates.push(
      join(root, 'node_modules/@starui/host-data/dist/assets/data-services-worker.mjs'),
      join(root, 'node_modules/@starui/data/host-data/dist/assets/data-services-worker.mjs'),
    );
  }
  const workerPath = candidates.find((p) => existsSync(p));
  return workerPath ? `${workerPath}?url` : null;
}

/**
 * Vite plugin — keeps `?url` asset handling for the bundled SharedWorker.
 * @param {string} appDir absolute path to the app root
 */
export function staruiHostDataWorkerAssetPlugin(appDir) {
  return {
    name: 'starui-host-data-worker-asset-url',
    enforce: 'pre',
    resolveId(source) {
      return resolveHostDataWorkerAssetUrl(source, appDir);
    },
  };
}

/** Tailwind `content` globs — absolute paths; prefer tailwindContentGlobs.mjs in tailwind.config.js. */
export function staruiTailwindContent(appDir) {
  return staruiTailwindContentImpl(appDir);
}

/** Force ESM entry — browser export resolves to UMD which breaks dynamic `import()` Client lookup. */
export function stompJsEsmAlias(appDir) {
  const reactRootDir = findReactRoot(appDir);
  return {
    find: /^@stomp\/stompjs$/,
    replacement: join(reactRootDir, 'node_modules/@stomp/stompjs/esm6/index.js'),
  };
}

/** Paths Vite may read when aliases resolve into hoisted node_modules. */
export function staruiServerFsAllow(appDir) {
  const reactRootDir = findReactRoot(appDir);
  const allow = new Set([
    REPO_ROOT,
    join(REPO_ROOT, 'packages'),
    join(REPO_ROOT, 'node_modules'),
    reactRootDir,
    join(reactRootDir, 'node_modules'),
  ]);
  for (const root of collectStaruiInstallRoots(appDir)) {
    allow.add(root);
    allow.add(join(root, 'node_modules'));
  }
  return [...allow];
}

export function staruiOptimizeDeps() {
  return {
    exclude: [
      '@stomp/stompjs',
      // Keep host-data out of the deps prebundle — prebundling breaks
      // `new SharedWorker(new URL(..., import.meta.url))` inside the
      // library. Apps must construct SharedWorkers at the call site.
      '@starui/host-data',
      '@starui/host-data/runtime',
      '@starui/data/host-data',
      '@starui/data/host-data/runtime',
      // Single React context instance — prebundling widgets-react pulls
      // a second copy of host-data-react and breaks <DataServicesProvider>.
      '@starui/host-data-react',
      '@starui/host-data-react/runtime',
      '@starui/data/host-data-react',
      '@starui/data/host-data-react/runtime',
    ],
  };
}

/** @param {string} configUrl import.meta.url from the calling vite.config */
export function appDirFromConfig(configUrl) {
  return dirname(fileURLToPath(configUrl));
}
