import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { resolveTarball } from "./manifest.js";

export type Vars = Record<string, string>;

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".css",
  ".md",
  ".gitignore",
  ".gitkeep",
  ".npmrc",
  ".env",
  ".env.example",
  ".fin.json",
]);

function isTextFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (TEXT_EXTENSIONS.has(lower)) return true;
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx === -1) return true;
  return TEXT_EXTENSIONS.has(lower.slice(dotIdx));
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
const TARBALL_RE = /<TARBALL:([@\w\-./]+)>/g;

export function substitute(text: string, vars: Vars): string {
  return text
    .replace(VAR_RE, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match,
    )
    .replace(TARBALL_RE, (_match, pkg: string) => resolveTarball(pkg));
}

function substitutePath(pathFragment: string, vars: Vars): string {
  return pathFragment.replace(VAR_RE, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match,
  );
}

export interface RenderOptions {
  source: string;
  dest: string;
  vars: Vars;
  overwrite?: boolean;
  ignore?: ReadonlySet<string>;
}

export interface RenderResult {
  written: string[];
  skipped: string[];
}

const DEFAULT_IGNORE = new Set<string>([
  "node_modules",
  "dist",
  ".turbo",
  ".DS_Store",
]);

export function renderTree(opts: RenderOptions): RenderResult {
  const { source, dest, vars, overwrite = false } = opts;
  const ignore = opts.ignore ?? DEFAULT_IGNORE;
  const written: string[] = [];
  const skipped: string[] = [];

  function walk(rel: string): void {
    const absSrc = join(source, rel);
    const absDest = join(dest, substitutePath(rel, vars));
    const st = statSync(absSrc);
    if (st.isDirectory()) {
      mkdirSync(absDest, { recursive: true });
      for (const child of readdirSync(absSrc)) {
        if (ignore.has(child)) continue;
        walk(rel ? `${rel}${sep}${child}` : child);
      }
    } else if (st.isFile()) {
      if (!overwrite && existsSync(absDest)) {
        skipped.push(absDest);
        return;
      }
      mkdirSync(dirname(absDest), { recursive: true });
      if (isTextFile(absSrc)) {
        const raw = readFileSync(absSrc, "utf8");
        writeFileSync(absDest, substitute(raw, vars));
      } else {
        copyFileSync(absSrc, absDest);
      }
      written.push(absDest);
    }
  }

  walk("");
  return { written, skipped };
}

export function copyDirVerbatim(source: string, dest: string): string[] {
  const written: string[] = [];
  function walk(rel: string): void {
    const absSrc = join(source, rel);
    const absDest = join(dest, rel);
    const st = statSync(absSrc);
    if (st.isDirectory()) {
      if (DEFAULT_IGNORE.has(rel.split(sep).pop() ?? "")) return;
      mkdirSync(absDest, { recursive: true });
      for (const child of readdirSync(absSrc)) {
        if (DEFAULT_IGNORE.has(child)) continue;
        walk(rel ? join(rel, child) : child);
      }
    } else if (st.isFile()) {
      mkdirSync(dirname(absDest), { recursive: true });
      copyFileSync(absSrc, absDest);
      written.push(absDest);
    }
  }
  walk("");
  return written;
}

export function relativeFrom(root: string, path: string): string {
  return relative(root, path) || ".";
}
