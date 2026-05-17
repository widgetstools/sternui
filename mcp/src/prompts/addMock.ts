import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-mock",
  description: "Wire a Mock data provider (in-process synthetic rows for prototyping).",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "id", description: "Provider id (camelCase)", required: true },
    { name: "dataType", description: "positions | trades | orders", required: false },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use `add_dataprovider` with transport='mock', id={{id}}, dataType={{dataType}} in {{path}}. After it lands, link any blotter view to this provider via the in-app DataProvider editor.",
        { ...args, dataType: args.dataType ?? "positions" },
      ),
    ),
  ],
});
