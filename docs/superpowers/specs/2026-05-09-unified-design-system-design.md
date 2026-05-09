# Unified Design System — Design Spec

**Date:** 2026-05-09
**Branch:** `bug/styling`
**Status:** Approved by user (sections 1–9), pending written-spec review

---

## Goal

Replace three coexisting token systems (FI v1, MarketsUI MDL, Cockpit Terminal) with **one unified design system** for the whole `marketsui-platform` monorepo. Constraints from the user:

1. One design system across the monorepo — no parallel token trees
2. No hardcoded hex codes, no inline styling
3. Tailwind utility classes only for styling
4. Exactly one scrollbar utility class, dark/light compatible
5. Easy to modify the design system once the contract is fixed

## Decisions (locked in during brainstorm)

| # | Question | Decision |
|---|---|---|
| 1 | Framework scope | React + Angular, Tailwind everywhere, PrimeNG styled mode + `tailwindcss-primeui` plugin |
| 2 | Token source | Build new unified token tree from `patch/design-system/` as canonical |
| 3 | Cockpit fate | Becomes house style with more contrast; Cockpit-specific classes and tokens deleted |
| 4 | Theme name | **One theme: "Chroma Desk"**, with two modes: `light` (cool graphite-grey ~89% L ground, AA/AAA-audited accents) and `dark` (balanced graphite + signature cyan brand) |
| 5 | CVD strategy | Default red/green + opt-in CVD theme that swaps positive/negative accents to blue/orange globally |
| 6 | Typography | **Unified across both modes**: Geist sans + JetBrains Mono. One typographic voice, consistent identity. (IBM Plex split dropped — single Chroma Desk identity carries across light and dark.) |
| 7 | Token authoring | TypeScript file → generates Tailwind config + PrimeNG preset + CSS vars file |
| 8 | Class naming | Tailwind utilities + single `--ds-*` / `.ds-*` prefix for the few non-utility utilities |
| 9 | Migration | Big-bang on `bug/styling` branch, single PR target |
| 10 | Old systems | Delete FI v1 token internals (replaced), `tokens-primeng` package entirely, Cockpit stylesheet entirely |
| 11 | Architecture | Single `@starui/design-system` package with subpath exports |
| 12 | Scrollbar | Exactly one class: `.ds-scrollbar`, minimalist thin thumb, theme-aware via `color-mix`, never hidden |

## Verified compatibility

PrimeNG 21.1.5 (the pinned version per `docs/2026-05-08/architecture-and-design/DEPS_STANDARD.md`) supports first-class Tailwind v3 integration via the official `tailwindcss-primeui` plugin (JS variant for Tailwind v3). Tailwind 3.4.1 + PrimeNG 21 is officially supported by PrimeTek; semantic utilities like `bg-primary`, `bg-surface-50`, `text-muted-color`, `border-surface-300` are emitted by the plugin and resolve through the active PrimeNG preset's CSS variables. Dark mode aligns via `darkModeSelector: '[data-theme="dark"]'` mirrored by Tailwind's `darkMode: ['selector', '[data-theme="dark"]']`. Sources: `/websites/v20_primeng` Context7 docs.

---

## Section 1 — Token Model

The `patch/design-system/` tokens are the canonical core. There is **one theme — Chroma Desk — with two modes (light, dark)**. Both modes share Chroma Desk's typographic voice (Geist + JetBrains Mono), the same accent hue family (teal/rose/amber/brand-cyan/cyan/purple), and the same component spacing language. They differ only in surface luminance and per-mode accent contrast tuning.

### 1.1 `primitives.ts`

Located at `patch/design-system/tokens/primitives.ts`. Contains:

- **`colors`** — palette
  - `chromeLight.{50..600}` — cool graphite-grey scale for light surfaces. Ground sits at `chromeLight[100]` (~89% L) for long-session ergonomics
  - `coolInk.{0..3}` — deep cool-charcoal text scale for light mode (AAA primary at ~16.5:1 against ground)
  - `graphite.{50, 300..975}` — Chroma Desk dark scale (unchanged from prior v2)
  - `teal`, `rose`, `amber`, `brand`, `cyan`, `purple` — accent families with `light` / `lightHov` / `dark` / `darkHov` variants, all WCAG-audited per-mode against the paired ground
  - `cvd.{buyLight, sellLight, buyDark, sellDark}` — deuteranopia-safe blue/orange alternates
- **`typography`** — `fontFamily.{sans, mono, serif}` all unified on **Geist + JetBrains Mono** (no per-mode font split). `fontSize.{2xs..4xl}`, `fontWeight`, `letterSpacing`, `lineHeight`
- **`spacing`** — `0..10` scale aligned to 4px grid
- **`radius`** — `none/sm/md/lg/xl/full` (3, 5, 8, 12px)
- **`opacity`**, **`transition`** (includes `tickFlash` 900ms for price-cell pulse), **`shadow`** (sm/md/lg)
- **`primitives`** — aggregate const

### 1.2 `semantic.ts`

Located at `patch/design-system/tokens/semantic.ts`. Exports exactly two `ColorScheme` objects:

- **`light`** — Chroma Desk · Light. Cool graphite-grey ground (`chromeLight[100]`, ~89% L), deep cool-charcoal text (`coolInk[0]`, AAA), vivid AA/AAA accents (teal `#076a48`, rose `#b01e3f`, amber `#7a5408`, brand `#1740a8`). Long-session-friendly, low-glare, never warm
- **`dark`** — Chroma Desk · Dark. Balanced graphite chrome (`graphite[975/950/900/850/800]`), vivid mint-teal `#22e3a8` and rose `#ff5a82`, signature cyan `#22d3ee` brand moment, white CTA text on accent backgrounds

Each scheme implements the full `ColorScheme` interface: `surface`, `text`, `border`, `accent`, `action`, `state`, `overlay`, `cvd`, `scrollbar`, `elevation`.

CVD is **not** a separate scheme. It's an override layer the CSS adapter emits as a small `[data-cvd="on"]` block that only overrides:
- `--ds-accent-positive`, `--ds-accent-positive-hover`
- `--ds-accent-negative`, `--ds-accent-negative-hover`
- `--ds-action-buy-bg`, `--ds-action-buy-fg`
- `--ds-action-sell-bg`, `--ds-action-sell-fg`

with the `cvd.buy` / `cvd.sell` values from the active scheme (`cvd.buyLight/sellLight` resolved in light mode, `cvd.buyDark/sellDark` in dark). Everything else inherits.

### 1.3 `components.ts`

Component-token shape (button, input, tab, badge, instrumentBar, countdownRing, table, card, tooltip, scrollbar). Drop any cockpit-specific slots. The terminal aesthetic comes from existing primitives — `font-mono text-xs uppercase tracking-widest tabular-nums` is the cockpit voice without privileged tokens.

### 1.4 Theme matrix

Two orthogonal `<html>` attributes:

| Attribute | Values | Default |
|---|---|---|
| `data-theme` | `dark` \| `light` | `dark` (also when unset) |
| `data-cvd` | `on` \| (unset) | unset |

Combinations: 2 modes × 2 cvd states = **4 effective themes**, expressed as orthogonal CSS layers.

---

## Section 2 — Theme Switching & CSS Output

The CSS file (`@starui/design-system/css`) emits a layered cascade. Apps import it once in their root stylesheet. Theme switching is attribute flips on `<html>` — no JS conditionals, no per-component prop drilling.

```css
@layer base {
  /* Layer 1: Chroma Desk · Dark — also default when no [data-theme] set */
  :root, [data-theme="dark"] {
    /* every dark token as --ds-* */
    /* shadcn-compat aliases (HSL channels): --background, --foreground, … */
    /* tailwindcss-primeui-compat aliases: --p-primary-color, --p-surface-50, … */
  }

  /* Layer 2: Chroma Desk · Light */
  [data-theme="light"] {
    /* every light token as --ds-* */
    /* shadcn-compat aliases */
    /* primeng-compat aliases */
  }

  /* Layer 3: CVD override — orthogonal, only positive/negative accents */
  [data-theme="dark"][data-cvd="on"] {
    --ds-accent-positive: /* cvd.buyDark = #7aa6ff */;
    --ds-accent-negative: /* cvd.sellDark = #ff9d4e */;
    /* and the *-hover, action.buyBg/sellBg counterparts */
  }
  [data-theme="light"][data-cvd="on"] {
    --ds-accent-positive: /* cvd.buyLight = #1740a8 */;
    --ds-accent-negative: /* cvd.sellLight = #a8350c */;
    /* … */
  }
}
```

App switches themes by setting attributes on `<html>`:

```html
<html data-theme="light" data-cvd="on">
```

Apps store user preference in localStorage; a tiny `applyTheme()` helper reads the saved settings and sets the attributes on mount. Helper lives in `@starui/design-system` and is exported as part of the package's main entry.

**Why orthogonal over enumerated:** if all 4 combinations were listed explicitly, every token would appear 4 times. With orthogonal layers, the CVD override lives in two compact blocks regardless of how many modes the theme grows to support.

---

## Section 3 — Tailwind Integration

Both shadcn semantic utilities AND tailwindcss-primeui semantic utilities work in React JSX and Angular templates, point at the same `--ds-*` source.

### 3.1 What's emitted

- **shadcn-compat utilities**: `bg-primary`, `bg-card`, `bg-popover`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-destructive`, `bg-success`, `bg-warning`, `bg-info`, `ring-ring`, etc. — emitted by Tailwind's `theme.extend.colors` reading shadcn-compat HSL vars.
- **tailwindcss-primeui utilities**: `bg-surface-{50..950}`, `text-muted-color`, `text-color`, `border-surface-300`, `bg-primary-50`, etc. — emitted by the `tailwindcss-primeui` plugin reading PrimeNG's `--p-*` vars.

Both layers point at the same `--ds-*` source vars, so they always agree.

### 3.2 The shared preset

`@starui/design-system/tailwind` exports a Tailwind config preset:

```ts
import { tailwindPreset } from '@starui/design-system/tailwind';

// any React or Angular app's tailwind.config.ts:
export default {
  presets: [tailwindPreset],
  content: [/* app's content paths */],
};
```

The preset:
- Sets `darkMode: ['selector', '[data-theme="dark"]']`
- Adds `theme.extend.colors` with shadcn-compat names (primary, secondary, muted, card, popover, destructive, border, input, ring, background, foreground, success, warning, info)
- Adds `theme.extend.colors.surface.{50..950}` mapped from `--ds-surface-*` for parity with PrimeNG's surface scale
- Adds `theme.extend.fontFamily` reading `--ds-font-sans` / `--ds-font-mono`. Content is the same in both modes (Geist + JetBrains Mono) — Chroma Desk uses one typographic voice across light and dark
- Includes `tailwindcss-primeui` in `plugins`
- Adds `theme.extend.boxShadow` for `--ds-elevation-card/overlay/glow` and a few semantic shadow utilities

### 3.3 Result

- An Angular template can write `<button pButton class="bg-primary text-primary-foreground hover:bg-primary/90">Save</button>` and the same classes work in a React `<Button>` component.
- PrimeNG's internal styles read our `--p-*` vars, so PrimeNG components paint with the unified palette without any pt overrides.
- Theme variants and dark mode are handled via attribute selectors, not Tailwind's class strategy — `dark:bg-card` and `data-[theme=light]:bg-card` both work.

---

## Section 4 — PrimeNG Integration

PrimeNG runs in styled mode with a `definePreset(Aura, …)` config built from the same `--ds-*` token tree.

### 4.1 The preset

`@starui/design-system/primeng` exports a config object whose color values are `var(--ds-*)` references where possible (not hex literals). When that works (verification step early in the migration), PrimeNG components automatically restyle as `<html>` attributes change without a preset rebuild. If `definePreset` resolves color values eagerly at build time and does not honor CSS-var strings, the fallback is to emit literal hex values per scheme — see Risks below. Either way, the consumer-facing API is unchanged: import the preset, pass to `definePreset(Aura, …)`, and `providePrimeNG`.

```ts
// generated config object shape
{
  primitive: { borderRadius: { … }, },
  semantic: {
    primary: { 50…900 mapped from colors.brand.{light,dark} },
    success: { 500: colors.teal.dark },
    warning: { 500: colors.amber.dark },
    danger:  { 500: colors.rose.dark },
    info:    { 500: colors.brand.dark },
    fontFamily: 'var(--ds-font-sans)',  // CSS var, not literal
    colorScheme: {
      light: { surface: 0..950, primary: { color, hoverColor, … }, text: { … },
               content: { … }, formField: { … } },
      dark:  { same shape, dark values },
    },
  },
  components: {
    button:    { borderRadius, paddingX, paddingY, fontWeight },
    inputtext: { borderRadius, paddingX, paddingY },
    datatable: { headerCellPadding, bodyCellPadding },
    tabs:      { activeBorderColor },
    /* per-component overrides matching v2's components.ts */
  },
}
```

### 4.2 Angular bootstrap

`apps/demo-angular/src/app/app.config.ts`:

```ts
import { definePreset } from '@primeng/themes';
import { Aura } from '@primeng/themes/aura';
import { providePrimeNG } from 'primeng/config';
import { primengPreset } from '@starui/design-system/primeng';

const FiTheme = definePreset(Aura, primengPreset);

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: FiTheme,
        options: {
          darkModeSelector: '[data-theme="dark"]',
          cssLayer: { name: 'primeng', order: 'tailwind-base, primeng, tailwind-utilities' },
        },
      },
    }),
  ],
};
```

The `cssLayer` ordering puts PrimeNG's generated CSS between Tailwind's base and utilities so utilities applied to `<p-button>` always win.

### 4.3 Angular styles + Tailwind config

- `apps/demo-angular/src/styles.scss` imports `@starui/design-system/css`
- `apps/demo-angular/tailwind.config.ts` uses the shared `tailwindPreset` (already wires `tailwindcss-primeui` and `darkMode`)

### 4.4 Result

Every PrimeNG component (`p-button`, `p-inputtext`, `p-datatable`, `p-dialog`, `p-dropdown`) paints with our tokens by default. Tailwind utility classes layered on top win cleanly. A single theme attribute flip on `<html>` repaints the whole Angular app.

---

## Section 5 — The One Scrollbar Utility

```css
/* @starui/design-system/styles/scrollbar.css — emitted as part of /css */
.ds-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--ds-text-primary) 22%, transparent) transparent;
}
.ds-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
.ds-scrollbar::-webkit-scrollbar-track { background: transparent; }
.ds-scrollbar::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--ds-text-primary) 18%, transparent);
  border-radius: 10px;
  border: 2px solid transparent;
  background-clip: padding-box;
  transition: background-color 120ms ease;
}
.ds-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: color-mix(in srgb, var(--ds-text-primary) 32%, transparent);
}
.ds-scrollbar::-webkit-scrollbar-corner { background: transparent; }
```

### 5.1 Properties

- **One class everywhere.** Apply `class="ds-scrollbar"` to any scrollable container. Picks up the current theme automatically.
- **`color-mix(in srgb, var(--ds-text-primary) X%, transparent)`** — thumb is a tinted version of the foreground text color of whichever theme is active. Always correct contrast against the parent surface.
- **No `[data-theme]` branches needed.** `--ds-text-primary` already resolves correctly per theme.
- **Works in portaled overlays.** `--ds-text-primary` resolves from `<html>` via inheritance.
- **Never globally applied** — opt-in per scroll container. Pre/code blocks and embedded iframes keep their default scrollbars unless explicitly opted in.

### 5.2 Replaces

All of:
- `.gc-themed-scrollbar` (Cockpit)
- `.gc-formatting-toolbar / .gc-popout-list-items / .gc-popout-body` per-component scrollbar blocks
- `.gc-excel-ref-scroll`, `[data-gc-settings] *::-webkit-scrollbar` blocks
- The `.gc-filter-scroll` hide-scrollbar special case (FiltersToolbar pill carousel — gets the themed scrollbar instead)
- Every ad-hoc `scrollbar-width: thin; scrollbar-color: …` declaration in app CSS

### 5.3 Final policy

- **Exactly one** scrollbar class in the monorepo
- Minimalist, thin, proper thumb thickness (10px width with 2px transparent border = 6px effective thumb)
- Theme-aware via `color-mix`
- Never hidden by default

---

## Section 6 — Component Layer (Cockpit Replacement)

Drop every Cockpit-specific class and Cockpit-specific token. The grid settings popout and its sub-components use only standard Tailwind utilities + standard `--ds-*` tokens.

### 6.1 What gets deleted

- All `.gc-*`, `.ck-*`, `.gc-be-*` classes (CSS string in `packages/shared/core/src/css/cockpit.ts`)
- All cockpit-specific tokens (`--ck-bg`, `--ck-popout-shadow`, `--ck-led-green-glow`, `--ck-header-lift`, `--ck-font-sans`, `--gc-*` token aliases)
- The `cockpit.ts` file itself
- The `COCKPIT_STYLE_ID` export and `ensureCockpitStyles` callsites (replaced by a thin no-op stub for backward-compat or removed entirely)

### 6.2 What replaces them

**Layout/composition wrappers → React components**

`PopoutShell`, `PopoutTitle`, `PopoutBody`, `PopoutFooter`, `PopoutList`, `PopoutEditor`, `Band`, `BandHeader`, `MetaGrid`, `MetaCell` become named React components under `packages/react/widgets/grid-react/src/ui/SettingsPanel/`. Each is a thin wrapper with Tailwind utilities inside:

```tsx
export function PopoutShell({ children, ...props }) {
  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[820px] h-[640px] max-w-[96vw] max-h-[94vh] bg-background border border-border rounded-md flex flex-col shadow-overlay overflow-hidden" {...props}>
      {children}
    </div>
  );
}
```

The Tailwind soup lives inside the component, not in callers.

**Atomic stylings → cva variants**

`SharpButton` variants (`action`, `ghost`, `danger`) fold into existing shadcn `<Button>` cva variants:

```tsx
const buttonVariants = cva("…base classes…", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      action:  "bg-success text-success-foreground hover:bg-success/90",
      ghost:   "bg-transparent text-muted-foreground border border-border hover:bg-card",
      danger:  "bg-transparent text-destructive border border-border hover:bg-destructive/10",
      sharp:   "uppercase tracking-widest font-semibold rounded-sm",
    },
  },
});
```

`.gc-caps` (uppercase tracked-caps label) becomes either a `<Caps>` typography component or a documented Tailwind class string: `"text-xs font-semibold uppercase tracking-widest text-muted-foreground"`.
`.gc-mono` (mono numeric voice) becomes `<MonoNumeric>` or `"font-mono text-sm tabular-nums tracking-tight"`.
`.gc-led` becomes a small `<Led>` component using utility classes for color and `shadow-[0_0_5px_var(--ds-accent-positive)]` arbitrary value.

**Pure tokens (LED glow, popout shadow, header lift)**

Removed. The popout uses standard `shadow.lg` from primitives.ts. The LED glow uses Tailwind arbitrary value referencing the standard accent var. No privileged effect tokens.

**Monaco editor repaint**

The `!important` block targeting `.monaco-editor .suggest-widget` etc. stays as scoped CSS (unavoidable due to Monaco's inline styles), but lives in a dedicated `monaco.css` that the grid loads only when Monaco mounts. All `--ck-*` references become `--ds-*`.

### 6.3 Net result

Zero `.gc-*` / `.ck-*` classes in the codebase outside Monaco's specific override sheet. No inline styles. No hardcoded hex. The terminal aesthetic comes from typography + spacing + tracking (`font-mono`, `uppercase`, `tracking-widest`, `tabular-nums`, `text-2xs`).

---

## Section 7 — Migration Plan

Single branch (`bug/styling`), single PR target. Sequenced commits, CI green at each step.

### 7.1 Delete entirely

- `packages/shared/foundation/tokens-primeng/` — entire package (tokens.css, primeng-preset.ts, tailwind-preset.cjs, animations.css, editor.css, index.ts, package.json). Update workspaces glob in root `package.json`.
- `packages/shared/core/src/css/cockpit.ts` — entire 1379-line stylesheet
- Cockpit-related exports from `packages/shared/core/src/css/index.ts` and `packages/shared/core/src/index.ts`

### 7.2 Replace with v2

- `packages/shared/foundation/design-system/src/tokens/primitives.ts` ← `patch/design-system/tokens/primitives.ts`
- `packages/shared/foundation/design-system/src/tokens/semantic.ts` ← `patch/design-system/tokens/semantic.ts` (Chroma Desk light + dark, single theme); CVD override layer added in the css adapter
- `packages/shared/foundation/design-system/src/tokens/components.ts` — extend v2 with no cockpit slots
- `packages/shared/foundation/design-system/src/themes/fi-dark.css` — regenerated by adapter
- `packages/shared/foundation/design-system/src/themes/fi-light.css` — regenerated by adapter (single light scheme + cvd override)
- `packages/shared/foundation/design-system/src/themes/scrollbars.css` — replaced by single `.ds-scrollbar` in new `styles/scrollbar.css`

### 7.3 Add new

- `packages/shared/foundation/design-system/src/adapters/tailwind.ts` — exports `tailwindPreset`
- `packages/shared/foundation/design-system/src/styles/scrollbar.css` — the one utility
- `packages/shared/foundation/design-system/src/styles/base.css` — `@tailwind base` + minimal reset
- Updated `package.json` `exports` field for `.`, `/tailwind`, `/primeng`, `/css`

### 7.4 Rewrite consumers

1. `packages/react/ui/tailwind.config.js` → use `tailwindPreset` from `@starui/design-system/tailwind`
2. Every React app's `tailwind.config.js` → same (`apps/demo-react`, `apps/demo-configservice-react`, `apps/config-admin-web`, `apps/markets-ui-react-reference`)
3. Every React app's `globals.css` / `index.css` → swap multi-import for single `@import '@starui/design-system/css'`
4. `apps/demo-angular/src/app/app.config.ts` — wire `providePrimeNG` (currently absent)
5. `apps/demo-angular/src/styles.scss` — import `@starui/design-system/css`
6. `apps/demo-angular/tailwind.config.ts` — new file using shared preset
7. `packages/shared/core/src/index.ts` — drop cockpit exports
8. `packages/react/widgets/grid-react/**` — sweep every `.gc-*` className and every `var(--bn-*)` / `var(--ck-*)` / `var(--gc-*)` reference. Rewrite with Tailwind utilities + `--ds-*` vars. This is the largest single sweep in the migration; the planning task should grep these references first to size the work before splitting into commits
9. `packages/react/widgets/markets-grid/**` — same sweep, smaller surface
10. Remaining `--bn-*` / `--fi-*` / `--mdl-*` references in `apps/` or `packages/` — mechanical grep + replace

### 7.5 Validation gates (CI must stay green at each commit)

- `npx turbo typecheck` — clean
- `npx turbo build` — clean
- `npx turbo test` — 653 unit tests stay passing
- `npx turbo e2e` — 195/214 baseline maintained (19 known failures per `docs/E2E_STATUS.md`; we don't fix those, don't add new)
- Visual smoke per app: boots, theme toggle works, scrollbars render themed, no white-on-white shadcn `<Select>` regressions

### 7.6 Commit order

1. `feat(design-system): adopt Chroma Desk tokens (light + dark) + cvd override layer`
2. `feat(design-system): add tailwind/shadcn/primeng adapters, ds-scrollbar`
3. `feat(design-system): emit unified css, add subpath exports`
4. `chore: delete tokens-primeng package`
5. `chore: delete cockpit stylesheet, drop cockpit exports`
6. `refactor(react/ui): use tailwindPreset`
7. `refactor(apps): wire unified design system in 4 React apps`
8. `feat(apps/demo-angular): wire providePrimeNG with unified preset`
9. `refactor(grid-react): sweep gc-/bn-/ck-/gc- references`
10. `refactor: clean up remaining --bn-/--fi-/--mdl- references`
11. `docs: update IMPLEMENTED_FEATURES + DEPS_STANDARD + ARCHITECTURE`

Each commit ends with the standard trailer:

```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Section 8 — Editing Workflow

Once shipped, modifying the design system is always one of three flows.

### 8.1 Three flows

**Flow 1 — Change a token value (most common)**
Edit `packages/shared/foundation/design-system/src/tokens/primitives.ts` or `semantic.ts`. Run `npx turbo build --filter=@starui/design-system`. Build regenerates `dist/css/theme.css`. Apps pick up the change on next dev reload (or rebuild). One file edit propagates to every consumer in every framework.

**Flow 2 — Add a new theme variant** (e.g., a new light variant or brand swap)
Add the new `ColorScheme` object in `semantic.ts`, register it with the adapter (a single array of modes drives the CSS emission). The adapter emits the new `[data-theme="…"]` block automatically. No per-component changes needed.

**Flow 3 — Add a new component variant or new utility**
Edit `components.ts` for the token (or `tailwindPreset` for the utility). cva variants in shadcn primitives consume token slots, so adding `success` / `info` button variants is a token edit + a one-line cva entry.

### 8.2 What "easy to modify" rules out by construction

- No hex hunting across 30 files. Every color is a `--ds-*` reference.
- No per-component CSS files to update. Adapters generate everything.
- No "did I update both the React side and the Angular side?" — single token tree, two adapters auto-sync.
- No "which scrollbar style does this file use?" — there's only `.ds-scrollbar`.
- No drift between Tailwind config and PrimeNG preset — same source.

### 8.3 Tooling shipped with the package

- **`tools/scripts/check-ds-tokens.ts`** — CI lint that greps for hardcoded hex (`#[0-9a-fA-F]{3,8}`), `style={{ color: …}}`-style inline styles, and any leftover `--bn-` / `--fi-` / `--mdl-` / `--ck-` / `--gc-` refs. Fails the build if any are found outside the design-system package itself.
- **`tools/scripts/audit-contrast.ts`** — runs at design-system build time. Computes WCAG ratios for every accent/text pair against every surface in every theme variant. Emits warnings for AA failures, errors for sub-3:1 UI failures. Comments these ratios into the generated `theme.css` so reviewers see them inline.
- **`apps/markets-ui-react-reference/src/routes/design-system/`** — live preview route showing every token, every component variant, every theme combo, with theme-switcher controls. Canonical place to QA visual changes before shipping. Doubles as documentation.

### 8.4 Documentation

- `packages/shared/foundation/design-system/README.md` — what the package is, file map, "how to change a color" recipe
- `docs/2026-05-09/architecture-and-design/DESIGN_SYSTEM.md` — architecture (this spec, in published form)
- `docs/IMPLEMENTED_FEATURES.md` — updated entry per CLAUDE.md mandate

---

## Section 9 — Testing & Verification

### 9.1 Existing baselines (per CLAUDE.md)

- 653 Vitest tests passing — must stay 653
- 195/214 Playwright e2e passing — 19 known pre-existing failures documented in `docs/E2E_STATUS.md`. We don't fix those, but we must not introduce new ones.

### 9.2 New tests added by this change

**Adapter unit tests** (`packages/shared/foundation/design-system/src/adapters/*.test.ts`)
- `tailwind.ts` snapshot — preset shape, `theme.extend.colors`, `darkMode` setting
- `shadcn.ts` snapshot — generated CSS for each theme combo (4 snapshots: dark, dark-cvd, light, light-cvd)
- `primeng.ts` snapshot — preset object structure
- `agGrid.ts` snapshot — light/dark params

**Token contract tests** (`packages/shared/foundation/design-system/src/tokens/*.test.ts`)
- Every `ColorScheme` object has all required keys (interface compliance via type-level `Equals<>` test)
- Every accent/text combination meets WCAG (AA for chrome, AAA for body) — runs the same audit as the build-time tool, fails CI on sub-spec contrast

**Lint script test** (`tools/scripts/check-ds-tokens.test.ts`)
- Fixture: a file with `#aabbcc` → expect lint failure
- Fixture: a file with `var(--bn-bg)` → expect lint failure
- Fixture: a file with `style={{ color: 'red' }}` → expect lint failure
- Fixture: a file with only `bg-card text-foreground` → expect pass

**Theme switching e2e** (`e2e/design-system-theme-switch.spec.ts`)
- demo-react: cycles `<html data-theme>` (dark↔light) and `data-cvd` (on↔unset), asserts surface and accent colors per combo via `getComputedStyle`
- demo-angular: same matrix on `p-button`, `p-inputtext`, ensures PrimeNG components paint correctly

**Visual smoke** (`e2e/design-system-smoke.spec.ts`)
- Each app boots without console errors related to undefined CSS vars
- Scrollbar appears themed (visual snapshot of a scrollable container in dark + light)
- shadcn `<Select>` doesn't render white-on-white in dark mode

### 9.3 What we explicitly do NOT do here

- No re-snapshot of existing component tests. Old snapshots that referenced `--bn-*` / `--ck-*` colors get updated mechanically as part of commit 9 (grid-react sweep), not as a separate test rewrite phase.
- No font-loading tests. Geist + JetBrains Mono load via whatever mechanism each app already uses (Google Fonts CDN or local `@font-face`); the existing setup is trusted, not changed by this PR. If font loading is broken or inconsistent across apps, that's a follow-up.
- No Figma sync. Adding Style Dictionary or Figma Token sync is a documented follow-up.
- No visual regression PNG snapshots. Recommended once the system stabilizes, not on day 1.

### 9.4 Manual QA checklist (PR description)

- [ ] Each of 4 React apps: theme toggle works, all 4 combos (dark, dark-cvd, light, light-cvd) render correctly
- [ ] demo-angular: theme toggle works, PrimeNG components paint with our tokens
- [ ] Grid settings popout: opens, looks correct in all 4 combos, no `.gc-*` references in DOM
- [ ] No console warnings about undefined CSS vars
- [ ] Lint passes (`tools/scripts/check-ds-tokens.ts`)
- [ ] Build-time contrast audit passes
- [ ] All 653 unit + 195 e2e baselines maintained

---

## Out of scope for this spec

- Figma token sync / Style Dictionary integration — documented follow-up
- Visual regression PNG snapshots — follow-up after system stabilizes
- iOS/Android token export — not currently a consumer
- Fixing the 19 pre-existing e2e failures — tracked separately in `docs/E2E_STATUS.md`
- Adding new component variants beyond what existing components need — case-by-case PRs

## Risks

| Risk | Mitigation |
|---|---|
| `tailwindcss-primeui` not in corporate artifactory | Verify availability before commit 2; bundle via `file:libs/` if needed; document in `DEPS_STANDARD.md` |
| PrimeNG `definePreset` may not accept `var(--ds-*)` string values directly | Verify in commit 2 with a smoke test on `p-button`. If preset resolves values eagerly, fall back to passing literal hex per scheme — preset is regenerated only at app build, not at runtime, so this only affects how *fast* theme switching repaints, not whether it works. Reference docs: https://primeng.org/theming/styled-mode |
| Grid-react sweep (commit 9) is large and risky to review | Optionally split into 4–6 sub-commits by feature module if reviewer prefers |
| Existing snapshot tests reference `--bn-*` / `--ck-*` and break | Update mechanically as part of the same commit that introduces the `--ds-*` references |
| Light + dark + CVD = 4 combos to test | Snapshot tests cover all 4 theme combos at the adapter layer; e2e cycles them |
| PrimeNG `cssLayer` ordering differs across browser engines | Validate in demo-angular early (commit 8); document workaround if needed |
| Font loading (Geist + JetBrains Mono) regresses on slow networks | `font-display: swap` + use system fallbacks until loaded; QA on throttled connection |
