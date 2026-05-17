import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.fix-issues",
  description: "Run inspect_app, walk through each finding interactively, and apply fixes.",
  arguments: [{ name: "path", description: "App directory", required: true }],
  render: (args) => [
    userMessage(
      fill(
        "Run `inspect_app` on {{path}}. For each finding, propose a concrete fix and ask me whether to apply it. Group findings by rule and show the most severe first. Do NOT batch-apply; one confirmation per fix.",
        args,
      ),
    ),
  ],
});
