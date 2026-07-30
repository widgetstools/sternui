# minimal-perspective-table

**SSRM performance with CSRM features.**

A blotter that never holds the book. The rows live once, as a Perspective
Table inside the SharedWorker, and this window reads only the blocks its
viewport asks for — so opening a second and third blotter costs a View, not a
20,000-row replay. Everything above the row supply is the ordinary MarketsGrid:
toolbar, formatting, column customizer, profiles, saved filters, grouping,
aggregation, the lot.

This is a clone of [`stomp-marketsgrid-minimal`](../stomp-marketsgrid-minimal)
with one line changed in the app and one line changed in the provider. That is
the claim being demonstrated — the pull path is a row supply, not a different
application.

## What differs from the STOMP demo

| | `stomp-marketsgrid-minimal` | this app |
|---|---|---|
| worker asset | `data-services-worker.mjs` | `data-services-perspective-worker.mjs` |
| provider type | `stomp` | `stomp-perspective` |
| grid | default (CSRM) | `rowModel="perspective"` |
| rows in this window | the whole book | the visible blocks |

Everything else — `bootstrap.ts`, `main.tsx`, the catalog seeding, the grid
event handlers, the AppData hooks — is the same shape, deliberately.

Two fields in [`src/perspectiveProvider.ts`](src/perspectiveProvider.ts) carry
weight and nowhere else:

- **`inferredFields`** declares the Table's schema up front, so the Table is
  created EMPTY and immediately and the blotter paints on open instead of
  waiting out the snapshot before there is anything to attach to. It must cover
  `keyColumn` — an unindexable Table would make `update()` append instead of
  upsert, and every tick would grow the book.
- **`tableName`** is what a window passes to `open_table`. One per provider.

There is no historical provider here. Swapping a date-templated provider is
orthogonal to where the book lives, the STOMP demo already covers it, and
carrying it would blur what this app is for.

## Running it

The broker fixture first — this app talks to the same one as every other STOMP
demo:

```bash
npm run dev:stomp
```

Then the app. Build and preview rather than `dev`: the pull path's costs only
show up in a production build, and the Perspective wasm chunk is code-split so
only a window that actually opens a blotter pays for it.

```bash
npm --prefix apps run build -w @starui/minimal-perspective-table
```

```bash
npm --prefix apps run preview -w @starui/minimal-perspective-table
```

Then open <http://localhost:5215>. Opening the same URL in a second and third
window is the point of the exercise — they attach to the Table the first one
already loaded.

`npm run dev:minimal-perspective-table` exists for iterating on the UI, but do
not read timings off it.

## Reading the status bar

The bar is not AG Grid's. Its stock panels count the rows the CLIENT holds,
which on this path is the handful of loaded blocks — a plausible and
confidently wrong number. Every figure here comes from the worker instead: the
filtered count from the View the grid is scrolling, the book total from the
Table. Selection is the one genuinely client-side number.

`live` / `paused` matters: a stalled feed and a quiet one look identical
otherwise.

## Where the pieces live

- `@starui/host-data` — `stomp-perspective` provider, the Perspective host
  inside the worker, and `attachPerspective` on the client
- `@starui/perspective-grid` — the row engine, View lifecycle, and
  `usePerspectiveTable`
- `@starui/grid` — `PerspectiveMarketsGridSurface` and the status panel
- `@starui/widgets-react` — `MarketsGridContainer` wires `rowModel="perspective"`
  to the provider's Table

The design, the measured 4.5.2 numbers, and the non-optional rules behind the
View lifecycle are in
[`packages/react-grid/perspective-grid/ARCHITECTURE.md`](../../../packages/react-grid/perspective-grid/ARCHITECTURE.md).
