# Dependency Standard — `widgetstools/marketsui-platform`

> **Canonical, authoritative.** Every package under `packages/*` and `apps/*` in the monorepo MUST use these exact versions. Corporate artifactory only mirrors what is pinned here.
>
> **Updated:** 2026-04-23
>
> **Sources of truth (precedence order):**
> 1. `fi-trading-terminal/react-app/package.json` — React-side pins
> 2. `fi-trading-terminal/angular-app/package.json` — Angular-side pins (Angular 21.1.0 exact)
> 3. Extras list provided by user — monorepo root tooling (Vitest, Playwright, Dexie, etc.)
>
> **Conflict resolutions locked in:**
> - Tailwind: **3.4.1 exact** (fi-trading authority wins; `@tailwindcss/vite` is NOT used)
> - OpenFin Core: **43.101.x** family — paired with workspace SDK **23.0.20** + runtime **43.142.101.2** (canonical v22/v42 triple, see below)

---

## Pinning strategy

| Symbol | Meaning | Use for |
|---|---|---|
| Exact (`21.1.0`) | Pin to the exact version — no updates | Angular core, AG-Grid, Tailwind, Vite plugin Angular |
| Tilde (`~19.2.5`) | Patch-level updates only | React, TypeScript, Vite, Angular tooling secondary |
| Caret (`^4.5.4`) | Minor + patch updates | Most utility libraries |
| `file:libs/…-x.y.z.tgz` | Corporate-bundled local package | Packages not mirrored to artifactory |

Every new dependency MUST appear in this document before it can be added to any package. Artifactory availability is checked before pinning.

---

## Bundled locally (`file:libs/…`)

These packages are NOT on corporate artifactory. They are vendored as `.tgz` files under each package's `libs/` directory and referenced via `file:` protocol. When consolidating, collect all tgz files into a single `tools/bundled-libs/` directory and symlink or copy per package as needed.

| Package | Version | Notes |
|---|---|---|
| `lucide-react` | `file:libs/lucide-react-0.554.0.tgz` | React icons — replaces the invalid `^1.8.0` currently in aggrid-customization (lucide-react has no v1.x; that was a typo/fork artifact) |
| `lucide-angular` | `file:libs/lucide-angular-0.554.0.tgz` | Angular icons — pair with lucide-react |
| `@widgetstools/react-dock-manager` | `file:libs/widgetstools-react-dock-manager-1.0.0.tgz` | React dock manager |
| `@widgetstools/angular-dock-manager` | `file:libs/widgetstools-angular-dock-manager-1.0.0.tgz` | Angular dock manager |
| `@widgetstools/dock-manager-core` | `file:libs/widgetstools-dock-manager-core-1.0.0.tgz` | Shared dock-manager core (both React + Angular) |
| `@primeng/themes` | `file:libs/primeng-themes-20.3.0.tgz` | PrimeNG 20.3.0 themes — corporate corporate downgrade from public `^21.0.4` |
| `tabby_ai-hijri-converter` | `file:libs/tabby_ai-hijri-converter-1.0.5.tgz` | Internal date-converter — fi-trading-specific |

---

## React core — dependencies

| Package | Version | Source |
|---|---|---|
| `react` | `~19.2.5` | fi-trading react-app |
| `react-dom` | `~19.2.5` | fi-trading react-app |

**Migration note:** stern-2/reference-app currently on `^18.3.1` — **must upgrade to 19.2.5** during consolidation. Every `<FC>` / `useId` / concurrent-mode consumer in stern-2 needs a React 19 review.

## AG-Grid — pinned EXACT

| Package | Version | Source |
|---|---|---|
| `ag-grid-community` | `35.1.0` | fi-trading (exact — no caret) |
| `ag-grid-enterprise` | `35.1.0` | fi-trading (exact) |
| `ag-grid-react` | `35.1.0` | fi-trading (exact) |
| `ag-grid-angular` | `35.1.0` | fi-trading angular-app (exact) |

> Note: fi-trading-terminal's readme explicitly pins these — "corporate registry does not yet mirror 35.2.x".

## TypeScript + Build tooling

| Package | Version | Source | Notes |
|---|---|---|---|
| `typescript` | `~5.9.3` | fi-trading (both react + angular) | Patch-level |
| `vite` | `~7.3.2` | fi-trading react-app | Patch-level |
| `@vitejs/plugin-react` | `~4.5.2` | fi-trading react-app | **DOWNGRADE** from current `^4.7.0` |
| `vite-plugin-dts` | `^4.5.4` | extras list | Used by `packages/core` for .d.ts emission |
| `@tailwindcss/vite` | **REMOVED** | — | Not compatible with Tailwind 3.4.1 |
| `@types/node` | `^22.19.17` | fi-trading react-app | |
| `@types/react` | `^19.2.14` | fi-trading react-app | |
| `@types/react-dom` | `^19.2.3` | fi-trading react-app | |

## Testing

| Package | Version | Source | Notes |
|---|---|---|---|
| `vitest` | `^4.1.4` | extras list | **MAJOR BUMP** from `^3.0.0`; 298 tests may need config tweaks (renames in vitest 4) |
| `jsdom` | `^29.0.2` | extras list | **MAJOR BUMP** from `^25.0.1`; paired with Vitest 4 |
| `@testing-library/react` | `^16.3.2` | extras list | Minor bump from `^16.0.0` |
| `@testing-library/jest-dom` | `^6.9.1` | extras list | |
| `@testing-library/user-event` | `^14.6.1` | extras list | |
| `@playwright/test` | `^1.59.1` | extras list | |

## OpenFin

| Package | Version | Source | Notes |
|---|---|---|---|
| `@openfin/core` | `~43.101.2` | extras list resolution | API adapter; pairs with v22 workspace SDK + v42 runtime |
| `@openfin/node-adapter` | `^43.101.2` | extras list | |
| `@openfin/workspace` | `23.0.20` | npm dist-tag `latest` (paired with v42 runtime) | |
| `@openfin/workspace-platform` | `23.0.20` | npm dist-tag `latest` (paired with v42 runtime) | Pinned exact — releases as a triple with `@openfin/workspace` and `@openfin/core` |
| `@openfin/notifications` | `2.13.1` | npm `latest` stable (no 2.12.x line published) | User-requested `2.12.5` does not exist on the registry — pending confirmation |

### Canonical OpenFin pairing (v23 / v43)

The four versions below MUST move together. Authoritative source: OpenFin's own [`built-on-openfin/workspace-starter`](https://github.com/built-on-openfin/workspace-starter) repo, branch `workspace/v23.0.0 (or main, which tracks v23)`.

| Layer | Version |
|---|---|
| `@openfin/workspace` | `23.0.20` |
| `@openfin/workspace-platform` | `23.0.20` |
| `@openfin/core` / `@openfin/node-adapter` | `43.101.2` |
| Runtime (`manifest.fin.json` → `runtime.version`) | `43.142.101.2` |

`@openfin/workspace-platform` performs a strict runtime-version check inside `init()`; pairing the SDK family with the matching runtime build is mandatory or `initWorkspace` throws `Runtime version is not supported`.

### OpenFin runtime — pinned to `43.142.101.2`

**Every `manifest.fin.json` declares `runtime.version: "43.142.101.2"`.** This matches the v22 workspace SDK's accepted band.

Affected manifests (all pinned identically):

```
apps/markets-ui-react-reference/public/platform/manifest.fin.json
apps/markets-ui-angular-reference/public/platform/manifest.fin.json
apps/stern-reference-react/public/manifest.fin.json
apps/stern-reference-angular/public/manifest.fin.json
```

View manifests under `public/views/*.fin.json` deliberately omit the `runtime` block — views inherit from the platform that hosts them, so a single source of truth lives at the platform-manifest level.

### When upgrading either side

1. Consult the matching `workspace/vXX.0.0` branch in `built-on-openfin/workspace-starter` for the canonical SDK + runtime + core triplet — never bump one without the others.
2. Bump `@openfin/workspace` + `@openfin/workspace-platform` together (they release as a pair, exact-pinned).
3. Match `@openfin/core` / `@openfin/node-adapter` to the runtime major (v42 ↔ v22 workspace, v43 ↔ v23 workspace, v44 ↔ v24 workspace).
4. Update `runtime.version` in every manifest in lockstep.
5. Run `npm run dev:openfin` on each app and confirm the workspace boots without a runtime-version error in the console.

**Action item:** fi-trading-terminal's react-app uses `@openfin/core: 43.101.2` — when importing that repo, downgrade imports to 43.101.x. Check for 43.x-only APIs and flag any; 42/43 have compatibility breaks in Workspace bootstrap.

## Radix UI — adopt fi-trading versions verbatim

All Radix packages in fi-trading-terminal/react-app/package.json are corporate-mirrored. Full list:

| Package | Version |
|---|---|
| `@radix-ui/react-accordion` | `^1.2.12` |
| `@radix-ui/react-alert-dialog` | `^1.1.15` |
| `@radix-ui/react-aspect-ratio` | `^1.1.8` |
| `@radix-ui/react-avatar` | `^1.1.11` |
| `@radix-ui/react-checkbox` | `^1.3.3` |
| `@radix-ui/react-collapsible` | `^1.1.12` |
| `@radix-ui/react-context-menu` | `^2.2.16` |
| `@radix-ui/react-dialog` | `^1.1.15` |
| `@radix-ui/react-dropdown-menu` | `^2.1.16` |
| `@radix-ui/react-hover-card` | `^1.1.15` |
| `@radix-ui/react-label` | `^2.1.8` |
| `@radix-ui/react-menubar` | `^1.1.16` |
| `@radix-ui/react-navigation-menu` | `^1.2.14` |
| `@radix-ui/react-popover` | `^1.1.15` |
| `@radix-ui/react-progress` | `^1.1.8` |
| `@radix-ui/react-radio-group` | `^1.3.8` |
| `@radix-ui/react-scroll-area` | `^1.2.10` |
| `@radix-ui/react-select` | `^2.2.6` |
| `@radix-ui/react-separator` | `^1.1.8` |
| `@radix-ui/react-slider` | `^1.3.6` |
| `@radix-ui/react-slot` | `^1.2.4` |
| `@radix-ui/react-switch` | `^1.2.6` |
| `@radix-ui/react-tabs` | `^1.1.13` |
| `@radix-ui/react-toast` | `^1.2.15` |
| `@radix-ui/react-toggle` | `^1.1.10` |
| `@radix-ui/react-toggle-group` | `^1.1.11` |
| `@radix-ui/react-tooltip` | `^1.2.8` |

## Tailwind CSS — **v3.4.1 exact, not v4**

| Package | Version | Notes |
|---|---|---|
| `tailwindcss` | `3.4.1` | fi-trading authority — "Do not upgrade to 4.x" |
| `tailwindcss-animate` | `^1.0.7` | classic plugin |
| `autoprefixer` | `^10.4.27` | required for PostCSS |
| `postcss` | `^8.5.9` | required for Tailwind 3 |

**Migration — completed:**
1. ✅ `tailwind.config.js` + `postcss.config.js` present in every React-serving package.
2. ✅ No `@import "tailwindcss"` anywhere; all CSS uses classic `@tailwind base; @tailwind components; @tailwind utilities;`.
3. ✅ `@theme inline { ... }` blocks (Tailwind-4-only syntax) ported to `theme.extend` in `tailwind.config.js` — previously in `apps/demo-react/src/globals.css` + `apps/demo-configservice-react/src/globals.css`. Under Tailwind 3 the directive was silently ignored, which left semantic classes like `bg-card` / `text-foreground` undefined and rendered browser-default whites on dark surfaces (shadcn `<Select>` being the most visible victim).
4. ✅ `tailwind-merge` pinned to `^3.5.0` across every workspace that consumes it — previously drifted across `^2.2.0` / `^2.6.0` / `^3.5.0`.

## UI utilities (React)

| Package | Version |
|---|---|
| `class-variance-authority` | `^0.7.1` |
| `clsx` | `^2.1.1` |
| `cmdk` | `^1.1.1` |
| `embla-carousel-react` | `^8.6.0` |
| `next-themes` | `^0.4.6` |
| `react-day-picker` | `^9.11.0` |
| `react-hook-form` | `^7.72.1` |
| `react-resizable-panels` | `^4.9.0` |
| `recharts` | `^3.6.0` |
| `sonner` | `^2.0.7` |
| `tailwind-merge` | `^3.5.0` |
| `vaul` | `^1.1.2` |

## Editor / schema utilities

| Package | Version | Notes |
|---|---|---|
| `@monaco-editor/react` | `^4.7.0` | used in ExpressionEditor |
| `monaco-editor` | `^0.55.1` | peer dep of @monaco-editor/react |
| `ssf` | `^0.11.2` | SheetJS format string parser — used by excelFormatter |
| `dexie` | `^4.4.2` | **BUMP** from `^4.0.0` |
| `zustand` | `^5.0.12` | **BUMP** from `^5.0.0` |
| `uuid` | `^9.0.0` | used by stern-2/widget-sdk |

## Angular (21.1.0 exact pin)

Every `@angular/*` package pins to `21.1.0` exact. No caret, no tilde. Corporate downgrade from public `21.2.x`.

| Package | Version |
|---|---|
| `@angular/animations` | `21.1.0` |
| `@angular/cdk` | `21.1.0` |
| `@angular/common` | `21.1.0` |
| `@angular/compiler` | `21.1.0` |
| `@angular/core` | `21.1.0` |
| `@angular/forms` | `21.1.0` |
| `@angular/platform-browser` | `21.1.0` |
| `@angular/router` | `21.1.0` |
| `@angular/build` | `21.1.0` |
| `@angular/cli` | `21.1.0` |
| `@angular/compiler-cli` | `21.1.0` |

## Angular peer deps

| Package | Version | Notes |
|---|---|---|
| `rxjs` | `~7.8.2` | patch-level only |
| `tslib` | `^2.8.1` | |
| `primeng` | `~21.1.5` | |
| `@primeng/themes` | `file:libs/primeng-themes-20.3.0.tgz` | bundled locally |
| `@primeuix/themes` | `2.0.3` (override) | |
| `chart.js` | `~4.4.9` | |
| `ag-grid-angular` | `35.1.0` | exact |

## ESLint

| Package | Version | Notes |
|---|---|---|
| `eslint` | `^9.39.4` | v9 flat config — every package needs `eslint.config.js` (not `.eslintrc.*`) |
| `@eslint/js` | `^9.39.4` | |
| `eslint-plugin-react-hooks` | `^7.0.1` | |
| `eslint-plugin-react-refresh` | `^0.4.26` | |
| `typescript-eslint` | `^8.53.1` | |
| `globals` | `^16.5.0` | |

## Dev tooling

| Package | Version | Notes |
|---|---|---|
| `concurrently` | `^9.2.1` | **BUMP** from `^9.0.0` |
| `wait-on` | `^9.0.5` | **BUMP** from `^8.0.0` |
| `prettier` | `^3.8.1` | |

## Monorepo tooling (NEW — not in any source repo yet)

These are the tools the monorepo root adopts to orchestrate across packages. Not per-package deps.

| Tool | Version | Purpose |
|---|---|---|
| `pnpm` | Latest LTS | Workspace package manager |
| `turbo` | `^2.x` (latest compatible) | Build orchestrator |
| `git-filter-repo` | System install | History-preserving repo merges (via `brew` or `pip`) |

Pin specific versions once selected during Day 2 of consolidation.

## Overrides (package.json `overrides`)

These override transitive-dep versions to enforce corporate registry availability. Every package.json should include:

```json
"overrides": {
  "@typescript-eslint/tsconfig-utils": "8.58.1",
  "@oxc-roject/types": "0.122.0",
  "@rolldown/pluginutils": "1.0.0-rc.12",
  "@primeuix/themes": "2.0.3"
}
```

---

## Version-change log (migration notes per consolidation)

This section tracks every version change required when consolidating from the 4 source repos. Each row is a delta from the source repo's current value → the standard.

### `aggrid-customization` (widgetstools/widgets) — outgoing

| Package | Was | Now | Impact |
|---|---|---|---|
| `tailwindcss` | `^4.2.2` | `3.4.1` exact | **MAJOR DOWNGRADE** — migrate CSS-first config back to classic |
| `@tailwindcss/vite` | `^4.2.2` | **REMOVED** | Remove from root devDeps + vite.config.ts |
| `lucide-react` | `^1.8.0` (invalid) | `file:libs/lucide-react-0.554.0.tgz` | **Fix invalid version** |
| `@monaco-editor/react` | `^4.7.0` | `^4.7.0` | ✓ match |
| `dexie` | `^4.0.0` | `^4.4.2` | Minor bump |
| `zustand` | `^5.0.0` | `^5.0.12` | Patch bump |
| `vitest` | `^3.0.0` | `^4.1.4` | **MAJOR BUMP** — review test configs |
| `jsdom` | `^25.0.1` | `^29.0.2` | **MAJOR BUMP** |
| `wait-on` | `^8.0.0` | `^9.0.5` | **MAJOR BUMP** |
| `@openfin/node-adapter` | `^42.103.0` | `^43.101.2` | Patch bump |
| React | `^19.2.0` | `~19.2.5` | Patch-lock |
| TypeScript | `^5.9.0` | `~5.9.3` | Patch-lock |
| `@vitejs/plugin-react` | `^4.7.0` | `~4.5.2` | **DOWNGRADE** |
| `vite-plugin-dts` | `^4.0.0` | `^4.5.4` | Minor bump |

### `markets-ui` (widgetstools/markets-ui) — incoming

| Package | Was | Now | Impact |
|---|---|---|---|
| Namespace | mixed (`@markets/*` + `@marketsui/*`) | unified `@marketsui/*` | Rename all `@markets/*` → `@marketsui/*`, update all imports |
| `@primeng/themes` | (as-is) | `file:libs/primeng-themes-20.3.0.tgz` | Ensure bundled tgz travels with import |
| AG-Grid | (not yet integrated) | `35.1.0` exact | Add to angular-tools when wiring grids |

### `stern-2` (nndrao/stern-2) — incoming

| Package | Was | Now | Impact |
|---|---|---|---|
| `react` | `^18.3.1` | `~19.2.5` | **MAJOR UPGRADE** — review every React 18 pattern |
| `typescript` | `^5.7.3` | `~5.9.3` | Minor bump |
| `vite` | `^6.0.11` | `~7.3.2` | **MAJOR BUMP** — vite.config.ts shape check |
| `tailwindcss` | `^3.4.17` | `3.4.1` exact | **DOWNGRADE** — pin to 3.4.1 |
| `@openfin/core` | `^42.103.1` | `~43.101.2` | Patch bump, compatible |
| `@tanstack/react-query` | `^5.80.7` | `^5.80.7` | (keep — not in fi-trading's standard, but used by widget-sdk) |
| `@stomp/stompjs` | current | (keep) | (not in fi-trading standard, but needed by StompDataProvider) |
| `ag-grid` | `33.x` | `35.1.0` exact | **MAJOR BUMP** — AG-Grid 33→35 has breaking API changes in rowModel/filter |

### `fi-trading-terminal` — incoming (authority)

No version changes for fi-trading; it IS the authority for React-side. Only path/structural relocations.

---

## How to enforce the standard

Post-consolidation, every PR must:
1. Not introduce a new dep not listed above without a separate RFC.
2. Not bump a listed dep past the specified range without explicit approval + corporate artifactory availability check.
3. Pass `pnpm audit` against the corporate mirror.
4. Pass a custom lint check (`tools/scripts/check-deps.js`) that reads every `package.json` and asserts versions match this file. Add this check to CI.

## References

- `fi-trading-terminal/react-app/package.json` lines 12-27 — pinning strategy notes
- `fi-trading-terminal/angular-app/package.json` lines 13-44 — downgraded-for-registry notes
- `MARKETSUI_DESIGN.md` — broader architectural context for the monorepo
