import { definePrompt, fill, userMessage } from "../lib/prompts.js";

export default definePrompt({
  name: "starui.upgrade",
  description: "Refresh bundled @starui/* tarballs in a scaffolded app.",
  arguments: [
    { name: "path", description: "App directory to upgrade", required: true },
    { name: "packages", description: "Comma-separated list of package names (default: all)", required: false },
  ],
  render: (args) => {
    const pkgList = (args.packages ?? "").trim();
    return [
      userMessage(
        fill(
          "Use `upgrade_libs` against {{path}}{{pkgClause}}. Walk me through the diff in package.json file: paths before running npm install.",
          {
            ...args,
            pkgClause: pkgList ? ` for packages: ${pkgList}` : "",
          },
        ),
      ),
    ];
  },
});
