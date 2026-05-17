import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { detectApp } from "../lib/detect.js";
import {
  assertVersions,
  scanForAppShellStack,
  scanForCrossFrameworkImports,
  scanForHardcodedColors,
  scanForNativeElements,
  scanForRuntimeBranching,
  tryReadPkg,
  type Finding,
} from "../lib/validate.js";
import { emptyResult, type ToolResult } from "../types.js";

export const InspectAppInput = z.object({
  path: z.string().min(1),
});

export type InspectAppArgs = z.infer<typeof InspectAppInput>;

export const INSPECT_APP_TOOL = {
  name: "inspect_app",
  description:
    "Read-only audit of a starui app: classifies web vs openfin, then runs six scanners (version-matrix, banned-deps, native-elements, hardcoded-colors, cross-framework-imports, AppShell-stack, runtime-branching). Returns a structured report.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Target app directory" },
    },
    required: ["path"],
  },
};

function resolvePath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

export interface InspectionReport extends ToolResult {
  kind: "web" | "openfin" | "unknown";
  findings: Finding[];
  summary: { errors: number; warnings: number; info: number };
}

export async function inspectApp(args: InspectAppArgs): Promise<InspectionReport> {
  const parsed = InspectAppInput.parse(args);
  const targetPath = resolvePath(parsed.path);
  const base = emptyResult();
  const report: InspectionReport = {
    ...base,
    kind: "unknown",
    findings: [],
    summary: { errors: 0, warnings: 0, info: 0 },
  };

  const detect = detectApp(targetPath);
  report.kind = detect.kind;
  if (detect.kind === "unknown") {
    report.ok = false;
    report.errors.push(
      `Target does not look like a starui app: ${targetPath}.`,
    );
    return report;
  }

  const pkg = tryReadPkg(targetPath);
  const findings: Finding[] = [];

  if (pkg) {
    findings.push(...assertVersions(pkg, detect.kind === "openfin"));
  }
  const srcDir = resolve(targetPath, "src");
  findings.push(...scanForNativeElements(srcDir));
  findings.push(...scanForHardcodedColors(srcDir));
  findings.push(...scanForCrossFrameworkImports(srcDir));
  findings.push(...scanForAppShellStack(targetPath, detect.kind === "openfin"));
  findings.push(...scanForRuntimeBranching(srcDir));

  report.findings = findings;
  for (const f of findings) {
    if (f.severity === "error") report.summary.errors++;
    else if (f.severity === "warn") report.summary.warnings++;
    else report.summary.info++;
  }

  if (report.summary.errors > 0) {
    report.ok = false;
  }
  report.nextSteps.push(
    `${report.summary.errors} error(s), ${report.summary.warnings} warning(s) reported.`,
  );
  return report;
}
