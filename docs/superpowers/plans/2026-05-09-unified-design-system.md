# Unified Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three coexisting token systems (FI v1, MarketsUI MDL, Cockpit Terminal) with one unified Chroma Desk design system. Single token tree → Tailwind preset + PrimeNG preset + CSS variables. One scrollbar utility. Tailwind utilities everywhere. No hardcoded hex anywhere outside the design-system package itself.

**Architecture:** TypeScript token core (`primitives.ts` / `semantic.ts` / `components.ts`) at `packages/shared/foundation/design-system/src/tokens/`. Three adapters (Tailwind preset, shadcn CSS generator, PrimeNG `definePreset` config) consume the token tree. A build step emits `dist/css/theme.css` containing `--ds-*` source vars, shadcn HSL aliases, and tailwindcss-primeui `--p-*` aliases. Two orthogonal `<html>` attributes drive theming: `data-theme="dark|light"` and `data-cvd="on"`. PrimeNG runs in styled mode with the `tailwindcss-primeui` plugin so the same utility classes (`bg-primary`, `text-muted-color`, `bg-card`) work in React JSX and Angular templates.

**Tech Stack:**
- TypeScript ~5.9.3, Node 20+
- Tailwind CSS 3.4.1 (exact, never v4)
- React 19.2.5, Angular 21.1.0, PrimeNG ~21.1.5
- `tailwindcss-primeui` (JS variant for Tailwind v3) — to be added to `DEPS_STANDARD.md`
- shadcn/ui via `@starui/ui` (Radix + class-variance-authority)
- Vitest 4 + Playwright 1.59 for tests
- Turborepo 2 build orchestrator, npm 10 workspaces

**Spec:** [docs/superpowers/specs/2026-05-09-unified-design-system-design.md](../specs/2026-05-09-unified-design-system-design.md)

**Branch:** `bug/styling`

**Commit trailer required on every commit:**
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## File Structure

### New files in `packages/shared/foundation/design-system/`

```
src/
├── tokens/
│   ├── primitives.ts       # color palette, type scale, spacing, radius, opacity, transitions, shadow
│   ├── semantic.ts         # Chroma Desk light + dark ColorScheme objects
│   ├── components.ts       # per-component tokens (button, input, table, etc.) consumed by adapters
│   └── index.ts            # barrel
├── adapters/
│   ├── tailwind.ts         # exports tailwindPreset
│   ├── shadcn.ts           # generateUnifiedCSS() — emits the full theme.css string
│   ├── primeng.ts          # exports primengPreset (definePreset config)
│   ├── agGrid.ts           # exports agGridDarkParams / agGridLightParams
│   └── index.ts            # barrel
├── styles/
│   ├── scrollbar.css       # the one .ds-scrollbar utility
│   └── base.css            # @tailwind base + minimal reset
├── scripts/
│   └── build-css.ts        # post-tsc step that writes dist/css/theme.css
├── applyTheme.ts           # tiny helper for apps to set data-theme / data-cvd
├── index.ts                # public API barrel
└── cellRenderers.ts        # unchanged from current

tests/
├── adapters/
│   ├── tailwind.test.ts
│   ├── shadcn.test.ts
│   ├── primeng.test.ts
│   └── agGrid.test.ts
├── tokens/
│   ├── colorScheme-contract.test.ts    # type-level + runtime contract
│   └── contrast-audit.test.ts
├── applyTheme.test.ts
└── __snapshots__/                      # vitest snapshot outputs

dist/
└── css/
    └── theme.css            # generated, committed via build (subpath export `./css`)
```

### Updated files

```
packages/shared/foundation/design-system/package.json          # exports field rewrite, deps add
packages/shared/foundation/design-system/tsconfig.json          # include scripts/, tests/
packages/shared/foundation/design-system/vitest.config.ts       # NEW
```

### Files DELETED

```
packages/shared/foundation/tokens-primeng/                      # entire package
packages/shared/core/src/css/cockpit.ts                          # 1379-line stylesheet
packages/shared/core/src/css/index.ts                            # cockpit-related exports only
packages/shared/foundation/design-system/src/themes/             # replaced by adapters/shadcn.ts output
patch/                                                            # working scratch dir, deleted at end
```

### New tooling

```
tools/scripts/check-ds-tokens.ts          # CI lint: forbids hex, inline styles, legacy --bn-/--ck-/etc.
tools/scripts/check-ds-tokens.test.ts     # tests for the lint script
tools/scripts/audit-contrast.ts           # build-time WCAG audit
```

### Updated consumers

```
packages/react/ui/tailwind.config.js                            # use tailwindPreset
apps/demo-react/tailwind.config.js                              # use tailwindPreset
apps/demo-react/src/globals.css                                 # single @import
apps/demo-configservice-react/tailwind.config.js                # use tailwindPreset
apps/demo-configservice-react/src/globals.css                   # single @import
apps/config-admin-web/tailwind.config.js                        # use tailwindPreset
apps/config-admin-web/src/index.css                             # single @import
apps/markets-ui-react-reference/tailwind.config.js              # use tailwindPreset
apps/markets-ui-react-reference/src/index.css                   # single @import

apps/demo-angular/tailwind.config.ts                            # NEW — use tailwindPreset
apps/demo-angular/src/styles.scss                               # add @import
apps/demo-angular/src/app/app.config.ts                         # add providePrimeNG
apps/demo-angular/package.json                                  # add tailwindcss-primeui

packages/shared/core/src/index.ts                                # drop cockpit exports
package.json                                                     # workspaces glob: drop tokens-primeng

docs/2026-05-08/architecture-and-design/DEPS_STANDARD.md         # add tailwindcss-primeui pin
docs/IMPLEMENTED_FEATURES.md                                     # new entry
packages/shared/foundation/design-system/README.md               # NEW
docs/2026-05-09/architecture-and-design/DESIGN_SYSTEM.md         # NEW
```

### Sweeps (mechanical replace)

```
packages/react/widgets/grid-react/**                             # largest sweep — gc-/bn-/ck-/gc- references
packages/react/widgets/markets-grid/**                           # smaller sweep
apps/**/* + packages/**/*                                        # mop-up: remaining --bn-/--fi-/--mdl- refs
```

---

## Phase 1 — Build the unified design-system package

### Task 1: Add `tailwindcss-primeui` to dependency standard

**Files:**
- Modify: `docs/2026-05-08/architecture-and-design/DEPS_STANDARD.md`

- [ ] **Step 1: Verify the package is on corporate artifactory**

Run:
```bash
npm view tailwindcss-primeui versions --json 2>&1 | head -20
```

Expected: a JSON array of versions, latest 0.7.x or higher. If the corporate registry is in use and returns 404, vendor as `file:libs/tailwindcss-primeui-X.Y.Z.tgz` instead — see DEPS_STANDARD.md "Bundled locally" section for the pattern.

- [ ] **Step 2: Add the row to DEPS_STANDARD.md under the Tailwind section**

Open `docs/2026-05-08/architecture-and-design/DEPS_STANDARD.md`. Find the Tailwind table (around line 174). Add this row immediately after the `tailwindcss-animate` row:

```markdown
| `tailwindcss-primeui` | `^0.7.0` | JS variant of PrimeTek's Tailwind plugin — required for tailwindcss-primeui utilities to resolve PrimeNG `--p-*` vars. JS, NOT CSS variant (the CSS variant requires Tailwind v4) |
```

- [ ] **Step 3: Commit**

```bash
git add docs/2026-05-08/architecture-and-design/DEPS_STANDARD.md
git commit -m "$(cat <<'EOF'
docs(deps): add tailwindcss-primeui ^0.7.0 to standard

Required for unified Chroma Desk design system — emits
tailwindcss-primeui semantic utilities (bg-surface-*, text-muted-color,
etc.) that resolve PrimeNG --p-* CSS vars. JS variant only; the CSS
variant requires Tailwind v4 which is forbidden by our pin.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add Vitest to design-system package + scaffold tests dir

**Files:**
- Modify: `packages/shared/foundation/design-system/package.json`
- Create: `packages/shared/foundation/design-system/vitest.config.ts`
- Create: `packages/shared/foundation/design-system/tests/sanity.test.ts`

- [ ] **Step 1: Add vitest devDeps and a `test` script to the package**

Open `packages/shared/foundation/design-system/package.json`. Replace the `scripts` block with:

```json
"scripts": {
  "build": "rimraf dist tsconfig.tsbuildinfo && tsc --project tsconfig.json && tsx scripts/build-css.ts",
  "typecheck": "tsc --noEmit --project tsconfig.json",
  "test": "vitest run",
  "test:watch": "vitest"
},
```

Replace the `devDependencies` block with:

```json
"devDependencies": {
  "ag-grid-community": "35.1.0",
  "rimraf": "^5.0.5",
  "tsx": "^4.19.2",
  "typescript": "~5.9.3",
  "vitest": "^4.1.4"
},
```

- [ ] **Step 2: Create vitest config**

Create `packages/shared/foundation/design-system/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    snapshotFormat: { printBasicPrototype: false },
  },
});
```

- [ ] **Step 3: Write a sanity test to confirm the harness works**

Create `packages/shared/foundation/design-system/tests/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run install + test**

Run from the repo root:
```bash
npm install --legacy-peer-deps
npm test --workspace=@starui/design-system
```

Expected: `1 passed`. Vitest emits `Test Files  1 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/foundation/design-system/package.json \
        packages/shared/foundation/design-system/vitest.config.ts \
        packages/shared/foundation/design-system/tests/sanity.test.ts \
        package-lock.json
git commit -m "$(cat <<'EOF'
chore(design-system): wire vitest harness for adapter + token tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Move Chroma Desk primitives + semantic tokens into the package

**Files:**
- Replace: `packages/shared/foundation/design-system/src/tokens/primitives.ts` ← `patch/design-system/tokens/primitives.ts`
- Replace: `packages/shared/foundation/design-system/src/tokens/semantic.ts` ← `patch/design-system/tokens/semantic.ts`
- Test: `packages/shared/foundation/design-system/tests/tokens/colorScheme-contract.test.ts`

- [ ] **Step 1: Write the contract test that the schemes must satisfy**

Create `packages/shared/foundation/design-system/tests/tokens/colorScheme-contract.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dark, light, type ColorScheme } from '../../src/tokens/semantic';

const requiredKeys: ReadonlyArray<keyof ColorScheme> = [
  'surface', 'text', 'border', 'accent', 'action',
  'state', 'overlay', 'cvd', 'scrollbar', 'elevation',
];

const requiredSurfaceKeys = ['ground', 'primary', 'secondary', 'tertiary', 'quaternary'] as const;
const requiredAccentKeys = [
  'positive', 'positiveHover', 'negative', 'negativeHover',
  'warning', 'info', 'infoHover', 'highlight', 'purple',
] as const;
const requiredCvdKeys = ['buy', 'sell'] as const;

describe('ColorScheme contract', () => {
  for (const [name, scheme] of [['dark', dark], ['light', light]] as const) {
    describe(name, () => {
      it.each(requiredKeys)('has %s block', (key) => {
        expect(scheme[key]).toBeDefined();
      });

      it.each(requiredSurfaceKeys)('surface.%s is a non-empty string', (key) => {
        expect(typeof scheme.surface[key]).toBe('string');
        expect(scheme.surface[key].length).toBeGreaterThan(0);
      });

      it.each(requiredAccentKeys)('accent.%s is a non-empty string', (key) => {
        expect(typeof scheme.accent[key]).toBe('string');
        expect(scheme.accent[key].length).toBeGreaterThan(0);
      });

      it.each(requiredCvdKeys)('cvd.%s is a non-empty string', (key) => {
        expect(typeof scheme.cvd[key]).toBe('string');
        expect(scheme.cvd[key].length).toBeGreaterThan(0);
      });
    });
  }

  it('dark and light have distinct ground surfaces', () => {
    expect(dark.surface.ground).not.toBe(light.surface.ground);
  });

  it('cvd.buy and cvd.sell differ from accent.positive/negative in both schemes', () => {
    expect(dark.cvd.buy).not.toBe(dark.accent.positive);
    expect(dark.cvd.sell).not.toBe(dark.accent.negative);
    expect(light.cvd.buy).not.toBe(light.accent.positive);
    expect(light.cvd.sell).not.toBe(light.accent.negative);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run:
```bash
npm test --workspace=@starui/design-system -- tokens/colorScheme-contract
```

Expected: FAIL — "Cannot find module" or the existing tokens don't have the new shape (`quaternary`, `cvd`, `elevation`).

- [ ] **Step 3: Copy patch tokens into the package**

Run:
```bash
cp /Users/develop/wfh/sternui/patch/design-system/tokens/primitives.ts \
   /Users/develop/wfh/sternui/packages/shared/foundation/design-system/src/tokens/primitives.ts
cp /Users/develop/wfh/sternui/patch/design-system/tokens/semantic.ts \
   /Users/develop/wfh/sternui/packages/shared/foundation/design-system/src/tokens/semantic.ts
```

- [ ] **Step 4: Run the test, expect pass**

Run:
```bash
npm test --workspace=@starui/design-system -- tokens/colorScheme-contract
```

Expected: all assertions pass.

- [ ] **Step 5: Run typecheck for the workspace**

Run:
```bash
npm run typecheck --workspace=@starui/design-system
```

Expected: clean — no TS errors. (`components.ts` and `index.ts` may still reference older token shapes; we'll fix them in Tasks 4–5. If typecheck fails on those files, note the errors and continue — they're addressed next.)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/foundation/design-system/src/tokens/primitives.ts \
        packages/shared/foundation/design-system/src/tokens/semantic.ts \
        packages/shared/foundation/design-system/tests/tokens/colorScheme-contract.test.ts
git commit -m "$(cat <<'EOF'
feat(design-system): adopt Chroma Desk tokens (light + dark)

Single theme, two modes. Light = cool graphite-grey ground at ~89% L
with deep cool-charcoal text (AAA at ~16.5:1). Dark = balanced
graphite chrome with vivid mint-teal/rose and signature cyan brand.
Geist + JetBrains Mono unified across modes. CVD slots present on
both schemes for the orthogonal override layer.

Adds runtime contract test asserting both schemes implement every
required ColorScheme key.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Rewrite `components.ts` to match new ColorScheme shape

**Files:**
- Replace: `packages/shared/foundation/design-system/src/tokens/components.ts`

- [ ] **Step 1: Read the current components.ts to capture the component-token surface area**

Run:
```bash
sed -n '1,80p' packages/shared/foundation/design-system/src/tokens/components.ts
```

Note: the existing file uses `scheme.accent.info`, `scheme.action.buyBg`, etc. Most references survive the rename — only `quaternary` is new.

- [ ] **Step 2: Replace the file**

Create `packages/shared/foundation/design-system/src/tokens/components.ts`:

```ts
// ─────────────────────────────────────────────────────────────
//  Chroma Desk — Component Tokens
//  Per-component overrides that both shadcn and PrimeNG consume.
//  Values reference semantic-scheme slots, never primitives directly.
//
//  Brand accent is `scheme.accent.info`. `scheme.accent.warning` is
//  semantic-only — never used for primary buttons, focus rings, or
//  tab indicators. The Chroma Desk identity reserves the brand cyan
//  (dark) / deep blue (light) for those moments.
// ─────────────────────────────────────────────────────────────

import { typography, radius, spacing } from './primitives';
import type { ColorScheme } from './semantic';

export function componentTokens(scheme: ColorScheme) {
  return {
    button: {
      fontFamily:    typography.fontFamily.sans,
      fontSize:      typography.fontSize.md,
      fontWeight:    typography.fontWeight.semibold,
      letterSpacing: typography.letterSpacing.normal,
      borderRadius:  radius.md,
      paddingX:      `${spacing[4]}px`,
      paddingY:      `${spacing[2]}px`,
      primary: {
        background:       scheme.accent.info,
        backgroundHover:  scheme.accent.infoHover,
        color:            '#ffffff',
      },
      buy: {
        background:       scheme.action.buyBg,
        backgroundHover:  scheme.accent.positiveHover,
        color:            scheme.action.buyText,
      },
      sell: {
        background:       scheme.action.sellBg,
        backgroundHover:  scheme.accent.negativeHover,
        color:            scheme.action.sellText,
      },
      ghost: {
        background:       'transparent',
        backgroundHover:  scheme.state.hoverOverlay,
        color:            scheme.text.secondary,
        borderColor:      scheme.border.secondary,
      },
      disabled: {
        background: scheme.state.disabledBg,
        color:      scheme.state.disabledFg,
        opacity:    0.6,
      },
    },

    input: {
      fontFamily:       typography.fontFamily.sans,
      fontSize:         typography.fontSize.sm,
      background:       'transparent',
      color:            scheme.text.primary,
      borderColor:      scheme.border.secondary,
      borderColorHover: scheme.accent.info,
      borderColorFocus: scheme.accent.info,
      focusRingBg:      scheme.state.focusRingBg,
      borderRadius:     radius.sm,
      placeholderColor: scheme.text.muted,
      paddingX:         `${spacing[2.5]}px`,
      paddingY:         `${spacing[1.5]}px`,
      disabledBg:       scheme.state.disabledBg,
      disabledColor:    scheme.state.disabledFg,
    },

    tab: {
      fontFamily:     typography.fontFamily.sans,
      fontSize:       typography.fontSize.sm,
      fontWeight:     typography.fontWeight.medium,
      color:          scheme.text.secondary,
      colorActive:    scheme.text.primary,
      indicatorColor: scheme.accent.info,
      indicatorWidth: '2px',
      paddingX:       `${spacing[3]}px`,
      paddingY:       `${spacing[2]}px`,
    },

    badge: {
      fontFamily:   typography.fontFamily.mono,
      fontSize:     typography.fontSize.xs,
      fontWeight:   typography.fontWeight.medium,
      borderRadius: radius.sm,
      paddingX:     `${spacing[1.5]}px`,
      paddingY:     '1px',
      filled:    { background: scheme.overlay.positiveSoft, color: scheme.accent.positive, border: scheme.overlay.positiveRing },
      partial:   { background: scheme.overlay.warningSoft,  color: scheme.accent.warning,  border: scheme.overlay.warningRing },
      pending:   { background: scheme.overlay.infoSoft,     color: scheme.accent.info,     border: scheme.overlay.infoRing },
      error:     { background: scheme.overlay.negativeSoft, color: scheme.accent.negative, border: scheme.overlay.negativeRing },
      neutral:   { background: scheme.overlay.neutralSoft,  color: scheme.text.muted,      border: scheme.overlay.neutralRing },
    },

    table: {
      fontFamily:          typography.fontFamily.mono,
      fontSize:            typography.fontSize.sm,
      headerFontSize:      typography.fontSize.xs,
      headerFontWeight:    typography.fontWeight.regular,
      headerLetterSpacing: typography.letterSpacing.wide,
      headerBackground:    scheme.surface.secondary,
      headerColor:         scheme.text.secondary,
      rowBackground:       scheme.surface.primary,
      rowBackgroundHover:  scheme.surface.secondary,
      rowBorderColor:      scheme.border.primary,
      selectedRowBg:       scheme.overlay.infoSoft,
      cellPaddingX:        `${spacing[2.5]}px`,
      cellPaddingY:        `${spacing[1.5]}px`,
    },

    card: {
      background:   scheme.surface.primary,
      borderColor:  scheme.border.primary,
      borderRadius: radius.md,
      shadow:       scheme.elevation.card,
    },

    tooltip: {
      fontFamily:   typography.fontFamily.sans,
      fontSize:     typography.fontSize.sm,
      background:   scheme.surface.secondary,
      color:        scheme.text.primary,
      borderColor:  scheme.border.primary,
      borderRadius: radius.sm,
      paddingX:     `${spacing[2.5]}px`,
      paddingY:     `${spacing[1.5]}px`,
    },

    scrollbar: {
      width:      '10px',
      thumbColor: scheme.scrollbar,
      trackColor: 'transparent',
      radius:     radius.lg,
    },
  } as const;
}
```

- [ ] **Step 3: Run typecheck**

Run:
```bash
npm run typecheck --workspace=@starui/design-system
```

Expected: clean. The `components.ts` references `scheme.accent.info`, `scheme.action.buyBg`, etc. — all valid keys on the new `ColorScheme`. The old `instrumentBar` and `countdownRing` slots are removed; if anything in the existing index.ts re-exports them, expect failures here that the next task fixes.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/foundation/design-system/src/tokens/components.ts
git commit -m "$(cat <<'EOF'
feat(design-system): rewrite components.ts for Chroma Desk schemes

Per-component tokens (button, input, tab, badge, table, card,
tooltip, scrollbar). Drops old instrumentBar/countdownRing slots
and any cockpit-specific tokens. All values resolve via
scheme.* — no primitives leak through.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Refresh tokens barrel + design-system root index

**Files:**
- Create: `packages/shared/foundation/design-system/src/tokens/index.ts`
- Modify: `packages/shared/foundation/design-system/src/index.ts`

- [ ] **Step 1: Create the tokens barrel**

Create `packages/shared/foundation/design-system/src/tokens/index.ts`:

```ts
export {
  primitives, colors, typography, spacing, radius, opacity, transition, shadow,
} from './primitives';
export { semantic, dark, light, shared } from './semantic';
export type { ColorScheme } from './semantic';
export { componentTokens } from './components';
```

- [ ] **Step 2: Read the current root index.ts**

Run:
```bash
cat packages/shared/foundation/design-system/src/index.ts
```

It currently re-exports a flat list. We'll replace it with a barrel that points at the sub-barrels and the new applyTheme helper (which we add in Task 7).

- [ ] **Step 3: Rewrite the root index.ts**

Replace the entire contents of `packages/shared/foundation/design-system/src/index.ts` with:

```ts
// ─────────────────────────────────────────────────────────────
//  @starui/design-system — Public API
//
//  Subpath imports for direct adapter access:
//    @starui/design-system/tailwind  → tailwindPreset
//    @starui/design-system/primeng   → primengPreset
//    @starui/design-system/css       → bundled stylesheet (theme + scrollbar + base)
//
//  Root import for tokens + helpers:
//    import { dark, light, componentTokens, applyTheme } from '@starui/design-system';
// ─────────────────────────────────────────────────────────────

export * from './tokens';
export * from './adapters';
export { applyTheme, getTheme, type ThemeOptions } from './applyTheme';
export {
  SideCellRenderer, StatusBadgeRenderer, ColoredValueRenderer,
  OasValueRenderer, SignedValueRenderer, TickerCellRenderer,
  RatingBadgeRenderer, PnlValueRenderer, FilledAmountRenderer,
  BookNameRenderer, ChangeValueRenderer, YtdValueRenderer,
  RfqStatusRenderer,
} from './cellRenderers';
```

- [ ] **Step 4: Add a stub adapters barrel so `export * from './adapters'` typechecks**

Create `packages/shared/foundation/design-system/src/adapters/index.ts`:

```ts
// Adapter barrels filled in across Tasks 8-11.
export {};
```

- [ ] **Step 5: Add a stub applyTheme so `export { applyTheme } …` typechecks**

Create `packages/shared/foundation/design-system/src/applyTheme.ts`:

```ts
// Real implementation in Task 7.
export type ThemeOptions = { theme: 'dark' | 'light'; cvd?: boolean };
export function applyTheme(_opts: ThemeOptions): void { /* stub */ }
export function getTheme(): ThemeOptions { return { theme: 'dark' }; }
```

- [ ] **Step 6: Run typecheck**

Run:
```bash
npm run typecheck --workspace=@starui/design-system
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/foundation/design-system/src/tokens/index.ts \
        packages/shared/foundation/design-system/src/index.ts \
        packages/shared/foundation/design-system/src/adapters/index.ts \
        packages/shared/foundation/design-system/src/applyTheme.ts
git commit -m "$(cat <<'EOF'
chore(design-system): scaffold barrels + applyTheme stub

Sets up the public API shape so adapter tasks can fill in behind
stable imports.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add WCAG contrast utility (used by audit + components)

**Files:**
- Create: `packages/shared/foundation/design-system/src/internal/wcag.ts`
- Test: `packages/shared/foundation/design-system/tests/internal/wcag.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/foundation/design-system/tests/internal/wcag.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contrastRatio, hexToRgb } from '../../src/internal/wcag';

describe('wcag', () => {
  it('hexToRgb parses #rrggbb', () => {
    expect(hexToRgb('#0f1218')).toEqual({ r: 15, g: 18, b: 24 });
  });

  it('hexToRgb parses #rgb shorthand', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('contrastRatio for white-on-black is 21', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });

  it('contrastRatio for identical colors is 1', () => {
    expect(contrastRatio('#abcdef', '#abcdef')).toBeCloseTo(1, 5);
  });

  it('contrastRatio returns ratio >= 1', () => {
    expect(contrastRatio('#ffaaff', '#aaccaa')).toBeGreaterThanOrEqual(1);
  });

  it('Chroma Desk light primary text on ground meets AAA (≥7)', () => {
    // coolInk[0] on chromeLight[100]
    expect(contrastRatio('#0f1218', '#e2e6ee')).toBeGreaterThanOrEqual(7);
  });

  it('Chroma Desk dark primary text on ground meets AAA (≥7)', () => {
    // graphite[50] on graphite[975]
    expect(contrastRatio('#ecf0f5', '#0b0d10')).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run:
```bash
npm test --workspace=@starui/design-system -- internal/wcag
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement wcag.ts**

Create `packages/shared/foundation/design-system/src/internal/wcag.ts`:

```ts
// ─────────────────────────────────────────────────────────────
//  WCAG contrast utilities — used by adapters + audit script.
//  Pure TS, no deps. Hex strings only (#rgb / #rrggbb).
// ─────────────────────────────────────────────────────────────

export interface Rgb { r: number; g: number; b: number; }

export function hexToRgb(hex: string): Rgb {
  const v = hex.replace(/^#/, '');
  const expanded = v.length === 3
    ? v.split('').map((c) => c + c).join('')
    : v;
  if (expanded.length !== 6) throw new Error(`Invalid hex: ${hex}`);
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function relLuminance({ r, g, b }: Rgb): number {
  const norm = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b);
}

/** WCAG 2.1 contrast ratio between two hex colors. */
export function contrastRatio(fg: string, bg: string): number {
  const lf = relLuminance(hexToRgb(fg));
  const lb = relLuminance(hexToRgb(bg));
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

/** Convert hex to HSL channel string ("210 14% 23%") for shadcn vars. */
export function hexToHslChannel(hex: string): string {
  const { r: rr, g: gg, b: bb } = hexToRgb(hex);
  const r = rr / 255, g = gg / 255, b = bb / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0% ${Math.round(l * 100)}%`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
```

- [ ] **Step 4: Run test, expect pass**

Run:
```bash
npm test --workspace=@starui/design-system -- internal/wcag
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/foundation/design-system/src/internal/wcag.ts \
        packages/shared/foundation/design-system/tests/internal/wcag.test.ts
git commit -m "$(cat <<'EOF'
feat(design-system): add WCAG contrast utility (internal)

Pure TS helpers for hex parsing, relative luminance, contrast ratio,
and hex→HSL channel conversion (for shadcn vars). Used by the css
adapter and the build-time audit script. Confirms Chroma Desk's
primary text meets AAA against its ground in both modes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Implement `applyTheme` helper

**Files:**
- Modify: `packages/shared/foundation/design-system/src/applyTheme.ts`
- Test: `packages/shared/foundation/design-system/tests/applyTheme.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/foundation/design-system/tests/applyTheme.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyTheme, getTheme } from '../src/applyTheme';

describe('applyTheme', () => {
  beforeEach(() => {
    // jsdom-less environment: stub document
    (globalThis as any).document = { documentElement: { setAttribute: vi.fn(), removeAttribute: vi.fn() } };
    (globalThis as any).localStorage = (() => {
      const store = new Map<string, string>();
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      };
    })();
  });

  it('sets data-theme="dark" on <html>', () => {
    applyTheme({ theme: 'dark' });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
  });

  it('sets data-theme="light" on <html>', () => {
    applyTheme({ theme: 'light' });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });

  it('sets data-cvd="on" when cvd: true', () => {
    applyTheme({ theme: 'dark', cvd: true });
    expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-cvd', 'on');
  });

  it('removes data-cvd when cvd: false', () => {
    applyTheme({ theme: 'dark', cvd: false });
    expect(document.documentElement.removeAttribute).toHaveBeenCalledWith('data-cvd');
  });

  it('persists choice to localStorage under "@starui/theme"', () => {
    applyTheme({ theme: 'light', cvd: true });
    expect(localStorage.getItem('@starui/theme')).toBe(JSON.stringify({ theme: 'light', cvd: true }));
  });

  it('getTheme reads back persisted value', () => {
    applyTheme({ theme: 'light', cvd: false });
    expect(getTheme()).toEqual({ theme: 'light', cvd: false });
  });

  it('getTheme returns dark default when nothing persisted', () => {
    localStorage.removeItem('@starui/theme');
    expect(getTheme()).toEqual({ theme: 'dark' });
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run:
```bash
npm test --workspace=@starui/design-system -- applyTheme
```

Expected: most assertions fail (the stub has no real implementation).

- [ ] **Step 3: Implement applyTheme**

Replace `packages/shared/foundation/design-system/src/applyTheme.ts` with:

```ts
// ─────────────────────────────────────────────────────────────
//  applyTheme — flip <html data-theme> and <html data-cvd> to
//  match the user's preference and persist to localStorage.
//
//  Apps call applyTheme() once at boot (and whenever the user
//  toggles). The CSS in @starui/design-system/css does the rest.
// ─────────────────────────────────────────────────────────────

export type Mode = 'dark' | 'light';

export interface ThemeOptions {
  theme: Mode;
  cvd?: boolean;
}

const STORAGE_KEY = '@starui/theme';

export function applyTheme(opts: ThemeOptions): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', opts.theme);
  if (opts.cvd) {
    document.documentElement.setAttribute('data-cvd', 'on');
  } else {
    document.documentElement.removeAttribute('data-cvd');
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
    } catch { /* private mode / quota */ }
  }
}

export function getTheme(): ThemeOptions {
  if (typeof localStorage === 'undefined') return { theme: 'dark' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { theme: 'dark' };
    const parsed = JSON.parse(raw) as Partial<ThemeOptions>;
    if (parsed.theme !== 'dark' && parsed.theme !== 'light') return { theme: 'dark' };
    return { theme: parsed.theme, ...(parsed.cvd ? { cvd: true } : {}) };
  } catch {
    return { theme: 'dark' };
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run:
```bash
npm test --workspace=@starui/design-system -- applyTheme
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/foundation/design-system/src/applyTheme.ts \
        packages/shared/foundation/design-system/tests/applyTheme.test.ts
git commit -m "$(cat <<'EOF'
feat(design-system): applyTheme/getTheme helpers

Single entry-point apps use to set data-theme and data-cvd on
<html>, with localStorage persistence under @starui/theme. Read
back via getTheme() at boot; defaults to dark.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Implement Tailwind preset adapter

**Files:**
- Create: `packages/shared/foundation/design-system/src/adapters/tailwind.ts`
- Test: `packages/shared/foundation/design-system/tests/adapters/tailwind.test.ts`
- Modify: `packages/shared/foundation/design-system/src/adapters/index.ts`

- [ ] **Step 1: Write the failing snapshot test**

Create `packages/shared/foundation/design-system/tests/adapters/tailwind.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tailwindPreset } from '../../src/adapters/tailwind';

describe('tailwindPreset', () => {
  it('sets darkMode to data-theme attribute selector', () => {
    expect(tailwindPreset.darkMode).toEqual(['selector', '[data-theme="dark"]']);
  });

  it('exposes shadcn-compat color names via theme.extend.colors', () => {
    const colors = tailwindPreset.theme?.extend?.colors as Record<string, unknown>;
    for (const k of [
      'background', 'foreground', 'card', 'popover', 'primary', 'secondary',
      'muted', 'accent', 'destructive', 'border', 'input', 'ring',
      'success', 'warning', 'info',
    ]) {
      expect(colors[k]).toBeDefined();
    }
  });

  it('exposes surface scale 50..950 for parity with PrimeNG', () => {
    const colors = tailwindPreset.theme?.extend?.colors as any;
    for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      expect(colors.surface[k]).toBeDefined();
    }
  });

  it('matches snapshot', () => {
    expect(tailwindPreset).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run:
```bash
npm test --workspace=@starui/design-system -- adapters/tailwind
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the preset**

Create `packages/shared/foundation/design-system/src/adapters/tailwind.ts`:

```ts
// ─────────────────────────────────────────────────────────────
//  Tailwind Preset — consumed by every React + Angular app.
//
//  Emits both shadcn-compat color names (bg-primary, bg-card,
//  text-foreground, etc.) AND a surface scale (bg-surface-50 …
//  bg-surface-950) for parity with tailwindcss-primeui's plugin.
//  All values reference CSS custom properties on <html>, so theme
//  switching is just `data-theme="dark|light"` flips.
// ─────────────────────────────────────────────────────────────

import primeui from 'tailwindcss-primeui';
import animate from 'tailwindcss-animate';
import type { Config } from 'tailwindcss';

const hsl = (v: string) => `hsl(var(${v}))`;

export const tailwindPreset: Partial<Config> = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--ds-font-sans)'],
        mono: ['var(--ds-font-mono)'],
        serif: ['var(--ds-font-serif)'],
      },
      borderRadius: {
        sm: 'var(--ds-radius-sm)',
        md: 'var(--ds-radius-md)',
        lg: 'var(--ds-radius-lg)',
        xl: 'var(--ds-radius-xl)',
      },
      colors: {
        // shadcn-compat names (HSL channel vars)
        background: hsl('--background'),
        foreground: hsl('--foreground'),
        card: {
          DEFAULT: hsl('--card'),
          foreground: hsl('--card-foreground'),
        },
        popover: {
          DEFAULT: hsl('--popover'),
          foreground: hsl('--popover-foreground'),
        },
        primary: {
          DEFAULT: hsl('--primary'),
          foreground: hsl('--primary-foreground'),
        },
        secondary: {
          DEFAULT: hsl('--secondary'),
          foreground: hsl('--secondary-foreground'),
        },
        muted: {
          DEFAULT: hsl('--muted'),
          foreground: hsl('--muted-foreground'),
        },
        accent: {
          DEFAULT: hsl('--accent'),
          foreground: hsl('--accent-foreground'),
        },
        destructive: {
          DEFAULT: hsl('--destructive'),
          foreground: hsl('--destructive-foreground'),
        },
        success: {
          DEFAULT: hsl('--success'),
          foreground: hsl('--success-foreground'),
        },
        warning: {
          DEFAULT: hsl('--warning'),
          foreground: hsl('--warning-foreground'),
        },
        info: {
          DEFAULT: hsl('--info'),
          foreground: hsl('--info-foreground'),
        },
        border: hsl('--border'),
        input: hsl('--input'),
        ring: hsl('--ring'),

        // Surface scale — parity with tailwindcss-primeui
        surface: {
          50:  hsl('--surface-50'),
          100: hsl('--surface-100'),
          200: hsl('--surface-200'),
          300: hsl('--surface-300'),
          400: hsl('--surface-400'),
          500: hsl('--surface-500'),
          600: hsl('--surface-600'),
          700: hsl('--surface-700'),
          800: hsl('--surface-800'),
          900: hsl('--surface-900'),
          950: hsl('--surface-950'),
        },
      },
      boxShadow: {
        card:    'var(--ds-elevation-card)',
        overlay: 'var(--ds-elevation-overlay)',
        glow:    'var(--ds-elevation-glow)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate, primeui],
};
```

- [ ] **Step 4: Add `tailwindcss-primeui` and `tailwindcss-animate` as deps**

Open `packages/shared/foundation/design-system/package.json`. Add to `dependencies`:

```json
"dependencies": {
  "turbo": "^2.9.6",
  "tailwindcss-animate": "^1.0.7",
  "tailwindcss-primeui": "^0.7.0"
},
```

Add to `peerDependencies`:

```json
"peerDependencies": {
  "ag-grid-community": ">=35.0.0",
  "tailwindcss": "3.4.1"
},
```

- [ ] **Step 5: Run install and tests**

Run:
```bash
npm install --legacy-peer-deps
npm test --workspace=@starui/design-system -- adapters/tailwind
```

Expected: 3 explicit assertions pass, plus the snapshot writes a new file `tests/adapters/__snapshots__/tailwind.test.ts.snap`.

- [ ] **Step 6: Update the adapters barrel**

Replace `packages/shared/foundation/design-system/src/adapters/index.ts` with:

```ts
export { tailwindPreset } from './tailwind';
```

- [ ] **Step 7: Run typecheck**

Run:
```bash
npm run typecheck --workspace=@starui/design-system
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/foundation/design-system/src/adapters/tailwind.ts \
        packages/shared/foundation/design-system/src/adapters/index.ts \
        packages/shared/foundation/design-system/tests/adapters/tailwind.test.ts \
        packages/shared/foundation/design-system/tests/adapters/__snapshots__/tailwind.test.ts.snap \
        packages/shared/foundation/design-system/package.json \
        package-lock.json
git commit -m "$(cat <<'EOF'
feat(design-system): tailwind preset adapter (shadcn + primeui parity)

Single tailwindPreset consumed by every React + Angular tailwind.config.
Emits shadcn-compat color names (bg-primary, bg-card, …) and a
surface scale (bg-surface-50…950) compatible with tailwindcss-primeui.
darkMode flips on [data-theme="dark"] — same attribute applyTheme()
sets and the css adapter targets.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Implement shadcn CSS generator (the unified theme.css)

**Files:**
- Create: `packages/shared/foundation/design-system/src/adapters/shadcn.ts`
- Test: `packages/shared/foundation/design-system/tests/adapters/shadcn.test.ts`
- Modify: `packages/shared/foundation/design-system/src/adapters/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/foundation/design-system/tests/adapters/shadcn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateUnifiedCSS } from '../../src/adapters/shadcn';

describe('generateUnifiedCSS', () => {
  const css = generateUnifiedCSS();

  it('contains @layer base', () => {
    expect(css).toMatch(/@layer base \{/);
  });

  it('contains :root, [data-theme="dark"] block', () => {
    expect(css).toMatch(/:root,\s*\[data-theme="dark"\]\s*\{/);
  });

  it('contains [data-theme="light"] block', () => {
    expect(css).toMatch(/\[data-theme="light"\]\s*\{/);
  });

  it('contains [data-theme="dark"][data-cvd="on"] CVD override', () => {
    expect(css).toMatch(/\[data-theme="dark"\]\[data-cvd="on"\]\s*\{/);
  });

  it('contains [data-theme="light"][data-cvd="on"] CVD override', () => {
    expect(css).toMatch(/\[data-theme="light"\]\[data-cvd="on"\]\s*\{/);
  });

  it('emits --ds-* source vars (e.g. --ds-surface-ground)', () => {
    expect(css).toMatch(/--ds-surface-ground:\s*#/);
  });

  it('emits shadcn HSL aliases (e.g. --background)', () => {
    expect(css).toMatch(/--background:\s*\d+\s+\d+%\s+\d+%/);
  });

  it('emits PrimeNG --p-* aliases (e.g. --p-primary-color)', () => {
    expect(css).toMatch(/--p-primary-color/);
  });

  it('emits surface scale --surface-50..950 (HSL channels)', () => {
    expect(css).toMatch(/--surface-50:\s*\d+\s+\d+%\s+\d+%/);
    expect(css).toMatch(/--surface-950:\s*\d+\s+\d+%\s+\d+%/);
  });

  it('matches snapshot', () => {
    expect(css).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run:
```bash
npm test --workspace=@starui/design-system -- adapters/shadcn
```

Expected: FAIL.

- [ ] **Step 3: Implement the generator**

Create `packages/shared/foundation/design-system/src/adapters/shadcn.ts`:

```ts
// ─────────────────────────────────────────────────────────────
//  Unified CSS Generator
//  Emits the entire theme.css consumed by every app.
//
//  Layer order:
//    1. Chroma Desk · Dark — :root + [data-theme="dark"]
//    2. Chroma Desk · Light — [data-theme="light"]
//    3. CVD override (dark) — [data-theme="dark"][data-cvd="on"]
//    4. CVD override (light) — [data-theme="light"][data-cvd="on"]
//
//  Each base block emits THREE token namespaces:
//    --ds-*       source tokens (hex / rgba)
//    --*          shadcn-compat HSL channel aliases
//    --p-*        PrimeNG / tailwindcss-primeui aliases
// ─────────────────────────────────────────────────────────────

import { dark, light, type ColorScheme } from '../tokens/semantic';
import { typography, radius, transition } from '../tokens/primitives';
import { hexToHslChannel } from '../internal/wcag';

function dsVars(scheme: ColorScheme): string {
  return `
    /* ── Chroma Desk source tokens ── */
    --ds-surface-ground:     ${scheme.surface.ground};
    --ds-surface-primary:    ${scheme.surface.primary};
    --ds-surface-secondary:  ${scheme.surface.secondary};
    --ds-surface-tertiary:   ${scheme.surface.tertiary};
    --ds-surface-quaternary: ${scheme.surface.quaternary};

    --ds-text-primary:   ${scheme.text.primary};
    --ds-text-secondary: ${scheme.text.secondary};
    --ds-text-muted:     ${scheme.text.muted};
    --ds-text-faint:     ${scheme.text.faint};

    --ds-border-primary:   ${scheme.border.primary};
    --ds-border-secondary: ${scheme.border.secondary};

    --ds-accent-positive:       ${scheme.accent.positive};
    --ds-accent-positive-hover: ${scheme.accent.positiveHover};
    --ds-accent-negative:       ${scheme.accent.negative};
    --ds-accent-negative-hover: ${scheme.accent.negativeHover};
    --ds-accent-warning:        ${scheme.accent.warning};
    --ds-accent-info:           ${scheme.accent.info};
    --ds-accent-info-hover:     ${scheme.accent.infoHover};
    --ds-accent-highlight:      ${scheme.accent.highlight};
    --ds-accent-purple:         ${scheme.accent.purple};

    --ds-action-buy-bg:    ${scheme.action.buyBg};
    --ds-action-buy-fg:    ${scheme.action.buyText};
    --ds-action-sell-bg:   ${scheme.action.sellBg};
    --ds-action-sell-fg:   ${scheme.action.sellText};

    --ds-state-focus-ring:    ${scheme.state.focusRing};
    --ds-state-focus-ring-bg: ${scheme.state.focusRingBg};
    --ds-state-disabled-bg:   ${scheme.state.disabledBg};
    --ds-state-disabled-fg:   ${scheme.state.disabledFg};
    --ds-state-hover-overlay: ${scheme.state.hoverOverlay};
    --ds-state-selection:     ${scheme.state.selection};

    --ds-overlay-positive-soft:  ${scheme.overlay.positiveSoft};
    --ds-overlay-positive-ring:  ${scheme.overlay.positiveRing};
    --ds-overlay-negative-soft:  ${scheme.overlay.negativeSoft};
    --ds-overlay-negative-ring:  ${scheme.overlay.negativeRing};
    --ds-overlay-warning-soft:   ${scheme.overlay.warningSoft};
    --ds-overlay-warning-ring:   ${scheme.overlay.warningRing};
    --ds-overlay-info-soft:      ${scheme.overlay.infoSoft};
    --ds-overlay-info-ring:      ${scheme.overlay.infoRing};
    --ds-overlay-neutral-soft:   ${scheme.overlay.neutralSoft};
    --ds-overlay-neutral-ring:   ${scheme.overlay.neutralRing};

    --ds-scrollbar:  ${scheme.scrollbar};

    --ds-elevation-card:    ${scheme.elevation.card};
    --ds-elevation-overlay: ${scheme.elevation.overlay};
    --ds-elevation-glow:    ${scheme.elevation.glow};

    /* ── shadcn-compat HSL channel aliases ── */
    --background:           ${hexToHslChannel(scheme.surface.ground)};
    --foreground:           ${hexToHslChannel(scheme.text.primary)};
    --card:                 ${hexToHslChannel(scheme.surface.primary)};
    --card-foreground:      ${hexToHslChannel(scheme.text.primary)};
    --popover:              ${hexToHslChannel(scheme.surface.primary)};
    --popover-foreground:   ${hexToHslChannel(scheme.text.primary)};
    --primary:              ${hexToHslChannel(scheme.accent.info)};
    --primary-foreground:   0 0% 100%;
    --secondary:            ${hexToHslChannel(scheme.surface.tertiary)};
    --secondary-foreground: ${hexToHslChannel(scheme.text.secondary)};
    --muted:                ${hexToHslChannel(scheme.surface.secondary)};
    --muted-foreground:     ${hexToHslChannel(scheme.text.muted)};
    --accent:               ${hexToHslChannel(scheme.surface.tertiary)};
    --accent-foreground:    ${hexToHslChannel(scheme.text.primary)};
    --destructive:          ${hexToHslChannel(scheme.accent.negative)};
    --destructive-foreground: 0 0% 100%;
    --success:              ${hexToHslChannel(scheme.accent.positive)};
    --success-foreground:   0 0% 100%;
    --warning:              ${hexToHslChannel(scheme.accent.warning)};
    --warning-foreground:   0 0% 100%;
    --info:                 ${hexToHslChannel(scheme.accent.info)};
    --info-foreground:      0 0% 100%;
    --border:               ${hexToHslChannel(scheme.border.primary)};
    --input:                ${hexToHslChannel(scheme.border.primary)};
    --ring:                 ${hexToHslChannel(scheme.accent.info)};

    --surface-50:  ${hexToHslChannel(scheme.surface.primary)};
    --surface-100: ${hexToHslChannel(scheme.surface.secondary)};
    --surface-200: ${hexToHslChannel(scheme.surface.tertiary)};
    --surface-300: ${hexToHslChannel(scheme.surface.quaternary)};
    --surface-400: ${hexToHslChannel(scheme.border.secondary)};
    --surface-500: ${hexToHslChannel(scheme.border.primary)};
    --surface-600: ${hexToHslChannel(scheme.text.faint)};
    --surface-700: ${hexToHslChannel(scheme.text.muted)};
    --surface-800: ${hexToHslChannel(scheme.text.secondary)};
    --surface-900: ${hexToHslChannel(scheme.text.primary)};
    --surface-950: ${hexToHslChannel(scheme.surface.ground)};

    /* ── PrimeNG var bridge (for tailwindcss-primeui) ── */
    --p-primary-color:        ${scheme.accent.info};
    --p-primary-color-text:   #ffffff;
    --p-surface-50:           ${scheme.surface.primary};
    --p-surface-100:          ${scheme.surface.secondary};
    --p-surface-200:          ${scheme.surface.tertiary};
    --p-surface-900:          ${scheme.text.primary};
    --p-surface-950:          ${scheme.surface.ground};
    --p-text-color:           ${scheme.text.primary};
    --p-text-muted-color:     ${scheme.text.muted};
    --p-content-background:   ${scheme.surface.primary};
    --p-content-border-color: ${scheme.border.primary};
    --p-content-color:        ${scheme.text.primary};

    /* ── Typography vars ── */
    --ds-font-sans:  ${typography.fontFamily.sans};
    --ds-font-mono:  ${typography.fontFamily.mono};
    --ds-font-serif: ${typography.fontFamily.serif};
    --ds-radius-sm:  ${radius.sm};
    --ds-radius-md:  ${radius.md};
    --ds-radius-lg:  ${radius.lg};
    --ds-radius-xl:  ${radius.xl};
    --radius:        ${radius.md};

    /* ── Motion vars ── */
    --ds-tx-fast:   ${transition.fast};
    --ds-tx-normal: ${transition.normal};
    --ds-tx-slow:   ${transition.slow};`;
}

function cvdOverride(scheme: ColorScheme): string {
  return `
    --ds-accent-positive:       ${scheme.cvd.buy};
    --ds-accent-positive-hover: ${scheme.cvd.buy};
    --ds-accent-negative:       ${scheme.cvd.sell};
    --ds-accent-negative-hover: ${scheme.cvd.sell};
    --ds-action-buy-bg:         ${scheme.cvd.buy};
    --ds-action-sell-bg:        ${scheme.cvd.sell};
    --success:                  ${hexToHslChannel(scheme.cvd.buy)};
    --destructive:              ${hexToHslChannel(scheme.cvd.sell)};`;
}

export function generateUnifiedCSS(): string {
  return `@layer base {
  :root, [data-theme="dark"] {${dsVars(dark)}
  }

  [data-theme="light"] {${dsVars(light)}
  }

  [data-theme="dark"][data-cvd="on"] {${cvdOverride(dark)}
  }

  [data-theme="light"][data-cvd="on"] {${cvdOverride(light)}
  }
}`;
}
```

- [ ] **Step 4: Run, expect pass**

Run:
```bash
npm test --workspace=@starui/design-system -- adapters/shadcn
```

Expected: 9 explicit assertions pass; snapshot file `tests/adapters/__snapshots__/shadcn.test.ts.snap` written.

- [ ] **Step 5: Spot-check the snapshot**

Run:
```bash
grep -E "data-theme|--ds-surface|--background|--p-primary|--surface-50" \
  packages/shared/foundation/design-system/tests/adapters/__snapshots__/shadcn.test.ts.snap | head -30
```

Expected: each token namespace shows up; dark and light blocks both present; CVD overrides include the cvd buy/sell hex values.

- [ ] **Step 6: Update barrel**

Replace `packages/shared/foundation/design-system/src/adapters/index.ts` with:

```ts
export { tailwindPreset } from './tailwind';
export { generateUnifiedCSS } from './shadcn';
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared/foundation/design-system/src/adapters/shadcn.ts \
        packages/shared/foundation/design-system/src/adapters/index.ts \
        packages/shared/foundation/design-system/tests/adapters/shadcn.test.ts \
        packages/shared/foundation/design-system/tests/adapters/__snapshots__/shadcn.test.ts.snap
git commit -m "$(cat <<'EOF'
feat(design-system): unified css generator (theme + shadcn + primeui)

Single function emits the full theme.css. Four blocks: dark base,
light, cvd-on dark, cvd-on light. Each base block emits three token
namespaces (--ds-*, shadcn HSL aliases, PrimeNG --p-* bridge) so
all three consumer styles resolve from one cascade.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Implement PrimeNG preset adapter

**Files:**
- Create: `packages/shared/foundation/design-system/src/adapters/primeng.ts`
- Test: `packages/shared/foundation/design-system/tests/adapters/primeng.test.ts`
- Modify: `packages/shared/foundation/design-system/src/adapters/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/foundation/design-system/tests/adapters/primeng.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { primengPreset } from '../../src/adapters/primeng';

describe('primengPreset', () => {
  it('has a primitive block with borderRadius', () => {
    expect(primengPreset.primitive?.borderRadius).toBeDefined();
  });

  it('has a semantic block with primary scale 50..900', () => {
    const primary = primengPreset.semantic?.primary as Record<string, string> | undefined;
    expect(primary).toBeDefined();
    for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(primary![String(k)]).toBeDefined();
    }
  });

  it('has light and dark colorSchemes', () => {
    const cs = primengPreset.semantic?.colorScheme;
    expect(cs?.light).toBeDefined();
    expect(cs?.dark).toBeDefined();
  });

  it('uses var(--ds-*) references for live theme switching', () => {
    const json = JSON.stringify(primengPreset);
    expect(json).toMatch(/var\(--ds-/);
  });

  it('matches snapshot', () => {
    expect(primengPreset).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run:
```bash
npm test --workspace=@starui/design-system -- adapters/primeng
```

Expected: FAIL.

- [ ] **Step 3: Implement the preset**

Create `packages/shared/foundation/design-system/src/adapters/primeng.ts`:

```ts
// ─────────────────────────────────────────────────────────────
//  PrimeNG Preset — for definePreset(Aura, primengPreset)
//
//  Color values are var(--ds-*) references (live-themed).
//  Apps wire via providePrimeNG() — see SECTION 4 of the spec.
// ─────────────────────────────────────────────────────────────

import { colors, radius } from '../tokens/primitives';

const v = (name: string) => `var(--ds-${name})`;

export const primengPreset = {
  primitive: {
    borderRadius: {
      none: '0px',
      xs:   radius.sm,
      sm:   radius.sm,
      md:   radius.md,
      lg:   radius.lg,
      xl:   radius.xl,
    },
  },
  semantic: {
    primary: {
      50:  colors.brand.light,
      100: colors.brand.light,
      200: colors.brand.light,
      300: colors.brand.light,
      400: colors.brand.lightHov,
      500: v('accent-info'),
      600: v('accent-info-hover'),
      700: colors.brand.lightHov,
      800: colors.brand.lightHov,
      900: colors.brand.lightHov,
    },
    success: { 500: v('accent-positive') },
    warning: { 500: v('accent-warning') },
    danger:  { 500: v('accent-negative') },
    info:    { 500: v('accent-info') },
    fontFamily: 'var(--ds-font-sans)',
    colorScheme: {
      light: {
        surface: {
          0:   v('surface-primary'),
          50:  v('surface-ground'),
          100: v('surface-secondary'),
          200: v('surface-tertiary'),
          300: v('surface-quaternary'),
          400: v('border-secondary'),
          500: v('border-primary'),
          600: v('text-faint'),
          700: v('text-muted'),
          800: v('text-secondary'),
          900: v('text-primary'),
          950: v('surface-ground'),
        },
        primary: {
          color:         v('accent-info'),
          contrastColor: '#ffffff',
          hoverColor:    v('accent-info-hover'),
          activeColor:   v('accent-info-hover'),
        },
        text: {
          color:           v('text-primary'),
          hoverColor:      v('text-primary'),
          mutedColor:      v('text-muted'),
          hoverMutedColor: v('text-secondary'),
        },
        content: {
          background:      v('surface-primary'),
          hoverBackground: v('surface-secondary'),
          borderColor:     v('border-primary'),
          color:           v('text-primary'),
          hoverColor:      v('text-primary'),
        },
        formField: {
          background:         v('surface-primary'),
          disabledBackground: v('state-disabled-bg'),
          filledBackground:   v('surface-secondary'),
          borderColor:        v('border-secondary'),
          hoverBorderColor:   v('accent-info'),
          focusBorderColor:   v('accent-info'),
          color:              v('text-primary'),
          disabledColor:      v('state-disabled-fg'),
          placeholderColor:   v('text-muted'),
        },
      },
      dark: {
        surface: {
          0:   v('surface-ground'),
          50:  v('surface-primary'),
          100: v('surface-secondary'),
          200: v('surface-tertiary'),
          300: v('surface-quaternary'),
          400: v('border-secondary'),
          500: v('border-primary'),
          600: v('text-faint'),
          700: v('text-muted'),
          800: v('text-secondary'),
          900: v('text-primary'),
          950: v('text-primary'),
        },
        primary: {
          color:         v('accent-info'),
          contrastColor: '#0b2b20',
          hoverColor:    v('accent-info-hover'),
          activeColor:   v('accent-info-hover'),
        },
        text: {
          color:           v('text-primary'),
          hoverColor:      v('text-primary'),
          mutedColor:      v('text-muted'),
          hoverMutedColor: v('text-secondary'),
        },
        content: {
          background:      v('surface-primary'),
          hoverBackground: v('surface-secondary'),
          borderColor:     v('border-primary'),
          color:           v('text-primary'),
          hoverColor:      v('text-primary'),
        },
        formField: {
          background:         v('surface-primary'),
          disabledBackground: v('state-disabled-bg'),
          filledBackground:   v('surface-tertiary'),
          borderColor:        v('border-secondary'),
          hoverBorderColor:   v('accent-info'),
          focusBorderColor:   v('accent-info'),
          color:              v('text-primary'),
          disabledColor:      v('state-disabled-fg'),
          placeholderColor:   v('text-muted'),
        },
      },
    },
  },
  components: {
    button: {
      borderRadius: radius.md,
      paddingX:     '16px',
      paddingY:     '8px',
      fontWeight:   '600',
    },
    inputtext: {
      borderRadius: radius.sm,
      paddingX:     '10px',
      paddingY:     '6px',
    },
    datatable: {
      headerCellPadding: '6px 10px',
      bodyCellPadding:   '6px 10px',
    },
    tabs: {
      activeBorderColor: v('accent-info'),
    },
  },
} as const;
```

- [ ] **Step 4: Run, expect pass**

Run:
```bash
npm test --workspace=@starui/design-system -- adapters/primeng
```

Expected: 4 assertions pass + snapshot written.

- [ ] **Step 5: Update barrel**

Replace `packages/shared/foundation/design-system/src/adapters/index.ts` with:

```ts
export { tailwindPreset } from './tailwind';
export { generateUnifiedCSS } from './shadcn';
export { primengPreset } from './primeng';
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/foundation/design-system/src/adapters/primeng.ts \
        packages/shared/foundation/design-system/src/adapters/index.ts \
        packages/shared/foundation/design-system/tests/adapters/primeng.test.ts \
        packages/shared/foundation/design-system/tests/adapters/__snapshots__/primeng.test.ts.snap
git commit -m "$(cat <<'EOF'
feat(design-system): primeng preset adapter (var(--ds-*) referenced)

Color values reference var(--ds-*) so PrimeNG components automatically
restyle when <html data-theme> changes. Apps wire with
definePreset(Aura, primengPreset) inside providePrimeNG().

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Update AG Grid adapter to use new tokens

**Files:**
- Modify: `packages/shared/foundation/design-system/src/adapters/agGrid.ts`
- Test: `packages/shared/foundation/design-system/tests/adapters/agGrid.test.ts`
- Modify: `packages/shared/foundation/design-system/src/adapters/index.ts`

- [ ] **Step 1: Read existing agGrid.ts**

Run:
```bash
cat packages/shared/foundation/design-system/src/adapters/agGrid.ts | head -60
```

Note the existing exports: `agGridLightParams`, `agGridDarkParams`, `agGridBlotterLightParams`, `agGridBlotterDarkParams`. Each is an object passed to AG Grid theme params.

- [ ] **Step 2: Write the failing test**

Create `packages/shared/foundation/design-system/tests/adapters/agGrid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  agGridDarkParams, agGridLightParams,
  agGridBlotterDarkParams, agGridBlotterLightParams,
} from '../../src/adapters/agGrid';

describe('agGrid params', () => {
  it.each(['agGridDarkParams', agGridDarkParams] as const)
    ('%s defines backgroundColor', (_n, p) => {
      // legacy AG Grid v33 used backgroundColor; v35 uses backgroundColor too
      expect((p as any).backgroundColor).toBeDefined();
    });

  it('dark and light differ in backgroundColor', () => {
    expect((agGridDarkParams as any).backgroundColor)
      .not.toBe((agGridLightParams as any).backgroundColor);
  });

  it('blotter variants exist', () => {
    expect(agGridBlotterDarkParams).toBeDefined();
    expect(agGridBlotterLightParams).toBeDefined();
  });

  it('matches snapshot', () => {
    expect({
      dark: agGridDarkParams, light: agGridLightParams,
      blotterDark: agGridBlotterDarkParams, blotterLight: agGridBlotterLightParams,
    }).toMatchSnapshot();
  });
});
```

- [ ] **Step 3: Run, see what currently fails**

Run:
```bash
npm test --workspace=@starui/design-system -- adapters/agGrid
```

If existing exports use old token shape (e.g., `colors.charcoal[975]` doesn't exist anymore in new primitives), expect type errors at import time.

- [ ] **Step 4: Rewrite agGrid.ts to consume new schemes**

Replace `packages/shared/foundation/design-system/src/adapters/agGrid.ts` with:

```ts
// ─────────────────────────────────────────────────────────────
//  AG Grid Theme Params — Chroma Desk
//  Plug into AG Grid 35+ via theme: themeQuartz.withParams(params).
// ─────────────────────────────────────────────────────────────

import { dark, light, type ColorScheme } from '../tokens/semantic';
import { typography } from '../tokens/primitives';

function gridParams(scheme: ColorScheme) {
  return {
    backgroundColor:   scheme.surface.primary,
    foregroundColor:   scheme.text.primary,
    headerBackgroundColor: scheme.surface.secondary,
    headerTextColor:       scheme.text.secondary,
    borderColor:           scheme.border.primary,
    rowHoverColor:         scheme.surface.secondary,
    selectedRowBackgroundColor: scheme.overlay.infoSoft,
    oddRowBackgroundColor: scheme.surface.primary,
    accentColor:           scheme.accent.info,
    fontFamily:            typography.fontFamily.sans,
    fontSize:              12,
    headerFontFamily:      typography.fontFamily.sans,
    headerFontWeight:      600,
    cellHorizontalPadding: 10,
    rowHeight:             28,
    headerHeight:          32,
  };
}

function blotterParams(scheme: ColorScheme) {
  return {
    ...gridParams(scheme),
    fontFamily:       typography.fontFamily.mono,
    headerFontFamily: typography.fontFamily.sans,
    rowHeight:        24,
    headerHeight:     28,
  };
}

export const agGridDarkParams         = gridParams(dark);
export const agGridLightParams        = gridParams(light);
export const agGridBlotterDarkParams  = blotterParams(dark);
export const agGridBlotterLightParams = blotterParams(light);
```

- [ ] **Step 5: Run, expect pass**

Run:
```bash
npm test --workspace=@starui/design-system -- adapters/agGrid
```

Expected: 4 assertions pass + snapshot written.

- [ ] **Step 6: Update barrel**

Replace `packages/shared/foundation/design-system/src/adapters/index.ts` with:

```ts
export { tailwindPreset } from './tailwind';
export { generateUnifiedCSS } from './shadcn';
export { primengPreset } from './primeng';
export {
  agGridDarkParams, agGridLightParams,
  agGridBlotterDarkParams, agGridBlotterLightParams,
} from './agGrid';
```

- [ ] **Step 7: Commit**

```bash
git add packages/shared/foundation/design-system/src/adapters/agGrid.ts \
        packages/shared/foundation/design-system/src/adapters/index.ts \
        packages/shared/foundation/design-system/tests/adapters/agGrid.test.ts \
        packages/shared/foundation/design-system/tests/adapters/__snapshots__/agGrid.test.ts.snap
git commit -m "$(cat <<'EOF'
feat(design-system): AG Grid adapter on Chroma Desk schemes

Consumes the same dark/light schemes as the other adapters. Two
shapes: gridParams (sans, 28px row) and blotterParams (mono, 24px row).
Replaces the old paper/charcoal/binance-inspired params.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Add scrollbar utility + base CSS files

**Files:**
- Create: `packages/shared/foundation/design-system/src/styles/scrollbar.css`
- Create: `packages/shared/foundation/design-system/src/styles/base.css`
- Test: `packages/shared/foundation/design-system/tests/styles/scrollbar.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/shared/foundation/design-system/tests/styles/scrollbar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(__dirname, '../../src/styles/scrollbar.css'),
  'utf8',
);

describe('scrollbar.css', () => {
  it('defines exactly one .ds-scrollbar utility (and its pseudo-elements)', () => {
    // Top-level (non-pseudo) class selectors
    const matches = css.match(/^\.ds-scrollbar\s*\{/gm) ?? [];
    expect(matches.length).toBe(1);
  });

  it('uses color-mix against --ds-text-primary for theme-awareness', () => {
    expect(css).toMatch(/color-mix\(in srgb, var\(--ds-text-primary\)/);
  });

  it('does NOT define a hidden-scrollbar utility', () => {
    expect(css).not.toMatch(/scrollbar-width:\s*none/);
  });

  it('uses minimalist 10px width with 2px transparent border for thumb thickness', () => {
    expect(css).toMatch(/width:\s*10px/);
    expect(css).toMatch(/border:\s*2px\s+solid\s+transparent/);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run:
```bash
npm test --workspace=@starui/design-system -- styles/scrollbar
```

Expected: FAIL — file not found.

- [ ] **Step 3: Create the scrollbar utility**

Create `packages/shared/foundation/design-system/src/styles/scrollbar.css`:

```css
/* ─────────────────────────────────────────────────────────────
   The one and only scrollbar utility.
   Apply class="ds-scrollbar" to any scrollable container.
   Theme-aware via color-mix on --ds-text-primary; works in
   dark + light + cvd without override blocks.
   ───────────────────────────────────────────────────────────── */

.ds-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--ds-text-primary) 22%, transparent) transparent;
}
.ds-scrollbar::-webkit-scrollbar {
  width:  10px;
  height: 10px;
}
.ds-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
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
.ds-scrollbar::-webkit-scrollbar-corner {
  background: transparent;
}
```

- [ ] **Step 4: Create base reset**

Create `packages/shared/foundation/design-system/src/styles/base.css`:

```css
/* ─────────────────────────────────────────────────────────────
   Base layer — Tailwind primitives + minimal reset.
   Apps import this once via @starui/design-system/css; no need
   to also include @tailwind base in their own globals.css.
   ───────────────────────────────────────────────────────────── */

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html, body {
    background-color: var(--ds-surface-ground);
    color:            var(--ds-text-primary);
    font-family:      var(--ds-font-sans);
    -webkit-font-smoothing: antialiased;
  }

  *:focus-visible {
    outline: 2px solid var(--ds-state-focus-ring);
    outline-offset: 2px;
  }

  ::selection {
    background-color: var(--ds-state-selection);
  }
}
```

- [ ] **Step 5: Run scrollbar test, expect pass**

Run:
```bash
npm test --workspace=@starui/design-system -- styles/scrollbar
```

Expected: 4 assertions pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/foundation/design-system/src/styles/scrollbar.css \
        packages/shared/foundation/design-system/src/styles/base.css \
        packages/shared/foundation/design-system/tests/styles/scrollbar.test.ts
git commit -m "$(cat <<'EOF'
feat(design-system): single .ds-scrollbar utility + base reset

The one and only scrollbar class. Minimalist thin thumb (10px width,
2px transparent border = 6px effective), theme-aware via color-mix
on --ds-text-primary, never hidden by default. Replaces every
existing scrollbar declaration in the repo.

base.css combines @tailwind directives with a minimal body reset
that picks up --ds-surface-ground / --ds-text-primary / --ds-font-sans.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Build script that emits `dist/css/theme.css`

**Files:**
- Create: `packages/shared/foundation/design-system/scripts/build-css.ts`
- Modify: `packages/shared/foundation/design-system/package.json` (already updated in Task 2 to call this)
- Modify: `packages/shared/foundation/design-system/tsconfig.json`

- [ ] **Step 1: Read tsconfig**

Run:
```bash
cat packages/shared/foundation/design-system/tsconfig.json
```

Make sure `include` covers `src/**/*.ts` but NOT `scripts/` or `tests/` (those use `tsx` at runtime).

- [ ] **Step 2: Create the build script**

Create `packages/shared/foundation/design-system/scripts/build-css.ts`:

```ts
// ─────────────────────────────────────────────────────────────
//  build-css.ts — runs after `tsc` to emit dist/css/theme.css
//  by concatenating base.css + the unified CSS + scrollbar.css.
// ─────────────────────────────────────────────────────────────

import { generateUnifiedCSS } from '../src/adapters/shadcn';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const base      = readFileSync(resolve(root, 'src/styles/base.css'), 'utf8');
const scrollbar = readFileSync(resolve(root, 'src/styles/scrollbar.css'), 'utf8');
const theme     = generateUnifiedCSS();

const out = [
  '/* @starui/design-system — Chroma Desk unified stylesheet */',
  '/* generated by scripts/build-css.ts; do not edit by hand */',
  '',
  base,
  '',
  theme,
  '',
  scrollbar,
].join('\n');

const outPath = resolve(root, 'dist/css/theme.css');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);

console.log(`✓ wrote ${outPath} (${out.length.toLocaleString()} bytes)`);
```

- [ ] **Step 3: Run the build**

Run:
```bash
npm run build --workspace=@starui/design-system
```

Expected output ends with:
```
✓ wrote .../dist/css/theme.css (NN,NNN bytes)
```

- [ ] **Step 4: Verify the output contains all expected blocks**

Run:
```bash
grep -c '^@layer base\|@tailwind\|--ds-surface-ground\|.ds-scrollbar' \
  packages/shared/foundation/design-system/dist/css/theme.css
```

Expected: at least 4 (one of each).

- [ ] **Step 5: Add `dist/` to package `files` and confirm exports include `/css`**

Open `packages/shared/foundation/design-system/package.json`. Update `exports`:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./css": "./dist/css/theme.css",
  "./tailwind": {
    "types": "./dist/adapters/tailwind.d.ts",
    "import": "./dist/adapters/tailwind.js"
  },
  "./primeng": {
    "types": "./dist/adapters/primeng.d.ts",
    "import": "./dist/adapters/primeng.js"
  },
  "./shadcn": {
    "types": "./dist/adapters/shadcn.d.ts",
    "import": "./dist/adapters/shadcn.js"
  },
  "./adapters/ag-grid": {
    "types": "./dist/adapters/agGrid.d.ts",
    "import": "./dist/adapters/agGrid.js"
  },
  "./tokens/primitives": {
    "types": "./dist/tokens/primitives.d.ts",
    "import": "./dist/tokens/primitives.js"
  },
  "./tokens/semantic": {
    "types": "./dist/tokens/semantic.d.ts",
    "import": "./dist/tokens/semantic.js"
  },
  "./tokens/components": {
    "types": "./dist/tokens/components.d.ts",
    "import": "./dist/tokens/components.js"
  },
  "./cell-renderers": {
    "types": "./dist/cellRenderers.d.ts",
    "import": "./dist/cellRenderers.js"
  }
},
"files": [
  "dist",
  "src/styles"
],
```

- [ ] **Step 6: Run build again to confirm exports resolve**

Run:
```bash
npm run build --workspace=@starui/design-system
node -e "import('@starui/design-system/css').catch(e => console.error(e.message))" 2>&1 | head -5
```

The CSS subpath isn't a JS module, but the bare `'@starui/design-system/css'` should resolve to a real file via Node's exports. Verify:

```bash
node -e "console.log(require.resolve('@starui/design-system/css'))" 2>&1
```

Expected: prints the absolute path to `dist/css/theme.css`.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/foundation/design-system/scripts/build-css.ts \
        packages/shared/foundation/design-system/package.json
git commit -m "$(cat <<'EOF'
feat(design-system): post-tsc build emits dist/css/theme.css

scripts/build-css.ts concatenates base.css + generated theme +
scrollbar.css into a single file consumed via the /css subpath.
package.json exports field rewritten: /tailwind, /primeng, /shadcn,
/css, /tokens/*, /adapters/ag-grid, /cell-renderers all resolvable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Build-time WCAG audit

**Files:**
- Create: `tools/scripts/audit-contrast.ts`
- Test: `packages/shared/foundation/design-system/tests/tokens/contrast-audit.test.ts`

- [ ] **Step 1: Write the test that codifies the audit thresholds**

Create `packages/shared/foundation/design-system/tests/tokens/contrast-audit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dark, light } from '../../src/tokens/semantic';
import { contrastRatio } from '../../src/internal/wcag';

const schemes = [['dark', dark], ['light', light]] as const;

describe('Chroma Desk contrast audit', () => {
  for (const [name, s] of schemes) {
    describe(name, () => {
      it('text.primary on surface.ground ≥ 7 (AAA body)', () => {
        expect(contrastRatio(s.text.primary, s.surface.ground)).toBeGreaterThanOrEqual(7);
      });

      it('text.secondary on surface.ground ≥ 4.5 (AA chrome)', () => {
        expect(contrastRatio(s.text.secondary, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('text.muted on surface.ground ≥ 4 (AA approx)', () => {
        expect(contrastRatio(s.text.muted, s.surface.ground)).toBeGreaterThanOrEqual(4);
      });

      it('accent.info on surface.ground ≥ 4.5 (AA links)', () => {
        expect(contrastRatio(s.accent.info, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('accent.positive on surface.ground ≥ 4.5 (AA gain)', () => {
        expect(contrastRatio(s.accent.positive, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('accent.negative on surface.ground ≥ 4.5 (AA loss)', () => {
        expect(contrastRatio(s.accent.negative, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });

      it('accent.warning on surface.ground ≥ 4.5 (AA caution)', () => {
        expect(contrastRatio(s.accent.warning, s.surface.ground)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});
```

- [ ] **Step 2: Run, expect pass (or honest failure)**

Run:
```bash
npm test --workspace=@starui/design-system -- tokens/contrast-audit
```

Expected: all 14 assertions pass for the Chroma Desk palette as designed. If any fail, the spec already noted that hex values may need tuning during implementation — adjust the offending color in `primitives.ts` until ratios pass.

- [ ] **Step 3: Create a CLI wrapper that emits a report**

Create `tools/scripts/audit-contrast.ts`:

```ts
#!/usr/bin/env tsx
import { dark, light } from '@starui/design-system/tokens/semantic';
import { contrastRatio } from '../../packages/shared/foundation/design-system/src/internal/wcag';

interface Row { theme: string; pair: string; ratio: number; min: number; pass: boolean; }

const checks = (n: string, s: typeof dark): Row[] => [
  ['text.primary on ground',   s.text.primary,   s.surface.ground, 7],
  ['text.secondary on ground', s.text.secondary, s.surface.ground, 4.5],
  ['text.muted on ground',     s.text.muted,     s.surface.ground, 4],
  ['accent.info on ground',    s.accent.info,    s.surface.ground, 4.5],
  ['accent.positive on ground',s.accent.positive,s.surface.ground, 4.5],
  ['accent.negative on ground',s.accent.negative,s.surface.ground, 4.5],
  ['accent.warning on ground', s.accent.warning, s.surface.ground, 4.5],
].map(([pair, fg, bg, min]) => ({
  theme: n,
  pair: pair as string,
  ratio: contrastRatio(fg as string, bg as string),
  min: min as number,
  pass: contrastRatio(fg as string, bg as string) >= (min as number),
}));

const rows = [...checks('dark', dark), ...checks('light', light)];
let failed = 0;
for (const r of rows) {
  const mark = r.pass ? '✓' : '✗';
  if (!r.pass) failed++;
  console.log(`  ${mark} ${r.theme.padEnd(6)} ${r.pair.padEnd(36)} ${r.ratio.toFixed(2).padStart(6)} : ${r.min}`);
}
if (failed > 0) {
  console.error(`\n${failed} contrast check(s) failed`);
  process.exit(1);
}
console.log('\nAll contrast checks pass.');
```

- [ ] **Step 4: Run the CLI**

Run from repo root:
```bash
npx tsx tools/scripts/audit-contrast.ts
```

Expected: prints rows with ✓ marks and exits 0.

- [ ] **Step 5: Commit**

```bash
git add tools/scripts/audit-contrast.ts \
        packages/shared/foundation/design-system/tests/tokens/contrast-audit.test.ts
git commit -m "$(cat <<'EOF'
feat(design-system): build-time WCAG contrast audit

Vitest assertion + CLI wrapper. Codifies the AAA/AA thresholds for
text and accents against ground in both schemes. Fails CI if any
ratio drops below spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Lint tooling

### Task 15: `check-ds-tokens` lint script

**Files:**
- Create: `tools/scripts/check-ds-tokens.ts`
- Create: `tools/scripts/check-ds-tokens.test.ts`
- Create: `tools/scripts/__fixtures__/clean.tsx`
- Create: `tools/scripts/__fixtures__/dirty-hex.tsx`
- Create: `tools/scripts/__fixtures__/dirty-legacy-var.css`
- Create: `tools/scripts/__fixtures__/dirty-inline-style.tsx`

- [ ] **Step 1: Write the fixture files**

Create `tools/scripts/__fixtures__/clean.tsx`:

```tsx
export function Clean() {
  return <div className="bg-card text-foreground border-border">ok</div>;
}
```

Create `tools/scripts/__fixtures__/dirty-hex.tsx`:

```tsx
export function DirtyHex() {
  return <div className="bg-[#aabbcc]">nope</div>;
}
```

Create `tools/scripts/__fixtures__/dirty-legacy-var.css`:

```css
.foo { background: var(--bn-bg); }
```

Create `tools/scripts/__fixtures__/dirty-inline-style.tsx`:

```tsx
export function DirtyInline() {
  return <div style={{ color: 'red' }}>nope</div>;
}
```

- [ ] **Step 2: Write the test**

Create `tools/scripts/check-ds-tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { lintFile } from './check-ds-tokens';

const fix = (n: string) => resolve(__dirname, '__fixtures__', n);

describe('check-ds-tokens', () => {
  it('passes a clean file', () => {
    expect(lintFile(fix('clean.tsx'))).toEqual([]);
  });

  it('flags hardcoded hex literal', () => {
    const issues = lintFile(fix('dirty-hex.tsx'));
    expect(issues.some(i => i.rule === 'no-hardcoded-hex')).toBe(true);
  });

  it('flags legacy --bn-* var ref', () => {
    const issues = lintFile(fix('dirty-legacy-var.css'));
    expect(issues.some(i => i.rule === 'no-legacy-css-var')).toBe(true);
  });

  it('flags style={{ … }} inline color', () => {
    const issues = lintFile(fix('dirty-inline-style.tsx'));
    expect(issues.some(i => i.rule === 'no-inline-style')).toBe(true);
  });
});
```

- [ ] **Step 3: Run, expect failure (no script yet)**

Run:
```bash
npx vitest run tools/scripts/check-ds-tokens.test.ts
```

Expected: FAIL — `lintFile` not exported.

- [ ] **Step 4: Implement the lint script**

Create `tools/scripts/check-ds-tokens.ts`:

```ts
#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────
//  check-ds-tokens — fails CI when forbidden patterns appear.
//  - hardcoded #rgb / #rrggbb literals (outside the design-system pkg)
//  - legacy --bn-/--fi-/--mdl-/--ck-/--gc- CSS var references
//  - inline style={{ color|background|border-color: '…' }} usage
// ─────────────────────────────────────────────────────────────

import { readFileSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';

export type Rule =
  | 'no-hardcoded-hex'
  | 'no-legacy-css-var'
  | 'no-inline-style';

export interface Issue {
  file: string;
  line: number;
  rule: Rule;
  excerpt: string;
}

const HEX_RE        = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const LEGACY_VAR_RE = /--(?:bn|fi|mdl|ck|gc)-[a-zA-Z0-9-]+/g;
const INLINE_RE     = /style\s*=\s*\{\{[^}]*(?:color|background|border)/g;

const STYLE_EXTS = new Set(['.css', '.scss', '.sass', '.less']);
const CODE_EXTS  = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts']);

export function lintFile(path: string): Issue[] {
  const ext = extname(path);
  if (!STYLE_EXTS.has(ext) && !CODE_EXTS.has(ext)) return [];
  const src = readFileSync(path, 'utf8');
  const issues: Issue[] = [];
  src.split('\n').forEach((line, i) => {
    const ln = i + 1;
    const m1 = line.match(HEX_RE);
    if (m1) issues.push({ file: path, line: ln, rule: 'no-hardcoded-hex', excerpt: m1.join(', ') });
    const m2 = line.match(LEGACY_VAR_RE);
    if (m2) issues.push({ file: path, line: ln, rule: 'no-legacy-css-var', excerpt: m2.join(', ') });
    const m3 = line.match(INLINE_RE);
    if (m3) issues.push({ file: path, line: ln, rule: 'no-inline-style', excerpt: m3.join(', ') });
  });
  return issues;
}

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.turbo', '.git', '.next', 'coverage',
  '__snapshots__', '__fixtures__', 'libs',
]);

// design-system package itself is allowed to define hex; everywhere
// else must reference --ds-* vars.
const ALLOW_PATHS = [
  'packages/shared/foundation/design-system/src/',
  'patch/',  // working dir, deleted at end of migration
];

function walk(dir: string, root: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = resolve(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, root, out);
    else out.push(p);
  }
}

function isAllowed(rel: string): boolean {
  return ALLOW_PATHS.some(p => rel.startsWith(p));
}

export function lintRepo(root: string): Issue[] {
  const files: string[] = [];
  walk(root, root, files);
  const issues: Issue[] = [];
  for (const f of files) {
    if (isAllowed(relative(root, f))) continue;
    issues.push(...lintFile(f));
  }
  return issues;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const issues = lintRepo(process.cwd());
  for (const i of issues) {
    console.error(`${relative(process.cwd(), i.file)}:${i.line}  [${i.rule}]  ${i.excerpt}`);
  }
  if (issues.length > 0) {
    console.error(`\n${issues.length} issue(s) — design-system token policy violations.`);
    process.exit(1);
  }
  console.log('check-ds-tokens: clean.');
}
```

- [ ] **Step 5: Run, expect pass**

Run:
```bash
npx vitest run tools/scripts/check-ds-tokens.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Add a turbo task**

Open the repo-root `turbo.json`. Add a `check-ds` task to the pipeline:

```json
{
  "tasks": {
    "check-ds": {
      "outputs": []
    },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "e2e":  { "dependsOn": ["build"] }
  }
}
```

(Merge into existing `tasks` object — keep all current entries, just add `check-ds`.)

Add a script to the root `package.json`:

```json
"scripts": {
  "...existing...": "...",
  "check-ds": "tsx tools/scripts/check-ds-tokens.ts"
}
```

(Add only the `check-ds` line; keep all existing scripts intact.)

- [ ] **Step 7: Run on the repo (will currently fail because legacy vars still exist)**

Run:
```bash
npm run check-ds 2>&1 | head -30
```

Expected: many issues found (this is the entire grid-react sweep). For now we just need the script to RUN. We do NOT add it to CI yet — that gate flips on after the sweep is complete (Task 33).

- [ ] **Step 8: Commit**

```bash
git add tools/scripts/check-ds-tokens.ts \
        tools/scripts/check-ds-tokens.test.ts \
        tools/scripts/__fixtures__/ \
        package.json turbo.json
git commit -m "$(cat <<'EOF'
feat(tools): check-ds-tokens lint script

Greps for hardcoded hex, legacy --bn-/--fi-/--mdl-/--ck-/--gc- CSS
var references, and inline style={{ color|background|border:… }}
usage. Allows the design-system package source to define hex.
Wired as `npm run check-ds`; CI gate flips on after Phase 6 sweep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Delete the old systems

### Task 16: Delete the `tokens-primeng` package

**Files:**
- Delete: `packages/shared/foundation/tokens-primeng/` (entire directory)
- Modify: root `package.json` workspaces glob

- [ ] **Step 1: Verify nothing depends on it**

Run:
```bash
grep -r "tokens-primeng" --include="package.json" --include="*.ts" --include="*.tsx" --include="*.scss" --include="*.css" 2>&1 | grep -v node_modules | head -30
```

Note any consumers. If anything imports from `@starui/tokens-primeng`, update those imports to use `@starui/design-system` equivalents BEFORE deletion. Likely candidates: Angular tools that imported `marketsPreset`. Update them now to import `primengPreset` from `@starui/design-system/primeng`.

- [ ] **Step 2: Delete the directory**

Run:
```bash
rm -rf packages/shared/foundation/tokens-primeng
```

- [ ] **Step 3: Update workspaces in root package.json**

Open the repo-root `package.json`. The `workspaces` array enumerates package globs explicitly. Find and remove the `"packages/shared/foundation/tokens-primeng"` entry (exact string).

Run to confirm:
```bash
grep -n "tokens-primeng" package.json
```

Expected: no output.

- [ ] **Step 4: Re-install to refresh lockfile**

Run:
```bash
npm install --legacy-peer-deps
```

- [ ] **Step 5: Confirm typecheck still passes**

Run:
```bash
npx turbo typecheck
```

Expected: clean. If consumers of `@starui/tokens-primeng` exist that we didn't update in Step 1, they'll fail here — fix and re-run.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: delete @starui/tokens-primeng package

Replaced by @starui/design-system. The MDL --mdl-* token tree,
its primeng-preset.ts, tailwind-preset.cjs, and sundry CSS files
are obsolete. Consumers updated to import from
@starui/design-system/primeng or /tailwind.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Delete the Cockpit stylesheet

**Files:**
- Delete: `packages/shared/core/src/css/cockpit.ts`
- Modify: `packages/shared/core/src/css/index.ts`
- Modify: `packages/shared/core/src/index.ts`

- [ ] **Step 1: Capture every callsite of cockpit exports**

Run:
```bash
grep -rn "ensureCockpitStyles\|COCKPIT_STYLE_ID\|cockpitCSS" \
  --include="*.ts" --include="*.tsx" \
  packages/ apps/ 2>&1 | grep -v node_modules | head -30
```

Note each location. Common pattern: a `useEffect(() => ensureCockpitStyles(), [])` or a top-of-module call.

- [ ] **Step 2: Replace each cockpit-exports import with a no-op**

For every file referencing `ensureCockpitStyles` or related, **delete the import line and the call**. The new design-system CSS is loaded once via the app's globals.css `@import '@starui/design-system/css'` — no per-component injection needed.

Example change:

```diff
- import { ensureCockpitStyles } from '@starui/core';
- ensureCockpitStyles();

  export function PopoutShell({ children }: Props) {
```

Apply via search-and-edit for each grep hit. Sample sites (verify with grep above):

- `packages/react/widgets/grid-react/src/ui/SettingsPanel/PopoutPortal.tsx`
- `packages/react/widgets/markets-grid/src/SettingsSheet.tsx`
- `packages/react/widgets/markets-grid/src/MarketsGrid.tsx`

(Each gets the import + call removed; nothing else changes here. Visual styling moves over in Phase 6 sweep.)

- [ ] **Step 3: Delete cockpit.ts**

Run:
```bash
rm packages/shared/core/src/css/cockpit.ts
```

- [ ] **Step 4: Update the css index.ts barrel**

Open `packages/shared/core/src/css/index.ts`. Remove the `cockpit` exports — keep anything else that file exports (e.g., other shared CSS strings if present). If the file ends up empty after the removal, delete it and adjust the parent index.ts accordingly.

- [ ] **Step 5: Update the package root index.ts**

Open `packages/shared/core/src/index.ts`. Remove any `cockpit`-related re-exports.

- [ ] **Step 6: Run typecheck for the whole monorepo**

Run:
```bash
npx turbo typecheck
```

Expected: clean if every callsite from Step 1 was updated. If the typecheck reports unresolved imports of cockpit functions, return to Step 1 and find the missed callsite.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: delete cockpit stylesheet + drop cockpit exports

Removes packages/shared/core/src/css/cockpit.ts (1379 lines) and the
ensureCockpitStyles / COCKPIT_STYLE_ID / cockpitCSS exports. Theme
chrome now comes from @starui/design-system/css imported once per
app. Component classnames (.gc-*, .ck-*, .gc-be-*) get rewritten to
Tailwind utilities in the Phase 6 sweep.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Wire React apps

### Task 18: Wire `packages/react/ui` to the new preset

**Files:**
- Modify: `packages/react/ui/tailwind.config.js`
- Modify: `packages/react/ui/package.json`

- [ ] **Step 1: Replace tailwind config**

Replace the entire contents of `packages/react/ui/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './src/**/*.{ts,tsx}',
  ],
};
```

- [ ] **Step 2: Add design-system to peerDeps**

Open `packages/react/ui/package.json`. Add to `peerDependencies`:

```json
"peerDependencies": {
  "react": "^19.2.5",
  "react-dom": "^19.2.5",
  "@starui/design-system": "*"
},
```

(Merge with existing entries — keep React, just add the design-system peer.)

- [ ] **Step 3: Add to workspace devDeps so the preset resolves at build time**

Add to `devDependencies` in the same file:

```json
"@starui/design-system": "*",
```

(Workspaces resolve `*` to the local package.)

- [ ] **Step 4: Re-install + typecheck + build**

Run:
```bash
npm install --legacy-peer-deps
npx turbo build --filter=@starui/ui --filter=@starui/design-system
```

Expected: both build cleanly. The shadcn primitives in `packages/react/ui/src/components/` consume `bg-primary`, `text-foreground`, etc. — those classes still resolve because the preset emits them.

- [ ] **Step 5: Commit**

```bash
git add packages/react/ui/tailwind.config.js \
        packages/react/ui/package.json \
        package-lock.json
git commit -m "$(cat <<'EOF'
refactor(react/ui): consume tailwindPreset from @starui/design-system

Drops the inlined HSL color map; everything resolves through the
shared preset now. shadcn primitives unchanged (still use bg-primary,
text-foreground, …).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 19: Wire `apps/demo-react`

**Files:**
- Modify: `apps/demo-react/tailwind.config.js`
- Modify: `apps/demo-react/src/globals.css`
- Modify: `apps/demo-react/package.json`
- Modify: `apps/demo-react/src/main.tsx` (add `applyTheme` boot)

- [ ] **Step 1: Read the current config + globals**

Run:
```bash
cat apps/demo-react/tailwind.config.js
head -30 apps/demo-react/src/globals.css
```

Note the current `@import` statements — there will be theme imports we replace.

- [ ] **Step 2: Replace tailwind.config.js**

Replace the contents of `apps/demo-react/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/react/ui/src/**/*.{ts,tsx}',
    '../../packages/react/widgets/**/src/**/*.{ts,tsx}',
  ],
};
```

(Keep `content` paths matching what the app currently scans — adjust if the existing config had additional consumer paths.)

- [ ] **Step 3: Replace globals.css imports**

Open `apps/demo-react/src/globals.css`. Remove every `@import` line that points at `@starui/design-system/themes/fi-*.css` or `@starui/tokens-primeng/css` or any other legacy theme CSS. Add as the very first line:

```css
@import '@starui/design-system/css';
```

The result should look like:

```css
@import '@starui/design-system/css';

/* Any app-specific styles below — must use only Tailwind utilities or
   reference --ds-* CSS vars. */
```

If there are app-specific custom blocks below, leave them but flag any that reference `--bn-*` / `--fi-*` / `--mdl-*` for the Phase 6 sweep (don't fix here yet).

- [ ] **Step 4: Add design-system as a dep**

Open `apps/demo-react/package.json`. Add to `dependencies`:

```json
"@starui/design-system": "*",
```

- [ ] **Step 5: Wire applyTheme at boot**

Open `apps/demo-react/src/main.tsx`. Just below the imports, before `createRoot(...)`:

```tsx
import { applyTheme, getTheme } from '@starui/design-system';

// Apply persisted theme before first render so there's no FOUC.
applyTheme(getTheme());
```

If `main.tsx` doesn't exist (the entry is named differently), apply the same pattern in whichever file calls `createRoot`.

- [ ] **Step 6: Build + run dev server smoke test**

Run:
```bash
npm install --legacy-peer-deps
npx turbo build --filter=demo-react
```

Expected: clean build.

In a separate terminal:
```bash
npm run dev:demo-react
```

Open the URL printed (typically `http://localhost:5173`). Expected:
- Page loads on dark theme by default
- Open DevTools → Application → Storage → Local Storage. Run in console:
  ```js
  document.documentElement.setAttribute('data-theme', 'light');
  ```
  Surfaces flip to cool graphite-grey, no white-on-white anywhere.
- Run:
  ```js
  document.documentElement.setAttribute('data-cvd', 'on');
  ```
  Any positive/negative semantic colors flip to blue/orange.

Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/demo-react/tailwind.config.js \
        apps/demo-react/src/globals.css \
        apps/demo-react/src/main.tsx \
        apps/demo-react/package.json \
        package-lock.json
git commit -m "$(cat <<'EOF'
refactor(apps/demo-react): consume unified design system

- tailwind.config.js: presets: [tailwindPreset]
- globals.css: single @import '@starui/design-system/css'
- main.tsx: applyTheme(getTheme()) before render to prevent FOUC

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: Wire `apps/demo-configservice-react`

**Files:**
- Modify: `apps/demo-configservice-react/tailwind.config.js`
- Modify: `apps/demo-configservice-react/src/globals.css`
- Modify: `apps/demo-configservice-react/package.json`
- Modify: `apps/demo-configservice-react/src/main.tsx` (or equivalent)

- [ ] **Step 1: Replace tailwind.config.js**

Replace contents:

```js
/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/react/ui/src/**/*.{ts,tsx}',
    '../../packages/react/widgets/**/src/**/*.{ts,tsx}',
  ],
};
```

- [ ] **Step 2: Replace globals.css imports**

Open `apps/demo-configservice-react/src/globals.css`. Remove every `@import` referencing legacy theme CSS. Add as the first line:

```css
@import '@starui/design-system/css';
```

- [ ] **Step 3: Add design-system dep**

Open `apps/demo-configservice-react/package.json`. Add `"@starui/design-system": "*"` to `dependencies`.

- [ ] **Step 4: Add applyTheme boot in entry file**

Find the file that calls `createRoot` (typically `src/main.tsx`). Add at the top, after imports:

```tsx
import { applyTheme, getTheme } from '@starui/design-system';
applyTheme(getTheme());
```

- [ ] **Step 5: Install + build + smoke test**

Run:
```bash
npm install --legacy-peer-deps
npx turbo build --filter=demo-configservice-react
```

Expected: clean.

Run:
```bash
npm run dev:demo-configservice-react
```

Verify in browser as in Task 19 step 6.

- [ ] **Step 6: Commit**

```bash
git add apps/demo-configservice-react/tailwind.config.js \
        apps/demo-configservice-react/src/globals.css \
        apps/demo-configservice-react/src/main.tsx \
        apps/demo-configservice-react/package.json \
        package-lock.json
git commit -m "$(cat <<'EOF'
refactor(apps/demo-configservice-react): consume unified design system

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 21: Wire `apps/config-admin-web`

**Files:**
- Modify: `apps/config-admin-web/tailwind.config.js`
- Modify: `apps/config-admin-web/src/index.css`
- Modify: `apps/config-admin-web/package.json`
- Modify: `apps/config-admin-web/src/main.tsx`

- [ ] **Step 1: Replace tailwind.config.js**

Same shape as Task 19 Step 2, adjusting `content` paths to match this app's layout. Read `apps/config-admin-web/tailwind.config.js` first, copy its existing `content` array, then build the replacement:

```js
/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    /* ...existing content paths from the prior config... */
  ],
};
```

- [ ] **Step 2: Replace index.css imports**

Open `apps/config-admin-web/src/index.css`. Remove legacy `@import`s. Add as the first line:

```css
@import '@starui/design-system/css';
```

- [ ] **Step 3: Add design-system dep**

Open `apps/config-admin-web/package.json`. Add `"@starui/design-system": "*"` to `dependencies`.

- [ ] **Step 4: Add applyTheme boot**

Edit `apps/config-admin-web/src/main.tsx`. Add at the top, after imports:

```tsx
import { applyTheme, getTheme } from '@starui/design-system';
applyTheme(getTheme());
```

- [ ] **Step 5: Install + build + smoke test**

Run:
```bash
npm install --legacy-peer-deps
npx turbo build --filter=config-admin-web
```

If a dev script exists (check root `package.json`), run it and verify in browser.

- [ ] **Step 6: Commit**

```bash
git add apps/config-admin-web/tailwind.config.js \
        apps/config-admin-web/src/index.css \
        apps/config-admin-web/src/main.tsx \
        apps/config-admin-web/package.json \
        package-lock.json
git commit -m "$(cat <<'EOF'
refactor(apps/config-admin-web): consume unified design system

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: Wire `apps/markets-ui-react-reference`

**Files:**
- Modify: `apps/markets-ui-react-reference/tailwind.config.js`
- Modify: `apps/markets-ui-react-reference/src/index.css`
- Modify: `apps/markets-ui-react-reference/package.json`
- Modify: `apps/markets-ui-react-reference/src/main.tsx`

- [ ] **Step 1: Replace tailwind.config.js**

Read existing config to copy `content` paths, then replace contents:

```js
/** @type {import('tailwindcss').Config} */
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset],
  content: [
    /* ...existing content paths from prior config... */
  ],
};
```

- [ ] **Step 2: Replace index.css imports**

Open `apps/markets-ui-react-reference/src/index.css`. Remove every legacy `@import`. Add as first line:

```css
@import '@starui/design-system/css';
```

- [ ] **Step 3: Add design-system dep**

Open `apps/markets-ui-react-reference/package.json`. Add `"@starui/design-system": "*"` to `dependencies`.

- [ ] **Step 4: Add applyTheme boot**

`apps/markets-ui-react-reference/src/main.tsx`:

```tsx
import { applyTheme, getTheme } from '@starui/design-system';
applyTheme(getTheme());
```

- [ ] **Step 5: Install + build + smoke test**

```bash
npm install --legacy-peer-deps
npx turbo build --filter=markets-ui-react-reference
```

- [ ] **Step 6: Commit**

```bash
git add apps/markets-ui-react-reference/tailwind.config.js \
        apps/markets-ui-react-reference/src/index.css \
        apps/markets-ui-react-reference/src/main.tsx \
        apps/markets-ui-react-reference/package.json \
        package-lock.json
git commit -m "$(cat <<'EOF'
refactor(apps/markets-ui-react-reference): consume unified design system

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Wire Angular

### Task 23: Wire `apps/demo-angular` Tailwind config

**Files:**
- Create: `apps/demo-angular/tailwind.config.ts`
- Modify: `apps/demo-angular/postcss.config.js` (if missing)
- Modify: `apps/demo-angular/package.json`

- [ ] **Step 1: Add tailwind + design-system deps**

Open `apps/demo-angular/package.json`. Add to `dependencies`:

```json
"@starui/design-system": "*",
"tailwindcss": "3.4.1",
"tailwindcss-primeui": "^0.7.0",
"tailwindcss-animate": "^1.0.7",
"autoprefixer": "^10.4.27",
"postcss": "^8.5.9",
```

- [ ] **Step 2: Create tailwind.config.ts**

Create `apps/demo-angular/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';
import { tailwindPreset } from '@starui/design-system/tailwind';

export default {
  presets: [tailwindPreset as any],
  content: [
    './src/**/*.{html,ts}',
  ],
} satisfies Config;
```

- [ ] **Step 3: Create or update postcss.config.js**

If `apps/demo-angular/postcss.config.js` doesn't exist, create it:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

If it exists, ensure `tailwindcss` and `autoprefixer` are listed.

- [ ] **Step 4: Re-install**

```bash
npm install --legacy-peer-deps
```

- [ ] **Step 5: Verify Angular build picks up Tailwind**

Run:
```bash
npx turbo build --filter=demo-angular
```

Expected: clean build. If Angular complains about missing Tailwind, check `apps/demo-angular/angular.json` — there should be a `styles` array listing `src/styles.scss`. Tailwind processes via the postcss config automatically when the styles file uses `@tailwind` directives (added in Task 24).

- [ ] **Step 6: Commit**

```bash
git add apps/demo-angular/tailwind.config.ts \
        apps/demo-angular/postcss.config.js \
        apps/demo-angular/package.json \
        package-lock.json
git commit -m "$(cat <<'EOF'
feat(apps/demo-angular): add Tailwind + tailwindcss-primeui via shared preset

Wires Tailwind 3.4.1 into the Angular app using the same preset as
React. Once template usage migrates to utility classes, both
frameworks share the bg-primary / text-muted-color / bg-card vocabulary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Add design-system CSS import to Angular global styles

**Files:**
- Modify: `apps/demo-angular/src/styles.scss`

- [ ] **Step 1: Read current styles.scss**

Run:
```bash
cat apps/demo-angular/src/styles.scss
```

Note any existing imports — most likely it imports PrimeNG icons / dock-manager CSS. Keep those.

- [ ] **Step 2: Add design-system import as the first line**

Open `apps/demo-angular/src/styles.scss`. Add at the very top:

```scss
@import '@starui/design-system/css';
```

The remainder of the file stays as-is.

- [ ] **Step 3: Run build**

```bash
npx turbo build --filter=demo-angular
```

Expected: clean. The CSS import resolves via the package's `./css` subpath export.

- [ ] **Step 4: Commit**

```bash
git add apps/demo-angular/src/styles.scss
git commit -m "$(cat <<'EOF'
feat(apps/demo-angular): import @starui/design-system/css in styles.scss

Loads --ds-* tokens, shadcn HSL aliases, --p-* PrimeNG bridge,
and the .ds-scrollbar utility into the Angular app's global stylesheet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: Wire `providePrimeNG` with the shared preset

**Files:**
- Modify: `apps/demo-angular/src/app/app.config.ts`
- Modify: `apps/demo-angular/src/main.ts` (or wherever bootstrapApplication is called) — apply theme before render

- [ ] **Step 1: Read current app.config.ts**

Run:
```bash
cat apps/demo-angular/src/app/app.config.ts
```

Note existing providers (likely `provideAnimationsAsync()`, `provideRouter()`, etc.).

- [ ] **Step 2: Replace with full configuration**

Replace contents with:

```ts
import { ApplicationConfig } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import { Aura } from '@primeng/themes/aura';
import { primengPreset } from '@starui/design-system/primeng';

const ChromaDeskPreset = definePreset(Aura, primengPreset);

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    provideRouter([]),
    providePrimeNG({
      theme: {
        preset: ChromaDeskPreset,
        options: {
          darkModeSelector: '[data-theme="dark"]',
          cssLayer: { name: 'primeng', order: 'tailwind-base, primeng, tailwind-utilities' },
        },
      },
    }),
  ],
};
```

If the existing config provided additional things (router config, HTTP client, etc.), merge them into the providers array — don't drop them.

- [ ] **Step 3: Apply theme in main.ts before bootstrap**

Open `apps/demo-angular/src/main.ts`. Add at the top, before `bootstrapApplication`:

```ts
import { applyTheme, getTheme } from '@starui/design-system';
applyTheme(getTheme());
```

- [ ] **Step 4: Build and verify**

Run:
```bash
npx turbo build --filter=demo-angular
```

Expected: clean.

In a separate terminal:
```bash
npm run dev:demo-angular
```

Open the printed URL. Expected:
- Default dark theme renders.
- DevTools console:
  ```js
  document.documentElement.setAttribute('data-theme', 'light');
  ```
  Page flips: PrimeNG components (`p-button`, `p-inputtext`, `p-dialog` if any) repaint with the light scheme.
- Console:
  ```js
  document.documentElement.setAttribute('data-cvd', 'on');
  ```
  Any positive/negative semantics swap to blue/orange.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-angular/src/app/app.config.ts \
        apps/demo-angular/src/main.ts
git commit -m "$(cat <<'EOF'
feat(apps/demo-angular): wire providePrimeNG with Chroma Desk preset

definePreset(Aura, primengPreset) feeds providePrimeNG. darkModeSelector
mirrors the [data-theme="dark"] attribute applyTheme sets. cssLayer
ordering puts PrimeNG between Tailwind base and utilities so utility
classes always win when applied to PrimeNG components.

main.ts now calls applyTheme(getTheme()) before bootstrap, eliminating
FOUC on theme load.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6 — Sweeps (the long one)

### Task 26: Inventory grid-react sweep targets

**Files:**
- (read-only) `packages/react/widgets/grid-react/**`

- [ ] **Step 1: Count `.gc-*` className occurrences**

Run:
```bash
grep -rn "className=\"[^\"]*\bgc-" \
  --include="*.tsx" --include="*.ts" \
  packages/react/widgets/grid-react/src/ 2>&1 | wc -l
```

Note the count. Expect a number in the hundreds.

- [ ] **Step 2: Count legacy CSS-var references**

Run:
```bash
grep -rn "var(--bn-\|var(--ck-\|var(--gc-\|var(--fi-\|var(--mdl-" \
  --include="*.tsx" --include="*.ts" --include="*.css" \
  packages/react/widgets/grid-react/src/ 2>&1 | wc -l
```

- [ ] **Step 3: List the per-feature directories that need sweeping**

Run:
```bash
ls packages/react/widgets/grid-react/src/modules/ 2>&1
ls packages/react/widgets/grid-react/src/ui/ 2>&1
```

This produces the work list. Expected modules: `column-customization`, `calculated-columns`, `conditional-styling`, `column-groups`, `general-settings`, `format-editor`, etc. UI subdirs: `SettingsPanel`, `ColorPicker`, `StyleEditor`, `format-editor`.

- [ ] **Step 4: Save the inventory as a working note**

Create `docs/superpowers/plans/.work/grid-react-sweep-inventory.md`:

```markdown
# grid-react sweep inventory (working note — delete after Task 33)

## Counts
- .gc-* className occurrences: <paste from Step 1>
- legacy --bn-/--ck-/--gc-/--fi-/--mdl- var refs: <paste from Step 2>

## Modules
<paste from Step 3>

## UI subdirs
<paste from Step 3>

## Strategy
1. Each module gets one commit. Within a module, walk every .tsx/.ts/.css.
2. Replace .gc-popout-title → equivalent Tailwind utility soup OR move to a
   shared component (PopoutTitle, etc.) under SettingsPanel/.
3. Replace var(--bn-bg) → bg-background; var(--bn-bg1) → bg-card; etc.
   Token mapping table:
     --bn-bg / --ck-bg          → bg-background  (or var(--ds-surface-ground))
     --bn-bg1 / --ck-surface    → bg-card        (or var(--ds-surface-primary))
     --bn-bg2 / --ck-card       → bg-muted       (or var(--ds-surface-secondary))
     --bn-bg3 / --ck-card-hi    → bg-secondary   (or var(--ds-surface-tertiary))
     --bn-t0 / --ck-t0          → text-foreground (or var(--ds-text-primary))
     --bn-t1 / --ck-t1          → text-secondary (or var(--ds-text-secondary))
     --bn-t2 / --ck-t2          → text-muted-foreground
     --bn-t3 / --ck-t3          → text-faint (var(--ds-text-faint))
     --bn-border / --ck-border  → border-border
     --bn-green / --ck-green    → text-success / bg-success
     --bn-red                    → text-destructive / bg-destructive
     --bn-amber                  → text-warning
     --bn-blue                   → text-primary (brand)
     --gc-accent                 → text-primary
4. .gc-themed-scrollbar / per-component scrollbar blocks → ds-scrollbar
5. Existing Vitest snapshots that lock --bn-/--ck- values get re-recorded
   in the same commit as the file that produces them.
```

This note guides the sweep but is not committed long-term — delete in Task 33.

- [ ] **Step 5: Commit the inventory note**

```bash
mkdir -p docs/superpowers/plans/.work
git add docs/superpowers/plans/.work/grid-react-sweep-inventory.md
git commit -m "$(cat <<'EOF'
docs(plans): grid-react sweep inventory + token mapping table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 27: Sweep `grid-react/src/ui/SettingsPanel/`

**Files:**
- Modify: every `.tsx` and `.ts` under `packages/react/widgets/grid-react/src/ui/SettingsPanel/`

This is the largest single subdirectory. Tackle file-by-file.

- [ ] **Step 1: List the files**

Run:
```bash
find packages/react/widgets/grid-react/src/ui/SettingsPanel/ -type f -name "*.tsx" -o -name "*.ts" | sort
```

Expected files include: `Cockpit.tsx`, `CockpitList.tsx`, `PanelChrome.tsx`, `FigmaPanelSection.tsx`, `TabStrip.tsx`, `IconInput.tsx`, `ItemCard.tsx`, `PillToggleGroup.tsx`, `GhostIcon.tsx`, `index.ts`.

- [ ] **Step 2: For each file, replace cockpit className strings + var refs**

Apply mechanically using the mapping table from Task 26 Step 4. For each file:

a. Open the file.
b. For every `className="…gc-X…"` substring, identify what visual outcome the cockpit class produced (read `packages/shared/core/src/css/cockpit.ts` history via `git show HEAD~N:packages/shared/core/src/css/cockpit.ts`) and replace with Tailwind utilities.

   Example transformation — `.gc-popout-title`:

   ```diff
   - <div className="gc-popout-title">
   + <div className="flex items-center gap-3 h-9 px-3.5 border-b border-border bg-card cursor-move select-none">
   ```

   The replaced classes resolve through the new preset (`bg-card` → `hsl(var(--card))` → `--ds-surface-primary`).

c. For every `var(--bn-X)` / `var(--ck-X)` / `var(--gc-X)`, replace with the `--ds-*` equivalent from the mapping table:

   ```diff
   - background: var(--bn-bg);
   + background: var(--ds-surface-ground);
   ```

   Or, where possible, prefer Tailwind utilities applied to className over inline `style={{ … }}` — the spec forbids new inline styles.

d. For every `style={{ … }}` block that sets color/background/border, replace with className. The lint script will flag any survivors.

e. For every `gc-themed-scrollbar` className, replace with `ds-scrollbar`.

f. Save and move to the next file.

- [ ] **Step 3: Rename `Cockpit.tsx` and `CockpitList.tsx` if desired**

The component names are still the public API — keep them as `Cockpit.tsx` and `CockpitList.tsx` for now. Their internals just don't use cockpit-prefixed classes anymore. (Renaming is a separate refactor; out of scope here.)

- [ ] **Step 4: Build + typecheck**

Run:
```bash
npx turbo typecheck build --filter=@starui/grid-react
```

Expected: clean.

- [ ] **Step 5: Run the lint script on the swept dir to verify**

Run:
```bash
npx tsx tools/scripts/check-ds-tokens.ts 2>&1 | grep "src/ui/SettingsPanel" | head -20
```

Expected: no output (subdir is clean). If issues remain, fix and re-run.

- [ ] **Step 6: Update any snapshot tests in this subtree**

Run:
```bash
npx turbo test --filter=@starui/grid-react -- --run --update SettingsPanel
```

(Vitest 4 syntax — adjust if the workspace uses a different test runner config.)

Expected: snapshot deltas updated; tests pass after the update. Manually inspect the snapshot diff to confirm only token-string changes (no logic regressions).

- [ ] **Step 7: Commit**

```bash
git add packages/react/widgets/grid-react/src/ui/SettingsPanel/
git commit -m "$(cat <<'EOF'
refactor(grid-react): sweep SettingsPanel/ to unified design system

Replaces .gc-* className strings with Tailwind utilities from the
shared preset. Replaces var(--bn-*) / var(--ck-*) / var(--gc-*) with
var(--ds-*). Drops style={{}} blocks in favor of className. Updates
affected snapshots.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 28: Sweep remaining grid-react UI subdirs

**Files:**
- Modify: `packages/react/widgets/grid-react/src/ui/{ColorPicker,StyleEditor,format-editor}/**`
- Modify: `packages/react/widgets/grid-react/src/ui/PopoutPortal.tsx`

- [ ] **Step 1: Apply the same sweep pattern as Task 27**

For each subdirectory (`ColorPicker/`, `StyleEditor/`, `format-editor/`) and any loose UI-level file (`PopoutPortal.tsx`):

a. Read each `.tsx` / `.ts` / `.css` file.
b. Replace `.gc-*` className strings with Tailwind utility soup.
c. Replace `var(--bn-*)` / `var(--ck-*)` / `var(--gc-*)` with `var(--ds-*)` equivalents (mapping in Task 26 Step 4 inventory note).
d. Drop inline `style={{ color|background|border:… }}` in favor of className.
e. Replace `gc-themed-scrollbar` with `ds-scrollbar`.

- [ ] **Step 2: Special case — Monaco overflow widgets**

In `format-editor/` or `StyleEditor/`, there's likely a Monaco-related component setting `[data-gc-monaco-overflow]`. The token re-bind block in cockpit.ts is gone; we need an inline replacement that reads `--ds-*` directly.

Look for components mounting Monaco. If they create an overflow widgets host on `document.body`, give it a small CSS-in-JS or scoped CSS module that re-binds the design-system tokens. Since cockpit.ts is deleted, this needs a new home: create `packages/react/widgets/grid-react/src/ui/StyleEditor/monaco-overflow.css`:

```css
[data-ds-monaco-overflow] {
  /* Re-bind --ds-* on portaled host so tokens resolve outside the
     normal cascade. Same set as :root in @starui/design-system/css,
     but only the slots Monaco actually consumes. */
  background: var(--ds-surface-primary);
  color:      var(--ds-text-primary);
  font-family: var(--ds-font-sans);
}

/* Monaco's inline-style suggest widget needs !important to win over
   its eager inline styles. */
.monaco-editor .suggest-widget,
.monaco-editor .parameter-hints-widget,
.monaco-editor .monaco-hover {
  background: var(--ds-surface-primary) !important;
  border: 1px solid var(--ds-border-primary) !important;
  border-radius: var(--ds-radius-sm) !important;
  color: var(--ds-text-primary) !important;
  box-shadow: var(--ds-elevation-overlay) !important;
}
.monaco-editor .suggest-widget .monaco-list-row.focused {
  background: var(--ds-overlay-info-soft) !important;
  color: var(--ds-text-primary) !important;
  border-left: 2px solid var(--ds-accent-info) !important;
}
```

Update the Monaco-mounting component to import this CSS and apply `data-ds-monaco-overflow` to the overflow-widgets host element (was `data-gc-monaco-overflow`).

- [ ] **Step 3: Build + typecheck + test**

```bash
npx turbo typecheck build test --filter=@starui/grid-react
```

Expected: clean. Snapshot deltas reviewed manually.

- [ ] **Step 4: Lint check**

```bash
npx tsx tools/scripts/check-ds-tokens.ts 2>&1 | grep "grid-react/src/ui/" | head -10
```

Expected: no output for these subdirs.

- [ ] **Step 5: Commit**

```bash
git add packages/react/widgets/grid-react/src/ui/
git commit -m "$(cat <<'EOF'
refactor(grid-react): sweep ColorPicker/StyleEditor/format-editor + Monaco

Replaces remaining .gc-* / .ck-* / .gc-be-* class strings and
var(--bn-/--ck-/--gc-) refs with utilities + var(--ds-*).

Adds packages/react/widgets/grid-react/src/ui/StyleEditor/monaco-overflow.css
to re-bind --ds-* on Monaco's overflow-widgets host (replaces the
[data-gc-monaco-overflow] block from the deleted cockpit.ts).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 29: Sweep grid-react modules

**Files:**
- Modify: `packages/react/widgets/grid-react/src/modules/**`

- [ ] **Step 1: List module subdirs**

Run:
```bash
ls packages/react/widgets/grid-react/src/modules/
```

Expected: `column-customization`, `calculated-columns`, `conditional-styling`, `column-groups`, `general-settings`, plus possibly more.

- [ ] **Step 2: Sweep each module subdir**

For each module dir, walk every `.tsx` / `.ts` / `.css` and apply the same replacements as Task 27 Step 2 (className `.gc-*` → utilities, `var(--bn-*)` → `var(--ds-*)`, inline `style={{}}` → className). Use the inventory note's mapping table.

- [ ] **Step 3: Build + test after each module**

After each individual module dir is swept, run:

```bash
npx turbo typecheck build test --filter=@starui/grid-react
```

If a module's tests break unexpectedly, that module is the suspect — bisect within its files.

- [ ] **Step 4: One commit per module**

Commit each module separately for reviewability:

```bash
git add packages/react/widgets/grid-react/src/modules/column-customization/
git commit -m "$(cat <<'EOF'
refactor(grid-react): sweep column-customization module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# Repeat for each module:
git add packages/react/widgets/grid-react/src/modules/calculated-columns/
git commit -m "refactor(grid-react): sweep calculated-columns module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git add packages/react/widgets/grid-react/src/modules/conditional-styling/
git commit -m "refactor(grid-react): sweep conditional-styling module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git add packages/react/widgets/grid-react/src/modules/column-groups/
git commit -m "refactor(grid-react): sweep column-groups module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git add packages/react/widgets/grid-react/src/modules/general-settings/
git commit -m "refactor(grid-react): sweep general-settings module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(If additional modules exist beyond these, add a commit per module following the same pattern.)

- [ ] **Step 5: Verify lint passes for the entire grid-react package**

```bash
npx tsx tools/scripts/check-ds-tokens.ts 2>&1 | grep "grid-react" | head -10
```

Expected: no output.

---

### Task 30: Sweep `markets-grid` and remaining repo

**Files:**
- Modify: `packages/react/widgets/markets-grid/**`
- Modify: anything else flagged by the lint script

- [ ] **Step 1: Sweep markets-grid**

Run:
```bash
grep -rln "gc-\|--bn-\|--ck-\|--gc-\|--fi-\|--mdl-\|style=\"" \
  --include="*.tsx" --include="*.ts" --include="*.css" \
  packages/react/widgets/markets-grid/src/
```

For each file, apply the same replacement pattern as Task 27. Smaller surface area than grid-react.

- [ ] **Step 2: Build + test markets-grid**

```bash
npx turbo typecheck build test --filter=@starui/markets-grid
```

- [ ] **Step 3: Commit markets-grid sweep**

```bash
git add packages/react/widgets/markets-grid/
git commit -m "$(cat <<'EOF'
refactor(markets-grid): sweep to unified design system

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Find any remaining repo-wide stragglers**

Run:
```bash
npx tsx tools/scripts/check-ds-tokens.ts 2>&1 | head -50
```

For each issue: open the file, apply the appropriate replacement.

- [ ] **Step 5: Run lint until clean**

```bash
npx tsx tools/scripts/check-ds-tokens.ts
```

Expected: prints `check-ds-tokens: clean.` and exits 0.

- [ ] **Step 6: Commit any final cleanup**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: clean up remaining --bn-/--fi-/--mdl-/--ck-/--gc- references

Final mop-up so check-ds-tokens passes for the whole repo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 7 — Polish

### Task 31: Wire `check-ds-tokens` into CI as a build gate

**Files:**
- Modify: `package.json` (root)
- Modify: `turbo.json` (root)

- [ ] **Step 1: Add check-ds to the typecheck dependsOn chain**

Open `turbo.json`. Update the `check-ds` task to be a dependency of build:

```json
{
  "tasks": {
    "check-ds": { "outputs": [] },
    "build":     { "dependsOn": ["^build", "check-ds"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test":      { "dependsOn": ["^build"] },
    "e2e":       { "dependsOn": ["build"] }
  }
}
```

(Merge with existing definitions — only add the `"check-ds"` entry to the build task's `dependsOn`.)

- [ ] **Step 2: Verify the gate**

Run:
```bash
npx turbo build
```

Expected: `check-ds` runs first, prints `check-ds-tokens: clean.`, build proceeds.

- [ ] **Step 3: Commit**

```bash
git add turbo.json package.json
git commit -m "$(cat <<'EOF'
ci: gate build on check-ds-tokens lint

Now that the sweep is complete, every future build runs the lint
script first. New hardcoded hex / inline style / legacy --bn-* refs
fail CI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 32: Theme-switch + visual smoke e2e tests

**Files:**
- Create: `e2e/design-system-theme-switch.spec.ts`
- Create: `e2e/design-system-smoke.spec.ts`

- [ ] **Step 1: Theme-switch e2e**

Create `e2e/design-system-theme-switch.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Chroma Desk theme switching', () => {
  test('demo-react: data-theme + data-cvd flips repaint surfaces and accents', async ({ page }) => {
    await page.goto('/'); // demo-react root, configured per playwright.config

    // Default = dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const ground = () => page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--ds-surface-ground').trim(),
    );

    const darkGround = await ground();
    expect(darkGround).toBe('#0b0d10');

    // Flip to light
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    expect(await ground()).toBe('#e2e6ee');

    const accentPositive = () => page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--ds-accent-positive').trim(),
    );

    const beforeCvd = await accentPositive();

    // Toggle CVD on — accent.positive becomes cvd.buyLight
    await page.evaluate(() => document.documentElement.setAttribute('data-cvd', 'on'));
    expect(await accentPositive()).toBe('#1740a8');
    expect(await accentPositive()).not.toBe(beforeCvd);

    // Off again
    await page.evaluate(() => document.documentElement.removeAttribute('data-cvd'));
    expect(await accentPositive()).toBe(beforeCvd);
  });
});
```

- [ ] **Step 2: Visual smoke e2e**

Create `e2e/design-system-smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Chroma Desk visual smoke', () => {
  test('demo-react boots without console errors mentioning undefined CSS vars', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => /var\(--/.test(e) && /undefined/i.test(e))).toEqual([]);
  });

  test('shadcn Select does not render white-on-white in dark', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const select = page.locator('[role="combobox"]').first();
    if (await select.count() === 0) test.skip();
    const bg = await select.evaluate(el => getComputedStyle(el).backgroundColor);
    // not pure white
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });

  test('.ds-scrollbar elements are styled', async ({ page }) => {
    await page.goto('/');
    const handles = page.locator('.ds-scrollbar');
    if (await handles.count() === 0) test.skip();
    const sw = await handles.first().evaluate(el => getComputedStyle(el).scrollbarWidth);
    expect(sw).toBe('thin');
  });
});
```

- [ ] **Step 3: Run e2e**

Run:
```bash
npx turbo e2e --filter=demo-react
```

Expected: new tests pass; the existing 195/214 baseline maintained (no new failures introduced beyond the documented 19).

- [ ] **Step 4: Commit**

```bash
git add e2e/design-system-theme-switch.spec.ts \
        e2e/design-system-smoke.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): theme-switch + visual smoke for unified design system

Asserts data-theme/dark↔light and data-cvd flips actually repaint
the --ds-* CSS vars, shadcn Select doesn't regress to white-on-white,
and .ds-scrollbar produces thin scrollbars.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 33: Documentation + cleanup

**Files:**
- Create: `packages/shared/foundation/design-system/README.md`
- Create: `docs/2026-05-09/architecture-and-design/DESIGN_SYSTEM.md`
- Modify: `docs/IMPLEMENTED_FEATURES.md`
- Delete: `patch/` (working scratch, no longer needed)
- Delete: `docs/superpowers/plans/.work/grid-react-sweep-inventory.md`

- [ ] **Step 1: Write the package README**

Create `packages/shared/foundation/design-system/README.md`:

```markdown
# @starui/design-system — Chroma Desk

Single token tree → Tailwind preset + PrimeNG preset + CSS variables.
Used by every React and Angular app and package in the monorepo.

## Install (workspace)

Already a workspace dep of every consuming package. Nothing to install.

## Subpath imports

| Path | Use |
|---|---|
| `@starui/design-system` | tokens, `componentTokens()`, `applyTheme`, `getTheme`, cell renderers |
| `@starui/design-system/css` | the bundled stylesheet — import once in app's globals.css/styles.scss |
| `@starui/design-system/tailwind` | `tailwindPreset` for tailwind.config.js |
| `@starui/design-system/primeng` | `primengPreset` for `definePreset(Aura, …)` |
| `@starui/design-system/shadcn` | `generateUnifiedCSS()` (advanced — apps don't usually need this directly) |
| `@starui/design-system/adapters/ag-grid` | `agGridDarkParams` / `agGridLightParams` |
| `@starui/design-system/tokens/{primitives,semantic,components}` | direct token access |
| `@starui/design-system/cell-renderers` | AG Grid cell renderer components |

## How to change a color

1. Open `src/tokens/primitives.ts` (palette) or `src/tokens/semantic.ts` (role mapping).
2. Edit the value.
3. Run `npm run build --workspace=@starui/design-system` to regenerate `dist/css/theme.css`.
4. Apps pick up the change on next dev reload.
5. The contrast audit (`tests/tokens/contrast-audit.test.ts`) runs as part of `npm test` — fixes must keep WCAG ratios in spec.

## How to add a theme variant (e.g. a high-contrast mode)

1. Add a new `ColorScheme` object in `src/tokens/semantic.ts`.
2. Update `src/adapters/shadcn.ts` `generateUnifiedCSS()` to emit a `[data-theme="high-contrast"]` block for the new scheme.
3. Update `src/applyTheme.ts` `Mode` type to include the new value.
4. Done. PrimeNG, shadcn, Tailwind, AG Grid all repaint automatically because they read `--ds-*` vars.

## How to test a token change locally

```bash
npm test --workspace=@starui/design-system
```

Snapshots in `tests/adapters/__snapshots__/` will fail if the change ripples through. Review the diff carefully and update with `npm test --workspace=@starui/design-system -- -u` only after verifying the visual change is intentional.

## What is NOT in this package

- No app-specific component variants — those live in their consuming package
- No layout components (cards, modals, etc.) — those live in `@starui/ui`
- No business logic — pure design tokens + adapter glue
- No font assets — apps load Geist + JetBrains Mono via Google Fonts or local @font-face

## Related docs

- `docs/superpowers/specs/2026-05-09-unified-design-system-design.md` — full spec
- `docs/2026-05-09/architecture-and-design/DESIGN_SYSTEM.md` — architecture overview
```

- [ ] **Step 2: Write the architecture overview**

Create `docs/2026-05-09/architecture-and-design/DESIGN_SYSTEM.md`:

```markdown
# Chroma Desk Design System Architecture

> Single design system across the monorepo. Tailwind utilities only. One scrollbar class.

## Layers

```
+------------------------------------------------------------+
| Apps (demo-react, demo-angular, config-admin-web, …)       |
| - import @starui/design-system/css once                    |
| - tailwind.config presets: [tailwindPreset]                |
| - call applyTheme(getTheme()) at boot                      |
+------------------------------------------------------------+
                            |
                            v
+------------------------------------------------------------+
| @starui/design-system                                      |
|                                                            |
|  src/tokens/                src/adapters/                  |
|  - primitives               - tailwind  → Config preset    |
|  - semantic (light, dark)   - shadcn    → generateUnifiedCSS  |
|  - components               - primeng   → definePreset     |
|                             - agGrid    → params           |
|                                                            |
|  src/styles/                src/applyTheme.ts              |
|  - base.css                 - <html data-theme=*           |
|  - scrollbar.css            -        data-cvd=*>           |
|                                                            |
|  scripts/build-css.ts → dist/css/theme.css                 |
+------------------------------------------------------------+
```

## Theme matrix

`<html data-theme="dark|light" [data-cvd="on"]>` — 4 effective combinations:

| theme | cvd | description |
|---|---|---|
| dark  | unset | Chroma Desk · Dark default |
| dark  | on    | Dark + blue/orange CVD-safe accents |
| light | unset | Chroma Desk · Light (cool graphite-grey, ~89% L ground) |
| light | on    | Light + blue/orange CVD-safe accents |

CVD is an orthogonal override — only swaps positive/negative accents. Surfaces/text/borders/etc. stay constant within a mode.

## Cross-framework class vocabulary

Both React JSX and Angular templates use the same Tailwind utilities:

```
bg-background        bg-card               bg-popover
bg-primary           bg-secondary          bg-muted
bg-success           bg-warning            bg-info       bg-destructive
text-foreground      text-muted-foreground text-primary  text-secondary
border-border        ring-ring
bg-surface-{50..950} text-color            text-muted-color    (PrimeNG-flavored)
shadow-card          shadow-overlay        shadow-glow
```

## Class restrictions

**Required:**
- All styling via Tailwind utilities (or, narrowly, `var(--ds-*)` in CSS files)
- Single scrollbar class: `.ds-scrollbar`

**Forbidden** (enforced by `tools/scripts/check-ds-tokens.ts`):
- Hardcoded hex literals (`#aabbcc`) outside the design-system package itself
- Legacy CSS vars (`--bn-*`, `--fi-*`, `--mdl-*`, `--ck-*`, `--gc-*`)
- Inline style props that set color/background/border (`style={{ color: 'red' }}`)

## Pointers

- Spec: [docs/superpowers/specs/2026-05-09-unified-design-system-design.md](../../superpowers/specs/2026-05-09-unified-design-system-design.md)
- Plan: [docs/superpowers/plans/2026-05-09-unified-design-system.md](../../superpowers/plans/2026-05-09-unified-design-system.md)
- Package README: [packages/shared/foundation/design-system/README.md](../../../packages/shared/foundation/design-system/README.md)
```

- [ ] **Step 3: Update IMPLEMENTED_FEATURES.md**

Open `docs/IMPLEMENTED_FEATURES.md`. Find the appropriate section (likely under a "Design System" heading or at the end of the most recent date block). Append:

```markdown
### 2026-05-09 — Unified Chroma Desk Design System

- Single token tree at `packages/shared/foundation/design-system/src/tokens/`
- Three adapters generate Tailwind preset, PrimeNG preset, AG Grid params from the same source
- Bundled stylesheet at `@starui/design-system/css` — imported once per app
- Theme matrix: `<html data-theme="dark|light" [data-cvd="on"]>` = 4 combos
- Single `.ds-scrollbar` utility (theme-aware via color-mix)
- `tailwindcss-primeui` plugin gives Angular/PrimeNG templates the same utility class vocabulary as React/shadcn
- `applyTheme()` / `getTheme()` helpers persist user preference to localStorage
- `check-ds-tokens` lint script gates CI: forbids hardcoded hex, inline styles, legacy CSS vars
- Build-time WCAG contrast audit codifies AAA body / AA chrome thresholds
- Replaces deleted: `@starui/tokens-primeng` package, Cockpit stylesheet (`packages/shared/core/src/css/cockpit.ts`)
- See `docs/2026-05-09/architecture-and-design/DESIGN_SYSTEM.md`
```

- [ ] **Step 4: Delete the working `patch/` directory**

The patch dir was a scratch workspace. Tokens have been moved into the package. Remove:

```bash
rm -rf /Users/develop/wfh/sternui/patch
```

- [ ] **Step 5: Delete the sweep inventory note**

```bash
rm docs/superpowers/plans/.work/grid-react-sweep-inventory.md
rmdir docs/superpowers/plans/.work 2>/dev/null
```

- [ ] **Step 6: Final full-repo validation**

```bash
npx turbo typecheck build test e2e
npx tsx tools/scripts/check-ds-tokens.ts
npx tsx tools/scripts/audit-contrast.ts
```

Expected:
- `typecheck` clean
- `build` clean (with `check-ds` running first as gate)
- `test` shows 653 + new adapter/token/lint tests passing
- `e2e` shows 195/214 baseline + new design-system specs passing
- `check-ds-tokens: clean.`
- `All contrast checks pass.`

- [ ] **Step 7: Commit docs + cleanup**

```bash
git add packages/shared/foundation/design-system/README.md \
        docs/2026-05-09/architecture-and-design/DESIGN_SYSTEM.md \
        docs/IMPLEMENTED_FEATURES.md
git rm -rf patch/
git rm -rf docs/superpowers/plans/.work/ 2>/dev/null || true
git commit -m "$(cat <<'EOF'
docs: README, architecture overview, IMPLEMENTED_FEATURES; cleanup

- @starui/design-system README with subpath table + how-to-modify recipe
- docs/2026-05-09/architecture-and-design/DESIGN_SYSTEM.md
- IMPLEMENTED_FEATURES entry for the unified system
- Delete patch/ scratch dir
- Delete docs/superpowers/plans/.work/ inventory note

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 8 — Final manual QA gate

### Task 34: Manual smoke pass + open PR

This task does not involve code changes — it confirms the migration is shippable.

- [ ] **Step 1: Run every CI gate one more time from a clean state**

```bash
git status   # confirm clean working tree
npx turbo run typecheck build test e2e
```

All green. If anything fails, return to the appropriate task to fix.

- [ ] **Step 2: Manual visual QA — each app, each combo**

For each of `demo-react`, `demo-configservice-react`, `config-admin-web`, `markets-ui-react-reference`, `demo-angular`:

1. `npm run dev:<app>`
2. Open the app in browser.
3. In DevTools console, cycle through:
   ```js
   document.documentElement.setAttribute('data-theme', 'dark');     document.documentElement.removeAttribute('data-cvd');
   document.documentElement.setAttribute('data-theme', 'dark');     document.documentElement.setAttribute('data-cvd', 'on');
   document.documentElement.setAttribute('data-theme', 'light');    document.documentElement.removeAttribute('data-cvd');
   document.documentElement.setAttribute('data-theme', 'light');    document.documentElement.setAttribute('data-cvd', 'on');
   ```
4. Verify each combo:
   - Surfaces and text contrast correctly
   - Accents (positive/negative/warning/info) read distinctly
   - CVD on: gain/loss colors swap to blue/orange
   - No white-on-white anywhere
   - Scrollbars themed (visible in any scrollable container)
   - No console errors related to undefined CSS vars
5. For grid-react surfaces (the settings popout): open the popout, exercise every panel — column-customization, calculated-columns, conditional-styling, column-groups, format editor. Each should look correct in all 4 combos.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin bug/styling
```

- [ ] **Step 4: Open the PR**

Run:
```bash
gh pr create --title "feat: unified Chroma Desk design system" --body "$(cat <<'EOF'
## Summary

- Single design system across the monorepo: one token tree, one scrollbar utility, one theme attribute model
- React + Angular both consume the same Tailwind preset (`@starui/design-system/tailwind`)
- PrimeNG runs in styled mode with a preset that references `var(--ds-*)` so theme switching repaints automatically
- Three legacy systems deleted: FI v1 (replaced), `@starui/tokens-primeng` (deleted entirely), Cockpit stylesheet (deleted entirely)
- `check-ds-tokens` lint script gates CI — no hardcoded hex, no inline styles, no legacy CSS vars

## Spec & plan

- Spec: `docs/superpowers/specs/2026-05-09-unified-design-system-design.md`
- Plan: `docs/superpowers/plans/2026-05-09-unified-design-system.md`

## Manual QA checklist

- [x] Each of 4 React apps: theme toggle works, all 4 combos (dark, dark-cvd, light, light-cvd) render correctly
- [x] demo-angular: theme toggle works, PrimeNG components paint with our tokens
- [x] Grid settings popout: opens, looks correct in all 4 combos, no `.gc-*` references in DOM
- [x] No console warnings about undefined CSS vars
- [x] `check-ds-tokens` clean
- [x] Build-time contrast audit passes
- [x] All 653+ unit + 195+ e2e baselines maintained

## Test plan

- Unit: adapter snapshots + token contracts + lint script tests
- E2E: theme-switch spec + visual smoke spec
- Manual: every app x every theme x cvd on/off

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

The PR URL is the deliverable.

---

## Self-Review Checklist

After implementation completes, verify the spec has been fully realized:

| Spec Section | Implementation Tasks |
|---|---|
| Decisions table (12 rows) | All 12 reflected in tasks |
| Section 1.1 primitives.ts | Task 3 |
| Section 1.2 semantic.ts (Chroma Desk light + dark) | Task 3 |
| Section 1.3 components.ts | Task 4 |
| Section 1.4 theme matrix | Task 9 (CSS), Task 7 (applyTheme) |
| Section 2 CSS structure | Task 9 |
| Section 3 Tailwind integration | Task 8 |
| Section 4 PrimeNG integration | Task 10, 25 |
| Section 5 the one .ds-scrollbar | Task 12 |
| Section 6 Cockpit replacement | Tasks 17, 27, 28, 29 |
| Section 7 migration plan | Tasks 16, 17, 18-22, 23-25, 26-30 |
| Section 8 editing workflow | Task 33 (README) |
| Section 8 lint script | Task 15 |
| Section 8 contrast audit | Task 14 |
| Section 8 reference app preview | OUT OF SCOPE — this plan defers it; the existing markets-ui-react-reference suffices for now |
| Section 9 testing | Tasks 8, 9, 10, 11, 14, 15, 32 |

**Note:** the spec's Section 8 mentions a live preview route in `apps/markets-ui-react-reference/src/routes/design-system/`. This plan defers that as a follow-up — the existing app already serves as a reference, and the formal preview route can be a separate PR once the unified system is shipping.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-09-unified-design-system.md`.**
