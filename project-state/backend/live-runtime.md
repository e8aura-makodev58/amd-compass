# Live runtime

Live is a **persistent, real-time control room**: the clock advances, the scheduler raises
issues, the event planner and Compass agent are real model calls, responders accept
asynchronously, and resolution attempts play out over simulated time. It is driven by
`backend/src/live-runtime.mjs` and persisted by `live-store.mjs`.

## What a tick does

The control-room manager calls each room's `runScheduledTick()` on the shared process
scheduler (see [control-rooms.md](control-rooms.md)). One tick, in order:

1. **Advance the clock** by the elapsed real time × speed multiplier (`simulation-clock.mjs`).
2. **Raise a due event.** When `simulationTime` reaches `nextEventAt`, the scheduler
   claims the `dueEventToken`, asks the **event planner** for one `ISSUE_RAISED` proposal,
   validates it, and persists a new `Issue` (or uses the deterministic fallback). The
   active-issue ceiling (`simulationConfig.maxActiveIssues`, default 10) and the
   workforce queue gate whether the issue is actionable now.
3. **Recommend.** For an issue needing a decision, `live-recommendation-service.mjs` builds
   the candidate packet (`context-engine.mjs`), calls the **Compass agent**, validates the
   ranked result, computes disagreement against the nearest-available and naive-score
   baselines, and persists a `Recommendation`.
4. **Dispatch.** `live-assignment-service.mjs` offers the top-ranked eligible responder;
   the responder accepts or rejects asynchronously. Complex or delayed work triggers an
   automatic assistance offer for a second responder (at most two active).
5. **Resolve.** Assigned attempts advance through `attempt-engine.mjs`; when an attempt is
   due, `resolution-engine.mjs` settles it, writes `ResolutionHistory`, returns responders
   to their duty stations, and reopens the issue on failure.

All of this is deterministic given the persisted RNG streams — the model calls only choose
*which eligible responder* and *what plausible next issue*, never the mechanics or the
outcome. See [../concepts/agent-boundary.md](../concepts/agent-boundary.md).

## Persistence & concurrency

- `live-store.mjs` writes the retained live state atomically (synced temp file, rename,
  synced directory) on every mutation, bumping `revision`. There is exactly one writer
  per room per process. At daily simulated boundaries and on load, closed detail older
  than `COMPASS_HISTORY_RETENTION_DAYS` (default seven) moves to per-room daily archives.
  Archive files are synced **before** the live commit, and insert-only by issue ID;
  retrying after a crash neither drops nor duplicates records. Reset starts a new archive
  epoch and leaves old epoch files intact. See [docs/history-retention.md](../../docs/history-retention.md).
- Exact `resolutionHistory` and workforce state stay canonical. Compact issue/lifecycle/
  recommendation facts and ID/token floors preserve analytics and engine decisions.
  Detail is available on demand via archived issue audits and paginated station history.
  `/state` contains open work, at most one hundred recent closed issues plus issues linked
  from the last hundred events, active rosters/attempts and bounded recent controls/feed.
- Read-only analytics projections run on the serialized store queue without cloning
  private detail; builders create their own derived output and never consult archives.
  The timeline caches parsed bin boundaries, preserving arithmetic order and values.
- `OperationalEvent`s are an audit log only; canonical state is the object itself, never
  rebuilt by replaying events.
- Simulation time is derived from wall-clock deltas while `RUNNING`, so **time does not
  advance while the process is stopped** and there is no catch-up burst on restart —
  missed scheduler boundaries replay in order at their persisted effective timestamps.

## Agent activity & deferred work

`live-runtime.mjs` tracks a visible agent-activity status (so the UI can show when the
planner or Compass is "thinking"). Model-bound work started by the **real-time loop**
(`runScheduledTick`: event planning, Compass ranking after a resolution or workforce
change, support matching, the autonomous-dispatch pass) runs in a single serialized
**agent lane**, so a slow provider never holds the clock: ticks keep advancing time and
handling resolutions, offers and shifts while a call is in flight. At most one
autonomous-dispatch pass is queued at a time; it re-reads state when it runs. The loop
context is carried with `AsyncLocalStorage`, so every other caller (API actions, tests,
`advanceSimulation` in offline history generation) still runs that work inline and in the
original order. `agentWorkIdle()` resolves when the lane is empty (tests). A queued event
plan is in memory only: if the process stops first, that event is skipped, never
duplicated. A model call that fails or times out marks the recommendation `UNAVAILABLE`
and dispatch proceeds on the baseline.

## Configuration

Live model behavior is controlled by the provider-settings service and these env vars:
`COMPASS_LIVE_COMPASS_MODE` (default `live`) and `COMPASS_EVENT_PLANNER_MODE` (default
`live`). See [model-providers.md](model-providers.md) and
[../operations/running-and-config.md](../operations/running-and-config.md).

## Mode wrapper

`createApplicationRuntime({ liveRuntime, offlineRuntime, initialMode })` wraps both modes
behind one interface; `mode-service.mjs` routes `getState`/`reset` to the active one.
Switching a room to Offline does not erase Live history — the two are independent stores.
See [offline-runtime.md](offline-runtime.md).

## Generic recommendation evidence

`context-engine.mjs` computes candidate aggregates directly from canonical
`resolutionHistory`, including participant-weighted assistance evidence. Compass
receives these aggregates and eligibility-filtered candidates only. There is no MES
adapter, comparable-case retrieval, case citation, or response-plan result contract.
`live-recommendation-service.mjs` snapshots the aggregates and rejects results when
those candidate facts change during inference. Offline uses the same packet builder
with its API-free fixture.
