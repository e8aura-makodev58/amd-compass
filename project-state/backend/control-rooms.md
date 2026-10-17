# Control Rooms (multi-instance)

A single deployment runs **several fully independent simulations** — named `e8-aura-p1`
and `e8-aura-p2` by default — each with its own persisted state, clock, issues, responders, and history.
This is the first step toward a multi-domain platform. The design was specified in
`Control_Rooms_SOW_v1_DRAFT.md` and is implemented across four modules.

## The pieces

| Module | Role |
|--------|------|
| `control-room-registry.mjs` | The frozen, hardcoded room list (`plant-1`, `plant-2`) plus `RESERVED_ROOM_IDS`, which prevents a room id from colliding with a real route segment. |
| `control-room-manager.mjs` | The **sole boundary** for room-scoped access. Composes one Live + Offline + application runtime per room; shares one logger, one settings service, and one planner/agent config across all rooms; and owns the single process scheduler. |
| `control-room-migration.mjs` | The idempotent first-boot move of legacy single-instance data into `backend/data/control-rooms/plant-1/`. |
| `control-room-metadata-store.mjs` | Revisioned display names in a shared `room-metadata.json`. |

## Invariants

- **One scheduler for the whole process.** The manager runs exactly one `setInterval`,
  which dispatches every `READY` room's tick **concurrently** (never awaiting one room
  before the next). N independent timers would violate the codebase's single-timer
  concurrency discipline. See [simulation.md](simulation.md) and [live-runtime.md](live-runtime.md).
- **One writer per room.** Each room has its own `live-store.mjs` writing its own state
  files atomically. Rooms never share operational state.
- **Health is separate from clock state.** A room is `READY` or `FAILED` (manager health)
  independently of `RUNNING` or `PAUSED` (its clock). A corrupt state file or a migration
  conflict fails just that one room; every other room boots and serves normally.
- **Migration never guesses.** If both a legacy source file and its destination already
  exist, migration records a `CONFLICT` and touches neither — ambiguous provenance is
  surfaced loudly, not silently repaired.

## Routing consequences

`server.mjs` resolves `/api/control-rooms/:id/...` through the manager: an unknown id
`404`s, a non-`READY` id `503`s before any handler runs. Settings (`/api/settings*`) and
diagnostics (`/api/logs*`) stay **deployment-global** — they are process-wide concerns, and
no single room's mode can be authoritative over a shared settings surface. See
[http-api.md](http-api.md).

## Frontend consequences

`/` shows a pre-boot room picker; choosing a room navigates to `/rooms/:id`, which the SPA
parses once at boot. Room switching is full-page navigation, not in-page teardown. The
client scopes calls with `roomApi()` (room-prefixed) vs. `globalApi()` (global). See
[frontend/overview.md](../frontend/overview.md).

## New-room default

A freshly seeded room starts `LIVE + PAUSED` — an operator starts the clock explicitly.
"Live mode" (vs. Offline) and "running" (vs. paused) are distinct axes; do not conflate
them.

## Restored generic rooms

The canonical IDs and storage directories are `plant-1` and `plant-2`, matching
`backend/seed/demo-control-rooms/`. Registry labels also supply the generic display
names when metadata is absent. Operator renames remain revisioned metadata.
The former `plant1` route is a compatibility alias for `plant-1`; startup moves its
known state files into the canonical directory without overwriting conflicting files.
A conflict fails only the first room. Metadata saved under `plant1` keeps its name
and revision when read as `plant-1`.

## Committed demo history

`backend/seed/demo-control-rooms/plant-1.json` contains real-engine, deterministic offline
history from 1 September through 6 October 2026 at 08:00 UTC, ending LIVE + PAUSED.
September and four complete operational weeks are retained. The existing visible period
windows include the current partial period (six complete days / three complete weeks /
one complete month visible at this endpoint). No retention or chart rules were changed.

`npm run generate:history` resumes a seed using the shared Live engine with both provider
roles forced onto deterministic fallbacks. It defaults to a scratch output, never installs
into the running app, and preserves hidden skill boundaries. Bootstrap still seeds only
a fresh data root; existing deployments are untouched. See [docs/demo-history.md](../../docs/demo-history.md)
for exact reproduction, SHA-256, measurements and the sequential worker/store rationale.
