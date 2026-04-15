# Column-Customization Schema Extension (v2)

**Date:** 2026-04-14
**Sub-project:** #1 of 4 in the FormattingToolbar v2 forward-port sequence
**Status:** Design approved

## Context

The v2 rewrite (`@grid-customizer/core-v2`) deliberately stripped four fields from `column-customization` to keep the v2.0 surface narrow:

- `cellStyleOverrides` — per-column cell appearance (typography, colors, alignment, borders)
- `headerStyleOverrides` — per-column header appearance (same shape)
- `valueFormatterTemplate` — per-column value-formatter
- `templateIds` — references to reusable column templates from the `column-templates` module

The v1 `FormattingToolbar` (1,008 LOC at `packages/markets-grid/src/FormattingToolbar.tsx`) writes all four. Forward-porting the toolbar to v2 requires those fields to exist in the v2 schema first. This sub-project extends the schema and the transform pipeline; the toolbar itself ships in sub-project #4.

The full sequence:

1. **#1 (this spec)** — extend `column-customization` schema + transform pipeline
2. **#2** — port the `column-templates` module to v2
3. **#3** — add undo/redo to the v2 store
4. **#4** — port `FormattingToolbar` to v2 + wire into `MarketsGrid` v2 + E2E

Each sub-project lands as a separate PR with its own spec / plan / implementation cycle.

## Goals

- Add the four new fields to `ColumnCustomization` as optional, structured types.
- Bump `column-customization` `schemaVersion` from 1 to 2 with a no-op `migrate(raw, fromVersion=1)`.
- Wire `cellStyleOverrides`, `headerStyleOverrides`, and `valueFormatterTemplate` into `transformColumnDefs` so AG-Grid actually consumes them.
- Keep `templateIds` as a stored reference only — sub-project #2 fills in the merge logic.
- Zero behavior change for existing v2 grids (all new fields default to `undefined`).

## Non-goals

- Building any UI to write the new fields (that's #4).
- Reading v1 IndexedDB profiles into the v2 schema (deferred to a v2.1 importer; v1 / v2 use separate Dexie DBs).
- Implementing the column-templates merge pipeline (`templateIds` is a stored array here, no-op in the transformer).
- Adding undo/redo for these fields (that's #3).

## Design

### 1. Schema shape

Bump `column-customization` from `schemaVersion: 1` to `schemaVersion: 2`. Add four optional fields per column entry; existing fields unchanged.

```ts
// packages/core-v2/src/modules/column-customization/state.ts

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

export type PresetId =
  | 'currency' | 'percent' | 'number' | 'date' | 'duration';

export type ValueFormatterTemplate =
  | { kind: 'preset'; preset: PresetId; options?: Record<string, unknown> }
  | { kind: 'expression'; expression: string };

export interface ColumnCustomization {
  // ... existing v2 fields (hide, width, pinned, sort, etc.) unchanged ...

  // NEW (all optional)
  cellStyleOverrides?: CellStyleOverrides;
  headerStyleOverrides?: CellStyleOverrides;     // same shape as cell
  valueFormatterTemplate?: ValueFormatterTemplate;
  templateIds?: string[];                        // order = application order; later wins
}
```

**Decisions baked in:**

- **Headers reuse `CellStyleOverrides`.** Borders / colors / alignment / typography all apply equally to header cells; trimming the shape for headers would add complexity without saving anything.
- **Flat fields, no `formatting:` subgroup.** Existing fields are flat; introducing one subgroup just for the new ones forces consumers through two layers (`col.formatting?.cellStyle?.colors?.text`) for no benefit.
- **`valueFormatterTemplate` is a hybrid discriminated union.** `kind: 'preset'` covers the 95% case CSP-safely; `kind: 'expression'` is the v1-parity escape hatch and will gate on CSP only when a downstream consumer needs it.
- **`templateIds` is a flat `string[]`.** Merge semantics live in sub-project #2.

### 2. Migration

**Within v2: `schemaVersion` 1 → 2.** Trivial. New fields are all optional, so existing snapshots pass through unchanged:

```ts
// packages/core-v2/src/modules/column-customization/state.ts
export function migrate(raw: unknown, fromVersion: number): ColumnCustomizationState {
  if (fromVersion === 1) {
    // No field renames, no shape changes. New fields default to undefined,
    // which is the canonical "no override" state.
    return raw as ColumnCustomizationState;
  }
  // fromVersion < 1 (or unknown) → drop with warning per v2 module contract.
  console.warn(`[column-customization] dropping state from unknown schemaVersion ${fromVersion}`);
  return defaultState();
}
```

**From v1 IndexedDB.** Out of scope. v1 (`GridCustomizerDB`) and v2 (`gc-customizer-v2`) use separate Dexie DBs, and per `MIGRATION.md` v2 doesn't auto-read v1 profiles. A v2.1 importer will pattern-match v1's free-form CSS bag into structured `CellStyleOverrides` (e.g., `fontWeight: 'bold'` → `typography.bold = true`, `border-top: '1px solid #313944'` → `borders.top = { width: 1, color: '#313944', style: 'solid' }`). Documented as a known-future task; no code in this sub-project.

The existing `migrateFromLegacy()` in `state.ts` (which silently drops style fields) stays as-is — it's only reached if someone manually pipes v1 data through the v2 module's deserialize, which isn't a supported path.

### 3. Transform pipeline

Three new emitters in `transformColumnDefs`. Each is a pure adapter; the transformer wires them onto the colDef only when at least one override is present, so it never clobbers other modules' contributions to the same field.

**`cellStyleOverrides` → AG-Grid `cellStyle`**

```ts
// packages/core-v2/src/modules/column-customization/adapters/cellStyleToAgStyle.ts
export function cellStyleToAgStyle(o: CellStyleOverrides): React.CSSProperties {
  const t = o.typography ?? {};
  const c = o.colors ?? {};
  const a = o.alignment ?? {};
  const b = o.borders ?? {};
  const border = (s?: BorderSpec) =>
    s ? `${s.width}px ${s.style} ${s.color}` : undefined;
  return {
    fontWeight: t.bold ? 'bold' : undefined,
    fontStyle: t.italic ? 'italic' : undefined,
    textDecoration: t.underline ? 'underline' : undefined,
    fontSize: t.fontSize != null ? `${t.fontSize}px` : undefined,
    color: c.text,
    backgroundColor: c.background,
    textAlign: a.horizontal,
    verticalAlign: a.vertical,
    borderTop: border(b.top),
    borderRight: border(b.right),
    borderBottom: border(b.bottom),
    borderLeft: border(b.left),
  };
}
```

The transformer assigns `colDef.cellStyle = cellStyleToAgStyle(overrides)` only when `overrides` exists.

**`headerStyleOverrides` → AG-Grid `headerStyle`**

Same adapter (`cellStyleToAgStyle` is shape-agnostic). AG-Grid 35 supports `colDef.headerStyle` directly; no generated class needed.

**`valueFormatterTemplate` → AG-Grid `valueFormatter`**

```ts
// packages/core-v2/src/modules/column-customization/adapters/valueFormatterFromTemplate.ts
type Formatter = (params: { value: unknown; data?: unknown }) => string;

const presetRegistry: Record<PresetId, (opts?: Record<string, unknown>) => Formatter> = {
  currency: (opts) => {
    const fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (opts?.currency as string) ?? 'USD',
      maximumFractionDigits: (opts?.decimals as number) ?? 2,
    });
    return ({ value }) => (value == null ? '' : fmt.format(Number(value)));
  },
  percent: (opts) => { /* ... Intl.NumberFormat style:'percent' */ },
  number:  (opts) => { /* ... Intl.NumberFormat */ },
  date:    (opts) => { /* ... Intl.DateTimeFormat with opts.pattern */ },
  duration:(opts) => { /* ... custom mm:ss / hh:mm:ss */ },
};

const expressionCache = new Map<string, Formatter>();

export function valueFormatterFromTemplate(t: ValueFormatterTemplate): Formatter {
  if (t.kind === 'preset') return presetRegistry[t.preset](t.options);
  // kind: 'expression' — CSP-unsafe branch, opt-in.
  let fn = expressionCache.get(t.expression);
  if (!fn) {
    try {
      // eslint-disable-next-line no-new-func
      const compiled = new Function('x', 'data', `return (${t.expression});`) as
        (x: unknown, data?: unknown) => unknown;
      fn = ({ value, data }) => {
        try { return String(compiled(value, data)); }
        catch { return String(value ?? ''); }
      };
      expressionCache.set(t.expression, fn);
    } catch (err) {
      console.warn('[column-customization] invalid valueFormatter expression:', t.expression, err);
      fn = ({ value }) => String(value ?? '');
      expressionCache.set(t.expression, fn);
    }
  }
  return fn;
}
```

The transformer assigns `colDef.valueFormatter = valueFormatterFromTemplate(template)` only when `template` is set.

**`templateIds` → no-op (this sub-project)**

The transformer reads the field but does not act on it. Sub-project #2 (column-templates port) adds a transformer that resolves `templateIds` into a merged base `ColumnCustomization` and re-runs the override emitters above. This sub-project defines the contract; #2 fills it in.

**Conflict ordering** — applies in order, last write wins:

1. `templateIds` (resolves to a base set in #2; no-op now)
2. Direct per-column overrides (`cellStyleOverrides`, `headerStyleOverrides`, `valueFormatterTemplate`)

Matches v1's "templates set defaults, direct customization wins" semantics.

## Files

```
packages/core-v2/src/modules/column-customization/
├── state.ts                                MODIFY  +types, schemaVersion 1→2, +migrate
├── index.ts                                MODIFY  wire 3 emitters into transformColumnDefs
├── adapters/
│   ├── cellStyleToAgStyle.ts               NEW     ~60 LOC, pure fn
│   ├── cellStyleToAgStyle.test.ts          NEW     unit
│   ├── valueFormatterFromTemplate.ts       NEW     ~80 LOC, preset registry + expr cache
│   └── valueFormatterFromTemplate.test.ts  NEW     unit
└── state.test.ts                           MODIFY  +tests for migrate(1→2)
```

Estimated: ~250 LOC added, ~20 modified. Blast radius: one module.

## Testing

**Unit (vitest):**

- `cellStyleToAgStyle`:
  - Empty overrides → object with all keys `undefined`.
  - Each branch (typography / colors / alignment / borders) → expected CSS keys.
  - Mixed overrides merge; no key wins or loses unexpectedly.
- `valueFormatterFromTemplate`:
  - Each preset (currency / percent / number / date / duration) — default options + custom options.
  - `kind: 'expression'` — compiles + executes; cache hit on second call to same expression.
  - Invalid expression → returns identity formatter + `console.warn`; never throws.
  - `null` / `undefined` value → empty string (don't render `"NaN"` or `"null"`).
- `migrate(raw, fromVersion=1)` → passes through unchanged; new fields are `undefined`.
- `migrate(raw, fromVersion=0)` → returns `defaultState()` + warning logged.

**Integration / E2E:** None. Without a UI to set the new fields and without column-templates resolution, nothing is user-observable. First E2E lands in sub-project #4.

## Verification

1. `pnpm --filter @grid-customizer/core-v2 test` — all unit tests green.
2. `pnpm --filter @grid-customizer/core-v2 build` — TypeScript clean, no `any` leaks in new types.
3. `pnpm exec playwright test` — all 16 v2 E2E tests still green (proves schema bump + migrate didn't break the load path).
4. Manual: `pnpm dev`, mount `/?v=2`, exercise existing column-customization features — no observable behavior change (all new fields `undefined`).
5. Architectural:
   - Grep confirms no consumer outside `column-customization/` imports the new types yet.
   - Grep confirms `schemaVersion: 2` is the only version literal in the module file.

## Risks

- **Expression cache leak.** `expressionCache` is module-scoped; expressions written, deleted, and rewritten accumulate compiled fns forever. Acceptable for v2.0 (cardinality is bounded by a human typing into a UI), but document a TODO to bound the cache (LRU or per-grid teardown) once #4 ships and we can measure.
- **Preset coverage.** Five presets cover the v1 toolbar's number-format menu, but if v1 actually exposes more presets that get used in production (e.g., basis points, custom date patterns), we'll discover that during sub-project #4. Adding a preset is non-breaking — just a new entry in `presetRegistry`.
- **CSP escape hatch is opt-in but not gated.** `kind: 'expression'` works regardless of CSP posture today. If a downstream app sets a strict CSP, expression-formatter columns will silently fall back to identity (`String(value)`) because `new Function` throws. The `console.warn` lands; no crash. Document this as the expected behavior; we don't add a runtime CSP check in this sub-project.
