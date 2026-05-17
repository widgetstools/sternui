import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import {
  DEFAULT_OPENFIN_PORT,
  DEFAULT_STOMP_PORT,
  DEFAULT_WEB_PORT,
} from "../constants.js";
import {
  appConfigPath,
  libsDir as bundledLibsDir,
  stompViewServerDir,
  templatesDir,
} from "../lib/manifest.js";
import { copyDirVerbatim, renderTree, type Vars } from "../lib/render.js";
import { runCommand } from "../lib/exec.js";
import type { ToolResult } from "../types.js";
import { emptyResult } from "../types.js";

export const CreateAppInput = z.object({
  kind: z.enum(["web", "openfin"]),
  path: z.string().min(1).describe("Target directory (absolute or relative to cwd)"),
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Use a kebab-case name (letters, digits, hyphens)")
    .describe("Project name (also used as package.json name)"),
  port: z.number().int().min(1024).max(65535).optional(),
  stompPort: z.number().int().min(1024).max(65535).optional(),
  useConfigServiceRest: z.boolean().optional(),
  configServiceRestUrl: z.string().url().optional(),
  skipInstall: z.boolean().optional(),
  overwriteExisting: z.boolean().optional().describe("Delete target dir if it exists"),
});

export type CreateAppArgs = z.infer<typeof CreateAppInput>;

export const CREATE_APP_TOOL = {
  name: "create_app",
  description:
    "Scaffold a new StarUI app at the given path. kind='web' produces a Vite + React + shadcn + tailwind + dock-manager app. kind='openfin' produces a lean OpenFin workspace app. Both come bundled with @starui/* tarballs and a copy of stomp-view-server.",
  inputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["web", "openfin"] },
      path: { type: "string", description: "Target directory" },
      name: { type: "string", description: "kebab-case project name" },
      port: { type: "number", description: "Dev server port" },
      stompPort: { type: "number", description: "Bundled STOMP server port" },
      useConfigServiceRest: { type: "boolean" },
      configServiceRestUrl: { type: "string" },
      skipInstall: { type: "boolean", description: "Skip 'npm install' after scaffolding" },
      overwriteExisting: { type: "boolean", description: "Delete target dir if it exists" },
    },
    required: ["kind", "path", "name"],
  },
};

function resolvePath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

function isEmptyDir(dir: string): boolean {
  try {
    return readdirSync(dir).length === 0;
  } catch {
    return false;
  }
}

export async function createApp(args: CreateAppArgs): Promise<ToolResult> {
  const result = emptyResult();
  const parsed = CreateAppInput.parse(args);
  const targetPath = resolvePath(parsed.path);

  if (existsSync(targetPath)) {
    const st = statSync(targetPath);
    if (!st.isDirectory()) {
      result.ok = false;
      result.errors.push(`Target exists and is not a directory: ${targetPath}`);
      return result;
    }
    if (!isEmptyDir(targetPath)) {
      if (parsed.overwriteExisting) {
        rmSync(targetPath, { recursive: true, force: true });
        result.warnings.push(`Overwrote existing non-empty directory: ${targetPath}`);
      } else {
        result.ok = false;
        result.errors.push(
          `Target directory is not empty: ${targetPath}. Pass overwriteExisting=true to replace it.`,
        );
        return result;
      }
    }
  }

  mkdirSync(targetPath, { recursive: true });

  const port = parsed.port ?? (parsed.kind === "web" ? DEFAULT_WEB_PORT : DEFAULT_OPENFIN_PORT);
  const stompPort = parsed.stompPort ?? DEFAULT_STOMP_PORT;
  const platformUuid = `${parsed.name}-platform`;
  const vars: Vars = {
    name: parsed.name,
    port: String(port),
    stompPort: String(stompPort),
    platformUuid,
    useRest: parsed.useConfigServiceRest ? "true" : "false",
    configServiceRestUrl: parsed.configServiceRestUrl ?? "",
  };

  const templateSource = `${templatesDir()}/${parsed.kind}-react`;
  if (!existsSync(templateSource)) {
    result.ok = false;
    result.errors.push(`Template not found: ${templateSource}`);
    return result;
  }

  const render = renderTree({
    source: templateSource,
    dest: targetPath,
    vars,
    overwrite: true,
  });
  result.files.written.push(...render.written);
  result.files.skipped.push(...render.skipped);

  const libsDest = `${targetPath}/libs`;
  mkdirSync(libsDest, { recursive: true });
  const libsCopied = copyDirVerbatim(bundledLibsDir(), libsDest);
  result.files.written.push(...libsCopied);

  const stompDest = `${targetPath}/tools/stomp-view-server`;
  mkdirSync(stompDest, { recursive: true });
  const stompCopied = copyDirVerbatim(stompViewServerDir(), stompDest);
  result.files.written.push(...stompCopied);

  const appConfigSrc = appConfigPath();
  const appConfigDest = join(targetPath, "appConfig.json");
  if (existsSync(appConfigSrc)) {
    copyFileSync(appConfigSrc, appConfigDest);
    result.files.written.push(appConfigDest);
  } else {
    result.warnings.push(
      `Bundled appConfig.json missing at ${appConfigSrc} (run scripts/pack.mjs to refresh).`,
    );
  }

  result.nextSteps.push(`cd ${basename(targetPath)}`);

  if (parsed.skipInstall) {
    result.nextSteps.push("npm install");
    result.nextSteps.push("npm run dev:stomp  # separate terminal");
    result.nextSteps.push("npm run dev");
    return result;
  }

  const install = await runCommand("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: targetPath,
  });
  if (install.code !== 0) {
    result.ok = false;
    result.errors.push(
      `npm install failed (exit ${install.code}). stderr:\n${install.stderr.slice(0, 4000)}`,
    );
    return result;
  }
  result.nextSteps.push("npm run dev:stomp  # separate terminal");
  result.nextSteps.push("npm run dev");
  return result;
}
