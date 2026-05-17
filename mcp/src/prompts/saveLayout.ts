import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.save-layout",
  description: "Confirm or extend the Save/Reset Layout wiring in a web app (it's in App.tsx by default).",
  arguments: [{ name: "path", description: "App directory", required: true }],
  render: (args) => [
    userMessage(
      fill(
        "Inspect {{path}}/src/App.tsx and confirm the Save/Reset Layout buttons + Ctrl+S / Ctrl+Shift+R shortcuts are wired against localStorage key '{{name}}.layout.v1' (or equivalent). If anything's missing or drifted, patch it back to the scaffolded shape and report the diff.",
        args,
      ),
    ),
  ],
});
