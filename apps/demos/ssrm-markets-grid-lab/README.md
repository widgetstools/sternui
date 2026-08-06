# `@starui/ssrm-markets-grid-lab`

**MarketsGrid on `@starui/ssrm-engine`. One engine, one grid, no switch.**

```bash
npm --prefix apps run build -w @starui/ssrm-markets-grid-lab
cd apps/demos/ssrm-markets-grid-lab && npx vite preview --port 5321 --strictPort
```

Open <http://localhost:5321> and you are on the product path. That sentence is
the entire reason this app exists.

## Why it exists

The engine decision was made in session 8: `@starui/ssrm-engine` ships and
Perspective does not. But the lab that decision was made in — `perspective-ssrm-lab`
— is a BAKE-OFF, and it still presents the question as open. Its PERFORMANCE
section offers three entries:

| entry | what it actually is |
|---|---|
| **Stress Test** | two engines behind `?engine=`; Perspective unless you know the query parameter |
| **SSRM Engine** | a bare `AgGridReact`, no MarketsGrid chrome — a measurement control |
| **SSRM Engine · MarketsGrid** | the product surface |

Nothing on screen says which engine you are looking at, and the one a reader
should open has the longest, most internal-sounding name. Two of the three exist
only to serve a comparison that is finished.

This app has no tab strip, no engine parameter and no second row supply. The
bake-off keeps its comparison; this keeps the product.

## What it is

- **50,000 x 120 rows**, generated in the app's own SharedWorker
  (`src/workers/ssrmBookWorker.ts`) and ticking 200 rows every 200 ms
- **`rowModel="ssrm-engine"`** — the window holds only the blocks its viewport
  asks for, so nothing here ever has more than a few hundred rows in memory
- the **full MarketsGrid platform**: toolbars, customizer, profiles, status bar,
  Excel export, saved filters
- **one seeded profile**, applied on first visit (verified — see below)

The seed is deliberate rather than decorative. Each piece is a thing that breaks
in its own way on a server row model:

- **six calculated columns**, authored in the customizer, whose ASTs cross the
  worker port and are evaluated where the BOOK is — which is what makes them
  sortable, filterable and groupable rather than merely displayed;
- **a whole-book style rule** (`[esgScore] > 999`) matching about one row in a
  thousand, so none of the ~100 rows a block cache holds satisfies it. Its header
  indicator can only light if the worker was asked about the book:
  `forEachNodeAfterFilter`, which is how a client-side grid answers "does any row
  match?", visits **zero** nodes here. It is the one visible thing on this
  surface a client-side grid physically cannot do;
- **a timed flash rule written as `value != null`** — the spelling that used to
  be dead, because the timed evaluator bound `value` to null and every rule
  written that way was false for every row;
- **both totals rows.** A grand total is created one way and updated another; a
  group footer is a different node again, one `forEachNode` does not traverse at
  all. Having both on screen makes a regression in either visible without any
  setup.

## No Perspective, and it shows in the bundle

There is no `@finos/perspective` dependency here. The bake-off lab emits a
5,070 kB inline Perspective chunk; this app's entire bundle is smaller than that
one chunk.

It also boots no data-services hub: the book is GENERATED, not provider-fed, so
there is nothing to start and nothing to fail before the first render. That is a
deliberate limit — a provider-fed book on this surface is exercised by
`providerBookProbe` against the other lab.

## The SharedWorker name is different on purpose

`starui-ssrm-marketsgrid-lab`, not the bake-off lab's `starui-ssrm-book`. A
SharedWorker is keyed by script URL **and** name, so sharing a name across two
apps would put two different books in one worker and make "which app am I
measuring?" a question again.

## Probes

Every `@starui/ssrm-engine` probe reads the same `__ssrmEngineGrid` handle, and
this app publishes it with `surface: 'ssrm-markets-grid-lab'` so a probe that
lands on the wrong app can say so rather than reporting one surface's numbers as
another's.

```bash
node packages/react-grid/ssrm-engine/scripts/firstVisitProbe.mjs --url http://localhost:5321/
node packages/react-grid/ssrm-engine/scripts/surfaceIdentityProbe.mjs --url http://localhost:5321/ --tab ''
```

`firstVisitProbe` is the one worth running after any change to the seed: it uses
a FRESH browser context, because a lab whose configuration only appears on the
second load is a lab that fails the reader it was built for. Measured on both
labs: 126 columns and 6 calculated columns on the first visit, and the same after
a reload.

## e2e

```bash
npx playwright test -c playwright.ssrm-lab.config.ts
```

The config exists and builds/serves this app on 5321. The spec
(`e2e/ssrm-marketsgrid.spec.ts`) is **not written yet** — session 6 recorded that
the ssrm surface's interaction coverage is committed probes rather than an
`e2e/` spec, and the honest position is unchanged until that file exists. What
has changed is that adding one no longer requires deciding which surface a
`?engine=` parameter had selected.
