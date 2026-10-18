# Simulation mechanics

The simulation is fully deterministic given its persisted RNG streams. Models influence
only *which* eligible responder is chosen and *what* plausible next issue appears; they
never touch the mechanics or outcomes below. All randomness is a 32-bit LCG
(`rngVersion: "lcg32-v1"`) with per-concern seeds in `simulationState.rngStreams`.

## Clock (`simulation-clock.mjs`)

Converts elapsed real time into simulated time while `RUNNING`, at 1× / 5× / 10× / 60×.
Pausing freezes simulated time; because time is derived from wall-clock deltas, a stopped
process does not advance and does not replay a catch-up burst on restart.

## Scheduler (`scheduler.mjs`)

Decides *when* the next issue is raised, on a bounded cadence, and rotates the scheduler
RNG stream. It is **process-level**: one interval for the whole deployment, dispatching
every `READY` room's tick concurrently (see [control-rooms.md](control-rooms.md)). Each
due event advances `dueEventToken` (`due-1` → `due-2` …) and reschedules the next.

## Context engine (`context-engine.mjs`)

The deterministic fact layer that feeds Compass. It computes eligibility and the evidence
for each candidate: floor-aware distance and travel time (`WALKING_SPEED_METRES_PER_SECOND`,
`FLOOR_TRANSIT_MINUTES`), same-issue-class success/median history, evidence strength, and
sample size — then assembles the bounded candidate packet. It contains **no model calls**,
and it never includes `ResponderSkill`.

## Attempt & resolution engines

- `attempt-engine.mjs` simulates the work: segments, a success draw, a duration factor,
  and multi-responder team effects. Key constants: `TEAM_SYNERGY = 0.60`,
  `TEAM_SUCCESS_CAP = 0.98`, and history weighting (`MAX_HISTORY_WEIGHT`,
  `FULL_HISTORY_COUNT`). A roster change **re-plans** remaining work; it never re-rolls the
  already-drawn outcome.
- `resolution-engine.mjs` finalizes a due attempt: writes `ResolutionHistory` (with
  per-participant `contributionShare` and a `TEMPORARY`/`DURABLE` durability class),
  returns responders to duty, and reopens the issue on failure. A temporary repair can
  recur later.

The hidden `ResponderSkill` (`trueMedianMinutes`, `trueSuccessProbability`) is one input to
the outcome draw, blended with confidence-weighted same-class observed history. It is
simulation truth and never leaves the engine. See
[domain-model.md](domain-model.md#invariant-responderskill-is-hidden-truth).

## Workforce continuity (`workforce-continuity.mjs`)

Policy version `wc-2`. Provisions 24 synthetic responders across four crews
(`CREW_IDS = ["A","B","C","D"]`) on a 14-day 2-2-3 rotation (A/C days, B/D nights) anchored
at `ROTATION_ANCHOR`. Enforces `MIN_REST_HOURS = 12`, `NORMAL_SHIFT_HOURS = 12`,
`MAX_DUTY_HOURS = 16`, and a `MAX_ACTIVE_STAFF = 8` on-shift cap. Drives shift handovers,
legal surge staffing, queue-first priority dispatch, and a `MAX_ACTIONABLE_ISSUES = 10`
cap. The provisioning seed never advances the simulation RNG streams. Priority and staffing
are application-owned and deterministic — they do not consult hidden skill or any
responder-specific evidence.

## Responder location (`responder-location.mjs`)

Deterministic positioning: on assignment a responder moves beside the issue's equipment
with a small role-seeded offset (Primary vs. Support), and on release returns to a
persisted duty station. Movement is recorded as `RESPONDER_MOVED` operational-event
snapshots rather than continuous coordinates. No hidden skill or RNG is consulted.

## Faults and applied fixes

`fault-truth.mjs` assigns each new issue one of four latent causes in its class with a
separate persisted fault RNG stream and equipment-dependent priors. Overlapping public
symptoms carry signal without disclosing a cause. `fix-catalog.mjs` supplies six synthetic
procedures per class. New attempts freeze an applied fix and troubleshooting order;
its private effectiveness multiplies team success (clamped at the existing cap) and
scales duration through segment rates. Roster changes preserve the same fix and draw.
Failure reopens the issue and selects the next untried fix; after exhausting the catalog,
the sequence restarts. Legacy running attempts keep their pre-upgrade mechanics.
