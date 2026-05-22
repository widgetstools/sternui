/**
 * Static Tailwind content globs (relative paths only — safe for PostCSS/jiti).
 * Pick the helper that matches app depth under `apps/`.
 *
 * Do not use `import.meta` here — Tailwind loads this file through jiti in a
 * CJS-like VM where `import.meta` throws.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const GRID_SRC_MARKER = join('packages', 'react-grid', 'grid', 'src');

/** True when building inside the starui monorepo (packages/ present). */
export function isStaruiMonorepoWorkspace() {
  let dir = process.cwd();
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, GRID_SRC_MARKER))) return true;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/** apps/<name>/ — e.g. demo-react, markets-ui-react-reference (3 levels to repo root) */
export const platformAppTailwindContent = [
  '../../packages/react-ui/ui/src/**/*.{ts,tsx}',
  '../../packages/react-grid/grid/src/**/*.{ts,tsx}',
  '../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../packages/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../packages/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/ui/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-ui/ui/dist/**/*.{js,mjs}',
  '../../../node_modules/@starui/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/widgets-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-core/widgets-react/dist/**/*.{js,mjs}',
  '../../../node_modules/@starui/config-browser/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../node_modules/@starui/grid/src/**/*.{ts,tsx}',
];

/** apps/demo-apps/<name>/ (4 levels to repo root) */
export const demoAppTailwindContent = [
  '../../../packages/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../packages/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../packages/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../../packages/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/ui/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-ui/ui/dist/**/*.{js,mjs}',
  '../../../../node_modules/@starui/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/widgets-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-core/widgets-react/dist/**/*.{js,mjs}',
  '../../../../node_modules/@starui/config-browser/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-core/config-browser/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../../node_modules/@starui/grid/src/**/*.{ts,tsx}',
];

/** Monorepo-only globs for apps/demo-apps/<name>/ (skip duplicate node_modules scans). */
export const demoAppMonorepoTailwindContent = [
  '../../../packages/react-ui/ui/src/**/*.{ts,tsx}',
  '../../../packages/react-grid/grid/src/**/*.{ts,tsx}',
  '../../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../../packages/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../../packages/react-core/config-browser/src/**/*.{ts,tsx}',
];

/** Monorepo-only globs for apps/<name>/ */
export const platformAppMonorepoTailwindContent = [
  '../../packages/react-ui/ui/src/**/*.{ts,tsx}',
  '../../packages/react-grid/grid/src/**/*.{ts,tsx}',
  '../../packages/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  '../../packages/react-core/widgets-react/src/**/*.{ts,tsx}',
  '../../packages/react-core/config-browser/src/**/*.{ts,tsx}',
];

/**
 * Tailwind content for apps/demo-apps/* — uses packages/ only in monorepo
 * (faster JIT); falls back to packages + node_modules for tarball installs.
 */
export function resolveDemoAppTailwindContent() {
  return isStaruiMonorepoWorkspace() ? demoAppMonorepoTailwindContent : demoAppTailwindContent;
}

/**
 * Tailwind content for apps/* (non demo-apps) — same monorepo vs tarball split.
 */
export function resolvePlatformAppTailwindContent() {
  return isStaruiMonorepoWorkspace()
    ? platformAppMonorepoTailwindContent
    : platformAppTailwindContent;
}

/** External tarball consumers (MCP templates) — scan installed package trees only. */
export const externalConsumerTailwindContent = [
  './node_modules/@starui/ui/dist/**/*.{js,mjs}',
  './node_modules/@starui/ui/src/**/*.{ts,tsx}',
  './node_modules/@starui/react-ui/ui/dist/**/*.{js,mjs}',
  './node_modules/@starui/react-ui/ui/src/**/*.{ts,tsx}',
  './node_modules/@starui/react-grid/grid/dist/**/*.{js,mjs}',
  './node_modules/@starui/react-grid/grid/src/**/*.{ts,tsx}',
  './node_modules/@starui/grid/dist/**/*.{js,mjs}',
  './node_modules/@starui/workspace-setup-react/src/**/*.{ts,tsx}',
  './node_modules/@starui/react-core/workspace-setup-react/src/**/*.{ts,tsx}',
  './node_modules/@starui/widgets-react/dist/**/*.{js,mjs}',
  './node_modules/@starui/react-core/widgets-react/dist/**/*.{js,mjs}',
  './node_modules/@starui/react-core/widgets-react/src/**/*.{ts,tsx}',
  './node_modules/@starui/config-browser/src/**/*.{ts,tsx}',
  './node_modules/@starui/react-core/config-browser/src/**/*.{ts,tsx}',
];
