import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-blotter",
  description: "Add a new MarketsGrid blotter view to an existing scaffolded openfin app.",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "gridId", description: "Unique grid id (e.g. 'positions-eod')", required: true },
    { name: "route", description: "Router path (e.g. '/blotters/positions')", required: true },
    { name: "viewName", description: "Pascal-case component name (default derived)", required: false },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use `add_marketsgrid` to register a new MarketsGrid blotter at {{route}} in {{path}}, gridId={{gridId}}. Confirm with me before any patches that touch main.tsx.",
        args,
      ),
    ),
  ],
});
