# STOMP `rowShape: 'ssrm'` — Design

**Date:** 2026-07-15  
**Status:** Implemented (see plan)  
**Repos:** starui (`@starui/shared-types`, `host-data` STOMP transport, provider editor)  
**Depends on:** MarketsGrid dual engine SSRM phases ([2026-07-14-marketsgrid-ssrm-dual-engine-design.md](./2026-07-14-marketsgrid-ssrm-dual-engine-design.md))  
**Plan:** [2026-07-15-stomp-rowshape-ssrm.md](../plans/2026-07-15-stomp-rowshape-ssrm.md)

## Goal

Enhance the existing STOMP data provider (not a new provider type) so it can emit **Perspective-ready flat rows** and **stream snapshot batches as they arrive**, for MarketsGrid SSRM ingest.

CSRM behaviour must remain unchanged when the mode is off / default.

## Non-goals

- A separate `ssrmStomp` / `SsrmStompDataProvider` catalog type.
- Flattening inside Perspective / ssrmgrid (Perspective only accepts typed scalars).
- Changing default STOMP snapshot buffering for CSRM consumers.
- Auto-switching `rowShape` from the grid’s `useSSRM` prop in v1 (catalog/config owns the mode; grid and provider are coordinated by the app / lab).

## Config

On `StompProviderConfig` (and persisted via `DataProviderConfig.config`):

```ts
/**
 * Row / snapshot delivery shape for hub consumers.
 * - `'csrm'` | omitted — today’s behaviour (default).
 * - `'ssrm'` — flatten dotted column paths; stream snapshot row
 *   payloads as batches arrive (plus live ticks flattened the same way).
 */
rowShape?: 'csrm' | 'ssrm';
```

| | `'csrm'` (default / omitted) | `'ssrm'` |
|--|--|--|
| Snapshot phase | Buffer rows; emit `{ rowsReceived }` only until end-token | Emit flattened row chunks as frames arrive |
| Snapshot complete | Chunked `{ rows, replace }` flush, then `ready` | First emitted batch `replace: true`, later append; `ready` on end-token |
| Row shape | Nested objects; dotted fields via AG Grid / `getValueByPath` | Flat scalars for every `columnDefinitions[].field` + `keyColumn` |
| Live ticks | Nested (unchanged) | Same flatten projector as snapshot |
| Progress overlays | `rowsReceived` counts | Keep emitting counts **and** row payloads |

Changing `rowShape` requires a provider **Restart** (same contract as `projectFields` / `thinDeltas`).

## Flattening rules

Owned by the **worker STOMP transport** when `rowShape === 'ssrm'`.

1. Build a path list from `columnDefinitions[].field` plus `keyColumn` (string or composite key parts).
2. For each path, resolve with existing `getValueByPath` semantics (literal flat key wins, else null-safe dot-walk).
3. Write the value onto the output row under the **literal field string** (e.g. `rating.moody`), so AG Grid `field` / Perspective schema keys stay aligned with authored column defs.
4. Omit paths whose resolved value is a non-scalar object/array (Perspective cannot coerce them). Dates and primitives are kept.
5. Do not leave unlisted nested envelopes on the output row (hub cache and wire stay lean).

Reuse / compose with `projectFields` where useful: projection prunes; `rowShape: 'ssrm'` additionally **lifts** dotted paths to top-level scalar keys. Order: parse → optional project → flatten-for-ssrm → emit.

### Live updates

**Also flatten in the provider** for post-ready ticks when `rowShape === 'ssrm'`.

Perspective / SSRM must **not** flatten nested objects. If the snapshot is flat and a live tick still ships `{ rating: { moody: 'Aa' } }`, schema/`updateRows` miss or fail.

Under `thinDeltas`, patched field names are the flattened keys (`rating.moody`), matching the Perspective schema.

## Snapshot streaming (`rowShape === 'ssrm'`)

Today (CSRM):

```text
frames → snapshotBuffer + emit(rowsReceived)
end-token → chunked emit(rows, replace) → ready
```

SSRM mode:

```text
first batch this generation → emit(rows, replace: true)  // flattened
later batches → emit(rows)                              // append
end-token → emit(ready)  (buffer empty / no late flush of nested rows)
```

Notes:

- Still emit `{ rowsReceived }` for loading overlays.
- Respect `snapshotChunkSize` as a **max batch size** when coalescing inbound frames if needed; do not re-buffer the entire book before first emit.
- Existing probe-only `passthroughSnapshot` stays separate (raw fan-out, no hub replace/`ready` contract). SSRM streaming is hub-safe and catalog-driven.
- Dedup by `keyColumn` within/across early batches must preserve last-write-wins consistent with today’s end-of-snapshot dedup.

## Provider editor

In STOMP **Behaviour** (`BehaviourFields` / `StompBehaviour`), add:

- Control: select — **Row shape**: `CSRM (default)` | `SSRM`
- Persists `config.rowShape: 'ssrm'` or omit / `'csrm'`
- Helper copy: SSRM flattens dotted columns and streams snapshot rows as they arrive; CSRM keeps nested rows and buffered snapshot. Restart required after change.

No new provider type in the subtype picker.

## Consumer / MarketsGrid coordination

| Engine | Expected provider config |
|--------|---------------------------|
| CSRM (`useSSRM={false}`) | `rowShape` omitted or `'csrm'` |
| SSRM (`useSSRM={true}`) | Catalog row (or restart overlay) with `rowShape: 'ssrm'` |

v1 does not auto-mutate provider config from the grid toggle. Lab / apps that dual-run may seed two catalog rows or restart with an overlay when flipping engines.

SSRM ingest path continues: hub deltas → `SSRMGrid.setRowData` / `updateRows` / `applyTransactionAsync` with already-flat rows.

## Testing (when implementing)

- Unit: flatten projector — nested `rating.moody` → flat key; skips arrays; keyColumn preserved.
- STOMP transport: `rowShape: 'ssrm'` emits row payloads before end-token; first batch `replace: true`; `ready` only on token; CSRM path regression (buffer + `rowsReceived` only).
- Live: nested tick → flattened emit; thin-delta keys use flat names.
- Editor: Behaviour control round-trips through save / load.
- Integration (lab): SSRM + STOMP (or mock with same emit contract) progressive Perspective ingest without waiting for full snapshot.

## Implementation deferral

| When | What |
|------|------|
| Done | Spec + plan + `rowShape` on STOMP + flattener + stream + Behaviour editor |
| Out of scope (still) | Auto-switch from grid `useSSRM`; REST/mock `rowShape` |

## Open follow-ups (post-implement)

- Optional: grid `useSSRM` auto-restarts active STOMP provider with `rowShape` overlay.
- Optional: REST / mock transports grow the same `rowShape` flag for symmetry.
- Column-key sanitization if Perspective ever rejects dotted column names (today plan assumes literal `field` strings work as schema keys; validate during implement).

## Spec self-review

- No placeholder TBDs for core behaviour.
- Explicitly deferred vs dual-engine phases 1–4.
- CSRM default path called out as unchanged.
- Flatten ownership: provider for snapshot **and** live; not Perspective.
- Editor control included.
- Not a new provider type (Approach B).
