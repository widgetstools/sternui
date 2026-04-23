<!--
  PR template — MarketsUI platform monorepo.
  Fill in Summary + Test plan. Delete sections that don't apply.
-->

## Summary

<!-- 1-3 bullets describing what changed and why. -->

-
-

## Packages touched

<!-- Tick every package affected. Helps reviewers scope their read. -->

- [ ] `@marketsui/core`
- [ ] `@marketsui/markets-grid`
- [ ] `@marketsui/design-system`
- [ ] `@marketsui/shared-types`
- [ ] `@marketsui/config-service`
- [ ] `@marketsui/component-host`
- [ ] `@marketsui/widget-sdk`
- [ ] `@marketsui/openfin-platform` / `@marketsui/openfin-platform-stern`
- [ ] `@marketsui/widgets-react`
- [ ] `@marketsui/react-tools` / `@marketsui/angular-tools`
- [ ] `@marketsui/dock-editor` / `@marketsui/angular-dock-editor`
- [ ] `@marketsui/registry-editor` / `@marketsui/angular-registry-editor`
- [ ] `apps/demo-react` / `apps/demo-angular`
- [ ] Other: ___

## Test plan

- [ ] `npx turbo typecheck` passes
- [ ] `npx turbo build` passes
- [ ] `npx turbo test` passes
- [ ] `npx playwright test` (if E2E-relevant)
- [ ] Manual smoke in `apps/demo-react` (if UI-facing)

## Docs updated

- [ ] `docs/IMPLEMENTED_FEATURES.md` (feature changes)
- [ ] `docs/ARCHITECTURE.md` (structural / boundary changes)
- [ ] `CLAUDE.md` (agent instructions)
- [ ] N/A
