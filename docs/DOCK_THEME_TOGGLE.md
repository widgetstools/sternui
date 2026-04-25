# Dock Theme Toggle Implementation Guide

How to implement and maintain a theme toggle on the OpenFin Workspace v23 Dock3
that flips both the dock chrome AND the content inside every platform window.

## Pinned versions this guide assumes

These are the versions verified to make the toggle work end-to-end.
Mismatched versions reintroduce the bugs documented below.

| Package | Version | Source of truth |
|---|---|---|
| `@openfin/workspace` | `23.0.20` | npm |
| `@openfin/workspace-platform` | `23.0.20` | npm |
| `@openfin/core` | `43.101.4` (forced via root `overrides`) | npm |
| `@openfin/node-adapter` | `43.101.2` | npm |
| `@openfin/notifications` | `2.13.1` | npm (`2.12.x` line not published) |
| Runtime | `43.142.101.2` | manifest `runtime.version` |

If you change any of these, re-validate the toggle end-to-end before merging.

## Required manifest configuration

Every `manifest.fin.json` for a platform that uses the dock theme toggle MUST
declare a `--security-realm` runtime argument. v23's `Theme.setSelectedScheme()`
internally calls `System.setThemePreferences()` to persist the choice; that
runtime API throws

```
RuntimeError: Security realm is not set. Cannot set theme preferences.
```

unless a security realm is set.

```jsonc
{
  "runtime": {
    "arguments": "--enable-mesh --security-realm=react-workspace-starter",
    "version": "43.142.101.2"
  },
  // ...
}
```

The realm name is arbitrary; pick one unique per app so multiple platforms
don't collide.

## Required workspace components

`Storefront.register()` (and `Home.register()`) must be called during platform
init even if you don't use them — the workspace SDK opens the
`__of_workspace_protocol__` channel as part of those registrations. Without
that channel, `setSelectedScheme()` hangs trying to sync workspace storage.

In practice you can register them as no-ops:

```ts
await Home.register({
  title, id: PLATFORM_ID, icon,
  onUserInput: async () => ({ results: [] }),
  onResultDispatch: async () => {},
});

await Storefront.register({
  title, id: PLATFORM_ID, icon,
  getApps: async () => [],
  getLandingPage: async () => ({}) as StorefrontLandingPage,
  getNavigation: async () => [],
  getFooter: async () => ({ logo: { src: icon }, links: [] }) as unknown as StorefrontFooter,
  launchApp: async () => {},
});
```

In our codebase this happens inside `initializeWorkspaceComponents()` — keep
`components.home` and `components.store` enabled (default `true`) when calling
`initWorkspace()`. **Do not disable Storefront**: theme toggle will silently
hang.

## Theme palettes — both schemes required

`init({ theme: [...] })` must define palettes for **both** `dark` and `light`,
not a single `palette`:

```ts
await init({
  theme: [
    {
      label: "Default",
      default: "dark",
      palettes: {
        dark: {
          brandPrimary: "#0A76D3",
          brandSecondary: "#383A40",
          backgroundPrimary: "#1E1F23",
        },
        light: {
          brandPrimary: "#0A76D3",
          brandSecondary: "#DDDFE4",
          backgroundPrimary: "#FAFBFE",
        },
      },
    },
  ],
  // ...
});
```

If you supply only a single `palette` field, `setSelectedScheme()` flips the
internal scheme but renders the same colors on both — visually it looks like
nothing happened.

## The toggle handler — INLINE inside `launchEntry`

This is the canonical pattern from OpenFin's `register-with-dock3-basic`
starter (see `THEME_TOGGLE_ON_DOCK.md` in that repo). The handler MUST live
inside the Dock3Provider override's `launchEntry()`, NOT in
`init({ customActions })` or any external action dispatcher.

### Why inline matters

Routing the toggle through an external dispatcher creates a deadlock:

```
Click toggle on dock
  ↓ Dock3 calls launchEntry on its channel
  ↓ launchEntry routes to actionDispatcher (external)
  ↓ actionDispatcher calls handler that awaits setSelectedScheme()
  ↓ setSelectedScheme tries to dispatch back to the dock3 channel
  ↓ dock3 channel is busy waiting for launchEntry to return
  ↓ Deadlock — setSelectedScheme hangs forever, dock chrome never updates
```

Handling the toggle inline keeps everything inside one stack frame so
`setSelectedScheme`'s dispatch fan-out can complete cleanly.

### Reference implementation

```ts
public async launchEntry(payload: LaunchDockEntryPayload): Promise<void> {
  const platform = getCurrentSync();

  // Inline theme toggle — must NOT go through customActions.
  if (
    payload.entry.itemData?.actionId === ACTION_TOGGLE_THEME ||
    payload.entry.id === "theme-toggle"
  ) {
    const currentScheme = await platform.Theme.getSelectedScheme();
    const newScheme =
      currentScheme === ColorSchemeOptionType.Light
        ? ColorSchemeOptionType.Dark
        : ColorSchemeOptionType.Light;
    const isDark = newScheme === ColorSchemeOptionType.Dark;

    // Fire-and-forget. Awaiting hangs on `__of_workspace_protocol__` in some
    // setups; the synchronous fan-out (dock chrome + browser windows) runs
    // before the hang anyway.
    void platform.Theme.setSelectedScheme(newScheme);

    // Flip our own surfaces — SDK doesn't know about these:
    //   1. Provider window's data-theme attribute (drives our CSS vars)
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    //   2. Dock icon variants (we manage {dark, light} per icon)
    await applyDock3Config();
    //   3. IAB notify our content windows (dock editor, registry editor, etc.)
    await fin.InterApplicationBus.publish(IAB_THEME_CHANGED, { isDark });
    return;
  }

  // Other entries (URL launches, etc.) ...
}
```

## How content inside windows gets notified

`setSelectedScheme()` only flips the **chrome** of workspace-managed windows
(provider, dock, browser windows, storefront). The **content** (your React
or Angular app DOM) does not auto-update.

For content to follow theme, every window mounts a subscriber to the
`IAB_THEME_CHANGED` topic (`"theme-changed"`):

```ts
useEffect(() => {
  const handler = (data: { isDark?: boolean }) => {
    const next = data?.isDark === false ? "light" : "dark";
    setTheme(next);
  };
  fin.InterApplicationBus.subscribe(
    { uuid: fin.me.identity.uuid },
    "theme-changed",
    handler,
  );
  return () => {
    fin.InterApplicationBus.unsubscribe(
      { uuid: fin.me.identity.uuid },
      "theme-changed",
      handler,
    );
  };
}, []);
```

When the React/Angular state's `theme` value changes, the window's `<html>`
gets a new `data-theme` attribute, and every CSS-variable consumer
(`--bn-*`, shadcn/PrimeNG primitives, AG-Grid Quartz theme) follows.

This subscriber lives in:

| Window | File |
|---|---|
| Provider (markets-ui-react-reference) | `src/context/ThemeContext.tsx` |
| Provider (markets-ui-angular-reference) | `src/app/app.ts` |
| Dock editor (React) | `packages/dock-editor-react/src/DockEditor.tsx` |
| Dock editor (Angular) | `packages/dock-editor-angular/src/dock-editor/dock-editor.component.ts` |
| Registry editor (React) | `packages/registry-editor-react/src/RegistryEditor.tsx` |
| Registry editor (Angular) | `packages/registry-editor-angular/src/registry-editor/registry-editor.component.ts` |
| Config browser (React) | `packages/config-browser-react/src/ConfigBrowser.tsx` |
| Config browser (Angular) | `packages/config-browser-angular/src/config-browser/config-browser.component.ts` |
| Component-host (any view) | `packages/component-host/src/theme-listener.ts` |

If you add a new child window or view, **wire up the subscriber the same
way** or its content won't follow theme.

## Theme entry on the dock

In `packages/openfin-platform/src/dock.ts` the dock's "Toggle Theme" item is
defined inside `buildAllFavorites()`:

```ts
const themeToggle: Dock3Entry = {
  type: "item",
  id: "theme-toggle",                      // <-- launchEntry recognizes this id
  label: "Toggle Theme",
  icon: { dark: SUN_ICON, light: MOON_ICON },
  itemData: { actionId: ACTION_TOGGLE_THEME },
};
```

Both `id === "theme-toggle"` AND `itemData.actionId === ACTION_TOGGLE_THEME`
trigger the inline handler. Either is sufficient; we set both for safety.

## Verification checklist

End-to-end smoke test after any change to versions, the manifest, or the
toggle handler:

1. `pkill -f OpenFin` to fully stop any running runtime.
2. Start the dev server: `npm run dev:openfin:markets-react` (or the angular
   equivalent).
3. Open a child window via the dock (Tools → Dock Editor / Component
   Registry / Config Browser).
4. Click the theme toggle on the dock.
5. Verify:
   - [ ] Dock chrome flips (background + button hovers).
   - [ ] Provider window chrome flips (window decoration).
   - [ ] Provider window content flips (text, panels — driven by `data-theme`).
   - [ ] Open child window's chrome flips.
   - [ ] Open child window's content flips.
   - [ ] Click toggle again — flips back.
   - [ ] Console shows `[Dock3 theme] dark → light` followed by
         `[Dock3 theme] IAB publish resolved.`
   - [ ] Subscriber console shows `[ThemeContext] Received IAB 'theme-changed'`.

If any step fails, the diagnostic flow below isolates the cause.

## Diagnostic flow if it breaks

### Symptom: nothing flips at all

- Did you click the toggle? Check `[Dock3 theme] ... → ...` in the **provider
  window** DevTools (port 9222).
  - No log → `launchEntry` isn't being reached. Check `Dock.init()` registered
    the override. Look for `[Dock3] launchEntry handler threw (swallowed)` —
    that means a thrown error in our handler.

### Symptom: dock flips, chrome flips, but content stays in old theme

- Look for `[Dock3 theme] IAB publish resolved.` after the `→` line. If it
  doesn't print, the `setSelectedScheme` await hangs and the publish never
  runs. The handler in `dock.ts` should be `void platform.Theme.setSelectedScheme(...)`
  (no `await`). If somebody re-added `await`, revert it.
- If the publish fires but content still doesn't flip, check the subscriber.
  In the child window's DevTools, look for
  `[ThemeContext] Subscribing to IAB 'theme-changed'` on mount. If not, the
  subscriber isn't running.

### Symptom: `Security realm is not set. Cannot set theme preferences.`

- Manifest is missing `--security-realm=...` in `runtime.arguments`. Add it
  back. v23 requires it for `setThemePreferences`.

### Symptom: `No channel found for channelName: __of_workspace_protocol__`

- This warning prints **harmlessly** in the background after every toggle —
  the SDK is trying to sync workspace storage to a channel it expects from
  Storefront. As long as the `setSelectedScheme` call is fire-and-forget, it
  doesn't block anything.
- If it ALSO blocks the toggle (no IAB publish), Storefront isn't registered.
  Re-enable `components.store` (or remove the `components` override entirely)
  in your `initWorkspace()` call.

### Symptom: `client is disconnected from the target provider` on dock click

- The platform provider window unmounted (HMR, error in init, manual close)
  while the dock window survived. Fully `pkill -f OpenFin` and relaunch.
- See `packages/openfin-platform/src/dock.ts` — `registerDock` has an
  idempotency guard against double-init. If you remove that, this error
  reappears in HMR / StrictMode flows.

## Restoring known-good state

If theme toggle stops working, the simplest path back is to check out the
tag we cut once it was working end-to-end:

```bash
git tag -l "theme-toggle-working"
git checkout theme-toggle-working -- \
  packages/openfin-platform/src/dock.ts \
  packages/openfin-platform/src/workspace.ts \
  apps/markets-ui-react-reference/public/platform/manifest.fin.json \
  apps/markets-ui-angular-reference/public/platform/manifest.fin.json \
  apps/markets-ui-react-reference/src/context/ThemeContext.tsx \
  apps/markets-ui-react-reference/src/platform/Provider.tsx \
  apps/markets-ui-angular-reference/src/app/app.ts
```

Then re-verify with the checklist above.

## Files involved (summary)

| File | Role |
|---|---|
| `packages/openfin-platform/src/dock.ts` | Dock3 provider override; inline `launchEntry` toggle handler; `Dock.init()` |
| `packages/openfin-platform/src/workspace.ts` | `init()` call, theme palettes, customActions registration, Storefront/Home registration |
| `packages/openfin-platform/src/iab-topics.ts` | `IAB_THEME_CHANGED = "theme-changed"` constant |
| `apps/*/public/platform/manifest.fin.json` | `runtime.arguments` with `--security-realm`, runtime version |
| Various app + package files | `IAB_THEME_CHANGED` subscribers per the table above |

## References

- OpenFin starter: `built-on-openfin/workspace-starter @ main` →
  `how-to/register-with-dock3-basic` — particularly its
  `THEME_TOGGLE_ON_DOCK.md` and `client/src/dock.ts`
- DEPS_STANDARD.md — canonical OpenFin version pinning
