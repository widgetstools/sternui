# Consolidation Decisions — Day 1 audit output

> Per-package resolution matrix. Every package across the four source repos is mapped to its target location + resolution strategy in the consolidated `widgetstools/marketsui-platform` monorepo.
>
> **Sourced from Day 1 audit.** See companion docs:
> - `docs/DEPS_STANDARD.md` — authoritative dep versions
> - `docs/ROADMAP.md` — downstream feature work unblocked by this consolidation
>
> **Last updated:** 2026-04-23

---

## 1. Package-by-package resolution table

### Legend

| Resolution | Meaning |
|---|---|
| **Rename** | Same code, new namespace (`@grid-customizer/*` / `@markets/*` / `@stern/*` → `@marketsui/*`) |
| **Relocate** | Move to a different path but same package boundary |
| **Merge** | Combine with another source's package into a single target |
| **Archive** | Not carried forward; preserved in old repo's history only |
| **Reserved** | Empty placeholder today; will be populated later |

### Source: `widgetstools/widgets` (this repo, renames to `marketsui-platform`)

| Path | Name | Target path | Target name | Resolution |
|---|---|---|---|---|
| `packages/core` | `@grid-customizer/core` | `packages/core` | `@marketsui/core` | Rename |
| `packages/design-system` | `@grid-customizer/design-system` | `packages/design-system` | `@marketsui/design-system` | Merge (see §2.1) |
| `packages/markets-grid` | `@grid-customizer/markets-grid` | `packages/markets-grid` | `@marketsui/markets-grid` | Rename |
| `apps/demo` | `@grid-customizer/demo` | `apps/demo-react` | — | Merge (see §2.3) |
| `e2e/` | (no package) | `e2e/` | — | Relocate verbatim |
| `openfin/` | (no package) | `apps/demo-react/openfin/` | — | Relocate under demo |
| `docs/*.md` | — | `docs/` | — | Relocate verbatim |

### Source: `widgetstools/markets-ui`

| Path | Name | Target path | Target name | Resolution |
|---|---|---|---|---|
| `packages/component-host` | `@markets/component-host` | `packages/component-host` | `@marketsui/component-host` | Rename |
| `packages/config-service` | `@marketsui/config-service` | `packages/config-service` | `@marketsui/config-service` | Relocate (name already correct) |
| `packages/icons-svg` | `@markets/icons-svg` | `packages/icons-svg` | `@marketsui/icons-svg` | Rename |
| `packages/openfin-workspace` | `@markets/openfin-workspace` | `packages/openfin-platform` | `@marketsui/openfin-platform` | Merge (see §2.2) |
| `packages/tokens` | `@marketsui/tokens` | `packages/design-system/src/tokens` | — | Merge into design-system (see §2.1) |
| `packages/react-tools/dock-editor` | `@markets/dock-editor` | `packages/dock-editor-react` | `@marketsui/dock-editor-react` | Rename |
| `packages/react-tools/registry-editor` | `@markets/registry-editor` | `packages/registry-editor-react` | `@marketsui/registry-editor-react` | Rename |
| `packages/angular-tools/dock-editor` | `@markets/angular-dock-editor` | `packages/dock-editor-angular` | `@marketsui/dock-editor-angular` | Rename |
| `packages/angular-tools/registry-editor` | `@markets/angular-registry-editor` | `packages/registry-editor-angular` | `@marketsui/registry-editor-angular` | Rename |
| `packages/widgets/ng` | (empty) | `packages/widgets-angular` | `@marketsui/widgets-angular` | Reserved |
| `packages/widgets/react` | (empty) | `packages/widgets-react` | `@marketsui/widgets-react` | Reserved — populated from stern-2 (see §2.5) |
| `apps/react-reference-app` | `react-workspace-starter` | `apps/demo-react` | — | Merge (see §2.3) |
| `apps/angular-reference-app` | `angular-reference-app` | `apps/demo-angular` | — | Merge (see §2.4) |
| `apps/react-showcase` | `react-showcase` | (none) | — | **Archive** — functionality covered by demo-react |
| `apps/angular-showcase` | `angular-showcase` | (none) | — | **Archive** — functionality covered by demo-angular |
| `docs/MARKETSUI_DESIGN.md` | — | `docs/MARKETSUI_DESIGN.md` | — | Relocate verbatim (1033-line authority) |

### Source: `nndrao/stern-2` (transferred to `widgetstools/stern-2` first)

| Path | Name | Target path | Target name | Resolution |
|---|---|---|---|---|
| `packages/angular` | `@stern/angular` | `packages/angular` | `@marketsui/angular` | Merge (see §2.6) |
| `packages/openfin-platform` | `@stern/openfin-platform` | `packages/openfin-platform` | `@marketsui/openfin-platform` | Merge (see §2.2) |
| `packages/shared-types` | `@stern/shared-types` | `packages/shared-types` | `@marketsui/shared-types` | Rename |
| `packages/ui` | `@stern/ui` | `packages/design-system/src/ui` | — | Merge into design-system (see §2.1) |
| `packages/widget-sdk` | `@stern/widget-sdk` | `packages/widget-sdk` | `@marketsui/widget-sdk` | Rename |
| `packages/widgets` | `@stern/widgets` | `packages/widgets-react` | `@marketsui/widgets-react` | Relocate + rename |
| `apps/reference-app` | `@stern/reference-app` | `apps/demo-react` | — | Merge (see §2.3) |
| `apps/angular-reference-app` | `@stern/angular-reference-app` | `apps/demo-angular` | — | Merge (see §2.4) |
| `apps/server` | `@stern/server` | `apps/config-service-server` | `@marketsui/config-service-server` | Rename |
| `docs/*` | — | `docs/archived/stern-2/` | — | Archive |

### Source: `widgetstools/fi-trading-terminal`

| Path | Name | Target path | Target name | Resolution |
|---|---|---|---|---|
| `design-system/` | (not a package) | `packages/design-system/src/` | — | Merge (see §2.1) — **authoritative visual spec** |
| `react-app/` | `fi-trading-terminal` | `apps/demo-react` | — | Merge (see §2.3) — **authoritative visual reference** |
| `angular-app/` | `angular-app` | `apps/demo-angular` | — | Merge (see §2.4) |
| `scripts/` | — | `tools/scripts/` | — | Relocate verbatim |
| `README.md` | — | `docs/archived/fi-trading-terminal/README.md` | — | Archive |
| `libs/*.tgz` (bundled corporate libs) | — | `tools/bundled-libs/` | — | **Relocate** — every package that needs these references via `file:../../tools/bundled-libs/…` |

---

## 2. Merge resolutions in detail

### 2.1 — `packages/design-system` (merges 4 sources)

**Sources merging here:**
- `aggrid/packages/design-system` (thin — just tokens glue)
- `fi-trading-terminal/design-system/` (adapters, cell-renderers, icons, themes, tokens)
- `markets-ui/packages/tokens` (`@marketsui/tokens` — PrimeNG theme tokens)
- `stern-2/packages/ui` (`@stern/ui` — shadcn wrappers over 47 Radix components)

**Winner on visual authority:** fi-trading-terminal. Its design-system/ is the most complete (themes/, tokens/, adapters/, cell-renderers.ts all present) AND it's the visual reference for corporate branding.

**Target layout:**
```
packages/design-system/
├── src/
│   ├── tokens/             (fi-trading tokens + markets-ui/tokens deltas)
│   ├── themes/             (fi-trading themes/)
│   ├── adapters/           (fi-trading adapters/)
│   ├── icons/              (fi-trading icons/)
│   ├── cell-renderers.ts   (from fi-trading)
│   ├── ui/                 (stern-2's shadcn/Radix wrappers — Button, Card, Dialog, etc.)
│   └── index.ts
├── package.json            (@marketsui/design-system)
└── libs/                   (bundled tgzs if any design-system deps require)
```

**Conflicts to resolve during merge:**
- stern-2/packages/ui may have its own Button/Card implementations; fi-trading may have different ones. Pick fi-trading's visual treatment; adopt stern-2's ergonomic props where fi-trading's ergonomics are thinner.
- aggrid's current design-system is a thin re-export package; drop its own types, import from new consolidated package.

### 2.2 — `packages/openfin-platform` (merges 2 sources)

**Sources:**
- `markets-ui/packages/openfin-workspace` (workspace launch, theme IAB, dock integration)
- `stern-2/packages/openfin-platform` (PlatformAdapter, identity, save/destroy lifecycle)

**Winner on structure:** stern-2's is more cleanly abstracted (has `BrowserAdapter` + `OpenFinAdapter` for non-OpenFin dev). Adopt stern-2's structure; port markets-ui's workspace-specific pieces (dock config load/save, theme IAB) into it.

**Target layout:**
```
packages/openfin-platform/
├── src/
│   ├── adapters/
│   │   ├── OpenFinAdapter.ts   (from stern-2)
│   │   └── BrowserAdapter.ts   (from stern-2 — critical for dev-mode)
│   ├── workspace/              (from markets-ui — workspace snapshot save/load)
│   ├── dock/                   (from markets-ui — dock custom items)
│   ├── identity.ts             (from stern-2 — PlatformAdapter identity + customData)
│   ├── theme.ts                (from markets-ui — theme IAB channel)
│   └── index.ts
├── package.json                (@marketsui/openfin-platform)
```

### 2.3 — `apps/demo-react` (merges 4 sources)

**Sources:**
- `aggrid/apps/demo` — showcase profile + market depth view + formatter toolbar
- `markets-ui/apps/react-reference-app` — dock editor + registry editor wiring
- `stern-2/apps/reference-app` — widget host + STOMP data provider demo
- `fi-trading-terminal/react-app` — **visual reference** (most complete shadcn UI + themes)

**Winner on visual:** fi-trading. Winner on feature coverage: aggrid (market depth, showcase profile).

**Target:** build demo-react as a multi-tab app where each tab showcases a feature set:
- `?view=fi-trading` — the visual reference from fi-trading
- `?view=grid-showcase` — aggrid's showcase profile + market depth
- `?view=dock-editor` — markets-ui's dock editor
- `?view=widget-host` — stern-2's widget host + STOMP

All four demos share the consolidated `<MarketsUIShell>` root and feed off the same ConfigService + SharedWorker.

### 2.4 — `apps/demo-angular` (merges 3 sources)

**Sources:**
- `markets-ui/apps/angular-reference-app` — PrimeNG + dock editor Angular
- `stern-2/apps/angular-reference-app` — Angular widget host stub
- `fi-trading-terminal/angular-app` — authoritative Angular 21.1.0 setup

**Winner on setup:** fi-trading (most recent Angular 21 config). Winner on features: markets-ui (has a real dock-editor integration).

**Target:** tabbed Angular app mirroring demo-react tabs where possible.

### 2.5 — `packages/widgets-react` (merges 2 sources)

**Sources:**
- `markets-ui/packages/widgets/react/` (empty placeholder)
- `stern-2/packages/widgets/` (`@stern/widgets` — SimpleBlotter, STOMP blotter)

**Resolution:** populate `packages/widgets-react/` from stern-2's content. markets-ui's empty folder was a reserved spot.

### 2.6 — `packages/angular` (merges 2 sources)

**Sources:**
- `markets-ui/packages/angular-tools/*` — dock-editor, registry-editor (split as their own packages, see table above)
- `stern-2/packages/angular` — Angular-side grid bindings, data-provider service

**Resolution:** `packages/angular/` becomes the **framework adapter only** — services, signals, `MarketsUIShellComponent`. The dock-editor and registry-editor become their own packages (`packages/dock-editor-angular`, `packages/registry-editor-angular`).

---

## 3. Name collision resolutions

| Conflicting name | Sources | Resolution |
|---|---|---|
| `widgets/` | markets-ui/packages/widgets/ + stern-2/packages/widgets/ | Target: `packages/widgets-react/` (from stern-2) + `packages/widgets-angular/` (reserved) |
| `angular/` | markets-ui has `angular-tools/` + stern-2 has `angular/` | Target: `packages/angular/` (framework adapter) + `packages/dock-editor-angular/` + `packages/registry-editor-angular/` (editors split out) |
| `openfin-*` | markets-ui/openfin-workspace + stern-2/openfin-platform | Target: `packages/openfin-platform/` (merged — see §2.2) |
| `angular-reference-app` | markets-ui + stern-2 | Target: `apps/demo-angular/` (merged tabs) |
| `reference-app` / `react-reference-app` | stern-2 + markets-ui + fi-trading (react-app) + aggrid (demo) | Target: `apps/demo-react/` (merged tabs) |
| `ui/` | stern-2/packages/ui/ + fi-trading/design-system (overlaps) | Target: `packages/design-system/src/ui/` (unified — see §2.1) |
| `tokens/` | markets-ui/packages/tokens + fi-trading/design-system/tokens | Target: `packages/design-system/src/tokens/` (merged — fi-trading authoritative, markets-ui tokens added where non-overlapping) |

---

## 4. Namespace migration

Every package migrates to `@marketsui/*`. Full rename map:

| Old namespace | Count | New namespace |
|---|---|---|
| `@grid-customizer/*` | 4 packages | `@marketsui/*` |
| `@markets/*` | 6 packages | `@marketsui/*` |
| `@marketsui/*` (already) | 2 packages | `@marketsui/*` (no change) |
| `@stern/*` | 8 packages | `@marketsui/*` |
| (fi-trading unnamed packages) | 2 apps | `@marketsui/demo-react` / `@marketsui/demo-angular` |

Global find-and-replace during Day 5 of the consolidation.

---

## 5. Dependencies archived (not carried forward)

| Package | Source | Why |
|---|---|---|
| `@radix-ui/react-dialog` (as used in markets-ui dock-editor) | markets-ui | Replaced by unified design-system wrapper |
| `react-showcase`, `angular-showcase` apps | markets-ui | Functionality covered by demo apps |
| Stern-2's old AG-Grid 33 integration | stern-2 | Upgrading to 35.1.0 per DEPS_STANDARD |

---

## 6. Open items requiring user decision BEFORE Day 3 starts

These could not be resolved from the audit alone. If left undecided, consolidation stalls on first merge-conflict.

1. **stern-2 ownership transfer.** `nndrao/stern-2` → `widgetstools/stern-2` needs GitHub admin action on both orgs. If this can't be done, fall back to `git format-patch` import (loses stern-2 history but completes the consolidation).

2. **fi-trading-terminal's `scripts/` directory.** Audit found it exists but contents unknown. Day 3 will read its package.json / README to decide: relocate to `tools/scripts/` or archive.

3. **Corporate bundled libs (`fi-trading/react-app/libs/*.tgz`).** All four `.tgz` files need to travel intact. Decide: single `tools/bundled-libs/` directory with symlinks from each consuming package OR per-package `libs/` directories (duplicated tgz). Single directory is cleaner; per-package matches corporate publish expectations. **Pick single `tools/bundled-libs/` unless corporate registry layout forbids.**

4. **Archived showcase apps — true archive or keep in `docs/archived-apps/`?** Leaning toward archive (not in monorepo tree) since history is preserved in the git-filter-repo merge.

5. **`packages/design-system` internal structure.** §2.1 proposes `src/tokens/`, `src/themes/`, `src/ui/`. Alternative: split into multiple sub-packages (`@marketsui/design-system-tokens`, `@marketsui/design-system-ui`) for tree-shakability. Single package is simpler; multiple is more professional. Default to single unless bundle-size pressure justifies the split.

---

## 7. Sequencing — packages in the order they should land during git-filter-repo imports

Imports are order-sensitive because of cross-dependency. Order:

1. **Day 3 — markets-ui first** (most independent; only depends on React/Angular core)
   - config-service → component-host → icons-svg → openfin-workspace → tokens → react-tools/* → angular-tools/* → reference apps → docs
2. **Day 4a — fi-trading-terminal** (depends on some Radix versions markets-ui uses)
   - design-system/ → react-app/ → angular-app/ → scripts/
3. **Day 4b — stern-2 last** (depends on everything; has React 18 → 19 migration)
   - shared-types → widget-sdk → openfin-platform (merge target exists) → angular → ui (merge target) → widgets (merge target) → reference apps → server

Rationale: markets-ui is structural (config, identity, editors). fi-trading gives the visual system. stern-2 brings concrete widgets + data — import last so all its deps resolve.

---

## 8. Final package count after consolidation

| Area | Packages |
|---|---|
| Core framework | 7 (`core`, `shared-types`, `config-service`, `component-host`, `data-plane`, `widget-sdk`, `dock`) |
| Design | 1 (`design-system`) |
| OpenFin | 1 (`openfin-platform`) |
| Framework adapters | 2 (`react`, `angular`) |
| Editors | 4 (`dock-editor-react`, `dock-editor-angular`, `registry-editor-react`, `registry-editor-angular`) |
| Grid + widgets | 3 (`markets-grid`, `widgets-react`, `widgets-angular`) |
| Utilities | 2 (`icons-svg`, `adapters/*`) |
| Apps | 4 (`demo-react`, `demo-angular`, `openfin-launcher`, `config-service-server`) |

**Total:** 20 packages + 4 apps + `tools/` + `docs/`.

This is denser than the original 17-package estimate in the monorepo plan — the editor splits (dock/registry × react/angular) add 4 packages that were single in markets-ui. The count is still tractable for pnpm workspaces + Turborepo.
