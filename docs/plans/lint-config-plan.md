---
title: "ESLint adoption plan"
subtitle: "Phased roll-out of `@starui/eslint-plugin` and a root flat-config without breaking v1"
date: "2026-05-19"
status: "Roll-out plan — not a contract"
---

# Why this plan exists

v1 has **no ESLint config**. 302 bare `console.*` calls. A
multi-prefix logging convention that filters worse every quarter.
The cure (lint + custom rules) is in place — `@starui/eslint-plugin`
ships two rules today (`no-bare-nested-field`, `no-bare-console`)
and the contract is documented in `PUBLIC_API_SPEC.md` §15 #11 +
#12.

The cure is not ready to be applied to v1 wholesale. 302 lint
errors in one PR is unreviewable. This document plans the phased
adoption so the contract becomes real one package at a time.

# Phases

## Phase 0 — Today (DONE)

- `@starui/eslint-plugin` package exists at
  `packages/tooling/eslint-plugin/`.
- Two rules: `no-bare-nested-field`, `no-bare-console`.
- 35+ unit tests via `@typescript-eslint/rule-tester`.
- Spec contract in `PUBLIC_API_SPEC.md` §1.3 + §2.5 + §15 #11–#12.
- Nuance entries in `UX_NUANCES.md` N32 + N33.

## Phase 1 — Root flat config + lint script (next PR)

Add a root `eslint.config.js` (flat config format, ESLint 9+):

```js
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import starui from '@starui/eslint-plugin';

export default [
  // Lint own source only — skip node_modules and dist.
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'] },

  // TypeScript baseline — recommended rules without
  // type-aware checks (too slow for monorepo-wide lint).
  ...tseslint.configs.recommended,

  // React rules where applicable.
  {
    files: ['packages/react/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // StarUI custom rules — apply across all packages.
  starui.configs.recommended,

  // Per-package overrides for packages still pending adoption.
  // Each removed as the package is brought into compliance.
  {
    files: [
      'packages/shared/platform/openfin-platform/src/**/*.ts',
      'packages/react/widgets/widgets-react/src/**/*.{ts,tsx}',
      'packages/shared/services/config-service/src/**/*.ts',
      // ... add files where bare-console adoption is pending
    ],
    rules: {
      '@starui/no-bare-console': 'off',
    },
  },
];
```

Add to root `package.json`:

```json
"scripts": {
  "lint": "eslint .",
  "lint:fix": "eslint . --fix"
}
```

And to `turbo.json`:

```json
"tasks": {
  "lint": {
    "dependsOn": ["^build"],
    "inputs": ["**/*.{ts,tsx,js,mjs}", "eslint.config.js"],
    "outputs": []
  }
}
```

The per-package overrides list is the **inventory of pending
work**. Phase 2 retires it one entry at a time.

## Phase 2 — Per-package adoption (incremental PRs)

For each package currently in the override list, one PR:

1. Add a `createLogger("starui:<pkg-short>")` import at the top of
   each source file that emits diagnostics.
2. Replace every `console.*('<prefix> message', payload)` with
   `log.<level>('message', payload)` — strip the inline prefix
   since the logger handles it.
3. Remove the package's entry from `eslint.config.js`'s override
   list.
4. Run `npm run lint` from root and confirm zero errors.
5. Commit as `refactor(<pkg>): adopt createLogger; close no-bare-console gap`.

Suggested PR order, biggest-impact first:

| # | Package | Bare-console count |
|---|---|---|
| 1 | `@starui/openfin-platform` (`dock.ts` + 5 siblings) | ~70 |
| 2 | `@starui/widgets-react` (`MarketsGridContainer.tsx` + hosted/) | ~55 |
| 3 | `@starui/grid-react` (`PopoutPortal.tsx` + modules/) | ~25 |
| 4 | `@starui/config-service` (`ConfigManager.ts`) | ~15 |
| 5 | `@starui/markets-grid` (controller + toolbars) | ~12 |
| 6 | `@starui/workspace-setup-react` | ~12 |
| 7 | `@starui/data-services` (worker + client) | ~13 |
| 8 | Everything else | < 5 each |

A codemod (~80 lines of jscodeshift) handles steps 1–2 for the
bulk of cases. Files with non-trivial prefix manipulation get
hand-edited.

## Phase 3 — Codemod the `nestedField()` adoption

A separate codemod converts bare `field: "<contains-dot>"` to
`...nestedField({ path: "<…>" })` across the codebase. Mechanical;
the design doc names it as a follow-up
(`docs/plans/nested-fields-design.md`).

Same per-package adoption pattern: enable the
`no-bare-nested-field` rule package by package after the codemod
runs.

## Phase 4 — CI integration

Once Phases 1–3 are complete:

- `npm run lint` runs in CI on every PR.
- Lint errors block merge.
- The override list in `eslint.config.js` is empty.

# Non-goals

- **No retroactive lint cleanup of v1 outside this plan.** The
  rewrite is the target; v1 stays as it is. Phases 1–3 happen as
  the rewrite progresses, not before.
- **No "lint everything aggressively" baseline.** The plan ships
  exactly two custom rules + a thin typescript-eslint baseline +
  react-hooks. Style preferences (Prettier, single-quote, etc.)
  are out of scope — those should be formatter-level, not
  lint-level.
- **No type-aware lint rules in Phase 1.** They're 10×+ slower and
  the existing `npm run typecheck` covers most of what they would.

# Open questions for review

1. Should the eslint plugin export typed configs (`recommended` vs
   `strict` vs `legacy`)? Currently one — `recommended`. Adding
   `strict` is cheap if there's appetite for more aggressive rules
   later.
2. Should `no-bare-console` also disallow `globalThis.console.*`?
   Today it only catches the lexical `console` identifier. Edge
   case but worth a follow-up if anyone reaches for it as a
   workaround.
3. Should `no-bare-nested-field` provide an auto-fix? The
   transformation needs to insert a spread of `nestedField({ path })`
   which can clash with existing properties. Conservative call:
   no auto-fix; codemod handles bulk migration.

---

*Authored 2026-05-19. Adoption plan, not a contract. The contracts
live in `PUBLIC_API_SPEC.md` §1.3 + §2.5 + §15 #11–#12.*
