import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { libsDir, loadManifest, resourcesDir, templatesDir } from "./manifest.js";
import { VERSION_MATRIX } from "../constants.js";

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCES: ResourceDescriptor[] = [
  {
    uri: "starui://architecture",
    name: "Architecture Guide",
    description: "The full StarUI architecture guide (layers, packages, import rules).",
    mimeType: "text/markdown",
  },
  {
    uri: "starui://feature-inventory",
    name: "Platform Parity",
    description: "Package parity gate for starui-platform (legacy → current map).",
    mimeType: "text/markdown",
  },
  {
    uri: "starui://implemented-features",
    name: "Implemented Features",
    description: "What's actually shipped — kept in lockstep with code.",
    mimeType: "text/markdown",
  },
  {
    uri: "starui://gotchas",
    name: "Gotchas",
    description: "Distilled anti-pattern list. Read before generating non-trivial code.",
    mimeType: "text/markdown",
  },
  {
    uri: "starui://version-matrix",
    name: "Version Matrix",
    description: "Exact pins required for React, AG-Grid, OpenFin, Vite, TypeScript, etc.",
    mimeType: "application/json",
  },
  {
    uri: "starui://templates/web-react/tree",
    name: "Web template file tree",
    description: "Files the create_app(kind=web) tool will write.",
    mimeType: "text/plain",
  },
  {
    uri: "starui://templates/openfin-react/tree",
    name: "OpenFin template file tree",
    description: "Files the create_app(kind=openfin) tool will write.",
    mimeType: "text/plain",
  },
  {
    uri: "starui://libs/manifest",
    name: "Bundled libs manifest",
    description: "JSON list of @starui/* tarballs bundled with this MCP server.",
    mimeType: "application/json",
  },
];

function readFileSafe(path: string): string {
  if (!existsSync(path)) return `File not bundled: ${path}`;
  return readFileSync(path, "utf8");
}

function treeOf(dir: string): string {
  if (!existsSync(dir)) return `(template not bundled: ${dir})`;
  const lines: string[] = [];
  function walk(d: string, indent: string): void {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => {
      if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
      return a.isDirectory() ? -1 : 1;
    });
    for (const e of entries) {
      const full = join(d, e.name);
      lines.push(`${indent}${e.name}${e.isDirectory() ? "/" : ""}`);
      if (e.isDirectory()) walk(full, `${indent}  `);
    }
  }
  walk(dir, "");
  return lines.join("\n");
}

export function readResource(uri: string): { mimeType: string; text: string } | null {
  const r = RESOURCES.find((res) => res.uri === uri);
  if (!r) return null;
  switch (uri) {
    case "starui://architecture":
      return { mimeType: r.mimeType, text: readFileSafe(join(resourcesDir(), "ARCHITECTURE_GUIDE.md")) };
    case "starui://feature-inventory":
      return { mimeType: r.mimeType, text: readFileSafe(join(resourcesDir(), "PARITY.md")) };
    case "starui://implemented-features":
      return { mimeType: r.mimeType, text: readFileSafe(join(resourcesDir(), "IMPLEMENTED_FEATURES.md")) };
    case "starui://gotchas":
      return { mimeType: r.mimeType, text: readFileSafe(join(resourcesDir(), "gotchas.md")) };
    case "starui://version-matrix":
      return { mimeType: r.mimeType, text: JSON.stringify(VERSION_MATRIX, null, 2) };
    case "starui://templates/web-react/tree":
      return { mimeType: r.mimeType, text: treeOf(join(templatesDir(), "web-react")) };
    case "starui://templates/openfin-react/tree":
      return { mimeType: r.mimeType, text: treeOf(join(templatesDir(), "openfin-react")) };
    case "starui://libs/manifest":
      return { mimeType: r.mimeType, text: JSON.stringify(loadManifest(), null, 2) };
    default:
      return null;
  }
}

// Suppress unused warnings — these are referenced indirectly above.
void libsDir;
void relative;
void statSync;
