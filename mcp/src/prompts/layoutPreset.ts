import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.layout-preset",
  description: "Apply a named dock-manager layout preset (single-grid, master-detail, multi-blotter) to a web app.",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "preset", description: "single-grid | master-detail | multi-blotter", required: true },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Apply the '{{preset}}' dock layout preset to {{path}}. Use `add_marketsgrid` for each panel the preset needs, then patch src/App.tsx's DEFAULT_LAYOUT in a single edit so the panels appear in the correct arrangement. Show me the layout JSON before writing.",
        args,
      ),
    ),
  ],
});
