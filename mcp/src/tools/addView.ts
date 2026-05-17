import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { fragmentsDir } from "../lib/manifest.js";
import { detectApp } from "../lib/detect.js";
import { applyFragment } from "../lib/patch.js";
import { emptyResult, type ToolResult } from "../types.js";

export const AddViewInput = z.object({
  path: z.string().min(1),
  name: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Za-z0-9]*$/, "Pascal-case view component name")
    .describe("Component name (e.g. 'Trades')"),
  route: z.string().min(1).describe("Router path (e.g. '/views/trades')"),
  port: z.number().int().min(1024).max(65535).optional(),
});

export type AddViewArgs = z.infer<typeof AddViewInput>;

export const ADD_VIEW_TOOL = {
  name: "add_view",
  description:
    "Add a new lazy-loaded OpenFin view: route in main.tsx, view.fin.json manifest entry, and a stub view component using useHost(). The OpenFin platform launches this URL as a Window/View.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Target app directory" },
      name: { type: "string", description: "Pascal-case component name" },
      route: { type: "string", description: "Router path" },
      port: { type: "number", description: "Dev server port (defaults from app)" },
    },
    required: ["path", "name", "route"],
  },
};

function resolvePath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

function slugify(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function addView(args: AddViewArgs): Promise<ToolResult> {
  const parsed = AddViewInput.parse(args);
  const targetPath = resolvePath(parsed.path);
  const result = emptyResult();

  const detect = detectApp(targetPath);
  if (detect.kind !== "openfin") {
    result.ok = false;
    result.errors.push(
      `add_view requires an openfin app. Detected: ${detect.kind}.`,
    );
    return result;
  }

  const vars: Record<string, string> = {
    ViewName: parsed.name,
    route: parsed.route,
    slug: slugify(parsed.name),
    port: String(parsed.port ?? 5174),
  };

  const out = applyFragment({
    fragmentDir: `${fragmentsDir()}/openfin-view`,
    targetDir: targetPath,
    vars,
  });
  result.files.written.push(...out.written);
  result.files.patched.push(...out.patched);
  result.files.skipped.push(...out.skipped);
  result.warnings.push(...out.warnings);
  result.nextSteps.push(
    `View available at http://localhost:${vars.port}${parsed.route}. Add an entry to manifest.fin.json's customSettings.apps[] if you want it discoverable via OpenFin.`,
  );
  return result;
}
