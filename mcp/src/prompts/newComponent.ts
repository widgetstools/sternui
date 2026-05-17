import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.new-component",
  description: "Generate a starui-compliant React component (shadcn primitives + design-system tokens).",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "name", description: "Pascal-case component name", required: true },
    { name: "kind", description: "'panel' | 'dialog' | 'sheet' | 'plain' (default panel)", required: false },
    { name: "with", description: "Comma-separated hooks: runtime, configManager, dataServices", required: false },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use `create_component` to add {{name}} to {{path}} with kind={{kind}} and hooks=[{{with}}]. Show me the generated file before suggesting how to wire it.",
        {
          ...args,
          kind: args.kind ?? "panel",
          with: args.with ?? "",
        },
      ),
    ),
  ],
});
