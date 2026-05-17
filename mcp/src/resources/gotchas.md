# StarUI Gotchas

A curated list of mistakes the reference apps have hit. The `inspect_app` tool checks for most of these automatically. Read this **before** generating non-trivial code or modifying scaffolded apps.

## Forbidden patterns (errors)

### Native form elements

**Do not use** `<input>`, `<select>`, or `<textarea>` directly in any `.tsx` file outside `@starui/ui` (the shadcn primitives). Always use the shadcn equivalent:

| Native | Use instead |
|---|---|
| `<input type="text">` | `<Input>` from `@starui/ui` |
| `<input type="checkbox">` | `<Checkbox>` |
| `<input type="radio">` | `<RadioGroup>` + `<RadioGroupItem>` |
| `<select>` | `<Select>` + `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>` |
| `<textarea>` | `<Textarea>` |

**Why:** Native form elements bypass the theme system, accessibility defaults, focus management, and the design-system token plumbing. Mixing them with shadcn-themed surrounding UI gives a janky, half-themed look.

### Cross-framework imports

React packages must not import from `@angular/*`. Angular packages must not import from React packages. Sibling adapters (`@starui/widgets-react` ↔ `@starui/widgets-angular`) must never import each other.

**Why:** They have different runtimes, different change-detection models, and different lifecycle semantics. Cross-imports break tree-shaking and produce unpredictable build output.

### Banned dependency managers

This monorepo and every scaffolded app use **npm 10 workspaces** exclusively. Never `pnpm`, never `yarn`.

**Why:** Mixing managers produces conflicting `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` files that diverge on resolution, especially around `file:` dependencies. The tarball workflow assumes npm's `file:` semantics.

### Direct `window.open` / `fin.Window.create`

Don't reach for the native window-creation APIs in view code. Use `runtime.openSurface({ kind: 'popout', ... })` from the runtime port. The same call site works in browser (delegates to `window.open`) and OpenFin (delegates to `fin.Window.create`).

**Why:** Branching on `isOpenFin()` inside views couples them to the transport. The runtime port is the single seam.

## Strong warnings

### Hardcoded color literals

`#0066ff`, `rgb(...)`, named colors — all forbidden in `.tsx` and `.css` files. Use `var(--ds-*)` CSS variables or the semantic exports from `@starui/design-system/tokens/semantic`.

**Why:** Themes flip via `data-theme="dark|light"` on `<html>`. Hardcoded colors don't respond.

### Version drift from the framework matrix

Every starui-scaffolded app pins exactly:

- `react: ~19.2.5`, `react-dom: ~19.2.5`
- `ag-grid-community/enterprise/react: 35.1.0` (exact)
- `@openfin/core: 43.101.2` (exact, openfin apps only)
- `@openfin/workspace`, `@openfin/workspace-platform: 23.0.20`
- `typescript: ~5.9.3`
- `vite: ~7.3.2`
- `tailwindcss: 3.4.1`

Bump in lockstep across all `@starui/*` packages or not at all.

### Ad-hoc `isOpenFin()` branching in views

Calling `isOpenFin()` inside a view component is a red flag. The view should consume `useHost().runtime` and call `runtime.<api>` — the runtime port is what knows whether it's OpenFin or browser.

**Allowed:** `main.tsx` and `Provider.tsx` may branch on `isOpenFin()` once during runtime construction.

### Missing AppShell provider stack

OpenFin apps must wrap their non-provider routes with `<AppShell>`. The stack order is:

```
DataServicesProvider → ConfigServiceProvider → HostWrapper
```

`<AppShell>` collapses this. The `/platform/provider` route stays OUTSIDE — it IS the bootstrap.

### Tarball SHA mismatch

When you change a `@starui/*` package and re-run `npm run propagate`, the tarball's content-hash suffix changes. The `file:` paths in consumer apps must be updated. Always use `upgrade_libs` to refresh — it rewrites the paths and clears `node_modules/@starui/*` so npm re-extracts.

## Subtle traps

### Vite worker.format must be 'es'

The data-services SharedWorker uses dynamic `import("@stomp/stompjs")`. Vite's default IIFE worker format does not support code-splitting and will fail at build time. Set `worker: { format: 'es' }` in `vite.config.ts`.

### @stomp/stompjs ESM6 alias

The package's `exports` map puts `browser` (UMD) before `import` (ESM). Vite's module-mode SharedWorker bundler picks UMD and explodes with `require is not defined`. Alias the bare specifier to the ESM6 entry:

```ts
alias: [
  { find: /^@stomp\/stompjs$/, replacement: resolve(__dirname, "./node_modules/@stomp/stompjs/esm6/index.js") },
]
```

### File naming case sensitivity

Linux/CI builds are case-sensitive; macOS dev isn't. Stick to the case in `CLAUDE.md` (PascalCase for components/classes, camelCase for utilities, kebab-case only in `@starui/ui` shadcn subtrees and Angular packages).

### ConfigManager singleton vs per-window

The OpenFin platform Provider window owns a **single** ConfigManager bootstrapped by `initWorkspace()`. Every view window has its OWN per-window ConfigClient that connects back to the platform via `@starui/host-wrapper-react`'s `useHost()`. Don't reach for `getConfigManager()` directly in view code — read from `useConfigService()`.

### Provider window prefetch

The Provider window is hidden in production. Use its idle time to prefetch tool-window chunks (the lazy-imported routes). First-open latency drops from ~200ms to ~10ms because the HTTP + V8 caches are warm. Always update `TOOL_WINDOW_CHUNK_LOADERS` in `src/platform/Provider.tsx` when you add a new view.

## Discoverable via `inspect_app`

`inspect_app` enforces (with severity):

- **error** `no-native-element` — native `<input>/<select>/<textarea>` outside `@starui/ui`
- **error** `cross-framework-import` — `@angular/*` in React (and vice versa)
- **error** `banned-dep` — `pnpm` / `yarn` in deps
- **error** `appshell-stack` — missing AppShell pieces in openfin `main.tsx`
- **warn** `version-matrix` — drift from the pinned matrix
- **warn** `no-hardcoded-color` — hex colors in `.tsx` / `.ts` / `.css`
- **warn** `no-runtime-branching` — `isOpenFin()` in a view file

If a finding looks like a false positive, the validator's source is at `src/lib/validate.ts` in `@starui/mcp-server`.
