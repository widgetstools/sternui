#!/usr/bin/env node
/**
 * Rewrite app package.json @starui/* file: tarball deps → workspace "*".
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APPS_ROOT = join(import.meta.dirname, '..', 'apps');

function walkApps(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    const pkgPath = join(p, 'package.json');
    try {
      statSync(pkgPath);
      out.push(pkgPath);
    } catch {
      walkApps(p, out);
    }
  }
  return out;
}

const STARUI_PKG = /^@starui\//;

for (const pkgPath of walkApps(APPS_ROOT)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  let changed = 0;
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const deps = pkg[key];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (!STARUI_PKG.test(name)) continue;
      if (typeof spec === 'string' && (spec.startsWith('file:') || spec.includes('starui-platform/libs'))) {
        deps[name] = '*';
        changed++;
      }
    }
  }
  if (changed > 0) {
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`updated ${changed} dep(s): ${pkgPath.replace(APPS_ROOT + '/', 'apps/')}`);
  }
}
