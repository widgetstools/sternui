# perspective-ssrm-lab

The MarketsGrid Feature Lab, moved onto the **Perspective pull path**. Same
columns, same profiles, same seeds, same scenarios as
[`markets-grid-lab`](../markets-grid-lab) — the only difference is where the
book lives, which is the point.

Run them side by side and any difference you see is the engine and nothing
else. That is what makes this lab a parity harness rather than another demo.

```bash
npm run dev:perspective-ssrm-lab      # this lab      → :5301
npm run dev:markets-grid-lab          # the CSRM twin → :5300
```

No broker is needed. The book is generated in the SharedWorker.

## What is actually different

| | markets-grid-lab | perspective-ssrm-lab |
|---|---|---|
| Provider | `mock` | `mock-perspective` |
| Worker asset | `data-services-worker.mjs` | `data-services-perspective-worker.mjs` |
| Rows reach the window as | a `rowData` array | nothing — a View over a worker-held Table |
| Row model | `clientSide` (or SSRM via the header toggle) | `serverSide`, always |
| Engine toggle | CSRM ↔ SSRM in the header | none — the engine is a property of the app |

Everything else — 44 columns, ~150 profile JSONs, every seed, all 28 demo
scenarios, the guides and the Inspector drawer — is byte-identical.

## The one file to read first

[`src/data/perspectiveProvider.ts`](src/data/perspectiveProvider.ts) decides
what the pull path can see, and it is the only place a mistake is expensive.

`mock-perspective` flattens each nested 250-field mock row down to the paths
its `columnDefinitions` declare and **drops everything else** — that is how a
nested row becomes a flat Perspective schema. So **a field not declared there
does not exist in the Table**, and a rule or calculated column referencing it
does not fail, it silently answers null.

Types are declared explicitly for the same reason. MEASURED during the build
of this app: with the key column `id` guessed as `number`, Perspective did not
reject the string `POS-3133EPLR2-0` — it **coerced it to `0`**. Every row
upserted onto the same index and the grid showed exactly one row, with nothing
logged anywhere. `fieldType()` now throws for an undeclared field rather than
guessing, because build time is the only moment that is cheap to notice.

## Things that behave differently, and why

**A tab shows a placeholder before its grid appears.** The grid is not mounted
until the Table exists. That is not politeness: exactly one grid may mount per
`GridPlatform`, ever, and a stand-in grid's `onGridPreDestroyed` calls
`platform.destroy()` permanently — the real grid then mounts into a dead
platform where the formatting toolbar, auto-formatter, saved filters and
profiles are all silently inert while the grid itself looks fine.

**A demo scenario is an edit, not an overlay.** The CSRM lab patched its own
copy of the rows. There is no copy here, so a scenario is applied to the rows
this window holds and written back through `applyDataTransactionAsync`, which
the Perspective surface routes to `table.update()`. It therefore lands in the
shared Table and **every other window on that provider sees it too**. Clearing
a scenario is a provider restart, not an undo.

**Pause and tick-rate are provider-side.** The generator ticks, not the window.
The Demo Console issues these through a transient attach carrying a restart
payload — see [`src/data/restartLabProvider.ts`](src/data/restartLabProvider.ts).

**The status bar is the surface's own.** AG's stock panels count the rows *this
window* holds, which is a few hundred of the book and reads as a bug.

**The Stress tab keeps a client-side row supply — deliberately.** It benchmarks
MarketsGrid *against* plain AG Grid and the FINOS Perspective viewer, and those
two are client-side by construction. Feeding them from a Table would measure
the Table instead of them. Only the MarketsGrid surfaces take the pull path.

**Synthetic stress columns are client-computed.** They are `valueGetter`
columns with no `field`, so the worker does not know them: they render, but
they cannot be sorted or filtered server-side. Real fields are unaffected.

## One Table per tab

Each tab keeps its own `providerId`, so each gets its own Table named after it.
That preserves the per-tab tuning the CSRM lab relies on — the editing tabs run
with updates **off**, which matters more here, not less: a sweep would
overwrite an edit in a Table that every peer window is reading.
