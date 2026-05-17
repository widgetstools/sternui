import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { fragmentsDir } from "../lib/manifest.js";
import { detectApp } from "../lib/detect.js";
import { applyFragment } from "../lib/patch.js";
import { emptyResult, type ToolResult } from "../types.js";

export const AddMarketsGridInput = z.object({
  path: z.string().min(1).describe("Target app directory"),
  gridId: z.string().min(1).describe("Unique grid id (e.g. 'portfolios-eod')"),
  route: z
    .string()
    .min(1)
    .describe("Router path on openfin (e.g. '/blotters/portfolios')"),
  viewName: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Za-z0-9]*$/, "Pascal-case view component name")
    .optional()
    .describe("Component name. Defaults to derived from gridId."),
});

export type AddMarketsGridArgs = z.infer<typeof AddMarketsGridInput>;

export const ADD_MARKETSGRID_TOOL = {
  name: "add_marketsgrid",
  description:
    "Add a new MarketsGrid blotter view to an existing scaffolded app. Creates a new view component, registers the lazy route in main.tsx, and adds a prefetch entry in Provider.tsx. v1 supports openfin apps only.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Target app directory" },
      gridId: { type: "string", description: "Unique grid id" },
      route: { type: "string", description: "Router path" },
      viewName: { type: "string", description: "Pascal-case component name (defaults from gridId)" },
    },
    required: ["path", "gridId", "route"],
  },
};

function deriveViewName(gridId: string): string {
  return gridId
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((s) => s[0]!.toUpperCase() + s.slice(1))
    .join("");
}

function resolvePath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

export async function addMarketsGrid(args: AddMarketsGridArgs): Promise<ToolResult> {
  const parsed = AddMarketsGridInput.parse(args);
  const targetPath = resolvePath(parsed.path);
  const result = emptyResult();

  const detect = detectApp(targetPath);
  if (detect.kind === "unknown") {
    result.ok = false;
    result.errors.push(
      `Target does not look like a starui app: ${targetPath}. Run create_app first.`,
    );
    return result;
  }
  if (detect.kind !== "openfin") {
    result.ok = false;
    result.errors.push(
      `add_marketsgrid v1 only supports openfin apps. Detected: ${detect.kind}.`,
    );
    return result;
  }

  const viewName = parsed.viewName ?? deriveViewName(parsed.gridId);
  const vars = {
    gridId: parsed.gridId,
    route: parsed.route,
    ViewName: viewName,
  };

  const out = applyFragment({
    fragmentDir: `${fragmentsDir()}/marketsgrid-view`,
    targetDir: targetPath,
    vars,
  });
  result.files.written.push(...out.written);
  result.files.patched.push(...out.patched);
  result.files.skipped.push(...out.skipped);
  result.warnings.push(...out.warnings);
  result.nextSteps.push(
    `Open http://localhost:<port>${parsed.route} (or launch via OpenFin and navigate to the view).`,
  );
  return result;
}
