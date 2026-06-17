# V2 baseline promotion — integration branch → `main`

Operational runbook for making the **rewrite integration branch** the repository
baseline. This is the promotion path when v2 work does **not** land via many
small PRs to `main`, but instead accumulates on one line that **replaces**
`main` when gates pass.

**Related docs:**

| Document | Role |
|----------|------|
| [`MARKETSGRID_V2_STRATEGY.md`](./MARKETSGRID_V2_STRATEGY.md) | Phases, spine scope, decision gates A–D |
| [`MARKETSGRID_UI_PARITY_TRACK.md`](./MARKETSGRID_UI_PARITY_TRACK.md) | UI preservation — zero regression on promotion |
| [`MARKETSGRID_V2_DEPRECATION_LIST.md`](./MARKETSGRID_V2_DEPRECATION_LIST.md) | APIs safe to delete after promotion |
| [`E2E_STATUS.md`](./E2E_STATUS.md) | Playwright baseline |

---

## 1. Branch model

### Roles

| Branch | Role | Until promotion |
|--------|------|-----------------|
| `main` | **Release baseline** — what ships today | Receives **hotfixes only** once integration branch is declared |
| `feature/worker-publish` | Spine hardening (fan-out, STOMP recovery, lifecycle) | **Merged into integration branch** — not maintained separately |
| `feature/mjor-refactor` | **V2 integration candidate** — all rewrite + Track B work | **Single write target** for v2 code and docs |

### Target end state

```text
legacy/pre-v2-baseline  ← tag on main tip immediately before promotion
main                    ← fast-forward or merge from integration branch
(feature/mjor-refactor deleted or archived after promotion)
```

### Rename (optional, recommended before wide team use)

`feature/mjor-refactor` reads like a short-lived feature branch. When the team
commits to this model, rename to one of:

- `integration/marketsgrid-v2` (recommended)
- `mainline/v2`

Update CI default branch **only after promotion**, not at rename time.

---

## 2. Foundation (already done / in progress)

Integration branch must include the latest spine before rewrite phases start:

| Commit / branch | Content | Status |
|-----------------|---------|--------|
| `feature/worker-publish` | Fan-out pool, reassembler, hosted identity, leak fixes | Merge into integration branch |
| `feature/mjor-refactor` | Strategy, deprecation list, UI parity track docs | On integration branch |

```bash
# One-time: ensure integration branch has worker-publish
git checkout feature/mjor-refactor
git merge feature/worker-publish   # already ancestral if branched from worker-publish
```

---

## 3. Rules while integration branch is NOT yet baseline

### 3.1 Where code lands

| Change type | Target branch |
|-------------|---------------|
| V2 spine (protocol, controller, delta engine, hub) | Integration branch only |
| Track B UI extensions (parity backlog) | Integration branch only |
| Production hotfix (security, data loss, show-stopper) | `main` **and** cherry-pick/rebase into integration branch **within 48h** |
| Unrelated platform work | **Pause on `main`** or cherry-pick to integration — avoid dual feature development |

### 3.2 Sync cadence

| Action | Frequency |
|--------|-----------|
| Merge or rebase `main` → integration branch | **Weekly** minimum, or on every `main` hotfix |
| Run full test suite on integration branch | Every PR merge |
| Run `e2e/v2-*` on integration branch | Every PR that touches `grid`, `engine`, `host-data`, `widgets-react` |

```bash
# Weekly sync (prefer merge to preserve integration history)
git checkout feature/mjor-refactor
git fetch origin
git merge origin/main
# resolve conflicts; run: npx turbo typecheck build test && npm run e2e
```

### 3.3 Forbidden on integration branch

- Wholesale rewrite of `packages/react-grid/grid/src/customizer/` or `widget/formatter/`
- New parallel data-entry APIs (see strategy PR checklist)
- Merging integration → `main` before **§5 promotion gates** are all checked

### 3.4 UI preservation (mandatory)

Every integration-branch PR that touches UI must satisfy
[`MARKETSGRID_UI_PARITY_TRACK.md` §1](./MARKETSGRID_UI_PARITY_TRACK.md#1-preservation-gates-every-ui-pr).
Promotion is **blocked** if any `e2e/v2-*` spec regresses vs the pre-promotion baseline.

---

## 4. Phase gates (integration branch progress)

These mirror [`MARKETSGRID_V2_STRATEGY.md` §6–10](./MARKETSGRID_V2_STRATEGY.md) but
are tracked on the integration branch only.

| Gate | Name | Entry criterion |
|------|------|-----------------|
| **A** | Delta engine work | Conformance harness ≥20 tests green; perf baseline captured |
| **B** | Deprecation deletions | `GridDataController` extracted; deprecation list approved |
| **C** | Pilot-ready | C-01…C-14 + E-01…E-03 green; 30 min multi-blotter soak |
| **D** | API cleanup | No production imports of deleted APIs (CI grep) |

Gate C = **minimum for baseline promotion**. Gate D can complete in the first
sprint **after** promotion if needed.

---

## 5. Promotion gates (integration branch → `main`)

**All boxes required.** Sign-off: engineering lead + one product/desk representative.

### 5.1 Automated

- [ ] `npx turbo typecheck build test` green on integration branch tip
- [ ] `npm run e2e` — all `e2e/v2-*.spec.ts` green (see [`E2E_STATUS.md`](./E2E_STATUS.md))
- [ ] `@starui/host-data` conformance suite green (C-01…C-14 when implemented)
- [ ] Import-graph audit clean per [`MARKETSGRID_V2_DEPRECATION_LIST.md`](./MARKETSGRID_V2_DEPRECATION_LIST.md) §sign-off (or explicit waivers documented)

### 5.2 Production spine

- [ ] `apps/demos/star-demo` — `HostedMarketsGrid`, full trading profile (alerts + conditional styling on)
- [ ] `apps/demos/markets-ui-react-reference` — same
- [ ] OpenFin e2e hosts (`e2e-openfin-workspace`, `e2e-browser-blotter`) green
- [ ] STOMP reconnect auto-recovery (E-01) — no manual reload
- [ ] Refresh view + live ticks (E-02)
- [ ] Multi-blotter workspace restore (E-03)

### 5.3 Performance & stability

- [ ] 30 min multi-blotter soak (≥5 windows, production build, STOMP live) — no leak growth per [`MEMORY_LEAK_AUDIT.md`](./MEMORY_LEAK_AUDIT.md)
- [ ] Perf panel: no >50 ms long tasks during 30 s STOMP soak with full trading profile ([strategy §Phase 3 budget](./MARKETSGRID_V2_STRATEGY.md))
- [ ] `npm run build` production apps (`star-demo`, reference) — no regressions

### 5.4 UI preservation

- [ ] Zero intentional removal of shipped customizer modules or toolbar segments
- [ ] Dark + light theme verified on formatter toolbar, settings sheet, primary toolbar
- [ ] OpenFin formatter popout parity (`v2-popout-toolbar`, `v2-popout-design-system`)
- [ ] Profile save/load/autosave round-trip on integration branch (`v2-autosave`, `v2-profile-lifecycle`)

### 5.5 Documentation & process

- [ ] `docs/current-features.md` reflects integration branch capabilities
- [ ] `docs/CHANGELOG-2026-06-16.md` or successor changelog updated for promotion release
- [ ] Rollback tag plan agreed (§6)

---

## 6. Promotion day checklist

Execute in order. Requires `maintainer` access.

### Pre-flight

```bash
git fetch origin
git checkout feature/mjor-refactor
git pull origin feature/mjor-refactor
npx turbo typecheck build test
npm run e2e
```

- [ ] All §5 gates signed off
- [ ] Team notified — `main` will fast-forward; no merges to old `main` during window

### Tag legacy baseline

```bash
git checkout main
git pull origin main
git tag -a legacy/pre-v2-baseline -m "main tip before MarketsGrid v2 baseline promotion"
git push origin legacy/pre-v2-baseline
```

### Promote

**Option A — fast-forward (preferred when main has no divergent commits):**

```bash
git checkout main
git merge --ff-only feature/mjor-refactor
git push origin main
```

**Option B — merge commit (when main received hotfixes not yet on integration):**

```bash
git checkout main
git merge feature/mjor-refactor -m "chore: promote MarketsGrid v2 integration branch to main baseline"
git push origin main
```

### Post-promotion

- [ ] Delete or archive `feature/mjor-refactor` remote branch (optional after 2 weeks)
- [ ] Update default branch protection rules if needed
- [ ] Announce: `main` **is** v2 baseline; integration branch model ends
- [ ] Open follow-up for Gate D deprecations if not done pre-promotion
- [ ] Update [`PARITY.md`](./PARITY.md) headline and last-verified date

---

## 7. Rollback

If a critical issue is found within **14 days** of promotion:

1. Revert `main` to `legacy/pre-v2-baseline`:

   ```bash
   git checkout main
   git reset --hard legacy/pre-v2-baseline
   git push origin main --force-with-lease   # requires explicit team approval
   ```

2. Resume fixes on a new integration branch cut from the failed tip.
3. Document incident in changelog; add conformance case (strategy §8).

**After 14 days:** rollback via forward-fix on `main`, not hard reset.

---

## 8. CI recommendations (integration branch)

Until promotion, configure CI to run on **both** `main` and integration branch:

| Job | `main` | Integration branch |
|-----|--------|-------------------|
| `turbo typecheck build test` | ✅ | ✅ |
| `npm run e2e` | ✅ (regression guard) | ✅ (promotion gate) |
| Conformance (when added) | — | ✅ |

Add branch name to PR template: *“Target: integration / main / hotfix-cherry-pick”*.

---

## 9. FAQ

**Why not merge small PRs to `main` along the way?**  
This repo chose a **baseline swap** model: one integration line becomes `main`
to avoid half-migrated spine on production. Sync rules in §3 prevent unbounded
divergence.

**Can `main` get features during integration?**  
Only hotfixes. Features go to integration branch or wait until after promotion.

**Does promotion require 100% AdapTable parity?**  
No. Spine + UI preservation gates (§5) apply. Track B gaps continue on `main`
after promotion per [`MARKETSGRID_UI_PARITY_TRACK.md`](./MARKETSGRID_UI_PARITY_TRACK.md).

**What about `STARUI_GRID_V2` flag?**  
Optional for **pilot apps within** the integration branch before promotion.
After promotion, the flag can be removed — `main` is v2.

---

## 10. Document history

| Date | Change |
|------|--------|
| 2026-06-17 | Initial runbook — integration branch model, sync rules, promotion + rollback |
