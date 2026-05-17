# @starui/mcp-server

Model Context Protocol server that scaffolds StarUI apps directly from your AI assistant.

- **Web template** — Vite + React 19.2 + shadcn + tailwind + `@widgetstools/react-dock-manager` + MarketsGrid
- **OpenFin template** — lean OpenFin workspace app (Provider + `AppShell` + `HostedMarketsGrid`), distilled from the markets-ui reference

Every scaffolded app ships with bundled `@starui/*.tgz` tarballs, a copy of `stomp-view-server`, and a seed `appConfig.json` at the project root (loadable via ConfigBrowser), so generated apps are **fully self-contained** and work offline.

---

## Build the tarball

From the monorepo root:

```bash
npm run mcp:pack
```

This mirrors `/libs/`, `/apps/stomp-view-server/`, and the architecture docs into `/mcp`, compiles TypeScript, runs `npm pack`, and produces a content-hashed tarball under `/mcp-dist/`:

```
/mcp-dist/starui-mcp-server-0.1.0-<sha8>.tgz
```

Find the current path:

```bash
ls -t /Users/develop/wfh/starui/mcp-dist/starui-mcp-server-*.tgz | head -1
```

> Repacking always emits a fresh content hash and garbage-collects the previous tarball, so the most recent file is always the current one.

---

## Install in an MCP client

The same tarball works in every client. Pick yours below.

### Claude Code

Either the CLI (preferred — writes to the right config for you):

```bash
claude mcp add --transport stdio starui -- \
  npx -y /Users/develop/wfh/starui/mcp-dist/starui-mcp-server-0.1.0-<sha>.tgz
```

…or edit the project config manually at `.mcp.json` in your project root (or `~/.claude.json` for user-scope):

```jsonc
{
  "mcpServers": {
    "starui": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "/Users/develop/wfh/starui/mcp-dist/starui-mcp-server-0.1.0-<sha>.tgz"
      ]
    }
  }
}
```

Verify with `claude mcp list` — you should see `starui` and 8 tools. In a session, `/starui.<TAB>` auto-completes the 21 prompts.

### Cursor

Project-level config at `.cursor/mcp.json`, or global at `~/.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "starui": {
      "command": "npx",
      "args": [
        "-y",
        "/Users/develop/wfh/starui/mcp-dist/starui-mcp-server-0.1.0-<sha>.tgz"
      ]
    }
  }
}
```

Open **Cursor Settings → MCP** to confirm the server shows green. The tools become available in agent chat; the 21 prompts surface as slash commands.

### VS Code (GitHub Copilot agent mode)

VS Code uses a slightly different shape — the key is **`servers`** (not `mcpServers`) and each entry needs an explicit **`type`** field.

Workspace config at `.vscode/mcp.json`:

```jsonc
{
  "servers": {
    "starui": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "/Users/develop/wfh/starui/mcp-dist/starui-mcp-server-0.1.0-<sha>.tgz"
      ]
    }
  }
}
```

For user-level (across all projects), open the command palette and run **MCP: Open User Configuration**.

Then open Copilot Chat in **agent mode** (top-right of the chat panel). The 8 tools become callable; the prompts can be invoked with `/starui.<name>`.

### Claude Desktop (and other clients)

Same shape as Cursor (`mcpServers` key). On macOS the config file is at:

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Restart the app after editing.

---

## What the server exposes

### 8 tools

| Tool | Purpose |
|---|---|
| `create_app` | Scaffold a new web or openfin app at a path |
| `create_component` | Generate a starui-compliant React component (shadcn + design-system tokens) |
| `add_marketsgrid` | Register a new MarketsGrid blotter view in an existing app |
| `add_dataprovider` | Wire a STOMP / REST / Mock / AppData provider config |
| `add_view` | Add a lazy-loaded OpenFin view (route + view.fin.json + stub) |
| `add_popout` | Wire a popout window via `runtime.openSurface` (works in browser + OpenFin) |
| `inspect_app` | Read-only audit: version drift, banned patterns, AppShell stack, runtime branching |
| `upgrade_libs` | Refresh bundled `@starui/*.tgz` in a target project |

### 8 resources (read-only docs)

`starui://architecture`, `starui://feature-inventory`, `starui://implemented-features`, `starui://gotchas`, `starui://version-matrix`, `starui://templates/web-react/tree`, `starui://templates/openfin-react/tree`, `starui://libs/manifest`.

### 21 prompts (slash-command wizards)

Auto-discovered from `src/prompts/`. Grouped:

- **Project bootstrap** — `starui.new-grid-app`, `starui.new-workspace-app`, `starui.audit-app`, `starui.upgrade`
- **Views & components** — `starui.new-component`, `starui.add-blotter`, `starui.add-view`, `starui.add-popout`, `starui.add-tool-window`
- **Data providers** — `starui.add-stomp`, `starui.add-rest`, `starui.add-mock`, `starui.add-appdata`
- **Layout & theme** — `starui.layout-preset`, `starui.save-layout`, `starui.theme-tokens`
- **OpenFin** — `starui.add-fdc3`, `starui.add-notifications`, `starui.add-workspace-setup`
- **Diagnostics** — `starui.fix-issues`, `starui.find-recipe`

Add a 22nd prompt by dropping a new file under `src/prompts/` and rebuilding — no other code changes.

---

## How to drive it (example prompts)

You can either invoke a prompt by name (`/starui.new-grid-app`) — the wizard fills in arguments, the AI calls the matching tool — **or** describe what you want in plain English and let the AI pick the tool. Both work. Below are realistic prompts for each workflow.

> Replace `~/projects/my-app` with your actual target path. Project names should be **kebab-case**, component names **PascalCase**, provider/grid ids **camelCase**.

### Create a new web app

```
Use the starui MCP to scaffold a new web app at ~/projects/positions-blotter
named "positions-blotter" on port 5180. Run npm install. Then walk me through
how to open it.
```

Or via prompt: `/starui.new-grid-app path=~/projects/positions-blotter name=positions-blotter port=5180`

### Create a new OpenFin workspace app

```
Scaffold an OpenFin workspace app at ~/projects/trading-floor named
"trading-floor" on port 5174. Enable ConfigService REST mode against
http://localhost:3001/api/v1. After install, remind me how to launch
OpenFin against the manifest.
```

Or via prompt: `/starui.new-workspace-app path=~/projects/trading-floor name=trading-floor port=5174 useConfigServiceRest=true`

### Add a MarketsGrid blotter to an existing app

```
In ~/projects/trading-floor, add a new MarketsGrid view at /blotters/positions
with grid id "positions-eod". Confirm with me before touching main.tsx.
```

Or: `/starui.add-blotter path=~/projects/trading-floor gridId=positions-eod route=/blotters/positions`

### Add a data provider

**STOMP (uses the bundled stomp-view-server):**

```
Add a STOMP data provider called "positions" to ~/projects/trading-floor,
destination /topic/positions. Then tell me how to run the bundled server.
```

Or: `/starui.add-stomp path=~/projects/trading-floor id=positions destination=/topic/positions`

**REST:**

```
Add a REST data provider "trades" pointing at
https://api.internal/trades?asOf=today to ~/projects/trading-floor.
```

Or: `/starui.add-rest path=~/projects/trading-floor id=trades url=https://api.internal/trades`

**Mock (for prototyping without a backend):**

```
Add a Mock data provider "orders" to ~/projects/trading-floor, dataType=orders.
```

Or: `/starui.add-mock path=~/projects/trading-floor id=orders dataType=orders`

**AppData (reads from another provider's snapshot):**

```
Add an AppData provider "positionsSnapshot" to ~/projects/trading-floor
sourced from "positions". Walk me through adding templateVariables for
{{positionsSnapshot.asOfDate}} when I wire a historical grid.
```

Or: `/starui.add-appdata path=~/projects/trading-floor id=positionsSnapshot dataSource=positions`

### Add a popout window

```
Add a ProviderEditor popout at /popouts/providerEditor to
~/projects/trading-floor, 1200x800. Then show me a sample call site
that opens it from a blotter view.
```

Or: `/starui.add-popout path=~/projects/trading-floor name=ProviderEditor route=/popouts/providerEditor width=1200 height=800`

### Add a lazy-loaded OpenFin view

```
Add a Reports view at /views/reports to ~/projects/trading-floor.
Don't change main.tsx silently — show me the diff first.
```

Or: `/starui.add-view path=~/projects/trading-floor name=Reports route=/views/reports`

### Generate a starui-compliant React component

```
Create a PortfolioSummary panel component in ~/projects/positions-blotter
that consumes the runtime port and data services. Then show me where to
import it.
```

Or: `/starui.new-component path=~/projects/positions-blotter name=PortfolioSummary kind=panel with=runtime,dataServices`

### Audit an existing app

```
Run the starui audit on ~/projects/trading-floor and summarize the
findings by rule. For each error, propose a fix and let me decide.
```

Or: `/starui.audit-app path=~/projects/trading-floor`

### Refresh bundled @starui packages (after a monorepo bump)

After running `npm run propagate && npm run mcp:pack` in the starui monorepo to ship new `@starui/*` tarballs, refresh a downstream app:

```
Upgrade the bundled starui libs in ~/projects/trading-floor. Show me the
diff in package.json file: paths before running npm install.
```

Or: `/starui.upgrade path=~/projects/trading-floor`

To upgrade only specific packages:

```
Upgrade only @starui/markets-grid and @starui/grid-react in
~/projects/trading-floor.
```

### Use the resources directly

You can also ask the assistant to read the bundled docs:

```
Read the starui://gotchas resource and summarize the top 5 things to
avoid when writing a new MarketsGrid view.
```

```
Read starui://version-matrix and tell me whether ~/projects/trading-floor's
package.json drifts from the pinned versions.
```

```
Show me the file tree of starui://templates/openfin-react/tree so I know
what create_app will write.
```

### Compose tools in one ask

The AI will chain tools when you describe a full workflow:

```
Scaffold an openfin app at ~/projects/dx-trading named "dx-trading",
then add a marketsgrid view at /blotters/positions with grid id
"dx-positions", then add a STOMP provider called "positions". Pause
after each step so I can confirm.
```

---

## Troubleshooting

**"Tool 'create_app' is not registered yet" → the client is talking to an older tarball.**
Make sure `args` points at the most recent tarball (`ls -t mcp-dist/*.tgz | head -1`). Restart the client after editing the config.

**"Permission denied" launching the bin →**
Run `npm install --no-audit --no-fund <tarball>` in any folder once. The bin gets executable bits during install; running the tarball path directly via shell skips that.

**Scaffold fails with `ERESOLVE peer dependency` →**
Re-run `npm run propagate` at the starui monorepo root so `/libs/` has the latest tarballs, then `npm run mcp:pack` again, then re-add to your client config.

**OpenFin app starts but blank page →**
You need *two* terminals: one for `npm run dev` (Vite), another for `npm run client` (OpenFin Node launcher).

**inspect_app reports a false positive →**
Open the validator source at `src/lib/validate.ts` and either tighten the rule or add the file to the ignore list. PRs welcome.

---

## Architecture and design

Full design doc at [`/.claude/plans/i-want-to-build-adaptive-lovelace.md`](../../.claude/plans/i-want-to-build-adaptive-lovelace.md).

Templates: [`templates/web-react/`](templates/web-react/), [`templates/openfin-react/`](templates/openfin-react/).
Fragments (patches for `add_*` tools): [`fragments/`](fragments/).
Tool sources: [`src/tools/`](src/tools/).
Validator scanners: [`src/lib/validate.ts`](src/lib/validate.ts).
Prompt files: [`src/prompts/`](src/prompts/).
