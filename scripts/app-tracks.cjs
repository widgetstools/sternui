/**
 * App install tracks under apps/ (and optional apps-workspace/).
 *
 * - **tarball** — validates file:libs/*.tgz consumer installs (CI, MCP parity).
 *   propagate/sync rewrite deps and refresh node_modules after pack.
 * - **workspace** — local dev via STARUI_DEV_SOURCE=1 (Vite → packages/ source).
 *   skipped by propagate install/sync to avoid lockfile churn and slow npm ci loops.
 *
 * Folder convention (mirror tutorials-tarball / tutorials-workspace):
 *   apps/<name>-tarball/*   apps/<name>-workspace/*
 *   apps/consumer-tarball/* apps/consumer-workspace/*
 *
 * Legacy paths (apps/legacy/*, top-level apps, e2e/*) remain tarball track until migrated.
 */
const { existsSync, readFileSync } = require('node:fs');
const { join, relative, sep } = require('node:path');

const REPO_ROOT = join(__dirname, '..');
const APPS_ROOT = join(REPO_ROOT, 'apps');

/** Path segments that mark the workspace (dev-source) track. */
const WORKSPACE_TRACK_SEGMENTS = new Set([
  'tutorials-workspace',
  'consumer-workspace',
]);

/** Path segments that mark the tarball (consumer) track explicitly. */
const TARBALL_TRACK_SEGMENTS = new Set([
  'tutorials-tarball',
  'consumer-tarball',
]);

function normalizeRel(appPkgPath) {
  const appDir = join(appPkgPath, '..');
  return relative(APPS_ROOT, appDir).split(sep).join('/');
}

/**
 * @param {string} appPkgPath absolute path to an app's package.json
 * @returns {'tarball' | 'workspace'}
 */
function appTrack(appPkgPath) {
  const segments = normalizeRel(appPkgPath).split('/').filter(Boolean);
  if (segments.some((s) => WORKSPACE_TRACK_SEGMENTS.has(s))) return 'workspace';
  if (segments.some((s) => TARBALL_TRACK_SEGMENTS.has(s))) return 'tarball';
  // legacy/, e2e/, and top-level apps (demo-react, markets-grid-lab, …) → tarball
  return 'tarball';
}

function isTarballTrack(appPkgPath) {
  return appTrack(appPkgPath) === 'tarball';
}

function isWorkspaceTrack(appPkgPath) {
  return appTrack(appPkgPath) === 'workspace';
}

/**
 * Apps that set STARUI_DEV_SOURCE on `dev` but still live on the tarball track path
 * (e.g. apps/markets-grid-lab). propagate still refreshes their tarballs; prefer
 * consumer-workspace/ for new apps.
 */
function devUsesSource(appPkgPath) {
  try {
    const pkg = JSON.parse(readFileSync(appPkgPath, 'utf8'));
    const dev = pkg.scripts?.dev ?? '';
    return dev.includes('STARUI_DEV_SOURCE');
  } catch {
    return false;
  }
}

module.exports = {
  REPO_ROOT,
  APPS_ROOT,
  WORKSPACE_TRACK_SEGMENTS,
  TARBALL_TRACK_SEGMENTS,
  appTrack,
  isTarballTrack,
  isWorkspaceTrack,
  devUsesSource,
};
