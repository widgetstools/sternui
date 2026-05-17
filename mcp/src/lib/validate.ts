import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { VERSION_MATRIX, BANNED_DEPS, BANNED_NATIVE_ELEMENT_TAGS } from "../constants.js";
import type { PackageJson } from "./pkgjson.js";

export type Severity = "error" | "warn" | "info";

export interface Finding {
  severity: Severity;
  rule: string;
  file?: string;
  line?: number;
  message: string;
}

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  function rec(curr: string): void {
    let entries;
    try {
      entries = readdirSync(curr, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (
        e.name === "node_modules" ||
        e.name === "dist" ||
        e.name === ".vite" ||
        e.name === ".turbo" ||
        e.name === "libs" ||
        e.name === "tools" ||
        e.name === "public"
      ) {
        continue;
      }
      const full = join(curr, e.name);
      if (e.isDirectory()) rec(full);
      else if (e.isFile() && exts.some((ext) => e.name.endsWith(ext))) {
        out.push(full);
      }
    }
  }
  rec(dir);
  return out;
}

function* lines(text: string): Generator<{ line: number; text: string }> {
  let lineNo = 1;
  for (const t of text.split("\n")) {
    yield { line: lineNo, text: t };
    lineNo++;
  }
}

export function assertVersions(pkg: PackageJson, isOpenFin: boolean): Finding[] {
  const findings: Finding[] = [];
  const allDeps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  for (const [name, expected] of Object.entries(VERSION_MATRIX)) {
    if (!isOpenFin && name.startsWith("@openfin/")) continue;
    const actual = allDeps[name];
    if (!actual) continue;
    if (actual !== expected) {
      findings.push({
        severity: "warn",
        rule: "version-matrix",
        file: "package.json",
        message: `${name} pinned to "${actual}" but matrix expects "${expected}".`,
      });
    }
  }
  for (const banned of BANNED_DEPS) {
    if (banned in allDeps) {
      findings.push({
        severity: "error",
        rule: "banned-dep",
        file: "package.json",
        message: `Banned dep present: ${banned}. Use npm only.`,
      });
    }
  }
  return findings;
}

const SHADCN_ALLOWED_DIRS = ["@starui/ui", "components/ui/"];

export function scanForNativeElements(dir: string): Finding[] {
  const findings: Finding[] = [];
  const files = walk(dir, [".tsx"]);
  for (const file of files) {
    const rel = relative(dir, file);
    if (SHADCN_ALLOWED_DIRS.some((d) => rel.includes(d))) continue;
    const text = readFileSync(file, "utf8");
    // Strip block comments and line comments before scanning so JSDoc
    // prose that names <input>/<select>/<textarea> isn't flagged.
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
      .split("\n")
      .map((row) => {
        const idx = row.indexOf("//");
        return idx === -1 ? row : row.slice(0, idx);
      })
      .join("\n");
    for (const tag of BANNED_NATIVE_ELEMENT_TAGS) {
      const re = new RegExp(`<${tag}(\\s|>|/>)`, "g");
      for (const { line, text: row } of lines(stripped)) {
        if (re.test(row)) {
          findings.push({
            severity: "error",
            rule: "no-native-element",
            file: rel,
            line,
            message: `Use the shadcn ${tag} primitive from @starui/ui instead of native <${tag}>.`,
          });
          re.lastIndex = 0;
        }
      }
    }
  }
  return findings;
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;

export function scanForHardcodedColors(dir: string): Finding[] {
  const findings: Finding[] = [];
  const files = walk(dir, [".tsx", ".ts", ".css"]);
  for (const file of files) {
    const rel = relative(dir, file);
    const text = readFileSync(file, "utf8");
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
      .split("\n")
      .map((row) => {
        const idx = row.indexOf("//");
        return idx === -1 ? row : row.slice(0, idx);
      })
      .join("\n");
    for (const { line, text: row } of lines(stripped)) {
      if (row.trim().startsWith("*")) continue;
      const m = row.match(HEX_RE);
      if (m) {
        findings.push({
          severity: "warn",
          rule: "no-hardcoded-color",
          file: rel,
          line,
          message: `Hardcoded color literal "${m[0]}". Use --ds-* tokens from @starui/design-system instead.`,
        });
      }
    }
  }
  return findings;
}

export function scanForCrossFrameworkImports(dir: string): Finding[] {
  const findings: Finding[] = [];
  const files = walk(dir, [".tsx", ".ts"]);
  for (const file of files) {
    const rel = relative(dir, file);
    const text = readFileSync(file, "utf8");
    for (const { line, text: row } of lines(text)) {
      if (/from\s+["']@angular\//.test(row)) {
        findings.push({
          severity: "error",
          rule: "cross-framework-import",
          file: rel,
          line,
          message: "Angular import in a React project. Cross-framework imports are forbidden.",
        });
      }
    }
  }
  return findings;
}

export function scanForAppShellStack(dir: string, isOpenFin: boolean): Finding[] {
  if (!isOpenFin) return [];
  const findings: Finding[] = [];
  const mainPath = join(dir, "src", "main.tsx");
  let text: string;
  try {
    text = readFileSync(mainPath, "utf8");
  } catch {
    findings.push({
      severity: "error",
      rule: "appshell-stack",
      message: "OpenFin app missing src/main.tsx.",
    });
    return findings;
  }
  const required = ["AppShell", "ConfigServiceProvider", "DataServicesProvider", "HostWrapper"];
  for (const sym of required) {
    if (!text.includes(sym)) {
      findings.push({
        severity: "error",
        rule: "appshell-stack",
        file: "src/main.tsx",
        message: `Provider stack incomplete: missing ${sym}. Restore the AppShell composition.`,
      });
    }
  }
  return findings;
}

export function scanForRuntimeBranching(dir: string): Finding[] {
  const findings: Finding[] = [];
  const files = walk(dir, [".tsx"]);
  for (const file of files) {
    const rel = relative(dir, file);
    if (rel.endsWith("main.tsx") || rel.endsWith("Provider.tsx")) continue;
    const text = readFileSync(file, "utf8");
    for (const { line, text: row } of lines(text)) {
      if (/\bisOpenFin\s*\(\s*\)/.test(row)) {
        findings.push({
          severity: "warn",
          rule: "no-runtime-branching",
          file: rel,
          line,
          message: "isOpenFin() in a view file. Use useHost() and runtime.openSurface to stay transport-agnostic.",
        });
      }
    }
  }
  return findings;
}

export function tryReadPkg(dir: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

export function tryReadDir(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
