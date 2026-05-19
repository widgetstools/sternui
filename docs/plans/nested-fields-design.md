---
title: "Nested-field handling — design"
subtitle: "Single source of truth for dot-notation ColDef fields, accessor performance, and expression-engine reference resolution"
date: "2026-05-19"
status: "Decision document — supersedes ad-hoc per-module handling"
---

# Goals

Three orthogonal goals, all of which the rewrite must hit:

1. **Consistency** — every consumer of a nested field (AG-Grid native
   features, conditional styling, calculated columns, server-side
   row model, value formatters, persistence, export) goes through
   one accessor and one author-facing API. No surface is allowed to
   roll its own dot-walking.
2. **Performance** — at 5,000 rows × 50 columns × repaint, every
   cell read happens at compiled-closure speed. No
   `path.split('.')` in hot loops.
3. **Expressiveness** — the conditional-styling expression
   `[x.y.price.old] > [x.y.price.new]` works without the data layer
   having to materialise the sibling paths. Cross-field deltas
   (`prev([a]) > [b]`) are first-class.

# What v1 already does well

Three pieces of existing code that any rewrite should preserve:

| File | What it does |
|---|---|
| `packages/shared/foundation/shared-types/src/dataProvider.ts` :: `getValueByPath` | Literal-flat-key priority on the root, then dot-walk. Handles `{"x.y": 1}` shaped feeds correctly. |
| `packages/react/widgets/grid-react/src/modules/conditional-styling/index.ts` | Per-grid `WeakMap<rowNode, Map<colId, {oldValue, newValue}>>` diff cache. WeakMap so rows GC naturally. Triggers pre-filter so untouched rows skip evaluation. |
| Same file :: `buildColumnsContextFromDiffs` | The load-bearing prototype-chain trick — `Object.create(data)` plus own-property writes for `${colId}.old` / `${colId}.new` so the same `[…]` expression syntax handles live access AND diff access. |

The prototype-chain scope is non-obvious and is documented as
`UX_NUANCES.md` §N32 to ensure it survives a rewrite.

# Gaps

1. **The diff cache only feeds conditional-styling.** AG-Grid's
   native sort/filter/group/aggregation/pivot consume `field`
   directly via AG-Grid's built-in dot-walk. Two implementations,
   two perf profiles, one platform.
2. **No compiled-accessor cache.** Every read calls `path.split('.')`
   and walks. ~10× speedup available by compiling once per path.
3. **No author-facing helper.** Today an author writes
   `field: "x.y.z"` and AG-Grid handles it on its terms. Nothing
   in the platform nudges the author toward a factory that wires
   `colId`, `valueGetter`, `valueSetter`, `comparator`, `equals`,
   `tooltipValueGetter`, `headerTooltip` consistently.
4. **Trigger registration for `[x.y.price.old]` likely registers
   two trigger paths (`…old` and `…new`)** instead of canonicalising
   to one (`x.y.price`). Doubles the trigger map size; minor but
   accumulates.

# Decisions taken

| # | Decision | Rationale |
|---|---|---|
| **D1** | Keep both `[path].old` / `[path].new` suffix syntax AND an explicit `prev([path])` function. | Suffix covers single-field delta (the 90% case) compactly. `prev()` is necessary for cross-field deltas (`prev([a]) > [b]`) where suffix has no expression. The expression engine documents both. |
| **D2** | Factory function `nestedField({...})` returning `Partial<ColDef>`. | Composes with spread (`{ headerName, ...nestedField({...}), cellClass }`); no class ceremony; single place to evolve when AG-Grid adds new field-consuming hooks. |
| **D3** | Dot-only paths in v1 — no `trades[0].price` array indexing. | Array indexing brings parser complexity (bracketed-int vs bracketed-ref) and a UX question of whether to expose array indices at all. Defer. |
| **D4** | Diff cache stays scoped to conditional-styling. | Promoting it to starui-platform-level would pay for sort-by-delta, group-by-delta, etc. — features that don't exist yet. Scope-creep avoided. |
| **D5** | Closure-per-path accessors, NOT `new Function()` codegen. | Codegen is 2× faster on long paths but breaks strict CSP. Typical path depth is 2–4, where closures are already fast. CSP cost outweighs the marginal speedup. |
| **D6** | Path-accessor and path-setter caches live in `@starui/shared` (vanilla TS), not in `@starui/grid`. | Used by both AG-Grid wiring AND the expression engine. Foundation leaf — no framework deps. |

# Layer 1: Compiled path accessors

`@starui/shared/path-accessors` (or `@starui/shared-types`, co-located
with the existing `getValueByPath`):

```ts
/**
 * Returns a closure that reads `path` from a row. Closure is cached
 * by `path` string so callers can rely on stable identity.
 *
 * Semantics:
 * 1. Literal-flat-key priority on the root — `{"x.y": 1}` resolves
 *    to `1` for path `"x.y"`. (Same as v1 `getValueByPath`.)
 * 2. Otherwise null-safe dot-walk: any `null` / `undefined` segment
 *    short-circuits to `undefined`.
 * 3. Returns `undefined` for any non-object root.
 */
export function getPathAccessor(path: string): (row: unknown) => unknown;

/**
 * Returns a closure that writes `value` to `path` on a row,
 * creating intermediate plain-object segments as needed.
 *
 * Returns `true` if the write changed the value (`!Object.is(old, new)`),
 * `false` if it was a no-op. Mutates `row` in place.
 *
 * Does NOT honour the literal-flat-key priority — writing through
 * `"x.y"` always creates `{ x: { y: value } }` (the read priority is
 * a defence against weird feeds, the write is an intentional structural
 * commitment).
 */
export function getPathSetter(path: string): (row: unknown, value: unknown) => boolean;
```

Implementation: `Map<string, Closure>` cache, populated lazily on
first call per path. Both functions accept `unknown` and return safely
for null / non-object inputs (defensive coding policy).

# Layer 2: `nestedField()` factory

`@starui/grid/coldef` (or wherever the grid-react ColDef helpers live):

```ts
export interface NestedFieldOptions {
  /** Dot-notation path into the row. The colId defaults to this
   *  value, so it also becomes the persistence key — be deliberate. */
  readonly path: string;

  /** Override the column id. Use when the persisted state from v1
   *  used a different id than the path would now generate. */
  readonly colId?: string;

  /** Sort comparator. Defaults to a null-safe numeric-aware
   *  comparator (numbers compare numerically; strings localeCompare;
   *  undefined sorts last in both directions). */
  readonly comparator?: ColDef['comparator'];

  /** Change-detection equals. Defaults to `Object.is`. */
  readonly equals?: ColDef['equals'];

  /** When true, the column registers a value-setter that creates
   *  intermediate object segments on write. When false, the column
   *  is read-only and AG-Grid will reject in-place edits.
   *  Default: true. */
  readonly writable?: boolean;
}

export function nestedField(opts: NestedFieldOptions): Partial<ColDef>;
```

Wired hooks the factory MUST populate:

| Hook | Why |
|---|---|
| `field`             | AG-Grid's group/pivot/aggregation auto-features use the field string directly. Keep it. |
| `colId`             | Stable persistence key. Defaults to `path`. |
| `valueGetter`       | Routes ALL reads (sort, filter, render, tooltip) through the compiled accessor. |
| `valueSetter`       | Routes writes through the compiled setter (creates intermediates). Suppressed when `writable: false`. |
| `comparator`        | Default null-safe numeric/string comparator. |
| `equals`            | `Object.is` so reference-identical objects don't trigger re-renders. |
| `tooltipValueGetter`| Returns string-formatted current value. |
| `headerTooltip`     | The path itself, so power users can see the source. |

ColDef authors write:

```ts
{
  headerName: 'Last Price',
  ...nestedField({ path: 'trade.price.last' }),
  cellClass: 'numeric',
}
```

Any author who reaches for a bare `field: "x.y.z"` triggers an ESLint
warning (see "Consistency enforcement" below).

# Layer 3: Expression engine reference resolution

Two changes; neither alters the public expression syntax users
already write.

### Bracket-reference compilation

The expression-engine parser produces an AST node for each `[…]`
reference. Currently the evaluator likely walks `params.columns` at
runtime via `getValueByPath`. Change: at expression-COMPILE time
(once per rule, not per row), resolve each `[…]` to a closure from
the same `getPathAccessor` cache that ColDefs use. Now expression
evaluation reads cells at the same speed as AG-Grid sort does.

Memory bonus: the accessor cache is shared between ColDefs and
expressions, so a path used in both consumes one closure.

### Suffix semantics + trigger canonicalisation

`[x.y.price.old]` and `[x.y.price.new]` are syntactic sugar for
"the prior / current value of `x.y.price`". The trigger registration
strips the suffix when computing the column-dependency set so
`[x.y.price.old] > [x.y.price.new]` registers as one trigger on
`x.y.price`, not two.

At evaluation time, the prototype-chain scope from
`buildColumnsContextFromDiffs` continues to work unchanged: literal
property `x.y.price.old` is read off the scope (set by the diff
cache); literal property `x.y.price` falls through the prototype to
`data` and dot-walks via the same compiled accessor.

### `prev([…])` function

For cross-field deltas where suffix has no expression:

```text
prev([trade.price.last]) > [trade.cost.last]
```

`prev(...)` is a reserved function in the expression catalogue. Its
argument must be a single bracket reference (compile-time error
otherwise). The compiler emits a lookup against
`rowDiffs.get(canonicalPath).oldValue`, falling back to the current
value when no diff exists yet (first observation of the row).

# Consistency enforcement

The user's explicit requirement: "as long as they are followed
consistently across the codebase". Three layers of enforcement:

### Spec teeth

`PUBLIC_API_SPEC.md` §15 non-negotiable: "every ColDef with a
dot-notation field MUST be constructed via `nestedField()`. Bare
`field: "x.y.z"` literals in ColDef objects are a contract
violation."

### Lint rule (follow-up PR)

A custom ESLint rule (`@starui/no-bare-nested-field`) flags any
object literal property where the key is `field` and the value is a
string literal containing `.`, unless the object is the return of
`nestedField(...)`. Concrete rule logic:

```
Bad:
  { headerName: 'X', field: 'a.b.c', cellClass: 'numeric' }

Good:
  { headerName: 'X', ...nestedField({ path: 'a.b.c' }), cellClass: 'numeric' }
  { headerName: 'X', field: 'simpleField', cellClass: 'numeric' }   // no dot, allowed
```

Not implemented in this PR — added to follow-up plan.

### Runtime safety net

In dev builds only, `GridPlatform` walks the registered ColDefs at
startup and warns
(`console.warn('[starui:grid] bare nested field "trade.price.last" — use nestedField()')`)
for any that bypassed the factory. Caught at first page load, no
production cost.

# Migration

Existing v1 ColDefs that use bare `field: "x.y.z"` continue to work
because AG-Grid's own dot-walk is still active and the diff cache
still feeds conditional-styling correctly. The new factory and
accessors are **additive** — adopt at the author's pace.

Rewrite-time migration is mechanical: a codemod converts each bare
`field: "<contains-dot>"` to `...nestedField({ path: "<…>" })`. The
codemod is a few-dozen lines of jscodeshift and is out of scope for
this design doc — captured in the follow-up plan.

# Open follow-ups (not in scope here)

1. The custom ESLint rule.
2. The codemod for the rewrite.
3. Promote the diff cache to starui-platform level if/when
   sort-by-delta becomes a real feature (currently a "no" per D4).
4. Array-element path support (`trades[0].price`) if/when a real
   use case appears (currently a "no" per D3).

---

*Authored 2026-05-19. Decision doc — changes to D1–D6 require a
docs PR that updates this file, `PUBLIC_API_SPEC.md`, and
`UX_NUANCES.md` §N32 in the same change.*
