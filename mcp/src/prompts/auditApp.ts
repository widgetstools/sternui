import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.audit-app",
  description: "Run a starui architecture audit (version-matrix, banned patterns, AppShell stack, runtime branching).",
  arguments: [{ name: "path", description: "App directory to audit", required: true }],
  render: (args) => [
    userMessage(
      fill(
        "Run `inspect_app` against {{path}} and summarize the findings for me, grouped by rule and severity. For each error, propose a fix and offer to apply it.",
        args,
      ),
    ),
  ],
});
