# StarUI MCP Scaffold Server — Design Spec

**Status:** Approved  
**Date:** 2026-05-27  
**Authors:** Platform team + agent design session

---

## 1. Overview

Build **`@starui/mcp-scaffold`**, an MCP (Model Context Protocol) server that scaffolds **external-consumer React apps** for the StarUI / MarketsUI platform. Scaffolds are **clean, minimal, and well-documented** — distilled from canonical monorepo apps, not raw copies.

The MCP server is distributed as an **npm tarball**, runnable via **`npx`**, and installable in **VS Code**, **Cursor**, and **Claude Code**.

### Goals

1. Scaffold five app templates matching tutorial and reference patterns.
2. Ship every app with **`libs/` StarUI tarballs** (self-contained tarball consumer).
3. Include **`stomp-view-server/`** for all data-provider templates.
4. Expose a **rich MarketsGrid feature picker** so users opt in/out of grid capabilities.
5. Enforce **100% design-system adherence** and **shadcn-only UI** (`@starui/ui`).
6. Include **AG Grid theme objects** from `@starui/design-system/adapters/ag-grid`.
7. Provide **full OpenFin reference** template with launcher, route-hosted MarketsGrid, and component registration walkthrough.

### Non-goals (v1)

- Angular app scaffolding.
- In-monorepo workspace `"*"` app scaffolding.
- npm registry publish automation (tarball + optional manual publish only).
- Live code generation beyond scaffold + optional UI component recipes.

---

## 2. Locked decisions

| Area | Decision |
|------|----------|
| Consumer model | **External tarball apps only** — `file:libs/*.tgz` deps |
| Tarballs in scaffold | **`libs/` folder** with `manifest.json` + all bucket tarballs |
| Tarball source at scaffold time | **Local propagate preferred** (`STARUI_ROOT`); **bundled fallback** inside MCP package |
| OpenFin template | **Full reference** (`markets-ui-react-reference` parity) with `launch.mjs` |
| STOMP dev server | **Copied** into scaffold as `stomp-view-server/` |
| MCP distribution | **Tarball** in `libs/starui-mcp-scaffold-*.tgz`; **`npx -y @starui/mcp-scaffold`** |
| Template engine | **Fragment composition** — small fragments composed per template manifest |
| Design system | **Mandatory** on every scaffold |
| AG Grid theme | Platform themes from **`@starui/design-system/adapters/ag-grid`** — no custom `themeQuartz.withParams` |
| App UI components | **shadcn via `@starui/ui` only** — no native `<input>` / `<textarea>` / `<select>` |
| Documentation | **Strong README** + **precise inline comments** on non-obvious wiring |

---

## 3. Architecture

### 3.1 Monorepo layout

```
tools/mcp-scaffold/                 # MCP server source
├── package.json                    # @starui/mcp-scaffold, bin entry
├── tsconfig.json
├── src/
│   ├── index.ts                    # stdio MCP entry (#!/usr/bin/env node)
│   ├── server.ts                   # McpServer registration
│   ├── tools/
│   │   ├── listTemplates.ts
│   │   ├── listGridFeatures.ts
│   │   ├── listUiComponents.ts
│   │   ├── scaffoldApp.ts
│   │   ├── addUiComponent.ts
│   │   ├── validateScaffold.ts
│   │   ├── validateDesignCompliance.ts
│   │   └── printInstallConfig.ts
│   ├── lib/
│   │   ├── tarballResolver.ts
│   │   ├── fragmentComposer.ts
│   │   ├── templateEngine.ts
│   │   ├── designLinter.ts
│   │   └── portAllocator.ts
│   └── resources/
│       ├── uiRecipes.ts
│       └── gridFeatureCatalog.ts
├── templates/
│   ├── fragments/                  # composable file fragments
│   │   ├── core/                   # vite, tsconfig, postcss, package.json base
│   │   ├── design-system/          # globals.css, tailwind, theme boot
│   │   ├── libs/                   # manifest.json placeholder
│   │   ├── data/                   # dataServices.ts, provider seed
│   │   ├── grid/                   # MarketsGrid / HostedMarketsGrid shells
│   │   ├── shell/                  # single-page, tabs, dock
│   │   ├── openfin/                # manifest, provider, launch.mjs, seed-config
│   │   ├── stomp-server/           # stomp-view-server copy source
│   │   └── ui/                     # HelpSheet, AppMenubar, StatusStrip recipes
│   └── manifests/
│       ├── basic.json
│       ├── mockdata-provider.json
│       ├── dataprovider-editor.json
│       ├── stomp.json
│       └── openfin-platform.json
└── bundled-libs/                   # populated at pack time (gitignored)
    ├── manifest.json
    └── starui-*.tgz

scripts/pack-mcp-scaffold.mjs       # propagate → copy libs → npm pack → libs/
libs/starui-mcp-scaffold-*.tgz      # deliverable tarball
```

### 3.2 Fragment composition flow

```
starui_scaffold_app({ template, outputDir, gridFeatures, ... })
  │
  ├─ 1. Resolve template manifest (fragments + variables)
  ├─ 2. Resolve StarUI tarballs (propagate | bundled)
  ├─ 3. Compose fragments → render Handlebars variables
  ├─ 4. Copy stomp-view-server/ (if template includes data plane)
  ├─ 5. Copy libs/*.tgz + manifest.json
  ├─ 6. Run design compliance linter
  ├─ 7. Write README from template-specific generator
  └─ 8. Return summary + next steps (npm ci, dev, openfin client)
```

### 3.3 MCP transport

- **Transport:** stdio only (v1).
- **SDK:** `@modelcontextprotocol/sdk` + `zod` for tool input schemas.
- **Entry:** `npx -y @starui/mcp-scaffold` → `dist/index.js`.

---

## 4. Distribution & installation

### 4.1 Package metadata

```json
{
  "name": "@starui/mcp-scaffold",
  "version": "0.1.0",
  "bin": {
    "starui-mcp-scaffold": "./dist/index.js"
  },
  "files": ["dist", "templates", "bundled-libs", "README.md"],
  "engines": { "node": ">=20" }
}
```

### 4.2 Pack pipeline

Root script:

```bash
npm run pack:mcp
# → node scripts/pack-mcp-scaffold.mjs
#   1. npm run propagate (unless --skip-propagate)
#   2. cp libs/starui-*.tgz → tools/mcp-scaffold/bundled-libs/
#   3. cd tools/mcp-scaffold && npm run build && npm pack
#   4. mv *.tgz → libs/starui-mcp-scaffold-<version>-<sha>.tgz
```

### 4.3 npx usage

```bash
# From npm registry (when published)
npx -y @starui/mcp-scaffold

# From local tarball
npx -y ./libs/starui-mcp-scaffold-0.1.0-abc12345.tgz

# With local StarUI checkout for fresh platform tarballs at scaffold time
STARUI_ROOT=/path/to/starui npx -y @starui/mcp-scaffold
```

### 4.4 IDE configuration snippets

**Cursor / Claude Code / Claude Desktop** (`mcpServers` root key):

```json
{
  "mcpServers": {
    "starui-scaffold": {
      "command": "npx",
      "args": ["-y", "@starui/mcp-scaffold"],
      "env": {
        "STARUI_ROOT": "/optional/path/to/starui"
      }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`, `servers` root key + `type: stdio`):

```json
{
  "servers": {
    "starui-scaffold": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@starui/mcp-scaffold"],
      "env": {
        "STARUI_ROOT": "/optional/path/to/starui"
      }
    }
  }
}
```

**Claude Code CLI:**

```bash
claude mcp add starui-scaffold -- npx -y @starui/mcp-scaffold
```

Tool **`starui_print_install_config`** returns all three snippets with optional detected `STARUI_ROOT`.

### 4.5 Environment variables

| Variable | Purpose |
|----------|---------|
| `STARUI_ROOT` | Monorepo path; run propagate before scaffold |
| `STARUI_SCAFFOLD_OUTPUT` | Default output directory |
| `STARUI_TARBALL_SOURCE` | `bundled` \| `propagate` \| absolute path to libs |

---

## 5. Template catalog

| Template ID | Canonical source | Grid | Data plane | Shell |
|-------------|------------------|------|------------|-------|
| `basic` | `apps/tarball/basic` | `MarketsGrid` + static data | None | Single page |
| `mockdata-provider` | `apps/tarball/mockdata-provider` | `MarketsGrid` ×1 | Mock via SharedWorker | Single panel (no dock) |
| `dataprovider-editor` | `apps/tarball/dataprovider-editor` | `HostedMarketsGrid` | SharedWorker + editor | Tabs (grid + editor) |
| `stomp` | `apps/tarball/stomp` | `HostedMarketsGrid` | STOMP + `ensureStompProvider` | Tabs + seeded provider |
| `openfin-platform` | `apps/tarball/markets-ui-react-reference` | `HostedMarketsGrid` on route | Full DataServices + ConfigManager | Full OpenFin platform |

All templates include the **design-system fragment**. Data-provider templates include **`stomp-view-server/`**.

### 5.1 Scaffold output layout (typical)

```
my-trading-app/
├── README.md
├── package.json              # file:libs/starui-*.tgz
├── libs/
│   ├── manifest.json
│   └── starui-*.tgz
├── stomp-view-server/        # data-provider templates only
├── launch.mjs                # openfin-platform only
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── index.html                # data-theme="dark"
├── public/                   # openfin-platform
│   ├── platform/manifest.fin.json
│   ├── seed-config.json
│   └── views/*.fin.json
└── src/
    ├── main.tsx
    ├── globals.css
    ├── dataServices.ts       # when SharedWorker needed
    ├── App.tsx
    ├── platform/Provider.tsx # openfin-platform
    └── views/...
```

---

## 6. MCP tools

### 6.1 `starui_list_templates`

Returns template metadata: id, description, port default, required fragments, included packages, whether STOMP server is bundled.

### 6.2 `starui_list_grid_features`

Returns grouped MarketsGrid / HostedMarketsGrid toggles with defaults per template. JSON Schema enums for agent UI.

**Groups:**

| Group | Options |
|-------|---------|
| Toolbars | `showFiltersToolbar`, `showFormattingToolbar`, `showEditingToolbar`, editing segments (`smartEdit`, `bulkUpdate`, `editHistory`), `showSaveButton`, `showSettingsButton`, `showProfileSelector`, `showVisualExcelExport`, `showToolbar` |
| Chrome | `sideBar`, `statusBar` |
| Hosting | `withStorage`, `dataServicesMode` (`eager` \| `lazy`), `historicalDateAppDataRef`, `onEditProvider` popout |
| AG Grid theme variant | `default` \| `blotter` \| `comfort` (maps to design-system adapter exports) |
| Modules (advanced) | Subset of `DEFAULT_MODULES` to include/exclude |
| Persistence | `localStorage` (basic) \| `configManager` (hosted/openfin) |

### 6.3 `starui_list_ui_components`

Returns `@starui/ui` export catalog (Button, Sheet, Tabs, …) for agent component selection.

### 6.4 `starui_scaffold_app` (primary)

**Inputs:**

```typescript
{
  template: 'basic' | 'mockdata-provider' | 'dataprovider-editor' | 'stomp' | 'openfin-platform';
  appName: string;           // kebab-case, used for folder + package name
  outputDir: string;         // absolute path
  port?: number;             // auto-allocated if omitted
  gridFeatures?: GridFeatureOverrides;
  staruiRoot?: string;       // overrides STARUI_ROOT env
  includeUiRecipes?: ('help-sheet' | 'app-menubar' | 'status-strip' | 'theme-toggle')[];
}
```

**Outputs:** `{ success, outputPath, devCommand, openfinCommand?, stompCommand?, warnings[] }`

### 6.5 `starui_add_ui_component`

Adds a UI component file to an existing scaffold using shadcn recipes only.

**Inputs:** `{ projectDir, component: 'help-sheet' | 'app-menubar' | 'status-strip' | 'settings-dialog' | 'theme-toggle' | 'config-inspector', targetPath? }`

### 6.6 `starui_validate_scaffold`

Runs `npm ci`, `npm run typecheck` in scaffold output (optional `skipInstall`).

### 6.7 `starui_validate_design_compliance`

Scans project for design-system violations (see §7).

### 6.8 `starui_print_install_config`

Returns IDE-specific MCP JSON snippets.

### 6.9 MCP resources

| URI | Content |
|-----|---------|
| `starui://templates` | Template catalog JSON |
| `starui://grid-features` | Full feature catalog |
| `starui://ui-recipes` | Component recipe → shadcn mapping |
| `starui://design-rules` | Token + shadcn enforcement rules |

---

## 7. Design system & UI compliance

### 7.1 Mandatory packages (every scaffold)

| Tarball bucket | npm name | Purpose |
|----------------|----------|---------|
| design-system | `@starui/design-system` | Tokens, CSS, Tailwind preset, AG Grid themes |
| react-ui | `@starui/ui` | shadcn primitives |
| react-grid | `@starui/grid` | MarketsGrid + styles |
| shared | `@starui/engine`, `@starui/shared-types`, … | As required by template |
| data | `@starui/host-data`, `@starui/host-data-react` | Data-provider templates |
| react-core | `@starui/app`, `@starui/widgets-react`, … | Hosted / OpenFin templates |

### 7.2 Mandatory bootstrap (design-system fragment)

**`index.html`:** `<html lang="en" data-theme="dark">`

**`src/main.tsx`:**

```typescript
import { applyTheme, getTheme } from '@starui/design-system';
applyTheme(getTheme());
```

**`src/globals.css`:**

```css
@import '@starui/design-system/css';
@import '@starui/grid/styles.css';
/* Tailwind layers + token-based body styles — no hardcoded hex */
```

**`tailwind.config.js`:**

```javascript
import { tailwindPreset } from '@starui/design-system/tailwind';
export default { presets: [tailwindPreset], content: ['./index.html', './src/**/*.{ts,tsx}'] };
```

### 7.3 AG Grid theme

MarketsGrid uses `useGridTheme()` internally:

```typescript
import { agGridDarkTheme, agGridLightTheme } from '@starui/design-system/adapters/ag-grid';
```

Scaffolds **must not** define custom Quartz params. Optional MCP toggle selects variant:

| Variant | Exports |
|---------|---------|
| `default` | `agGridDarkTheme` / `agGridLightTheme` (via `theme="auto"` or hook) |
| `blotter` | `agGridBlotterDarkTheme` / `agGridBlotterLightTheme` |
| `comfort` | `agGridComfortDarkTheme` / `agGridComfortLightTheme` |

Theme follows `[data-theme]` on `<html>` — flipped by `applyTheme()`.

### 7.4 Enforcement rules

| Rule | Linter check |
|------|--------------|
| No hardcoded colors | Reject `#`, `rgb(`, `hsl(` in generated `.tsx`/`.css` (except `@import`) |
| Token-only surfaces | Require `var(--ds-*)` or Tailwind preset classes for custom layout |
| Dark + light | `data-theme` on `<html>`; README documents theme toggle |
| No native form elements | Reject `<input`, `<textarea`, `<select` in generated TSX |
| shadcn only for app chrome | All shell UI imports from `@starui/ui` |
| No custom grid CSS | Grid chrome from MarketsGrid only |

Violations block scaffold completion unless `force: true` (dev-only escape hatch).

### 7.5 UI component recipes

| Recipe ID | shadcn building blocks | Reference |
|-----------|------------------------|-----------|
| `help-sheet` | Sheet, Tabs, ScrollArea, Badge, Separator | `basic/HelpSheet.tsx` |
| `app-menubar` | Menubar, DropdownMenu | `basic/AppMenubar.tsx` |
| `status-strip` | Badge + token layout | `basic/StatusStrip.tsx` |
| `theme-toggle` | Button + `applyTheme()` | `basic/App.tsx` |
| `settings-dialog` | Dialog, Switch, Label, Select, Button | — |
| `config-inspector` | Sheet, ScrollArea, Badge | `basic/ConfigInspector.tsx` |

---

## 8. OpenFin reference template

Scaffolds full parity with `apps/tarball/markets-ui-react-reference`:

1. **`launch.mjs`** + `"client": "node launch.mjs http://localhost:<port>/platform/manifest.fin.json"`
2. **`public/platform/manifest.fin.json`** — provider URL, platform UUID, customSettings
3. **`public/seed-config.json`** — roles, permissions, appRegistry, userProfiles
4. **Three-tier routing** in `src/main.tsx`:
   - `/platform/provider` → `initWorkspace()`
   - Tool routes: `/dataproviders`, `/config-browser`, `/workspace-setup`, `/import-config`, `/rename-view-tab`
   - View routes: `/blotters/marketsgrid` wrapped in `StarGridApp`
5. **`BlottersMarketsGrid.tsx`** — commented walkthrough: route → lazy chunk → `HostedMarketsGrid` → ConfigManager profile key `(appId, userId, instanceId)`
6. **FDC3 View1/View2** demos, Provider chunk prefetch, `dataProvidersPopout.ts`
7. **README section:** “How MarketsGrid is hosted and registered as a component”

Default grid features match reference: filters + formatting toolbars; no sidebar/statusBar unless user opts in.

---

## 9. Tarball resolution

```
resolveTarballs({ staruiRoot?, source? })
  │
  ├─ if staruiRoot && propagate succeeds
  │    → exec npm run propagate in staruiRoot
  │    → return libs/*.tgz + manifest.json
  │
  ├─ else if STARUI_TARBALL_SOURCE is absolute path
  │    → copy from that libs/ directory
  │
  └─ else
       → copy from MCP bundled-libs/
       → warn: "Using bundled StarUI <version> — set STARUI_ROOT for latest"
```

Scaffolded app's `package.json` uses `file:libs/<filename>.tgz` entries matching `manifest.json` members.

---

## 10. README & comment standards

Every scaffold includes a **README.md** with:

1. Prerequisites (Node 20+, npm 10)
2. Install: `npm ci`
3. Dev: `npm run dev` (+ port)
4. STOMP: `npm run dev:stomp` (when applicable)
5. OpenFin: `npm run client` (openfin-platform)
6. Architecture diagram (ASCII or mermaid)
7. File index — what each key file does
8. Theme architecture — `applyTheme` → `[data-theme]` → AG Grid theme
9. “Where to edit” guide

**Comment standard:**

- File header: purpose, dependencies, extension points
- Inline: only non-obvious wiring (routing tiers, SharedWorker bootstrap, provider seed, OpenFin identity)

Tutorial templates target **15–25 source files**. OpenFin template is larger but every file is indexed in README.

---

## 11. Testing & validation

| Layer | Tests |
|-------|-------|
| MCP unit | Fragment composer, tarball resolver, design linter, template manifests |
| MCP integration | Scaffold each template to temp dir → `npm ci` → `typecheck` |
| Design compliance | Golden files must pass linter; inject violation fixtures must fail |
| Manual | OpenFin client launch, STOMP stream on positions blotter |

CI (future): `npm run test --workspace=@starui/mcp-scaffold` + scaffold smoke script.

---

## 12. Documentation updates

On implementation completion, update:

- `docs/current-features.md` — add `@starui/mcp-scaffold` bullet
- `README.md` — MCP scaffold section with install snippets
- `docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md` — link to MCP as preferred scaffold path

---

## 13. Success criteria

1. `npx -y ./libs/starui-mcp-scaffold-*.tgz` starts MCP server on stdio.
2. Agent can scaffold all five templates with feature picker.
3. Scaffolded app passes `npm ci && npm run typecheck`.
4. Design linter reports zero violations on generated output.
5. OpenFin template launches via `npm run client` against local Vite dev server.
6. STOMP template streams data from bundled `stomp-view-server` on `:8081`.
7. README + comments enable a new developer to understand architecture without reading monorepo docs.
