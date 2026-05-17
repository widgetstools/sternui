import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-stomp",
  description: "Wire a STOMP data provider config that targets the bundled stomp-view-server.",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "id", description: "Provider id (camelCase)", required: true },
    { name: "destination", description: "STOMP destination (e.g. /topic/positions)", required: false },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use `add_dataprovider` with transport='stomp', id={{id}}, destination={{destination}} in {{path}}. Then remind me to run `npm run dev:stomp` in a separate terminal and to register the provider via the in-app DataProvider editor.",
        { ...args, destination: args.destination ?? `/topic/${args.id}` },
      ),
    ),
  ],
});
