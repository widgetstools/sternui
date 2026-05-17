import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { DEFAULT_STOMP_PORT } from "../constants.js";
import { fragmentsDir } from "../lib/manifest.js";
import { detectApp } from "../lib/detect.js";
import { applyFragment } from "../lib/patch.js";
import { emptyResult, type ToolResult } from "../types.js";

const TRANSPORTS = ["stomp", "rest", "mock", "appdata"] as const;
type Transport = (typeof TRANSPORTS)[number];

export const AddDataProviderInput = z.object({
  path: z.string().min(1),
  transport: z.enum(TRANSPORTS),
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-zA-Z0-9_]*$/, "Use a camelCase identifier"),
  // transport-specific options (all optional with sensible defaults)
  stompUrl: z.string().url().optional(),
  destination: z.string().optional(),
  url: z.string().url().optional(),
  dataType: z.enum(["positions", "trades", "orders"]).optional(),
  dataSource: z.string().optional(),
});

export type AddDataProviderArgs = z.infer<typeof AddDataProviderInput>;

export const ADD_DATAPROVIDER_TOOL = {
  name: "add_dataprovider",
  description:
    "Scaffold a data-provider config (STOMP, REST, Mock, or AppData) into the app's src/providers/<id>.ts and reference it in dataServices.mainThread.ts. For STOMP, also wires the bundled stomp-view-server via a 'dev:stomp' script. v1 supports openfin apps only.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Target app directory" },
      transport: { type: "string", enum: TRANSPORTS as unknown as string[] },
      id: { type: "string", description: "camelCase provider id" },
      stompUrl: { type: "string", description: "STOMP WebSocket URL (stomp transport)" },
      destination: { type: "string", description: "STOMP destination (stomp transport)" },
      url: { type: "string", description: "REST endpoint URL (rest transport)" },
      dataType: { type: "string", enum: ["positions", "trades", "orders"], description: "Mock data type (mock transport)" },
      dataSource: { type: "string", description: "AppData source name (appdata transport)" },
    },
    required: ["path", "transport", "id"],
  },
};

function resolvePath(input: string): string {
  return isAbsolute(input) ? input : resolve(process.cwd(), input);
}

export async function addDataProvider(
  args: AddDataProviderArgs,
): Promise<ToolResult> {
  const parsed = AddDataProviderInput.parse(args);
  const targetPath = resolvePath(parsed.path);
  const result = emptyResult();

  const detect = detectApp(targetPath);
  if (detect.kind === "unknown") {
    result.ok = false;
    result.errors.push(
      `Target does not look like a starui app: ${targetPath}.`,
    );
    return result;
  }
  if (detect.kind !== "openfin") {
    result.ok = false;
    result.errors.push(
      `add_dataprovider v1 only supports openfin apps. Detected: ${detect.kind}.`,
    );
    return result;
  }

  const transport: Transport = parsed.transport;
  const fragmentName = `dataprovider-${transport}`;

  const vars: Record<string, string> = {
    id: parsed.id,
    stompPort: String(DEFAULT_STOMP_PORT),
    stompUrl: parsed.stompUrl ?? `ws://localhost:${DEFAULT_STOMP_PORT}`,
    destination: parsed.destination ?? `/topic/${parsed.id}`,
    url: parsed.url ?? "https://example.com/api",
    dataType: parsed.dataType ?? "positions",
    dataSource: parsed.dataSource ?? parsed.id,
  };

  const out = applyFragment({
    fragmentDir: `${fragmentsDir()}/${fragmentName}`,
    targetDir: targetPath,
    vars,
  });
  result.files.written.push(...out.written);
  result.files.patched.push(...out.patched);
  result.files.skipped.push(...out.skipped);
  result.warnings.push(...out.warnings);

  if (transport === "stomp") {
    result.nextSteps.push("npm run dev:stomp  # start the bundled STOMP test server");
  }
  result.nextSteps.push(
    `Open the in-app DataProvider editor (or call dataServices.registerProvider(${parsed.id}ProviderConfig)) to register "${parsed.id}".`,
  );
  return result;
}
