import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-fdc3",
  description: "Wire FDC3 context broadcast + listen into an existing OpenFin view.",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "view", description: "View file (e.g. src/views/Positions.tsx)", required: true },
    { name: "contextType", description: "FDC3 context type (e.g. fdc3.instrument)", required: true },
  ],
  render: (args) => [
    userMessage(
      fill(
        "In {{path}}/{{view}}, add FDC3 wiring for context type '{{contextType}}'. Use the @finos/fdc3 package (add it to deps if missing). Set up a useEffect that calls `fdc3.addContextListener` and a broadcast helper. Show me the patch before applying.",
        args,
      ),
    ),
  ],
});
