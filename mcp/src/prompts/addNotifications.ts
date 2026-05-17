import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.add-notifications",
  description: "Wire @openfin/notifications and add a sample toast helper.",
  arguments: [{ name: "path", description: "App directory", required: true }],
  render: (args) => [
    userMessage(
      fill(
        "Add a `src/notifications.ts` to {{path}} that exports `toast(title, body)` calling `Notifications.create(...)` from @openfin/notifications, guarded by `typeof fin !== 'undefined'` so it no-ops in browser dev. Show me the file before writing.",
        args,
      ),
    ),
  ],
});
