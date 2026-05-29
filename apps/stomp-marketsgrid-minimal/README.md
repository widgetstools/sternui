# STOMP + MarketsGrid — minimal

Lean browser demo: programmatic STOMP provider → hub catalog → `HostedMarketsGrid`.

**Prerequisite:** `npm run dev:stomp` (broker on `:8081`)

```bash
npm run dev:stomp-marketsgrid-minimal
# → http://localhost:5213
```

## The whole app (4 files)

| File | Role |
|------|------|
| `src/main.tsx` | SharedWorker hub + `DataHubProvider` |
| `src/bootstrap.ts` | `ensurePlatformReady` from `app-config.json` |
| `src/stompProvider.ts` | STOMP cfg + column defs (saved to catalog) |
| `src/App.tsx` | `configStore.save` → `HostedMarketsGrid` |

No OpenFin, no routing, no chrome — full-screen grid only.
