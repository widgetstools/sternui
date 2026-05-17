import { definePrompt, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.theme-tokens",
  description: "Surface available @starui/design-system semantic tokens and explain override paths.",
  arguments: [],
  render: () => [
    userMessage(
      "Read the `starui://architecture` resource and the `starui://gotchas` resource, then summarize for me: (1) what --ds-* CSS variables are available, (2) how to override them per-theme, (3) the rule against hardcoded hex colors, (4) where `applyTheme()` is called in the scaffolded templates.",
    ),
  ],
});
