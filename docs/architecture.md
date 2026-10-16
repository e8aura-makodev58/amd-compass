# Architecture

## Runtime composition

```text
single server process
└── shared application runtime
    ├── LIVE
    │   ├── atomic JSON live store
    │   ├── explicit simulation clock
    │   ├── one deterministic scheduler interval
    │   ├── contextual event planner → validator → fallback
    │   ├── deterministic context + two baselines
    │   ├── Compass model boundary → validator
    │   ├── automatic primary/support offer queues + atomic acceptance/override
    │   ├── roster-versioned release and cross-issue transfer
    │   ├── segmented hidden-skill resolution-attempt engine
    │   └── fixed-snapshot analytics
    └── OFFLINE
        ├── fixed Scenario A state
        ├── fixed validated Compass result
        └── shared asynchronous offer/accept and override UI
```

All canonical Live writes pass through one serialized `validate → mutate clone → atomic rename` boundary. Operational events are audit/feed data, never event-sourcing reconstruction.

The shared Live/Offline floor renderer keeps view state entirely in the browser. It defaults to a one-floor-at-a-time 2D plan, with explicit floor selection and a screen-space camera for drag pan and wheel/button/keyboard zoom. The optional 2.5D projection uses the same DOM and data. Camera variables are applied after idempotent panel rendering, so the 1.5-second state poll cannot reset an operator's viewport.

The map is split into two layers. Geometry — machines, responders, floor signage — lies in the floor plane and shares its axes, so it foreshortens with the floor in 2.5D instead of billboarding toward the camera. All readable node text lives outside the 3D scene in a screen-space overlay that measures the browser's projection of each node and places an upright label above it with a leader line; `frontend/map-label-layout.js` owns that placement as a pure, separately tested function. Because labels are measured rather than frozen, they are re-measured each frame until the camera transition settles. This split is the first step toward a fully three-dimensional floor: world geometry stays in the scene, text stays in screen space.

## Deterministic / agent boundary

| Concern | Owner |
|---|---|
| Clock, cadence, due tokens, active ceiling | Application |
| Equipment and issue eligibility | Application |
| Candidate membership and observed metrics | Application |
| Nearest and versioned naive baseline | Application |
| Event content proposal | Event-planning model or deterministic fallback |
| Candidate ranking and qualitative tradeoff | Compass model |
| Proposal/result validation | Application |
| Primary/support offer progression, acceptance sampling, stale rematch, release, transfer, and central override | Application |
| Resolution work, schedule, and success sampling | Application using hidden truth, bounded same-class history influence, team synergy, and seeded variability |
| Persistence and analytics | Application |

Model calls occur after a snapshot and outside the store lock. Their outputs are revalidated against current canonical state inside the mutation transaction. A changed candidate set marks a Compass request stale and triggers an automatic rerun. For each issue, Compass ranking (or a deterministic fallback ordering) feeds a ride-hailing-style offer queue: one eligible responder is offered at a time, rejection advances to the next ranked candidate, acceptance claims the issue atomically, and central command may override while an offer is pending. An issue may have one Primary and one Support responder. Complex work requests support immediately; standard work requests support only after application-observed delay. Capacity shortages remain issue-local and retry automatically. Cross-issue movement is a deliberate control-center transfer, never a global optimizer.

## Hidden simulation truth

`ResponderSkill(responderId, issueClass, trueMedianMinutes, trueSuccessProbability)` exists only in the live seed/store and resolution/evaluation code. It is removed from public snapshots, planner packets, Compass packets, event payloads, and analytics. At attempt creation, the resolution engine samples one fixed work total and one fixed success draw. Roster segments then use the dominant hidden prior plus bounded observed-history influence; two-person work uses the faster rate plus 60% of the slower rate and bounded team success synergy. Joins, releases, promotions, and transfers settle elapsed work and replan only the remaining schedule: they never reroll the attempt. Pending draws, skill truth, contribution shares, RNG state, and tokens are removed from public state.

Observed `ResolutionHistory` is separate. Runtime outcomes can therefore contradict observed estimates, and future Compass packets learn only from completed observations.

## Persistence and restart

- simulation time advances only from explicit elapsed-time ticks while running;
- store loading never computes elapsed wall time;
- scheduler and resolution tokens are consumed atomically before dispatch;
- transient Event Planner and Compass activity is runtime-owned and projected read-only to every browser; it is never treated as canonical simulation history;
- timing, fallback, and resolution use independent persisted RNG streams;
- Live reset reproduces the fixed synthetic seed; Offline reset reproduces Scenario A;
- switching mode does not reset the other mode.

## HTTP surface

Read routes: `/api/state`, `/api/issues`, `/api/issues/:id/audit`, `/api/responders`, `/api/events`, `/api/analytics`, `/api/logs`.

Mode-guarded routes return `409 Conflict` when invoked in the wrong runtime mode. Invalid mode values return `400 Bad Request`; unexpected server failures remain `500` without exposing internal details.

Live mutations: `/api/simulation/start`, `/pause`, `/resume`, `/speed`, `/force-event`, `/reset`; `/api/issues/:id/force-resolve`; `/api/issues/:id/assistance`; `/api/issues/:id/responders/:responderId/release`; `/api/assignments/transfer`; `/api/compass/recommend`; `/api/assignments/confirm`; `/api/assignments/override`.

Shared mode: `/api/mode`. Historical Offline-compatible issue routes remain available only while Offline is active.
