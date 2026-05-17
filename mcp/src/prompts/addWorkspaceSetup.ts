import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-workspace-setup",
  description: "Add the WorkspaceSetup + ImportConfig widget pair to an OpenFin app.",
  arguments: [{ name: "path", description: "App directory", required: true }],
  render: (args) => [
    userMessage(
      fill(
        "Use `add_view` twice in {{path}}: WorkspaceSetup at /tools/workspace-setup, ImportConfig at /tools/import-config. Then patch each generated view to render `<WorkspaceSetup />` / `<ImportConfig />` from @starui/workspace-setup-react. Show me each patch before applying.",
        args,
      ),
    ),
  ],
});
