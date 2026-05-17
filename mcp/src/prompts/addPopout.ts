import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-popout",
  description: "Wire a popout window via runtime.openSurface (works in browser and OpenFin).",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "name", description: "Pascal-case popout name", required: true },
    { name: "route", description: "Router path", required: true },
    { name: "width", description: "Popout window width (default 1000)", required: false },
    { name: "height", description: "Popout window height (default 700)", required: false },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use `add_popout` to scaffold {{name}} popout at {{route}} in {{path}} ({{width}}x{{height}}). Then show me a sample call site that uses runtime.openSurface.",
        { ...args, width: args.width ?? "1000", height: args.height ?? "700" },
      ),
    ),
  ],
});
