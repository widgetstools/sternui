import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { renderTree, substitute, type Vars } from "./render.js";
import { ensureDep, ensureScript, readPkg, writePkg } from "./pkgjson.js";

export interface FragmentManifest {
  name: string;
  appliesTo: Array<"web" | "openfin">;
  newFiles?: Array<{ src: string; dest: string }>;
  patches?: Array<{
    file: string;
    anchor: string;
    insert: string;
    idempotencyMarker?: string;
    description?: string;
  }>;
  depsToAdd?: Record<string, string>;
  devDepsToAdd?: Record<string, string>;
  scriptsToAdd?: Record<string, string>;
}

export interface ApplyFragmentResult {
  written: string[];
  patched: string[];
  skipped: string[];
  warnings: string[];
}

export function loadFragmentManifest(fragmentDir: string): FragmentManifest {
  const path = join(fragmentDir, "fragment.json");
  if (!existsSync(path)) {
    throw new Error(`fragment.json not found at ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as FragmentManifest;
}

function insertAboveAnchor(
  source: string,
  anchor: string,
  insert: string,
): string {
  const idx = source.indexOf(anchor);
  if (idx === -1) {
    throw new Error(`Anchor not found: "${anchor}"`);
  }
  const lineStart = source.lastIndexOf("\n", idx - 1) + 1;
  const indent = source.slice(lineStart, idx);
  const indented = insert
    .split("\n")
    .map((line) => (line ? `${indent}${line}` : line))
    .join("\n");
  const block = indented.endsWith("\n") ? indented : `${indented}\n`;
  return source.slice(0, lineStart) + block + source.slice(lineStart);
}

export function applyFragment(opts: {
  fragmentDir: string;
  targetDir: string;
  vars: Vars;
}): ApplyFragmentResult {
  const { fragmentDir, targetDir, vars } = opts;
  const result: ApplyFragmentResult = {
    written: [],
    patched: [],
    skipped: [],
    warnings: [],
  };

  const manifest = loadFragmentManifest(fragmentDir);

  if (manifest.newFiles) {
    for (const f of manifest.newFiles) {
      const src = join(fragmentDir, f.src);
      const dest = join(targetDir, substitute(f.dest, vars));
      if (!existsSync(src)) {
        result.warnings.push(`Fragment source missing: ${src}`);
        continue;
      }
      const st = statSync(src);
      if (st.isDirectory()) {
        const r = renderTree({ source: src, dest, vars, overwrite: false });
        result.written.push(...r.written);
        result.skipped.push(...r.skipped);
      } else {
        if (existsSync(dest)) {
          result.skipped.push(dest);
          continue;
        }
        mkdirSync(dirname(dest), { recursive: true });
        const raw = readFileSync(src, "utf8");
        const isText = /\.(tsx?|jsx?|mjs|cjs|json|html|css|md|gitignore)$/i.test(src);
        if (isText) {
          writeFileSync(dest, substitute(raw, vars));
        } else {
          copyFileSync(src, dest);
        }
        result.written.push(dest);
      }
    }
  }

  if (manifest.patches) {
    for (const p of manifest.patches) {
      const filePath = join(targetDir, p.file);
      if (!existsSync(filePath)) {
        result.warnings.push(`Patch target missing: ${filePath}`);
        continue;
      }
      const original = readFileSync(filePath, "utf8");
      const idempotency = p.idempotencyMarker
        ? substitute(p.idempotencyMarker, vars)
        : null;
      const renderedInsert = substitute(p.insert, vars);
      const renderedAnchor = substitute(p.anchor, vars);

      if (idempotency && original.includes(idempotency)) {
        result.skipped.push(`${filePath} (already patched)`);
        continue;
      }
      // Also treat the insert text itself as an idempotency check —
      // if it's already in the file verbatim, we've applied this patch.
      if (!idempotency && original.includes(renderedInsert.trim())) {
        result.skipped.push(`${filePath} (already patched)`);
        continue;
      }
      try {
        const updated = insertAboveAnchor(original, renderedAnchor, renderedInsert);
        writeFileSync(filePath, updated);
        result.patched.push(filePath);
      } catch (err) {
        result.warnings.push(
          `Patch failed on ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  if (manifest.depsToAdd || manifest.devDepsToAdd || manifest.scriptsToAdd) {
    const pkg = readPkg(targetDir);
    let changed = false;
    if (manifest.depsToAdd) {
      for (const [name, ver] of Object.entries(manifest.depsToAdd)) {
        if (ensureDep(pkg, name, substitute(ver, vars), "dependencies")) {
          changed = true;
        }
      }
    }
    if (manifest.devDepsToAdd) {
      for (const [name, ver] of Object.entries(manifest.devDepsToAdd)) {
        if (ensureDep(pkg, name, substitute(ver, vars), "devDependencies")) {
          changed = true;
        }
      }
    }
    if (manifest.scriptsToAdd) {
      for (const [name, cmd] of Object.entries(manifest.scriptsToAdd)) {
        if (ensureScript(pkg, name, substitute(cmd, vars))) {
          changed = true;
        }
      }
    }
    if (changed) {
      writePkg(targetDir, pkg);
      result.patched.push(join(targetDir, "package.json"));
    }
  }

  return result;
}
