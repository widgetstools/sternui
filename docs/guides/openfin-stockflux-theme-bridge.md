# OpenFin Workspace theme ↔ Stockflux palette bridge

How MarketsUI maps Stockflux semantic colors into OpenFin `CustomPaletteSet` at platform init, and how dock/content-menu icons follow the active palette at runtime.

**Package:** `@starui/openfin-platform`  
**Files:** `stockfluxOpenFinPalette.ts`, `workspace.ts`, `dock.ts`

---

## Two color systems

| System | API | Scope |
|--------|-----|--------|
| **Stockflux** | `applyTheme({ theme, palette })` | Provider windows, grids, shadcn/PrimeNG (`data-theme`, `data-palette`) |
| **OpenFin Workspace** | `WorkspacePlatform.init({ theme })` | Dock companion, notifications, workspace chrome (`theme.palette.*`) |

They are orthogonal: OpenFin’s `palettes.dark` / `palettes.light` mean **appearance mode**, not teal/indigo/amber/slate/grey.

---

## Init-time bridge

On `init()`, `workspace.ts` builds OpenFin theme palettes from the persisted Stockflux palette (`getTheme().palette`, default slate):

```ts
palettes: buildOpenFinThemePalettes(readInitialStockfluxPalette(), manifestThemeOverrides),
```

`stockfluxSchemeToOpenFinPalette()` maps `getColorScheme(palette, mode)` fields to OpenFin tokens, including:

- `brandPrimary` ← `primary.color`
- `textDefault` ← `text.primary`
- `backgroundPrimary` ← `surface.ground`
- inputs, links, status, content backgrounds

Manifest `WorkspaceConfig.theme` can still override `brandPrimary`, `brandSecondary`, and `backgroundPrimary` per scheme.

**Limitation:** OpenFin exposes no `setThemes()` API. Palette changes after init update dock menus via `applyDock3Config()` but do **not** recompute OpenFin `CustomPaletteSet` until platform restart. Dock companion chrome may stay on the init-time palette until then.

---

## Runtime: palette-aware dock icons

`contentMenuIcon()` and user favorites/content-menu icon recoloring use `stockfluxIconStrokeColors(readDockPalette())` — accent stroke per dark/light scheme.

Choosing a palette in the dock content menu runs `ACTION_SET_PALETTE` → `applyTheme` → `applyDock3Config()` → folder icon CSS reinjection (see [dock-content-menu-folder-icons.md](./dock-content-menu-folder-icons.md)).

---

## References

- [CustomPaletteSet](https://developer.openfin.co/workspace/docs/platform/latest/interfaces/CustomPaletteSet.html)
- `@openfin/workspace` `computeThemes()` / `ThemeApi.setSelectedScheme()` (dark/light/system only)
