/**
 * Tailwind `content` globs for apps consuming @starui/* packages.
 *
 * CommonJS only — PostCSS/Tailwind load config through jiti, which cannot
 * evaluate `import.meta` in ESM tailwind.config.js.
 */
const { join, resolve } = require('node:path');
const { existsSync } = require('node:fs');

const REPO_ROOT = resolve(__dirname, '..');

/** Walk up from appDir until hoisted node_modules has react + @starui. */
function findMonoRoot(appDir) {
  let dir = resolve(appDir);
  let reactRoot = null;
  for (let i = 0; i < 8; i++) {
    const nm = join(dir, 'node_modules');
    const hasReact = existsSync(join(nm, 'react'));
    const hasStarui = existsSync(join(nm, '@starui'));
    if (hasReact && hasStarui) {
      return dir;
    }
    if (hasReact) {
      reactRoot = dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return reactRoot ?? REPO_ROOT;
}

/**
 * @param {string} appDir absolute path to the app root
 * @returns {string[]}
 */
function staruiTailwindContent(appDir) {
  const monoRoot = findMonoRoot(appDir);
  const nm = join(monoRoot, 'node_modules', '@starui');
  return [
    join(REPO_ROOT, 'packages/react-ui/ui/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-grid/grid/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-core/widgets-react/src/**/*.{ts,tsx}'),
    join(REPO_ROOT, 'packages/react-core/config-browser/src/**/*.{ts,tsx}'),
    join(nm, 'ui/src/**/*.{ts,tsx}'),
    join(nm, 'react-ui/ui/src/**/*.{ts,tsx}'),
    join(nm, 'react-ui/ui/dist/**/*.{js,mjs}'),
    join(nm, 'workspace-setup-react/src/**/*.{ts,tsx}'),
    join(nm, 'react-core/workspace-setup-react/src/**/*.{ts,tsx}'),
    join(nm, 'react-grid/grid/src/**/*.{ts,tsx}'),
    join(nm, 'grid/src/**/*.{ts,tsx}'),
    join(nm, 'widgets-react/src/**/*.{ts,tsx}'),
    join(nm, 'react-core/widgets-react/src/**/*.{ts,tsx}'),
    join(nm, 'react-core/widgets-react/dist/**/*.{js,mjs}'),
    join(nm, 'config-browser/src/**/*.{ts,tsx}'),
    join(nm, 'react-core/config-browser/src/**/*.{ts,tsx}'),
  ];
}

module.exports = { REPO_ROOT, findMonoRoot, staruiTailwindContent };
