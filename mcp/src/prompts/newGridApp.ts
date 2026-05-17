import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.new-grid-app",
  description: "Scaffold a new StarUI web app (Vite + React + shadcn + dock-manager + MarketsGrid).",
  arguments: [
    { name: "path", description: "Target directory (absolute or relative)", required: true },
    { name: "name", description: "Project name (kebab-case)", required: true },
    { name: "port", description: "Dev server port (default 5173)", required: false },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use the `create_app` tool with kind='web' to scaffold a StarUI web app at {{path}} named {{name}} on port {{port}}. Confirm with me before any other tool calls.",
        { ...args, port: args.port ?? "5173" },
      ),
    ),
  ],
});
