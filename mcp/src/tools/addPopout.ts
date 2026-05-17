import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { fragmentsDir } from "../lib/manifest.js";
import { detectApp } from "../lib/detect.js";
import { applyFragment } from "../lib/patch.js";
import { emptyResult, type ToolResult } from "../types.js";

export const AddPopoutInput = z.object({
  path: z.string().min(1),
  name: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Za-z0-9]*$/, "Pascal-case popout name"),
  route: z.string().min(1).describe("Router path for the popout (e.g. '/popouts/providerEditor')"),
  width: z.number().int().min(100).max(4000).optional(),
  height: z.number().int().min(100).max(4000).optional(),
});

export type AddPopoutArgs = z.infer<typeof AddPopoutInput>;

export const ADD_POPOUT_TOOL = {
  name: "add_popout",
  description:
    "Add a popout window: route + a typed open<Name>Popout(runtime, options) helper that uses runtime.openSurface, so the same call site works in browser (window.open) and OpenFin (fin.Window.create). v1 supports openfin apps only.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      name: { type: "string", description: "Pascal-case popout name" },
      route: { type: "string", description: "Router path" },
      width: { type: "number", description: "Popout window width (default 1000)" },
      height: { type: "number", description: "Popout window height (default 700)" },
    },
    required: ["path", "name", "route"],
  },
};

function resolvePath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

export async function addPopout(args: AddPopoutArgs): Promise<ToolResult> {
  const parsed = AddPopoutInput.parse(args);
  const targetPath = resolvePath(parsed.path);
  const result = emptyResult();

  const detect = detectApp(targetPath);
  if (detect.kind !== "openfin") {
    result.ok = false;
    result.errors.push(
      `add_popout v1 requires an openfin app. Detected: ${detect.kind}.`,
    );
    return result;
  }

  const vars: Record<string, string> = {
    Name: parsed.name,
    route: parsed.route,
    width: String(parsed.width ?? 1000),
    height: String(parsed.height ?? 700),
  };

  const out = applyFragment({
    fragmentDir: `${fragmentsDir()}/popout-host`,
    targetDir: targetPath,
    vars,
  });
  result.files.written.push(...out.written);
  result.files.patched.push(...out.patched);
  result.files.skipped.push(...out.skipped);
  result.warnings.push(...out.warnings);
  result.nextSteps.push(
    `Import { open${parsed.name}Popout } from "./popouts/open${parsed.name}Popout" anywhere you need to launch the popout, then call open${parsed.name}Popout(runtime, {...}).`,
  );
  return result;
}
