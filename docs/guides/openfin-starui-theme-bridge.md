# OpenFin Workspace theme ↔ StarUI palette bridge

How MarketsUI handles OpenFin workspace chrome vs StarUI content theming.

**Package:** `@starui/openfin-platform`  
**Files:** `staruiOpenFinPalette.ts`, `workspace.ts`, `dock.ts`

---

## Default: OpenFin built-in theme (not StarUI)

`initWorkspace()` does **not** pass a custom `theme` block to `@openfin/workspace-platform` unless you opt in:

```ts
initWorkspace({ useStarUIOpenFinTheme: true });
```

By default, OpenFin uses its **native** `CustomPaletteSet` for dock companion chrome, notifications, and workspace UI. MarketsUI does not map StarUI teal/indigo/amber/slate/grey into that layer.

---

## Dark / light mode only

Persisted `starui:theme` still drives:

- Provider + content **appearance mode** via `applyTheme` / per-app `main.tsx`
- OpenFin **scheme** via `Theme.setSelectedScheme` (dark/light) on boot and dock theme toggle

That syncs light/dark chrome without replacing OpenFin's default color tokens.

---

## Dock Color palette submenu

The dock picker only updates **✓ checkmarks** (`starui:dock-menu-palette`). It does not change OpenFin theme, dock icon strokes (fixed slate), or content `starui:palette`.

---

## Opt-in StarUI → OpenFin chrome bridge

When `useStarUIOpenFinTheme: true`:

```ts
palettes: buildOpenFinThemePalettes(OPENFIN_CHROME_PALETTE, themeOverrides),
```

Maps `getColorScheme('slate', mode)` into OpenFin tokens (`brandPrimary`, `textDefault`, etc.). Optional `WorkspaceConfig.theme` overrides three fields.

**Limitation:** No runtime `setThemes()` API — palette is fixed at `init()` until platform restart.

---

## Content surfaces (grids, shadcn)

Use `applyTheme({ theme, palette })` in each app (`main.tsx`, demo toggles, Workspace Setup). Independent of OpenFin workspace `init({ theme })`.

---

## References

- [openfin-legacy-dock.md](./openfin-legacy-dock.md)
- [dock-content-menu-folder-icons.md](./dock-content-menu-folder-icons.md)
