#!/usr/bin/env node
/**
 * audit-dep-conflicts.mjs — list every external dependency whose
 * version specifier disagrees WITHIN A SECTION across the monorepo.
 *
 * Walks every `package.json` under `packages/` and `apps/` (skipping
 * node_modules, dist, .turbo, and `dist/package.json` copies). Groups
 * by (section, dependency) — so `dependencies.react: ~19.2.5` and
 * `peerDependencies.react: ^19.2.5` are NOT flagged as a conflict (they
 * are intentionally different by the section convention: apps and lib
 * devDeps pin exact for reproducibility while lib peers use caret for
 * consumer flexibility). Within a section, every package should
 * agree.
 *
 * Output is grouped: major-version splits first (highest-risk to
 * align), then minor drift.
 *
 * Usage: `node scripts/audit-dep-conflicts.mjs`
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const ROOTS = ['packages', 'apps'];

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function findPackageJsons(root) {
  const out = [];
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.turbo') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'package.json') out.push(p);
    }
  }
  walk(root);
  return out.sort();
}

// "Major" is just the first numeric digit found in a specifier;
// strips leading ^, ~, >=, etc.
function majorOf(spec) {
  const m = String(spec).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Section-keyed map so we report within-section drift only. Different
// specifiers across sections (e.g. `21.1.0` in devDependencies vs
// `^21.1.0` in peerDependencies) are intentional — apps/lib-devDeps
// pin exact for build reproducibility while lib peers stay broad
// enough to allow consumer flexibility.
function collect() {
  // Map<"section::depName", Map<version, Set<sourceFile>>>
  const map = new Map();
  for (const root of ROOTS) {
    const abs = join(REPO_ROOT, root);
    if (!isDir(abs)) continue;
    for (const file of findPackageJsons(abs)) {
      let pkg;
      try { pkg = JSON.parse(readFileSync(file, 'utf8')); }
      catch { continue; }
      const rel = relative(REPO_ROOT, file);
      const sections = ['dependencies', 'devDependencies', 'peerDependencies'];
      for (const sect of sections) {
        const obj = pkg[sect] ?? {};
        for (const [name, version] of Object.entries(obj)) {
          if (name.startsWith('@starui/')) continue;
          const key = `${sect}::${name}`;
          if (!map.has(key)) map.set(key, new Map());
          const vmap = map.get(key);
          if (!vmap.has(version)) vmap.set(version, new Set());
          vmap.get(version).add(rel);
        }
      }
    }
  }
  return map;
}

function classify(versions) {
  const majors = new Set(versions.map(majorOf).filter((m) => m !== null));
  if (majors.size > 1) return 'major-split';
  return 'minor-or-patch';
}

function formatReport(map) {
  const conflicts = [];
  for (const [key, vmap] of map.entries()) {
    if (vmap.size < 2) continue;
    const [section, name] = key.split('::');
    const versions = [...vmap.keys()];
    conflicts.push({
      section,
      name,
      versions,
      severity: classify(versions),
      sources: Object.fromEntries(
        [...vmap.entries()].map(([v, srcs]) => [v, [...srcs].sort()]),
      ),
    });
  }
  // Sort: major-split first, then by name + section.
  conflicts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'major-split' ? -1 : 1;
    }
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.section.localeCompare(b.section);
  });
  return conflicts;
}

function main() {
  const map = collect();
  const conflicts = formatReport(map);

  if (conflicts.length === 0) {
    console.log('No cross-package version conflicts found.');
    return;
  }

  console.log(`\n${conflicts.length} external deps have inconsistent versions across the monorepo:\n`);
  console.log(`Severity legend:`);
  console.log(`  [MAJOR]  versions span different major versions (risk of breaking changes)`);
  console.log(`  [minor]  versions within the same major (usually safe to align)\n`);

  for (const c of conflicts) {
    const tag = c.severity === 'major-split' ? '[MAJOR]' : '[minor]';
    console.log(`${tag} ${c.name}  (${c.section})`);
    for (const v of c.versions) {
      console.log(`  ${v}`);
      for (const src of c.sources[v]) {
        console.log(`    ${src}`);
      }
    }
    console.log('');
  }

  const majors = conflicts.filter((c) => c.severity === 'major-split').length;
  console.log(`Summary: ${conflicts.length} total conflicts — ${majors} major-version splits, ${conflicts.length - majors} minor drift.`);
}

main();
