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

- [ ] `@starui/core`
- [ ] `@starui/markets-grid`
- [ ] `@starui/design-system`
- [ ] `@starui/shared-types`
- [ ] `@starui/config-service`
- [ ] `@starui/component-host`
- [ ] `@starui/widget-sdk`
- [ ] `@starui/openfin-platform`
- [ ] `@starui/widgets-react`
- [ ] `@starui/react-tools` / `@starui/angular-tools`
- [ ] `@starui/dock-editor` / `@starui/angular-dock-editor`
- [ ] `@starui/registry-editor` / `@starui/angular-registry-editor`
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
