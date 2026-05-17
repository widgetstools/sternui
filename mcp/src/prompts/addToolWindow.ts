import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-tool-window",
  description: "Add a known starui tool window (ConfigBrowser, DataProviderEditor, WorkspaceSetup, ImportConfig).",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "tool", description: "One of: configBrowser, dataProviderEditor, workspaceSetup, importConfig", required: true },
    { name: "route", description: "Router path (e.g. '/tools/config-browser')", required: true },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Wire the {{tool}} tool window at {{route}} in {{path}}. Use `add_view` to register the route, then patch the new view file to import and render the matching widget from @starui/widgets-react, @starui/config-browser, or @starui/workspace-setup-react. Show me each patch before applying.",
        args,
      ),
    ),
  ],
});
