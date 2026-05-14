# Session Runbooks

Each file in this directory is the **literal first message** to paste into a fresh agent session. They are self-contained — the agent receives the file content and can execute end-to-end without prior conversation context.

## How to use

```sh
# 1. Open a new agent session in this repo
# 2. Paste the contents of the session file as your first message
# 3. Wait for the agent to verify + commit + push + report the PR link
```

## Session order

The high-level overview lives in [`../WORKLOG-DEFERRED-REFACTORS.md`](../WORKLOG-DEFERRED-REFACTORS.md). The dependencies between sessions:

```
Refactor 1 (MarketsGrid split) — STRICT ORDER
  └─ 1.1 → 1.2 → 1.3

Refactor 2 (Toolbar splits) — ANY ORDER, parallel ok with anything
  ├─ 2.1 HelpPanel
  ├─ 2.2 FiltersToolbar
  └─ 2.3 FormatterPicker

Refactor 3 (Profile state) — STRICT ORDER, depends on Refactor 1 finishing
  └─ 3.1 → 3.2 → 3.3
```

## Files

| Session | File | LOC scope |
|---|---|---|
| 1.1 | [`session-1-1-marketsgrid-characterisation-tests.md`](./session-1-1-marketsgrid-characterisation-tests.md) | New tests, no production code change |
| 1.2 | [`session-1-2-marketsgrid-controller-hook.md`](./session-1-2-marketsgrid-controller-hook.md) | MarketsGrid.tsx 1376 → ~500 |
| 1.3 | [`session-1-3-marketsgrid-view-components.md`](./session-1-3-marketsgrid-view-components.md) | MarketsGrid.tsx ~500 → <400 |
| 2.1 | [`session-2-1-helppanel-split.md`](./session-2-1-helppanel-split.md) | HelpPanel.tsx 1174 → ~150 |
| 2.2 | [`session-2-2-filterstoolbar-hook.md`](./session-2-2-filterstoolbar-hook.md) | FiltersToolbar.tsx 795 → ~250 |
| 2.3 | [`session-2-3-formatterpicker-table-driven.md`](./session-2-3-formatterpicker-table-driven.md) | FormatterPicker.tsx 1002 → ~300 |
| 3.1 | [`session-3-1-profile-state-design.md`](./session-3-1-profile-state-design.md) | Design doc only |
| 3.2 | [`session-3-2-profilemanager-facade.md`](./session-3-2-profilemanager-facade.md) | ProfileManager → ConfigManager façade |
| 3.3 | [`session-3-3-remove-profilemanager-facade.md`](./session-3-3-remove-profilemanager-facade.md) | Remove façade, migrate consumers, -850 LOC |

## Universal rules (every session)

- **Package manager**: npm 10 workspaces. Always `npm ci --legacy-peer-deps`. Never pnpm/yarn.
- **Final gate**: every session ends with `npx turbo typecheck build test` green. Non-negotiable. Per-package `tsc --noEmit` is looser than the full project-ref build and per-package tests miss adjacent regressions.
- **Worktree trap**: if you add a new `@starui/*` workspace package, every other developer worktree needs `npm ci --legacy-peer-deps` to pick up the symlink. Mention this in the PR description.
- **Commit trailer**: every commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **No backwards-compat shims**: when removing code, remove it cleanly. Don't leave `// removed` comments or renamed-to-_unused variables.
- **No new dependencies**: if you find you need one, stop, flag it in the PR description, and add it in a follow-up.
- **Don't bypass hooks** (`--no-verify`, `--no-gpg-sign`) unless explicitly told.
