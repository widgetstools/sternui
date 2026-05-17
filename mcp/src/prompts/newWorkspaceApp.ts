import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.new-workspace-app",
  description: "Scaffold a new StarUI OpenFin workspace app (lean Provider + AppShell + HostedMarketsGrid).",
  arguments: [
    { name: "path", description: "Target directory", required: true },
    { name: "name", description: "Project name (kebab-case)", required: true },
    { name: "port", description: "Dev server port (default 5174)", required: false },
    { name: "useConfigServiceRest", description: "Enable ConfigService REST mode (default false)", required: false },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use the `create_app` tool with kind='openfin' to scaffold a StarUI OpenFin workspace app at {{path}} named {{name}} on port {{port}} (useConfigServiceRest={{useConfigServiceRest}}). Confirm with me before any other tool calls.",
        {
          ...args,
          port: args.port ?? "5174",
          useConfigServiceRest: args.useConfigServiceRest ?? "false",
        },
      ),
    ),
  ],
});
