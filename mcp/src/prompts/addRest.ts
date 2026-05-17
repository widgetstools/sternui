import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-rest",
  description: "Wire a REST data provider config.",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "id", description: "Provider id (camelCase)", required: true },
    { name: "url", description: "REST endpoint URL", required: true },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use `add_dataprovider` with transport='rest', id={{id}}, url={{url}} in {{path}}. After it lands, point me at the generated `src/providers/{{id}}.ts` so I can adjust the polling interval and headers.",
        args,
      ),
    ),
  ],
});
