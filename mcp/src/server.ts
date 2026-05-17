import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { CREATE_APP_TOOL, CreateAppInput, createApp } from "./tools/createApp.js";
import {
  ADD_MARKETSGRID_TOOL,
  AddMarketsGridInput,
  addMarketsGrid,
} from "./tools/addMarketsGrid.js";
import {
  ADD_DATAPROVIDER_TOOL,
  AddDataProviderInput,
  addDataProvider,
} from "./tools/addDataProvider.js";
import { ADD_VIEW_TOOL, AddViewInput, addView } from "./tools/addView.js";
import { ADD_POPOUT_TOOL, AddPopoutInput, addPopout } from "./tools/addPopout.js";
import {
  CREATE_COMPONENT_TOOL,
  CreateComponentInput,
  createComponent,
} from "./tools/createComponent.js";
import { INSPECT_APP_TOOL, InspectAppInput, inspectApp } from "./tools/inspectApp.js";
import { UPGRADE_LIBS_TOOL, UpgradeLibsInput, upgradeLibs } from "./tools/upgradeLibs.js";
import { RESOURCES, readResource } from "./lib/resources.js";
import { type PromptDefinition, discoverPrompts } from "./lib/prompts.js";
import type { ToolResult } from "./types.js";

const TOOLS = [
  CREATE_APP_TOOL,
  CREATE_COMPONENT_TOOL,
  ADD_MARKETSGRID_TOOL,
  ADD_DATAPROVIDER_TOOL,
  ADD_VIEW_TOOL,
  ADD_POPOUT_TOOL,
  INSPECT_APP_TOOL,
  UPGRADE_LIBS_TOOL,
];

function asContent(payload: ToolResult): {
  content: { type: "text"; text: string }[];
  isError: boolean;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: !payload.ok,
  };
}

export async function createServer(): Promise<Server> {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        prompts: { listChanged: false },
      },
    },
  );

  const prompts: PromptDefinition[] = await discoverPrompts();
  const promptMap = new Map(prompts.map((p) => [p.name, p]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    try {
      switch (name) {
        case "create_app":
          return asContent(await createApp(CreateAppInput.parse(args)));
        case "create_component":
          return asContent(await createComponent(CreateComponentInput.parse(args)));
        case "add_marketsgrid":
          return asContent(await addMarketsGrid(AddMarketsGridInput.parse(args)));
        case "add_dataprovider":
          return asContent(await addDataProvider(AddDataProviderInput.parse(args)));
        case "add_view":
          return asContent(await addView(AddViewInput.parse(args)));
        case "add_popout":
          return asContent(await addPopout(AddPopoutInput.parse(args)));
        case "inspect_app":
          return asContent(await inspectApp(InspectAppInput.parse(args)));
        case "upgrade_libs":
          return asContent(await upgradeLibs(UpgradeLibsInput.parse(args)));
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: RESOURCES.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const res = readResource(req.params.uri);
    if (!res) {
      return {
        contents: [
          {
            uri: req.params.uri,
            mimeType: "text/plain",
            text: `Resource not found: ${req.params.uri}`,
          },
        ],
      };
    }
    return {
      contents: [{ uri: req.params.uri, mimeType: res.mimeType, text: res.text }],
    };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: prompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    })),
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const def = promptMap.get(req.params.name);
    if (!def) {
      return {
        description: `Unknown prompt: ${req.params.name}`,
        messages: [],
      };
    }
    const args = (req.params.arguments ?? {}) as Record<string, string>;
    return {
      description: def.description,
      messages: def.render(args),
    };
  });

  return server;
}
