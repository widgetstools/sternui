# Visual Reference

Screenshots of every screen and component-state in the StarUI Platform,
captured against the demo apps. Companion to
[`../UX_NUANCES.md`](../UX_NUANCES.md): nuance entries link here to
prove the rewrite preserves visual parity.

## Why

A rewrite that re-uses the public API and re-implements the
component tree from scratch can pass every unit test, pass every
e2e interaction test, and still ship with subtle visual
regressions — a 2px misaligned border on the formatter, a wrong
hover-tint on the column header, a focus ring that no longer
matches the design-system spec. Type checkers don't catch
these. Reviewers reading diffs don't catch these. Side-by-side
screenshots do.

## Directory layout

```
visual-reference/
├── README.md               (this file)
├── react/                  (apps/demo-react captures)
│   ├── light/
│   │   ├── markets-grid/
│   │   │   ├── default.png
│   │   │   ├── customizer-open.png
│   │   │   ├── customizer-popped.png
│   │   │   ├── formatter-open.png
│   │   │   ├── formatter-popped.png
│   │   │   ├── profile-manager.png
│   │   │   └── context-menu.png
│   │   ├── data-provider-editor/
│   │   ├── config-browser/
│   │   ├── workspace-setup/
│   │   └── ...
│   └── dark/
│       └── (mirror of light/)
├── angular/                (apps/demo-angular captures)
│   ├── light/
│   └── dark/
├── popout-correct/         (cross-window UX captured under §N1, N3-N9)
└── popout-broken/          (deliberately-broken comparison shots — pre-fix state)
```

## Naming convention

`<surface>/<state>.png` where:

- **surface** is the screen / component / panel under test, in
  kebab-case, matching the title in `UX_NUANCES.md` where one
  exists.
- **state** is the interaction state — `default`, `hover`,
  `focus`, `open`, `loading`, `empty`, `error`, `popped`,
  `customizer-open`, etc.

Examples:

- `react/dark/markets-grid/formatter-open.png` — formatter dialog
  open, inline (not popped), dark theme, React demo.
- `react/dark/markets-grid/formatter-popped.png` — same dialog in
  its own window.
- `popout-broken/dropdown-on-parent.png` — the bug behaviour from
  N1 (Symptom-if-missing).

## Capture workflow

The captures live in `git` and are regenerated on demand. The
workflow has three parts:

### 1. Boot the demo

```bash
# React (preferred — denser, exercises more primitives):
npm --workspace apps/demo-react run dev

# Angular:
npm --workspace apps/demo-angular run start
```

The dev server runs on `http://localhost:5173` (Vite) /
`http://localhost:4200` (Angular CLI).

### 2. Run the capture spec

A dedicated Playwright project under `e2e/visual-reference/`
drives the demo through every catalogued state. The spec is
**not** part of the regular e2e suite — it runs explicitly:

```bash
npx playwright test --project=visual-reference --grep "@vr"
```

Each test:

1. Navigates to the demo.
2. Applies the required theme (`html[data-theme="dark|light"]`).
3. Reaches the target state via real interactions (click, hover,
   keyboard) — never via DOM injection. This is important: a
   shortcut that mutates state directly would miss the
   layout/animation work that produces the visual.
4. Waits for animations to settle
   (`page.waitForLoadState('networkidle')` plus an explicit
   `waitForFunction` against `prefers-reduced-motion` /
   transition completion).
5. Calls `page.screenshot({ fullPage: false, mask: [...volatile selectors] })`.
   Volatile selectors include live clocks, "X seconds ago"
   timestamps, and the WebSocket connection-state pill — masking
   these prevents trivial diff noise.
6. Writes to the deterministic path under `visual-reference/`.

### 3. Compare and commit

```bash
git diff visual-reference/             # review pixel diffs
git add visual-reference/              # commit if changes are intentional
```

For drive-by reviews, GitHub renders PNG diffs inline in the diff
view, so a PR that re-captures the suite produces a visually
reviewable diff without extra tooling.

## Surfaces to capture (initial sweep)

This list is the minimum viable capture set — every entry in
`UX_NUANCES.md` should resolve to at least one screenshot once
N10–N30 are filled in.

**Per surface, capture both light and dark themes.**

| Surface | States |
|---|---|
| MarketsGrid (default) | default, hover-on-cell, with-selection (single, range), with-context-menu |
| MarketsGrid Customizer | closed, open-inline, open-popped, columns-tab, formatting-tab |
| Formatter dialog | closed, open-inline, open-popped, with-autocomplete-open |
| Profile Manager | default, with-active-profile, rename-in-progress, with-many-profiles (overflow) |
| Data Provider Editor | default, REST-form, websocket-form, validation-errors |
| Config Browser | table view, row-detail, orphans-tab, empty state |
| Workspace Setup wizard | step-1, step-2, step-3, validation-error, complete |
| Settings Sheet | closed, open, popped, scrolled |
| Toast layer | one toast, three toasts stacked, error toast (sticky) |
| Empty states | grid-no-data, no-profiles, no-providers |
| Loading states | grid-loading, profile-loading, provider-loading |
| Theme transition | light-to-dark mid-edit (single frame at the moment of swap, for the §N28 verification) |

For each MarketsGrid state, also capture:
- AG-Grid theme integration (header chrome, sort indicator, row hover)
- Status-bar contents
- Floating filter row (if enabled)

## Acceptance criterion for a rewrite

A rewrite has reached visual-parity acceptance when:

1. Every screenshot in this directory has a corresponding shot
   from the rewrite's demo.
2. Per-pixel diff fails to find any difference exceeding the
   threshold (configurable per-test; default 0.1% pixel
   difference, suitable for catching real regressions while
   tolerating font anti-aliasing jitter).
3. For the popout entries (N1, N3–N9), the rewrite's
   `popout-correct/` set matches v1's; the rewrite need not
   reproduce the `popout-broken/` set (those are evidence of
   pre-fix bugs, retained for context).

A rewrite that passes all e2e tests but fails the visual diff is
**not** accepted. Visual regression is regression.

## Maintenance

- When a UX-affecting change ships, **the same PR re-captures the
  affected screenshots**. CI will not auto-regenerate.
- When a new nuance is added to `UX_NUANCES.md`, the same PR adds
  the supporting screenshots.
- Stale screenshots (referenced by a nuance entry that no longer
  exists) are deleted as part of the cleanup PR.

---

*Authored 2026-05-18. The actual Playwright spec under
`e2e/visual-reference/` and the first capture sweep are
follow-up work — this README defines the contract first.*
