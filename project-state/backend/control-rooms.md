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

`backend/seed/demo-control-rooms/plant-1.json` contains the corrected history from
1 September to 6 October 2026, 08:00 UTC, LIVE + PAUSED. Its companion
`plant-1.json.history/` contains immutable closed-issue bundles. Fresh-root bootstrap
stages both room seeds, metadata and archives together before publishing the room root;
an existing root is untouched. Plant-2 and metadata are unchanged.

`npm run generate:history` uses the shared Live engine, deterministic provider fallbacks
and the same retention planner. Copying a retained seed requires its companion archives;
normal room storage places them at `plant-1/history-archive/`. Missing indexed day files
fail room startup instead of silently losing audit history. See
[demo-history.md](../../docs/demo-history.md) for reproduction and measurements, and
[history-retention.md](../../docs/history-retention.md) for persistence and reader inventory.

Round 8 plant-1 uses a checksum-verified gzip manifest and companion payload to keep each
committed file below 20 MB. `demo-seed-reader.mjs` restores ordinary runtime JSON during
bootstrap; plant-2's ordinary JSON remains supported. The generator also accepts either
format. Copying the manifest as a live state file is invalid; see the materialization
command in `docs/demo-history.md`. Runtime state and memory are not compressed.
