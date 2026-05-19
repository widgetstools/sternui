# StarGrid Platform — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `grid-platform/` as an isolated npm workspace with host port interfaces and a working browser runtime adapter.

**Architecture:** New `@stargrid/*` namespace; `@stargrid/types` (foundation) → `@stargrid/host` (ports) → `@stargrid/host-browser` (default runtime). Engine and grid packages are stubbed for phase 2/3.

**Tech Stack:** npm 10 workspaces, Turborepo 2, TypeScript 5.9, Vitest 4

**Design spec:** [`docs/superpowers/specs/2026-05-19-grid-platform-design.md`](../specs/2026-05-19-grid-platform-design.md)

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `grid-platform/package.json`
- Create: `grid-platform/turbo.json`
- Create: `grid-platform/tsconfig.base.json`
- Create: `grid-platform/README.md`

- [x] Root workspace with npm workspaces glob for `packages/*`
- [x] Turbo tasks: `build`, `typecheck`, `test`
- [x] Shared tsconfig base

---

## Task 2: `@stargrid/types`

**Files:**
- Create: `grid-platform/packages/types/`

Port from `@starui/runtime-port` types: `Theme`, `IdentitySnapshot`, `SurfaceSpec`, `SurfaceHandle`, constants.

- [x] Package builds with `tsc`
- [x] Zero `@stargrid/*` dependencies

---

## Task 3: `@stargrid/host`

**Files:**
- Create: `grid-platform/packages/host/`

Define:
- `RuntimePort` (ported interface)
- `StoragePort`, `DataPort`, `ConfigPort` (minimal interfaces)
- `GridHostContext` + `createDefaultHostContext()`

- [x] Depends only on `@stargrid/types`
- [x] Unit tests for default context factory

---

## Task 4: `@stargrid/host-browser`

**Files:**
- Create: `grid-platform/packages/host-browser/`

Port `BrowserRuntime` + `resolveBrowserIdentity` from legacy `@starui/runtime-browser`.

- [x] Implements `RuntimePort`
- [x] Vitest tests for identity resolution + theme detection

---

## Task 5: Stub packages + docs

**Files:**
- Create: `grid-platform/packages/engine/README.md`
- Create: `grid-platform/packages/grid/README.md`
- Create: `grid-platform/packages/host-openfin/README.md`
- Create: `grid-platform/docs/ARCHITECTURE.md`

---

## Task 6: Verification

Run from `grid-platform/`:

```bash
npm install
npm run typecheck
npm run build
npm run test
```

Expected: all green.

---

## Phase 2 preview (next session)

1. Copy `packages/shared/core` → `grid-platform/packages/engine`
2. Remove `utils/openFin.ts` from engine; move to `host-openfin` or `grid`
3. Port engine tests; verify no React imports
4. Update `@stargrid/grid` stub to depend on engine
