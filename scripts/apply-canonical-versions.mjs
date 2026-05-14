#!/usr/bin/env node
/**
 * apply-canonical-versions.mjs — apply the agreed "latest wins"
 * canonical version per dep across every package.json in the
 * monorepo. Idempotent: re-running after a clean pass is a no-op.
 *
 * Scope: packages/ + apps/, skipping node_modules / dist / .turbo
 * and dist/package.json copies.
 *
 * The canonical table is hardcoded below. To extend it: add a row,
 * re-run the script, commit. Re-run scripts/audit-dep-conflicts.mjs
 * afterwards to confirm the conflict count drops to zero.
 *
 * Usage: `node scripts/apply-canonical-versions.mjs`
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const ROOTS = ['packages', 'apps'];

// Canonical = the agreed-upon version specifier per (dep, section).
// Apply mechanically: every occurrence of <dep> in <section> across
// the monorepo is set to this value. "Latest wins" — see commit msg
// for the per-row rationale.
const CANONICAL = {
  // ── Category A: within-section drift ─────────────────────────────
  rimraf:                          { devDependencies: '^6.0.1' },
  jsdom:                           { devDependencies: '^29.0.2' },
  vitest:                          { devDependencies: '^4.1.4' },
  tsx:                             { devDependencies: '^4.19.2' },
  '@testing-library/react':        { devDependencies: '^16.3.2' },
  '@radix-ui/react-alert-dialog':  { dependencies: '^1.1.15' },
  react:                           { peerDependencies: '^19.2.5' },
  'react-dom':                     { peerDependencies: '^19.2.5' },

  // ── Category B: tighten loose peer ranges to match dev pin ───────
  '@angular/common':               { peerDependencies: '^21.1.0' },
  '@angular/core':                 { peerDependencies: '^21.1.0' },
  '@angular/forms':                { peerDependencies: '^21.1.0' },
  'ag-grid-angular':               { peerDependencies: '^35.1.0' },
  'ag-grid-community':             { peerDependencies: '^35.1.0' },
  'ag-grid-enterprise':            { peerDependencies: '^35.1.0' },
  'ag-grid-react':                 { peerDependencies: '^35.1.0' },
  primeng:                         { peerDependencies: '^21.1.5' },
  rxjs:                            { peerDependencies: '^7.8.2' },

  // ── Category C: loose peer that should match app pin ─────────────
  '@stomp/stompjs':                { peerDependencies: '^7.3.0' },
  'lucide-react':                  { peerDependencies: '^0.554.0' },
  '@tanstack/react-query':         { peerDependencies: '^5.80.0' },
};

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

function applyTo(pkg) {
  const changes = [];
  for (const [dep, sectionRule] of Object.entries(CANONICAL)) {
    for (const [section, target] of Object.entries(sectionRule)) {
      const obj = pkg[section];
      if (!obj || !Object.prototype.hasOwnProperty.call(obj, dep)) continue;
      const before = obj[dep];
      if (before === target) continue;
      obj[dep] = target;
      changes.push({ dep, section, before, after: target });
    }
  }
  return changes;
}

function main() {
  const allChanges = [];
  for (const rel of ROOTS) {
    const abs = join(REPO_ROOT, rel);
    if (!isDir(abs)) continue;
    for (const file of findPackageJsons(abs)) {
      const raw = readFileSync(file, 'utf8');
      let pkg;
      try { pkg = JSON.parse(raw); }
      catch { continue; }
      const changes = applyTo(pkg);
      if (changes.length === 0) continue;
      const next = JSON.stringify(pkg, null, 2) + '\n';
      writeFileSync(file, next);
      const r = relative(REPO_ROOT, file);
      for (const c of changes) {
        allChanges.push({ file: r, ...c });
      }
    }
  }

  if (allChanges.length === 0) {
    process.stdout.write('[apply-canonical] no changes — every file already canonical.\n');
    return;
  }

  // Group by file for readability.
  const byFile = new Map();
  for (const c of allChanges) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file).push(c);
  }
  for (const [file, changes] of byFile) {
    process.stdout.write(`\n${file}\n`);
    for (const c of changes) {
      process.stdout.write(`  ${c.section}.${c.dep}: ${c.before} → ${c.after}\n`);
    }
  }
  process.stdout.write(`\n[apply-canonical] updated ${allChanges.length} entries across ${byFile.size} files.\n`);
}

main();
