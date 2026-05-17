import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-appdata",
  description: "Wire an AppData provider with optional template variables.",
  arguments: [
    { name: "path", description: "App directory", required: true },
    { name: "id", description: "Provider id (camelCase)", required: true },
    { name: "dataSource", description: "AppData source name", required: false },
  ],
  render: (args) => [
    userMessage(
      fill(
        "Use `add_dataprovider` with transport='appdata', id={{id}}, dataSource={{dataSource}} in {{path}}. Then walk me through adding templateVariables entries for any references like `{{dataSource}}.asOfDate`.",
        { ...args, dataSource: args.dataSource ?? args.id },
      ),
    ),
  ],
});
