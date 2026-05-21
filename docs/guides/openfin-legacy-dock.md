# Legacy OpenFin dock (`Dock.register`)

Optional dock implementation using `@openfin/workspace` **`Dock.register()`** instead of Dock3 **`Dock.init()`**. Use when you need **dropdown buttons on the dock bar** (same model as [register-with-dock](https://github.com/built-on-openfin/workspace-starter/tree/main/how-to/register-with-dock)).

**Package:** `@starui/openfin-platform`  
**Files:** `dockLegacy.ts`, `dockConfigTypes.ts` (`toLegacyDockButtons`), `dock.ts` (router), `workspace.ts`

---

## Selecting the implementation

Set at bootstrap (not hot-swappable):

| Source | Field | Values |
|--------|--------|--------|
| Manifest | `customSettings.dockType` | `"dock3"` (default) \| `"legacy"` |
| Code | `initWorkspace({ dockType: "legacy" })` | Overrides manifest |

Example manifest:

```json
"customSettings": {
  "dockType": "legacy",
  "apps": []
}
```

`initWorkspace` resolves: `config.dockType` → `customSettings.dockType` → `"dock3"`.

---

## Behavior differences

| Feature | Dock3 (`dock3`) | Legacy (`legacy`) |
|---------|-----------------|-------------------|
| API | `Dock.init()` from `@openfin/workspace-platform` | `Dock.register()` + `Dock.show()` from `@openfin/workspace` |
| Editor `ActionButton` | Dock bar (favorites) | Dock bar |
| Editor `DropdownButton` | Content menu flyout | **Dock bar dropdown** |
| System Tools / palette | Content menu folders | Bar dropdowns |
| Workspace chrome buttons | `defaultDockButtons` | `workspaceComponents: ["notifications", "switchWorkspace"]` |
| Persistence | IndexedDB `DockEditorConfig` (same) | Same |

Both paths share the dock editor, `updateDockButtons`, and platform `customActions` (including `set-palette` on legacy dropdown items).

**Live updates from Workspace Setup:** the provider subscribes to IAB `dock-config-update` / `dock-config-reset` from **any** child window (`uuid: '*'`). **Reload Dock** on legacy uses a **soft** `updateDockProviderConfig` + `Dock.show()` — not `Dock.deregister()` (deregister hides the bar and re-register is unreliable).

---

## Switching at runtime

OpenFin allows only one dock provider per platform. Switching `dockType` requires a **full dock teardown and re-register** (same class of operation as **Reload Dock**), not a live toggle.

---

## References

- Workspace starter: `how-to/register-with-dock`
- Dock3: [dock-content-menu-folder-icons.md](./dock-content-menu-folder-icons.md)
- Theme bridge: [openfin-starui-theme-bridge.md](./openfin-starui-theme-bridge.md)
