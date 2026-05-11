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

- Spec: `docs/superpowers/specs/2026-05-09-unified-design-system-design.md`
- Plan: `docs/superpowers/plans/2026-05-09-unified-design-system.md`
- Package README: `packages/shared/foundation/design-system/README.md`
