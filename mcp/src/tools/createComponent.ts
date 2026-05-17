import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { fragmentsDir } from "../lib/manifest.js";
import { detectApp } from "../lib/detect.js";
import { applyFragment } from "../lib/patch.js";
import { scanForNativeElements } from "../lib/validate.js";
import { emptyResult, type ToolResult } from "../types.js";

const HOOKS = ["runtime", "configManager", "dataServices"] as const;
type Hook = (typeof HOOKS)[number];

export const CreateComponentInput = z.object({
  path: z.string().min(1),
  name: z
    .string()
    .min(1)
    .regex(/^[A-Z][A-Za-z0-9]*$/, "Pascal-case component name"),
  kind: z.enum(["panel", "dialog", "sheet", "plain"]).optional(),
  with: z.array(z.enum(HOOKS)).optional(),
});

export type CreateComponentArgs = z.infer<typeof CreateComponentInput>;

export const CREATE_COMPONENT_TOOL = {
  name: "create_component",
  description:
    "Generate a starui-compliant React component under src/components/<Name>.tsx. Uses @starui/ui primitives and @starui/design-system tokens; never emits native <input>/<select>/<textarea>. Optional hooks: runtime, configManager, dataServices.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      name: { type: "string", description: "Pascal-case component name" },
      kind: { type: "string", enum: ["panel", "dialog", "sheet", "plain"] },
      with: {
        type: "array",
        items: { type: "string", enum: HOOKS as unknown as string[] },
        description: "Optional hooks the component should receive",
      },
    },
    required: ["path", "name"],
  },
};

function resolvePath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

function buildHookSnippets(hooks: Hook[]): {
  hookImports: string;
  hookBody: string;
} {
  const imports: string[] = [];
  const bodyLines: string[] = [];
  if (hooks.includes("runtime")) {
    imports.push(`import { useHost } from "@starui/host-wrapper-react";`);
    bodyLines.push(`  const { runtime } = useHost();`);
    bodyLines.push(`  void runtime;`);
  }
  if (hooks.includes("configManager")) {
    imports.push(`import { useConfigService } from "@starui/config-service-react";`);
    bodyLines.push(`  const { configManager } = useConfigService();`);
    bodyLines.push(`  void configManager;`);
  }
  if (hooks.includes("dataServices")) {
    imports.push(`import { useDataServices } from "@starui/data-services-react";`);
    bodyLines.push(`  const dataServices = useDataServices();`);
    bodyLines.push(`  void dataServices;`);
  }
  return {
    hookImports: imports.join("\n"),
    hookBody: bodyLines.join("\n"),
  };
}

export async function createComponent(
  args: CreateComponentArgs,
): Promise<ToolResult> {
  const parsed = CreateComponentInput.parse(args);
  const targetPath = resolvePath(parsed.path);
  const result = emptyResult();

  const detect = detectApp(targetPath);
  if (detect.kind === "unknown") {
    result.ok = false;
    result.errors.push(`Target does not look like a starui app: ${targetPath}.`);
    return result;
  }

  const hooks = (parsed.with ?? []) as Hook[];
  const { hookImports, hookBody } = buildHookSnippets(hooks);

  const vars: Record<string, string> = {
    Name: parsed.name,
    hookImports,
    hookBody,
  };

  const out = applyFragment({
    fragmentDir: `${fragmentsDir()}/component`,
    targetDir: targetPath,
    vars,
  });
  result.files.written.push(...out.written);
  result.files.patched.push(...out.patched);
  result.files.skipped.push(...out.skipped);
  result.warnings.push(...out.warnings);

  // Sanity check: the new file should pass the no-native-element scan.
  const componentDir = resolve(targetPath, "src", "components");
  if (existsSync(componentDir)) {
    const findings = scanForNativeElements(componentDir);
    const offending = findings.filter((f) => f.file?.endsWith(`${parsed.name}.tsx`));
    if (offending.length) {
      result.warnings.push(
        `Generated component contains native form elements (this should not happen — please report).`,
      );
    }
  }

  result.nextSteps.push(
    `Import { ${parsed.name} } from "./components/${parsed.name}" where you need it.`,
  );
  return result;
}
