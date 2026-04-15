# Column-Customization Schema Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@grid-customizer/core-v2`'s `column-customization` module schema with four optional fields (`cellStyleOverrides`, `headerStyleOverrides`, `valueFormatterTemplate`, `templateIds`), bump `schemaVersion` to 2 with a no-op migrate, and wire three pure-fn emitters into `transformColumnDefs` so AG-Grid actually consumes them.

**Architecture:** All work is local to `packages/core-v2/src/modules/column-customization/`. The schema gets new optional fields with structured types (no free-form CSS bag); two new pure adapters (`cellStyleToAgStyle`, `valueFormatterFromTemplate`) live in a new `adapters/` folder; the existing `applyAssignments` walker in `index.ts` calls them only when overrides are present, leaving multi-module composition intact. `templateIds` is stored but not yet read — sub-project #2 fills in template resolution.

**Tech Stack:** TypeScript, Vitest, AG-Grid Community/Enterprise 35, React 19. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-14-column-customization-schema-extension-design.md`

---

## File Structure

```
packages/core-v2/src/modules/column-customization/
├── state.ts                                MODIFY  +types, +ColumnAssignment fields
├── index.ts                                MODIFY  +schemaVersion 2, +migrate, wire emitters
├── index.test.ts                           MODIFY  +schemaVersion test, +emitter tests
├── state.test.ts                           NEW     migrate(1→2) + migrate(0) tests
└── adapters/
    ├── cellStyleToAgStyle.ts               NEW     pure flattener (~60 LOC)
    ├── cellStyleToAgStyle.test.ts          NEW     unit tests
    ├── valueFormatterFromTemplate.ts       NEW     preset registry + expr cache (~80 LOC)
    └── valueFormatterFromTemplate.test.ts  NEW     unit tests for both branches
```

**Why this layout:** `state.ts` already owns shape + types + legacy migration; new types go there. `adapters/` is new — it isolates the pure CSS-bag and formatter-compile logic from the module's lifecycle code so each can be unit-tested without spinning up a Module instance. The transformer wiring stays in `index.ts` (one call per emitter, kept terse).

**Rules:**
- `cd /Users/develop/aggrid-customization` before any command.
- Run vitest filtered: `pnpm --filter @grid-customizer/core-v2 test --run path/to/file.test.ts`.
- Commit after every passing test step (small commits per the plan's commit gates).

---

## Task 1: Add `BorderSpec` + `CellStyleOverrides` types to state.ts

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/state.ts`

This task is type-only — it adds the structured shapes but doesn't yet attach them to `ColumnAssignment` (Task 3). Splitting types from the field add keeps the diff readable and keeps the module compiling at every step.

- [ ] **Step 1: Add the types**

Append to `packages/core-v2/src/modules/column-customization/state.ts` (after the existing exports, before the `// ─── Migration from v1` divider):

```ts
// ─── Style override shapes (used by FormattingToolbar in v2.1) ──────────────
//
// Structured discriminated shapes — closed set matching the FormattingToolbar's
// editor controls. The flattener in `adapters/cellStyleToAgStyle.ts` converts
// these into a CSS object AG-Grid consumes via `colDef.cellStyle` / `headerStyle`.

export interface BorderSpec {
  width: number;                                  // px
  color: string;                                  // hex / css color
  style: 'solid' | 'dashed' | 'dotted';
}

export interface CellStyleOverrides {
  typography?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSize?: number;                            // px
  };
  colors?: {
    text?: string;
    background?: string;
  };
  alignment?: {
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'middle' | 'bottom';
  };
  borders?: {
    top?: BorderSpec;
    right?: BorderSpec;
    bottom?: BorderSpec;
    left?: BorderSpec;
  };
}
```

- [ ] **Step 2: Verify compile**

Run: `pnpm --filter @grid-customizer/core-v2 typecheck`

Expected: clean (the new types are unused so far; TS should not flag them as errors because `interface` exports don't require usage).

- [ ] **Step 3: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/state.ts
git commit -m "feat(core-v2): add CellStyleOverrides + BorderSpec types

Pre-work for FormattingToolbar v2 port. Adds the structured shapes only;
ColumnAssignment field wiring lands in a follow-up task."
```

---

## Task 2: Add `PresetId` + `ValueFormatterTemplate` types to state.ts

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/state.ts`

- [ ] **Step 1: Add the types**

Append to the same file, immediately after `CellStyleOverrides`:

```ts
// ─── Value-formatter template ───────────────────────────────────────────────
//
// Hybrid discriminated union: `kind: 'preset'` covers the FormattingToolbar's
// menu (CSP-safe, validates at edit time); `kind: 'expression'` is the v1
// escape hatch for users who need full Intl.NumberFormat / arbitrary fns.
//
// `kind: 'expression'` compiles via `new Function(...)` — CSP-unsafe by design.
// Under strict CSP it falls back to identity formatter (see adapter for details).

export type PresetId = 'currency' | 'percent' | 'number' | 'date' | 'duration';

export type ValueFormatterTemplate =
  | { kind: 'preset'; preset: PresetId; options?: Record<string, unknown> }
  | { kind: 'expression'; expression: string };
```

- [ ] **Step 2: Verify compile**

Run: `pnpm --filter @grid-customizer/core-v2 typecheck`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/state.ts
git commit -m "feat(core-v2): add ValueFormatterTemplate + PresetId types

Hybrid preset|expression discriminated union. Preset branch is CSP-safe;
expression branch is v1-parity escape hatch."
```

---

## Task 3: Extend `ColumnAssignment` with the four new optional fields

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/state.ts`

- [ ] **Step 1: Update `ColumnAssignment`**

Replace the existing `ColumnAssignment` interface (lines 12-22) with:

```ts
export interface ColumnAssignment {
  readonly colId: string;
  headerName?: string;
  headerTooltip?: string;
  initialWidth?: number;
  initialHide?: boolean;
  initialPinned?: 'left' | 'right' | boolean;
  sortable?: boolean;
  filterable?: boolean;
  resizable?: boolean;

  // ─── New in schemaVersion 2 ──────────────────────────────────────────────
  // Per-column appearance + formatting. All optional; absent = no override.
  // Wired into AG-Grid by the transformers in `index.ts` via the adapters in
  // `./adapters/`. `templateIds` is stored only — column-templates resolution
  // ships in a future module port.
  cellStyleOverrides?: CellStyleOverrides;
  headerStyleOverrides?: CellStyleOverrides;
  valueFormatterTemplate?: ValueFormatterTemplate;
  templateIds?: string[];                         // order = application order; later wins
}
```

Also update the docstring directly above `ColumnAssignment` — replace "Cell/header styling: deferred until the FormattingToolbar lands in v2.1" and "Template composition: column-templates module is out of v2.0 scope" with:

```
 * v2.1 schema (schemaVersion: 2) extends v2.0 with optional appearance,
 * formatter, and template-reference fields. All new fields are optional and
 * default to undefined, so existing v2.0 snapshots roundtrip unchanged.
```

(Replace the entire docstring of `ColumnAssignment` with that single explanatory paragraph; keep the comment about "fresh column has `{ colId }` only" if you want — both are fine.)

- [ ] **Step 2: Verify compile**

Run: `pnpm --filter @grid-customizer/core-v2 typecheck`

Expected: clean. The existing `applyAssignments` walker in `index.ts` doesn't read the new fields, so nothing breaks.

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/index.test.ts`

Expected: all 13 existing tests pass (schemaVersion check still expects 1 — Task 4 will bump it).

- [ ] **Step 4: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/state.ts
git commit -m "feat(core-v2): extend ColumnAssignment with v2.1 schema fields

Adds optional cellStyleOverrides, headerStyleOverrides,
valueFormatterTemplate, and templateIds. No transformer wiring yet — that
lands per-field in subsequent commits. schemaVersion stays at 1 until the
migrate function is in place."
```

---

## Task 4: Bump `schemaVersion` to 2 + add no-op `migrate`

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/index.ts`
- Modify: `packages/core-v2/src/modules/column-customization/index.test.ts`
- Create: `packages/core-v2/src/modules/column-customization/state.test.ts`

This task uses TDD: write the migration test first, watch it fail, implement, watch it pass.

- [ ] **Step 1: Write failing test for `migrate(raw, fromVersion=1)`**

Create `packages/core-v2/src/modules/column-customization/state.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { columnCustomizationModule, INITIAL_COLUMN_CUSTOMIZATION } from './index';
import type { ColumnCustomizationState } from './state';

describe('column-customization — migrate (schemaVersion 1 → 2)', () => {
  it('passes a v1 snapshot through unchanged (new fields default to undefined)', () => {
    const v1State = {
      assignments: {
        symbol: { colId: 'symbol', headerName: 'Ticker', initialWidth: 120 },
      },
    };
    const out = columnCustomizationModule.migrate!(v1State, 1) as ColumnCustomizationState;
    expect(out).toEqual(v1State);
    // None of the new v2 fields should be auto-populated.
    expect(out.assignments.symbol.cellStyleOverrides).toBeUndefined();
    expect(out.assignments.symbol.headerStyleOverrides).toBeUndefined();
    expect(out.assignments.symbol.valueFormatterTemplate).toBeUndefined();
    expect(out.assignments.symbol.templateIds).toBeUndefined();
  });

  it('falls back to initial state with a warning for unknown older versions', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = columnCustomizationModule.migrate!({ junk: true }, 0) as ColumnCustomizationState;
    expect(out).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('column-customization'),
      expect.stringContaining('schemaVersion 0'),
    );
    warnSpy.mockRestore();
  });

  it('falls back to initial state when raw is not an object at v1', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(columnCustomizationModule.migrate!(null, 1)).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    expect(columnCustomizationModule.migrate!('garbage', 1)).toEqual(INITIAL_COLUMN_CUSTOMIZATION);
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/state.test.ts`

Expected: FAIL — `columnCustomizationModule.migrate` is undefined (the `!` non-null assertion will throw at runtime).

- [ ] **Step 3: Implement `schemaVersion: 2` + `migrate`**

In `packages/core-v2/src/modules/column-customization/index.ts`, change line 67:

```ts
  schemaVersion: 1,
```

to:

```ts
  schemaVersion: 2,
```

Then add a `migrate` method to the module definition. Insert it directly after `getInitialState` (around line 72-74), before `transformColumnDefs`:

```ts
  migrate(raw, fromVersion) {
    if (fromVersion === 1) {
      // No field renames between v1 and v2; new fields are all optional and
      // default to undefined. Tolerate non-object inputs (defensive — core
      // calls migrate with whatever was on disk).
      if (!raw || typeof raw !== 'object') {
        return { ...INITIAL_COLUMN_CUSTOMIZATION };
      }
      return raw as ColumnCustomizationState;
    }
    console.warn(
      `[core-v2] column-customization`,
      `cannot migrate from schemaVersion ${fromVersion}; falling back to initial state.`,
    );
    return { ...INITIAL_COLUMN_CUSTOMIZATION };
  },
```

- [ ] **Step 4: Update the existing schemaVersion test in `index.test.ts`**

In `packages/core-v2/src/modules/column-customization/index.test.ts`, change line 14:

```ts
    expect(columnCustomizationModule.schemaVersion).toBe(1);
```

to:

```ts
    expect(columnCustomizationModule.schemaVersion).toBe(2);
```

- [ ] **Step 5: Run all column-customization tests**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/`

Expected: all tests pass — the 13 existing in `index.test.ts` (with the schemaVersion bumped) + the 3 new in `state.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/
git commit -m "feat(core-v2): bump column-customization to schemaVersion 2 with no-op migrate

v1 snapshots pass through unchanged because all new fields are optional.
Unknown older versions warn + fall back to initial state per the v2 module
contract. Adds state.test.ts covering both branches."
```

---

## Task 5: Implement `cellStyleToAgStyle` adapter (TDD)

**Files:**
- Create: `packages/core-v2/src/modules/column-customization/adapters/cellStyleToAgStyle.ts`
- Create: `packages/core-v2/src/modules/column-customization/adapters/cellStyleToAgStyle.test.ts`

- [ ] **Step 1: Write failing tests**

Create the adapters folder if needed, then write `packages/core-v2/src/modules/column-customization/adapters/cellStyleToAgStyle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cellStyleToAgStyle } from './cellStyleToAgStyle';
import type { CellStyleOverrides } from '../state';

describe('cellStyleToAgStyle', () => {
  it('returns an empty object when overrides is empty', () => {
    expect(cellStyleToAgStyle({})).toEqual({});
  });

  it('typography: bold/italic/underline/fontSize map to CSS', () => {
    const out = cellStyleToAgStyle({
      typography: { bold: true, italic: true, underline: true, fontSize: 14 },
    });
    expect(out).toEqual({
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      fontSize: '14px',
    });
  });

  it('typography: false flags do not emit keys', () => {
    const out = cellStyleToAgStyle({
      typography: { bold: false, italic: false, underline: false },
    });
    expect(out).toEqual({});
  });

  it('colors: text and background', () => {
    const out = cellStyleToAgStyle({
      colors: { text: '#f0b90b', background: '#161a1e' },
    });
    expect(out).toEqual({ color: '#f0b90b', backgroundColor: '#161a1e' });
  });

  it('alignment: horizontal + vertical', () => {
    const out = cellStyleToAgStyle({
      alignment: { horizontal: 'right', vertical: 'middle' },
    });
    expect(out).toEqual({ textAlign: 'right', verticalAlign: 'middle' });
  });

  it('borders: per-side shorthand strings', () => {
    const out = cellStyleToAgStyle({
      borders: {
        top:    { width: 1, color: '#313944', style: 'solid' },
        right:  { width: 2, color: '#f0b90b', style: 'dashed' },
        bottom: { width: 1, color: '#000',    style: 'dotted' },
        left:   { width: 3, color: '#fff',    style: 'solid' },
      },
    });
    expect(out).toEqual({
      borderTop: '1px solid #313944',
      borderRight: '2px dashed #f0b90b',
      borderBottom: '1px dotted #000',
      borderLeft: '3px solid #fff',
    });
  });

  it('omits border keys for sides that are absent', () => {
    const out = cellStyleToAgStyle({
      borders: { top: { width: 1, color: '#313944', style: 'solid' } },
    });
    expect(out).toEqual({ borderTop: '1px solid #313944' });
    expect(out).not.toHaveProperty('borderRight');
  });

  it('mixed overrides all merge into one object', () => {
    const overrides: CellStyleOverrides = {
      typography: { bold: true, fontSize: 12 },
      colors: { text: '#fff' },
      alignment: { horizontal: 'center' },
      borders: { bottom: { width: 1, color: '#313944', style: 'solid' } },
    };
    expect(cellStyleToAgStyle(overrides)).toEqual({
      fontWeight: 'bold',
      fontSize: '12px',
      color: '#fff',
      textAlign: 'center',
      borderBottom: '1px solid #313944',
    });
  });

  it('does NOT emit keys whose value is undefined (so AG-Grid keeps existing styling)', () => {
    const out = cellStyleToAgStyle({ colors: { text: undefined, background: '#000' } });
    expect(out).toEqual({ backgroundColor: '#000' });
    expect(Object.prototype.hasOwnProperty.call(out, 'color')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/adapters/cellStyleToAgStyle.test.ts`

Expected: FAIL — module doesn't exist (`Cannot find module './cellStyleToAgStyle'`).

- [ ] **Step 3: Implement the adapter**

Create `packages/core-v2/src/modules/column-customization/adapters/cellStyleToAgStyle.ts`:

```ts
import type { CSSProperties } from 'react';
import type { BorderSpec, CellStyleOverrides } from '../state';

/**
 * Flatten the structured `CellStyleOverrides` shape into a plain CSS object
 * that AG-Grid consumes via `colDef.cellStyle` (and the same shape works for
 * `colDef.headerStyle`). Undefined inputs map to absent keys so multi-module
 * composition can layer values without the flattener clobbering them.
 *
 * Pure function — same input always produces the same output. No internal
 * state. Safe to call on every transform-pipeline pass.
 */
export function cellStyleToAgStyle(overrides: CellStyleOverrides): CSSProperties {
  const out: CSSProperties = {};

  const t = overrides.typography;
  if (t) {
    if (t.bold) out.fontWeight = 'bold';
    if (t.italic) out.fontStyle = 'italic';
    if (t.underline) out.textDecoration = 'underline';
    if (t.fontSize != null) out.fontSize = `${t.fontSize}px`;
  }

  const c = overrides.colors;
  if (c) {
    if (c.text !== undefined) out.color = c.text;
    if (c.background !== undefined) out.backgroundColor = c.background;
  }

  const a = overrides.alignment;
  if (a) {
    if (a.horizontal !== undefined) out.textAlign = a.horizontal;
    if (a.vertical !== undefined) out.verticalAlign = a.vertical;
  }

  const b = overrides.borders;
  if (b) {
    const shorthand = (s: BorderSpec) => `${s.width}px ${s.style} ${s.color}`;
    if (b.top)    out.borderTop    = shorthand(b.top);
    if (b.right)  out.borderRight  = shorthand(b.right);
    if (b.bottom) out.borderBottom = shorthand(b.bottom);
    if (b.left)   out.borderLeft   = shorthand(b.left);
  }

  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/adapters/cellStyleToAgStyle.test.ts`

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/adapters/cellStyleToAgStyle.ts \
        packages/core-v2/src/modules/column-customization/adapters/cellStyleToAgStyle.test.ts
git commit -m "feat(core-v2): add cellStyleToAgStyle adapter (pure flattener)

Converts the structured CellStyleOverrides shape into a CSS object suitable
for colDef.cellStyle / colDef.headerStyle. Undefined inputs produce absent
keys so other modules can layer style without clobbering."
```

---

## Task 6: Implement `valueFormatterFromTemplate` adapter (TDD)

**Files:**
- Create: `packages/core-v2/src/modules/column-customization/adapters/valueFormatterFromTemplate.ts`
- Create: `packages/core-v2/src/modules/column-customization/adapters/valueFormatterFromTemplate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core-v2/src/modules/column-customization/adapters/valueFormatterFromTemplate.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  valueFormatterFromTemplate,
  __resetExpressionCacheForTests,
} from './valueFormatterFromTemplate';
import type { ValueFormatterTemplate } from '../state';

const params = (value: unknown, data: unknown = undefined) => ({ value, data });

describe('valueFormatterFromTemplate — preset branch', () => {
  it('currency: defaults to USD with 2 decimals', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'currency' });
    expect(fn(params(1234.5))).toBe('$1,234.50');
  });

  it('currency: honors options.currency and options.decimals', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'currency',
      options: { currency: 'EUR', decimals: 0 },
    });
    expect(fn(params(1234.5))).toBe('€1,235');
  });

  it('percent: defaults to 0 decimals; treats value as a fraction (0.5 → 50%)', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'percent' });
    expect(fn(params(0.5))).toBe('50%');
  });

  it('percent: honors options.decimals', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'percent',
      options: { decimals: 2 },
    });
    expect(fn(params(0.1234))).toBe('12.34%');
  });

  it('number: groups thousands by default with 0 decimals', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'number' });
    expect(fn(params(1234567))).toBe('1,234,567');
  });

  it('number: honors options.decimals and options.thousands=false', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'number',
      options: { decimals: 2, thousands: false },
    });
    expect(fn(params(1234567.5))).toBe('1234567.50');
  });

  it('date: formats epoch ms with ISO-ish default pattern', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'date' });
    // 2026-01-15T00:00:00Z (use Date.UTC so the test is timezone-stable on CI)
    const epoch = Date.UTC(2026, 0, 15);
    // Default pattern is yyyy-MM-dd; assert the date portion is present.
    expect(fn(params(epoch))).toMatch(/2026-01-15/);
  });

  it('duration: formats a numeric ms value as mm:ss (under one hour)', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'duration' });
    expect(fn(params(125_000))).toBe('02:05');           // 2 min 5 s
    expect(fn(params(3_725_000))).toBe('01:02:05');      // 1 h 2 min 5 s
  });

  it('any preset: null/undefined value returns empty string', () => {
    const fn = valueFormatterFromTemplate({ kind: 'preset', preset: 'currency' });
    expect(fn(params(null))).toBe('');
    expect(fn(params(undefined))).toBe('');
  });
});

describe('valueFormatterFromTemplate — expression branch', () => {
  afterEach(() => __resetExpressionCacheForTests());

  it('compiles + executes a simple expression', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'expression',
      expression: "x + ' (raw)'",
    });
    expect(fn(params('foo'))).toBe('foo (raw)');
  });

  it('caches compiled fn per expression string (same object across calls)', () => {
    const t: ValueFormatterTemplate = { kind: 'expression', expression: 'x * 2' };
    const a = valueFormatterFromTemplate(t);
    const b = valueFormatterFromTemplate(t);
    expect(a).toBe(b);
  });

  it('different expression strings produce different fns', () => {
    const a = valueFormatterFromTemplate({ kind: 'expression', expression: 'x * 2' });
    const b = valueFormatterFromTemplate({ kind: 'expression', expression: 'x * 3' });
    expect(a).not.toBe(b);
    expect(a(params(5))).toBe('10');
    expect(b(params(5))).toBe('15');
  });

  it('exposes `data` to the expression', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'expression',
      expression: "data.symbol + ': ' + x",
    });
    expect(fn(params(100, { symbol: 'AAPL' }))).toBe('AAPL: 100');
  });

  it('invalid expression: warns + returns identity formatter (never throws)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = valueFormatterFromTemplate({
      kind: 'expression',
      expression: '))) not a valid js expression',
    });
    expect(() => fn(params(42))).not.toThrow();
    expect(fn(params(42))).toBe('42');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('runtime exception inside expression: returns String(value), does not throw', () => {
    const fn = valueFormatterFromTemplate({
      kind: 'expression',
      expression: 'data.deeply.nested.thing',
    });
    expect(() => fn(params(42, undefined))).not.toThrow();
    expect(fn(params(42, undefined))).toBe('42');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/adapters/valueFormatterFromTemplate.test.ts`

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the adapter**

Create `packages/core-v2/src/modules/column-customization/adapters/valueFormatterFromTemplate.ts`:

```ts
import type { PresetId, ValueFormatterTemplate } from '../state';

export type FormatterParams = { value: unknown; data?: unknown };
export type Formatter = (params: FormatterParams) => string;

// ─── Preset registry ────────────────────────────────────────────────────────
//
// Each preset returns a Formatter. All are CSP-safe (Intl.* + arithmetic).
// Null/undefined value short-circuits to '' so we never render "NaN" / "null".

type PresetFactory = (opts?: Record<string, unknown>) => Formatter;

const currency: PresetFactory = (opts) => {
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: typeof opts?.currency === 'string' ? opts.currency : 'USD',
    maximumFractionDigits: typeof opts?.decimals === 'number' ? opts.decimals : 2,
    minimumFractionDigits: typeof opts?.decimals === 'number' ? opts.decimals : 2,
  });
  return ({ value }) => (value == null ? '' : fmt.format(Number(value)));
};

const percent: PresetFactory = (opts) => {
  const decimals = typeof opts?.decimals === 'number' ? opts.decimals : 0;
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return ({ value }) => (value == null ? '' : fmt.format(Number(value)));
};

const number: PresetFactory = (opts) => {
  const decimals = typeof opts?.decimals === 'number' ? opts.decimals : 0;
  const thousands = opts?.thousands !== false;
  const fmt = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: thousands,
  });
  return ({ value }) => (value == null ? '' : fmt.format(Number(value)));
};

const date: PresetFactory = (opts) => {
  // For v2.1 we ship a single fixed pattern (yyyy-MM-dd). The `pattern` option
  // is reserved for a future minor release; documented in the spec.
  const pattern = typeof opts?.pattern === 'string' ? opts.pattern : 'yyyy-MM-dd';
  void pattern;
  return ({ value }) => {
    if (value == null) return '';
    const d = value instanceof Date ? value : new Date(Number(value));
    if (isNaN(d.getTime())) return '';
    // Manual ISO date slice — Intl.DateTimeFormat respects the host TZ which
    // makes tests flaky on CI. Stick to UTC components.
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
};

const duration: PresetFactory = () => {
  return ({ value }) => {
    if (value == null) return '';
    const ms = Number(value);
    if (!Number.isFinite(ms)) return '';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };
};

const presetRegistry: Record<PresetId, PresetFactory> = {
  currency,
  percent,
  number,
  date,
  duration,
};

// ─── Expression branch (CSP-unsafe; cached per expression string) ───────────

const expressionCache = new Map<string, Formatter>();

/** Test-only: clear the cache between tests so cache-hit assertions are reliable. */
export function __resetExpressionCacheForTests(): void {
  expressionCache.clear();
}

function compileExpression(expression: string): Formatter {
  try {
    // eslint-disable-next-line no-new-func
    const compiled = new Function('x', 'data', `return (${expression});`) as
      (x: unknown, data?: unknown) => unknown;
    return ({ value, data }) => {
      try {
        const out = compiled(value, data);
        return out == null ? '' : String(out);
      } catch {
        // Runtime error inside the user expression — fall back to identity.
        return value == null ? '' : String(value);
      }
    };
  } catch (err) {
    console.warn(
      '[core-v2] column-customization',
      'invalid valueFormatter expression; falling back to identity formatter:',
      expression,
      err,
    );
    return ({ value }) => (value == null ? '' : String(value));
  }
}

// ─── Public entrypoint ──────────────────────────────────────────────────────

export function valueFormatterFromTemplate(t: ValueFormatterTemplate): Formatter {
  if (t.kind === 'preset') {
    return presetRegistry[t.preset](t.options);
  }
  // kind: 'expression' — cache by expression string.
  let fn = expressionCache.get(t.expression);
  if (!fn) {
    fn = compileExpression(t.expression);
    expressionCache.set(t.expression, fn);
  }
  return fn;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/adapters/valueFormatterFromTemplate.test.ts`

Expected: all tests pass (15 tests total: 9 preset + 6 expression).

- [ ] **Step 5: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/adapters/valueFormatterFromTemplate.ts \
        packages/core-v2/src/modules/column-customization/adapters/valueFormatterFromTemplate.test.ts
git commit -m "feat(core-v2): add valueFormatterFromTemplate adapter

Preset branch (currency/percent/number/date/duration) uses Intl APIs and is
CSP-safe. Expression branch compiles via new Function(), caches per
expression string, and falls back to identity formatter on either compile
error or runtime exception (never throws into AG-Grid)."
```

---

## Task 7: Wire `cellStyleOverrides` into `transformColumnDefs` (TDD)

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/index.ts`
- Modify: `packages/core-v2/src/modules/column-customization/index.test.ts`

- [ ] **Step 1: Write failing test**

Append to `packages/core-v2/src/modules/column-customization/index.test.ts`, inside the `describe('column-customization module — transformColumnDefs', ...)` block (before its closing `})`):

```ts
  it('emits colDef.cellStyle when cellStyleOverrides is set', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: {
          colId: 'symbol',
          cellStyleOverrides: {
            typography: { bold: true },
            colors: { background: '#161a1e' },
          },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].cellStyle).toEqual({ fontWeight: 'bold', backgroundColor: '#161a1e' });
    // Untouched column has no cellStyle assigned.
    expect(out[1].cellStyle).toBeUndefined();
  });

  it('does NOT touch colDef.cellStyle when cellStyleOverrides is absent', () => {
    const defsWithExistingStyle: AnyColDef[] = [
      { field: 'symbol', cellStyle: { color: 'red' } } satisfies ColDef,
    ];
    const state: ColumnCustomizationState = {
      assignments: { symbol: { colId: 'symbol', headerName: 'Ticker' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(defsWithExistingStyle, state, ctx) as ColDef[];
    // The transformer left the upstream cellStyle in place — multi-module
    // composition contract.
    expect(out[0].cellStyle).toEqual({ color: 'red' });
    expect(out[0].headerName).toBe('Ticker');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/index.test.ts`

Expected: FAIL on the first new test (`out[0].cellStyle` is undefined because the wiring isn't in place yet). The second test passes incidentally — that's fine.

- [ ] **Step 3: Wire the adapter**

In `packages/core-v2/src/modules/column-customization/index.ts`:

Add the import at the top (after the existing `state` import block):

```ts
import { cellStyleToAgStyle } from './adapters/cellStyleToAgStyle';
```

Then in `applyAssignments`, inside the leaf-column branch, after the existing `merged.resizable = a.resizable;` line and before `return merged;` (currently around line 49-50), add:

```ts
    if (a.cellStyleOverrides !== undefined) {
      merged.cellStyle = cellStyleToAgStyle(a.cellStyleOverrides);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/index.test.ts`

Expected: all tests pass (existing 13 + new 2 = 15).

- [ ] **Step 5: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/index.ts \
        packages/core-v2/src/modules/column-customization/index.test.ts
git commit -m "feat(core-v2): wire cellStyleOverrides → colDef.cellStyle

When the new field is present on an assignment, transformColumnDefs flattens
it via cellStyleToAgStyle and writes colDef.cellStyle. Absent overrides
leave any upstream cellStyle untouched."
```

---

## Task 8: Wire `headerStyleOverrides` into `transformColumnDefs` (TDD)

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/index.ts`
- Modify: `packages/core-v2/src/modules/column-customization/index.test.ts`

- [ ] **Step 1: Write failing test**

Append to the same `transformColumnDefs` describe block:

```ts
  it('emits colDef.headerStyle when headerStyleOverrides is set', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: {
          colId: 'symbol',
          headerStyleOverrides: {
            typography: { bold: true, fontSize: 13 },
            alignment: { horizontal: 'center' },
          },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].headerStyle).toEqual({
      fontWeight: 'bold',
      fontSize: '13px',
      textAlign: 'center',
    });
  });

  it('cellStyleOverrides + headerStyleOverrides on same column emit both', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        symbol: {
          colId: 'symbol',
          cellStyleOverrides: { colors: { background: '#000' } },
          headerStyleOverrides: { colors: { background: '#fff' } },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(out[0].cellStyle).toEqual({ backgroundColor: '#000' });
    expect(out[0].headerStyle).toEqual({ backgroundColor: '#fff' });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/index.test.ts`

Expected: FAIL on the new tests — `headerStyle` undefined.

- [ ] **Step 3: Wire the adapter**

In `packages/core-v2/src/modules/column-customization/index.ts` `applyAssignments`, immediately after the `cellStyleOverrides` block from Task 7:

```ts
    if (a.headerStyleOverrides !== undefined) {
      merged.headerStyle = cellStyleToAgStyle(a.headerStyleOverrides);
    }
```

(Same adapter — `cellStyleToAgStyle` is shape-agnostic; we don't need a `headerStyleToAgStyle` alias.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/index.test.ts`

Expected: all tests pass (15 + 2 new = 17).

- [ ] **Step 5: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/index.ts \
        packages/core-v2/src/modules/column-customization/index.test.ts
git commit -m "feat(core-v2): wire headerStyleOverrides → colDef.headerStyle

Reuses cellStyleToAgStyle since the structured shape is identical. cell + header
overrides on the same column emit independently to colDef.cellStyle and
colDef.headerStyle."
```

---

## Task 9: Wire `valueFormatterTemplate` into `transformColumnDefs` (TDD)

**Files:**
- Modify: `packages/core-v2/src/modules/column-customization/index.ts`
- Modify: `packages/core-v2/src/modules/column-customization/index.test.ts`

- [ ] **Step 1: Write failing test**

Append to the same `transformColumnDefs` describe block:

```ts
  it('emits colDef.valueFormatter from a preset template', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          valueFormatterTemplate: { kind: 'preset', preset: 'currency' },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    expect(typeof out[1].valueFormatter).toBe('function');
    const fmt = out[1].valueFormatter as (params: { value: unknown }) => string;
    expect(fmt({ value: 1234.5 })).toBe('$1,234.50');
  });

  it('emits colDef.valueFormatter from an expression template', () => {
    const state: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          valueFormatterTemplate: { kind: 'expression', expression: "x + ' USD'" },
        },
      },
    };
    const out = columnCustomizationModule.transformColumnDefs!(baseDefs, state, ctx) as ColDef[];
    const fmt = out[1].valueFormatter as (params: { value: unknown }) => string;
    expect(fmt({ value: 100 })).toBe('100 USD');
  });

  it('does NOT touch colDef.valueFormatter when template is absent', () => {
    const defsWithFormatter: AnyColDef[] = [
      { field: 'price', valueFormatter: 'value + " original"' } satisfies ColDef,
    ];
    const state: ColumnCustomizationState = {
      assignments: { price: { colId: 'price', headerName: 'Price' } },
    };
    const out = columnCustomizationModule.transformColumnDefs!(defsWithFormatter, state, ctx) as ColDef[];
    expect(out[0].valueFormatter).toBe('value + " original"');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/index.test.ts`

Expected: FAIL on the first two new tests — `valueFormatter` is undefined.

- [ ] **Step 3: Wire the adapter**

In `packages/core-v2/src/modules/column-customization/index.ts`:

Add the import (alongside the `cellStyleToAgStyle` import from Task 7):

```ts
import { valueFormatterFromTemplate } from './adapters/valueFormatterFromTemplate';
```

In `applyAssignments`, immediately after the `headerStyleOverrides` block from Task 8:

```ts
    if (a.valueFormatterTemplate !== undefined) {
      merged.valueFormatter = valueFormatterFromTemplate(a.valueFormatterTemplate);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @grid-customizer/core-v2 test --run packages/core-v2/src/modules/column-customization/index.test.ts`

Expected: all tests pass (17 + 3 new = 20).

- [ ] **Step 5: Commit**

```bash
git add packages/core-v2/src/modules/column-customization/index.ts \
        packages/core-v2/src/modules/column-customization/index.test.ts
git commit -m "feat(core-v2): wire valueFormatterTemplate → colDef.valueFormatter

Both preset and expression branches flow through the adapter into the colDef.
Absent template leaves any upstream valueFormatter untouched."
```

---

## Task 10: Verify the whole picture

**Files:** none (verification only)

- [ ] **Step 1: Run the full core-v2 test suite**

Run: `pnpm --filter @grid-customizer/core-v2 test`

Expected: every test passes. The relevant column-customization counts:
- `index.test.ts`: 20 tests (13 original + 7 new across Tasks 7-9)
- `state.test.ts`: 3 tests (Task 4)
- `adapters/cellStyleToAgStyle.test.ts`: 9 tests (Task 5)
- `adapters/valueFormatterFromTemplate.test.ts`: 15 tests (Task 6)

Plus all unrelated module + core tests (which should be unaffected — this sub-project is module-local).

- [ ] **Step 2: Typecheck the package**

Run: `pnpm --filter @grid-customizer/core-v2 typecheck`

Expected: clean. No `any` leaks in the new types — `ColumnAssignment.cellStyleOverrides` should hover as `CellStyleOverrides | undefined` in an editor.

- [ ] **Step 3: Run the full v2 E2E suite to confirm no behavior regression**

Run: `pnpm exec playwright test --grep "v2"`

Expected: all v2 specs pass. Behavior is unchanged because no UI writes the new fields — every existing snapshot has them undefined, every transformer skips its emission, and the schema migration is a no-op pass-through.

- [ ] **Step 4: Architectural greps**

Run: `grep -rn "schemaVersion: 1" packages/core-v2/src/modules/column-customization/`

Expected: no matches (the only literal in the module file is now `schemaVersion: 2`).

Run: `grep -rn "from '@grid-customizer/core-v2/.*column-customization" packages/ apps/`

Expected: no matches outside `packages/core-v2/src/modules/column-customization/`. The new types are not yet imported by any consumer — sub-projects #2-#4 will introduce those imports.

- [ ] **Step 5: Final sweep commit (only if there are stragglers)**

If any docs / re-exports were missed (e.g., `packages/core-v2/src/index.ts` doesn't yet re-export the new types and you want them surfaced for sub-project #4), make those additions now and commit:

```bash
git add packages/core-v2/src/index.ts
git commit -m "chore(core-v2): re-export CellStyleOverrides + ValueFormatterTemplate types

So sub-project #4 (FormattingToolbar v2 port) can import them via the
package root rather than reaching into module internals."
```

Otherwise skip this step.

---

## Done

When all tasks are complete:
- `column-customization` ships at `schemaVersion: 2` with a no-op upgrade migrator.
- Three new optional override fields exist on every `ColumnAssignment`.
- A fourth (`templateIds`) is stored but no-op until sub-project #2.
- Two new pure adapters (`cellStyleToAgStyle`, `valueFormatterFromTemplate`) live in `adapters/` with 24 unit tests covering them end-to-end.
- The transform pipeline emits `cellStyle` / `headerStyle` / `valueFormatter` on AG-Grid colDefs only when overrides are present.
- All existing v2 tests + E2E pass unchanged (no behavior regression).

Hand off to the writing-plans skill for sub-project #2 (port `column-templates` to v2) when you're ready.
