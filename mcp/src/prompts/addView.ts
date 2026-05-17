import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-view",
  description: "Add a new lazy-loaded OpenFin view (route + view.fin.json + stub component using useHost()).",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "name", description: "Pascal-case component name", required: true },
    { name: "route", description: "Router path (e.g. '/views/positions')", required: true },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use `add_view` to scaffold a new OpenFin view named {{name}} at {{route}} in {{path}}. After it lands, walk me through where to put the real view content.",
        args,
      ),
    ),
  ],
});
