import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.find-recipe",
  description: "Search the bundled recipe corpus and suggest the best matching MCP tool or prompt.",
  arguments: [
    { name: "query", description: "Free-text description of what you want to do", required: true },
  ],
  render: (args) => [
    userMessage(
      fill(
        "I want to: {{query}}\n\nRead the starui://gotchas resource and the recipe corpus, then suggest the best MCP tool(s) or prompt(s) to use, with exact argument values where you can infer them.",
        args,
      ),
    ),
  ],
});
