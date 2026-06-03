# StarUI MCP Scaffold Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@starui/mcp-scaffold` — an MCP server packaged as a tarball, runnable via `npx`, that scaffolds external-consumer StarUI React apps with bundled `libs/` tarballs, design-system compliance, shadcn-only UI, AG Grid themes, STOMP server, and a full OpenFin reference template.

**Architecture:** Fragment-composition template engine in `tools/mcp-scaffold/`; MCP stdio server exposing scaffold/validate/list tools; pack pipeline copies propagate tarballs into `bundled-libs/` and emits `libs/starui-mcp-scaffold-*.tgz`.

**Tech Stack:** Node 20+, `@modelcontextprotocol/sdk`, `zod`, `handlebars`, TypeScript, Vitest. Scaffold output: Vite 7, React 19.2, StarUI tarball deps, `@starui/design-system/adapters/ag-grid`.

**Spec:** [`../specs/2026-05-27-starui-mcp-scaffold-design.md`](../specs/2026-05-27-starui-mcp-scaffold-design.md)

---

## File map (created/modified)

| Path | Responsibility |
|------|----------------|
| `tools/mcp-scaffold/package.json` | MCP package, bin, deps |
| `tools/mcp-scaffold/src/index.ts` | stdio entry |
| `tools/mcp-scaffold/src/server.ts` | Tool + resource registration |
| `tools/mcp-scaffold/src/lib/fragmentComposer.ts` | Manifest → files on disk |
| `tools/mcp-scaffold/src/lib/tarballResolver.ts` | propagate / bundled / path |
| `tools/mcp-scaffold/src/lib/designLinter.ts` | Token + shadcn enforcement |
| `tools/mcp-scaffold/src/lib/templateEngine.ts` | Handlebars render |
| `tools/mcp-scaffold/src/tools/*.ts` | MCP tool handlers |
| `tools/mcp-scaffold/templates/fragments/**` | Source fragments |
| `tools/mcp-scaffold/templates/manifests/*.json` | Template definitions |
| `scripts/pack-mcp-scaffold.mjs` | Pack pipeline |
| `package.json` (root) | `"pack:mcp"` script, workspace entry |
| `docs/current-features.md` | Feature bullet |
| `README.md` | MCP install section |

---

### Task 1: MCP package bootstrap

**Files:**
- Create: `tools/mcp-scaffold/package.json`
- Create: `tools/mcp-scaffold/tsconfig.json`
- Create: `tools/mcp-scaffold/src/index.ts`
- Create: `tools/mcp-scaffold/vitest.config.ts`
- Modify: root `package.json` — add `"tools/mcp-scaffold"` to workspaces (or `"tools/*"` if glob exists)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@starui/mcp-scaffold",
  "version": "0.1.0",
  "description": "MCP server for scaffolding StarUI React apps",
  "type": "module",
  "bin": {
    "starui-mcp-scaffold": "./dist/index.js"
  },
  "files": ["dist", "templates", "bundled-libs", "README.md"],
  "scripts": {
    "build": "rimraf dist && tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "prepack": "npm run build"
  },
  "engines": { "node": ">=20" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.11.0",
    "handlebars": "^4.7.8",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "rimraf": "^6.0.0",
    "typescript": "~5.9.3",
    "vitest": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create stdio entry**

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createStaruiMcpServer } from './server.js';

async function main() {
  const server = createStaruiMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('[starui-mcp-scaffold] fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Add root workspace + script**

In root `package.json` workspaces array add `"tools/mcp-scaffold"` and script:

```json
"pack:mcp": "node scripts/pack-mcp-scaffold.mjs"
```

- [ ] **Step 5: Install and verify build**

Run: `npm ci && npm run build --workspace=@starui/mcp-scaffold`  
Expected: `dist/index.js` exists

---

### Task 2: MCP server + stub tools

**Files:**
- Create: `tools/mcp-scaffold/src/server.ts`
- Create: `tools/mcp-scaffold/src/tools/listTemplates.ts`
- Create: `tools/mcp-scaffold/src/tools/scaffoldApp.ts` (stub)
- Create: `tools/mcp-scaffold/templates/manifests/basic.json`

- [ ] **Step 1: Write failing test for listTemplates**

Create `tools/mcp-scaffold/src/tools/listTemplates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { listTemplates } from './listTemplates.js';

describe('listTemplates', () => {
  it('returns five templates', () => {
    const result = listTemplates();
    expect(result).toHaveLength(5);
    expect(result.map((t) => t.id)).toContain('basic');
    expect(result.map((t) => t.id)).toContain('openfin-platform');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm run test --workspace=@starui/mcp-scaffold`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement listTemplates**

```typescript
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  defaultPort: number;
  includesStompServer: boolean;
  includesOpenFin: boolean;
}

const TEMPLATES: TemplateInfo[] = [
  { id: 'basic', name: 'Basic MarketsGrid', description: 'Static rowData, localStorage profiles', defaultPort: 5194, includesStompServer: false, includesOpenFin: false },
  { id: 'mockdata-provider', name: 'Mock Data Provider', description: 'SharedWorker mock stream', defaultPort: 5192, includesStompServer: true, includesOpenFin: false },
  { id: 'dataprovider-editor', name: 'Data Provider Editor', description: 'HostedMarketsGrid + editor tabs', defaultPort: 5193, includesStompServer: true, includesOpenFin: false },
  { id: 'stomp', name: 'STOMP Streaming', description: 'HostedMarketsGrid + STOMP seed', defaultPort: 5200, includesStompServer: true, includesOpenFin: false },
  { id: 'openfin-platform', name: 'OpenFin Platform', description: 'Full reference platform app', defaultPort: 5174, includesStompServer: true, includesOpenFin: true },
];

export function listTemplates(): TemplateInfo[] {
  return TEMPLATES;
}
```

- [ ] **Step 4: Register tools in server.ts**

Wire `starui_list_templates`, `starui_scaffold_app` (returns "not implemented"), using MCP SDK `server.tool(...)`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npm run test --workspace=@starui/mcp-scaffold`

---

### Task 3: Design-system fragment + linter

**Files:**
- Create: `tools/mcp-scaffold/templates/fragments/design-system/globals.css.hbs`
- Create: `tools/mcp-scaffold/templates/fragments/design-system/main-theme-boot.ts.hbs`
- Create: `tools/mcp-scaffold/templates/fragments/design-system/tailwind.config.js.hbs`
- Create: `tools/mcp-scaffold/templates/fragments/design-system/index.html.hbs`
- Create: `tools/mcp-scaffold/src/lib/designLinter.ts`
- Create: `tools/mcp-scaffold/src/lib/designLinter.test.ts`

- [ ] **Step 1: Write failing linter test**

```typescript
import { describe, it, expect } from 'vitest';
import { lintDesignCompliance } from './designLinter.js';

describe('designLinter', () => {
  it('flags hardcoded hex', () => {
    const violations = lintDesignCompliance([{ path: 'App.tsx', content: '<div style={{ color: "#fff" }} />' }]);
    expect(violations.some((v) => v.rule === 'no-hardcoded-color')).toBe(true);
  });

  it('flags native input', () => {
    const violations = lintDesignCompliance([{ path: 'Form.tsx', content: '<input type="text" />' }]);
    expect(violations.some((v) => v.rule === 'no-native-form-elements')).toBe(true);
  });

  it('passes token-based styles', () => {
    const violations = lintDesignCompliance([
      { path: 'App.tsx', content: "import { Button } from '@starui/ui';\n<div style={{ color: 'var(--ds-text-primary)' }}><Button/></div>" },
    ]);
    expect(violations).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement designLinter.ts**

Rules: `no-hardcoded-color`, `no-native-form-elements`, `require-design-system-css-import` (for globals.css).

- [ ] **Step 3: Add fragment templates**

`globals.css.hbs`:

```css
@import '@starui/design-system/css';
@import '@starui/grid/styles.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html, body, #root { height: 100%; margin: 0; padding: 0; }
  body {
    background: var(--ds-surface-ground);
    color: var(--ds-text-primary);
    font-family: var(--ds-font-sans), -apple-system, sans-serif;
    font-size: var(--ds-font-size-body);
    -webkit-font-smoothing: antialiased;
  }
}
```

`main-theme-boot.ts.hbs` — prepend to every `main.tsx`:

```typescript
import { applyTheme, getTheme } from '@starui/design-system';
applyTheme(getTheme());
```

- [ ] **Step 4: Run tests — expect PASS**

---

### Task 4: Fragment composer + template engine

**Files:**
- Create: `tools/mcp-scaffold/src/lib/templateEngine.ts`
- Create: `tools/mcp-scaffold/src/lib/fragmentComposer.ts`
- Create: `tools/mcp-scaffold/src/lib/fragmentComposer.test.ts`
- Create: `tools/mcp-scaffold/templates/manifests/basic.json`

- [ ] **Step 1: Define basic manifest**

```json
{
  "id": "basic",
  "fragments": [
    "core/package.json",
    "core/vite.config.ts",
    "core/tsconfig.json",
    "core/postcss.config.js",
    "design-system/index.html",
    "design-system/globals.css",
    "design-system/tailwind.config.js",
    "grid/markets-grid-static-app.tsx",
    "grid/bond-columns.ts",
    "grid/mock-bonds.ts",
    "readme/basic.md"
  ],
  "variables": {
    "port": 5194,
    "worker": false,
    "packages": ["design-system", "react-ui", "react-grid", "shared"]
  }
}
```

- [ ] **Step 2: Write failing compose test**

Test composes `basic` manifest to temp dir; assert `src/globals.css` contains `@starui/design-system/css`.

- [ ] **Step 3: Implement fragmentComposer**

- Load manifest JSON
- For each fragment, read `.hbs` or static file from `templates/fragments/`
- Render Handlebars with `{ appName, port, packageName, gridFeatures, tarballDeps }`
- Write to outputDir preserving relative paths

- [ ] **Step 4: Run tests — expect PASS**

---

### Task 5: Tarball resolver + pack script

**Files:**
- Create: `tools/mcp-scaffold/src/lib/tarballResolver.ts`
- Create: `tools/mcp-scaffold/src/lib/tarballResolver.test.ts`
- Create: `scripts/pack-mcp-scaffold.mjs`
- Create: `tools/mcp-scaffold/.gitignore` — `bundled-libs/`

- [ ] **Step 1: Implement tarballResolver**

```typescript
export interface TarballBundle {
  manifestPath: string;
  tarballs: { filename: string; absolutePath: string }[];
  source: 'propagate' | 'bundled' | 'path';
  warnings: string[];
}

export async function resolveTarballs(opts: {
  staruiRoot?: string;
  tarballSource?: string;
  bundledLibsDir: string;
}): Promise<TarballBundle>;
```

Logic per spec §9: try propagate → path override → bundled fallback.

- [ ] **Step 2: Implement pack-mcp-scaffold.mjs**

```javascript
#!/usr/bin/env node
// 1. npm run propagate (unless --skip-propagate)
// 2. cp REPO_ROOT/libs/starui-*.tgz + manifest.json → tools/mcp-scaffold/bundled-libs/
// 3. npm run build --workspace=@starui/mcp-scaffold
// 4. npm pack in tools/mcp-scaffold
// 5. mv starui-mcp-scaffold-*.tgz → libs/starui-mcp-scaffold-<version>-<sha>.tgz
```

- [ ] **Step 3: Test resolver with mocked bundled-libs**

- [ ] **Step 4: Dry-run pack script**

Run: `node scripts/pack-mcp-scaffold.mjs --dry-run`

---

### Task 6: Grid feature catalog + list tool

**Files:**
- Create: `tools/mcp-scaffold/src/resources/gridFeatureCatalog.ts`
- Create: `tools/mcp-scaffold/src/tools/listGridFeatures.ts`
- Create: `tools/mcp-scaffold/src/tools/listGridFeatures.test.ts`

- [ ] **Step 1: Define catalog** matching `MarketsGridProps` / `HostedMarketsGridProps` toggles from `packages/react-grid/grid/src/widget/types.ts`

Groups: toolbars, chrome, hosting, agGridThemeVariant, modules, persistence.

- [ ] **Step 2: Implement `starui_list_grid_features` tool** returning catalog + defaults per template id.

- [ ] **Step 3: Unit test defaults** — `basic` has `persistence: localStorage`; `stomp` has `withStorage: true`.

---

### Task 7: Core fragments (vite, package.json)

**Files:**
- Create: `tools/mcp-scaffold/templates/fragments/core/package.json.hbs`
- Create: `tools/mcp-scaffold/templates/fragments/core/vite.config.ts.hbs`
- Create: `tools/mcp-scaffold/templates/fragments/core/tsconfig.json`
- Create: `tools/mcp-scaffold/templates/fragments/core/postcss.config.js`

- [ ] **Step 1: package.json.hbs** — generate `file:libs/{{tarballFilename}}` deps from manifest members; include `@starui/design-system`, `@starui/ui`, `@starui/grid`, ag-grid 35.1.0, react 19.2.5.

- [ ] **Step 2: vite.config.ts.hbs** — inline `staruiConsumerVite.mjs` equivalent for **external** apps (copy minimal config from `apps/tarball/basic/vite.config.ts` — no monorepo-relative import; embed alias resolution or ship `scripts/staruiConsumerVite.mjs` as fragment):

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: {{port}}, open: true },
  {{#if worker}}worker: { format: 'es' },{{/if}}
  resolve: { /* starui tarball resolve aliases from bundled vite helper */ },
});
```

**Note:** External apps cannot import `../../scripts/staruiConsumerVite.mjs`. Ship `scaffold/vite/staruiConsumerVite.mjs` + `staruiConsumerAliases.mjs` as copied fragments (from `scripts/`).

- [ ] **Step 3: Verify composed basic template has valid package.json** with all tarball file: deps.

---

### Task 8: Basic template fragments

**Files:**
- Create: `tools/mcp-scaffold/templates/fragments/grid/markets-grid-static-app.tsx.hbs`
- Create: `tools/mcp-scaffold/templates/fragments/grid/bond-columns.ts`
- Create: `tools/mcp-scaffold/templates/fragments/grid/mock-bonds.ts`
- Create: `tools/mcp-scaffold/templates/fragments/readme/basic.md.hbs`
- Create: `tools/mcp-scaffold/templates/fragments/ui/help-sheet.tsx` (from tutorial, commented)

Source: distill `apps/tarball/basic/src/` — strip dock/extra panels; keep HelpSheet as optional `includeUiRecipes`.

- [ ] **Step 1: App.tsx.hbs** — `MarketsGrid` with `createMarketsGridLocalStorageStorage()`, grid feature flags from `{{gridFeatures}}`, imports from `@starui/grid`, `@starui/ui`, `@starui/design-system`.

- [ ] **Step 2: README** — architecture, theme section documenting `agGridDarkTheme`/`agGridLightTheme` via MarketsGrid `useGridTheme()`.

- [ ] **Step 3: Integration test** — scaffold basic → lint → assert file count < 30.

---

### Task 9: Data-provider fragments (SharedWorker + STOMP server)

**Files:**
- Create: `tools/mcp-scaffold/templates/fragments/data/dataServices.ts.hbs`
- Create: `tools/mcp-scaffold/templates/fragments/data/main-with-provider.tsx.hbs`
- Create: `tools/mcp-scaffold/templates/fragments/stomp-server/` — copy from `apps/tarball/stomp-view-server/` (exclude node_modules)

- [ ] **Step 1: Copy stomp-view-server** as static fragment (not .hbs); composer copies directory tree.

- [ ] **Step 2: dataServices.ts.hbs** — from `apps/tarball/stomp/src/dataServices.ts`:

```typescript
import { bootstrapDataServicesWithWorkerAsset } from '@starui/host-data';
import workerAssetUrl from '@starui/host-data/assets/data-services-worker.mjs?url';

export const dataServices = bootstrapDataServicesWithWorkerAsset(workerAssetUrl, {
  appName: '{{appName}}',
  userId: '{{userId}}',
});
```

- [ ] **Step 3: Add `dev:stomp` script** to package.json.hbs when `includesStompServer`.

---

### Task 10: mockdata-provider, dataprovider-editor, stomp manifests

**Files:**
- Create: manifests + fragments for each template
- Source: `apps/tarball/mockdata-provider`, `dataprovider-editor`, `stomp`

- [ ] **Step 1: mockdata-provider** — single `DirectGridPanel` OR `DataServicesGridPanel` (not both — cleaner default: DataServices path only; document direct path in README).

- [ ] **Step 2: dataprovider-editor** — tabs shell: `HostedGridPanel` + `ProviderEditorPanel`; SharedWorker; `worker: true`.

- [ ] **Step 3: stomp** — `ensureStompProvider.ts`, `positionsStomp.ts`, `PositionsBlotter.tsx` from tutorial; seed config pointing to `ws://localhost:8081`.

- [ ] **Step 4: Scaffold integration tests** for all three templates.

---

### Task 11: OpenFin platform template

**Files:**
- Create: `tools/mcp-scaffold/templates/manifests/openfin-platform.json`
- Create: `tools/mcp-scaffold/templates/fragments/openfin/**`
- Source: `apps/tarball/markets-ui-react-reference/`

- [ ] **Step 1: Copy + distill fragments:**

| Fragment | Source |
|----------|--------|
| `launch.mjs` | `markets-ui-react-reference/launch.mjs` |
| `manifest.fin.json.hbs` | `public/platform/manifest.fin.json` — parametrize port |
| `seed-config.json.hbs` | `public/seed-config.json` |
| `Provider.tsx` | `src/platform/Provider.tsx` |
| `main.tsx.hbs` | `src/main.tsx` — three-tier routing |
| `BlottersMarketsGrid.tsx` | `src/views/BlottersMarketsGrid.tsx` — heavy comments |
| `DataProviders.tsx` | `src/views/DataProviders.tsx` |
| `dataServices.mainThread.ts` | same |
| `dataProvidersPopout.ts` | same |
| View1/View2, ConfigBrowser, RenameViewTab | optional but included for full reference |

- [ ] **Step 2: package.json.hbs** — add OpenFin deps: `@openfin/core`, `@openfin/workspace`, `@openfin/workspace-platform`, `@openfin/notifications`, `@finos/fdc3`, `@openfin/node-adapter` (dev), `@starui/openfin-platform` tarball.

- [ ] **Step 3: README section** — “MarketsGrid route registration” explaining:
  - Route `/blotters/marketsgrid` → lazy `BlottersMarketsGrid`
  - `StarGridApp` shell wraps view routes
  - `HostedMarketsGrid` `componentName` + `defaultInstanceId` + `withStorage` → ConfigManager profile key
  - `seed-config.json` `appRegistry` entry

- [ ] **Step 4: Manual smoke** — scaffold → `npm ci` → `npm run dev` + `npm run client`.

---

### Task 12: UI recipes + addUiComponent tool

**Files:**
- Create: `tools/mcp-scaffold/src/resources/uiRecipes.ts`
- Create: `tools/mcp-scaffold/templates/fragments/ui/*.tsx`
- Create: `tools/mcp-scaffold/src/tools/addUiComponent.ts`
- Create: `tools/mcp-scaffold/src/tools/listUiComponents.ts`

- [ ] **Step 1: Copy distilled UI recipes** from `apps/tarball/basic/src/components/` with header comments.

- [ ] **Step 2: Implement `starui_add_ui_component`** — copies recipe to `src/components/`, runs design linter.

- [ ] **Step 3: Implement `starui_list_ui_components`** — exports from `@starui/ui` index (static list matching `packages/react-ui/ui/src/index.ts`).

---

### Task 13: scaffoldApp orchestrator + validate tools

**Files:**
- Modify: `tools/mcp-scaffold/src/tools/scaffoldApp.ts`
- Create: `tools/mcp-scaffold/src/tools/validateScaffold.ts`
- Create: `tools/mcp-scaffold/src/tools/validateDesignCompliance.ts`
- Create: `tools/mcp-scaffold/src/tools/printInstallConfig.ts`

- [ ] **Step 1: Implement full scaffoldApp flow** per spec §3.2

- [ ] **Step 2: validateDesignCompliance** — scan output dir, return violations

- [ ] **Step 3: validateScaffold** — optional `npm ci` + `typecheck` via `child_process.execSync`

- [ ] **Step 4: printInstallConfig** — return Cursor/VS Code/Claude snippets

- [ ] **Step 5: E2E test** — scaffold all 5 templates to `os.tmpdir()`, run design lint on each

---

### Task 14: Pack, docs, current-features

**Files:**
- Create: `tools/mcp-scaffold/README.md`
- Modify: `README.md`
- Modify: `docs/current-features.md`
- Modify: `docs/STOMP_DATAPROVIDER_MARKETSGRID_GUIDE.md` — MCP link

- [ ] **Step 1: Write MCP README** with npx usage, IDE configs, env vars, tool list

- [ ] **Step 2: Run full pack**

Run: `npm run pack:mcp`  
Expected: `libs/starui-mcp-scaffold-0.1.0-<sha>.tgz` exists

- [ ] **Step 3: Smoke MCP via npx**

Run: `npx -y ./libs/starui-mcp-scaffold-*.tgz` (stdio — verify no crash on startup)

- [ ] **Step 4: Update docs/current-features.md** — bullet under tooling:

```markdown
- **`@starui/mcp-scaffold`** (`tools/mcp-scaffold/`) — MCP server (tarball in `libs/`) scaffolds external-consumer React apps with bundled StarUI tarballs, design-system compliance, shadcn UI, AG Grid themes, STOMP server, OpenFin reference template
```

- [ ] **Step 5: Update root README.md** — “Scaffolding apps with MCP” section with install snippets

- [ ] **Step 6: Run verification**

Run: `npx turbo typecheck test --filter=@starui/mcp-scaffold`  
Expected: PASS

---

## Self-review checklist

| Spec section | Task |
|--------------|------|
| §3 Architecture | Tasks 1–2, 4 |
| §4 Distribution | Tasks 1, 5, 14 |
| §5 Templates | Tasks 8–11 |
| §6 MCP tools | Tasks 2, 6, 12, 13 |
| §7 Design system | Tasks 3, 7, 8 |
| §8 OpenFin | Task 11 |
| §9 Tarballs | Task 5 |
| §10 README | Tasks 8, 11, 14 |
| §11 Testing | Tasks 3, 4, 10, 13, 14 |

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-starui-mcp-scaffold.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach do you want?
