# Domain model & state schema

The canonical Live state is one JSON object persisted per room by `live-store.mjs` and
validated by `live-schema.mjs`. Type definitions live in `backend/src/domain.ts`; the
runtime schema constants live in `backend/src/live-schema.mjs`.

## Key constants (`live-schema.mjs`)

- `LIVE_SCHEMA_VERSION = "2.1"`
- `ISSUE_CLASSES = ["A", "B", "C"]`
- `BASELINE_CONFIG` — the auditable naive-score baseline: `version: "naive-score-v1"`,
  formula `(100 * successRate) - (2 * medianResolutionMinutes) - (3 * travelTimeMinutes)`,
  with a no-history policy of `successRate: 0, medianResolutionMinutes: 60`.

## Persisted state shape

```jsonc
{
  "schemaVersion": "2.1",
  "revision": 0,                    // monotonically increasing per mutation
  "equipment": [ /* Equipment[] */ ],
  "responders": [ /* Responder[] */ ],
  "responderSkills": [ /* ResponderSkill[] — HIDDEN, never public */ ],
  "issues": [ /* Issue[] */ ],
  "assignments": [ /* Assignment[] */ ],
  "resolutionAttempts": [ /* ResolutionAttempt[] */ ],
  "resolutionHistory": [ /* ResolutionHistory[] */ ],
  "recommendations": [ /* Recommendation[] */ ],
  "dispatchOffers": [ /* DispatchOffer[] */ ],
  "operationalEvents": [ /* OperationalEvent[] — audit-only */ ],
  "simulationState": {
    "simulationTime": "ISO-8601",
    "status": "RUNNING | PAUSED",
    "speedMultiplier": 1,           // 1 | 5 | 10 | 60
    "nextEventAt": "ISO-8601",
    "dueEventToken": "due-N",
    "rngVersion": "lcg32-v1",
    "rngStreams": { "scheduler": 0, "fallback": 0, "resolution": 0,
                    "attempt": 0, "dispatch": 0, "durability": 0 }
  },
  "simulationConfig": { "maxActiveIssues": 10 },
  "workforceContinuity": { /* WorkforcePolicy, see simulation.md */ },
  "stationMetrics": { /* per-equipment counters */ }
}
```

`revision` is the optimistic-concurrency token: every mutation bumps it, and the frontend
polls it to detect change. RNG streams are per-concern `uint32` seeds advanced by a
32-bit LCG (`lcg32-v1`), which is what makes the whole simulation reproducible.

An optional private `historyRetention` block records archive addresses/reset epoch,
original ID high-water marks and length-based token counts, original analytic reduction
order, compact closed-issue/lifecycle/recommendation facts and the last hundred events.
It is removed entirely from public snapshots. Full closed detail lives in per-room
`history-archive/<epoch>/<resolution-day>.json` bundles; exact resolution observations
remain in canonical `resolutionHistory`. The public arrays contain current/recent work,
not all historical detail. See [live-runtime.md](live-runtime.md#persistence--concurrency).

## Core entities

| Entity | Key fields | Notes |
|--------|-----------|-------|
| **Issue** | `id`, `equipmentId`, `issueClass` (`A`/`B`/`C`), `status`, `raisedAt`, `description`, `responseAction`, `complexity` (`STANDARD`/`COMPLEX`) | One owning issue per active problem; may reopen after a failed attempt. |
| **Responder** | `id`, `name`, `availability` (`AVAILABLE`/`OFFERED`/`ASSIGNED`/`UNAVAILABLE`), `floor` (1–3), `x`, `y`, `crewId` (`A`–`D`), `currentIssueId`, `currentOfferId` | Public `name`s use neutral `EngrNNN`/`TechNNN`/`OptrNNN` forms. |
| **Equipment** | `id`, `name`, `status` (`NORMAL`/`ISSUE_ACTIVE`/`ATTENTION_REQUIRED`/`OFFLINE`), `floor` (1–3), `x`, `y` | The manufacturing-floor machines; three floors. |
| **Assignment** | `id`, `issueId`, `responderId`, `attemptId`, `role` (`PRIMARY`/`SUPPORT`), `status` (`ACTIVE`/`RELEASED`/`COMPLETED`), `roleHistory` | **At most two active per issue.** Primary promotion is automatic. |
| **ResolutionAttempt** | `id`, `issueId`, `status` (`ACTIVE`/`SUCCEEDED`/`FAILED`), `durationFactor`, `successDraw`, `workTotal`, `completedWork`, `segments`, `assistance` | Deterministic work simulation; re-planned (not re-rolled) when the roster changes. |
| **ResolutionHistory** | `id`, `issueId`, `attemptId`, `responderId`, `success`, `resolutionMinutes`, `participants[]`, `roleIntervals`, `durability` (`TEMPORARY`/`DURABLE`) | Completed-attempt outcome. Multi-contributor via `contributionShare`. Sequential handovers may record 3+ historical contributors even though only ≤2 are ever active at once. |
| **Recommendation** | `id`, `issueId`, `status` (`PENDING_MODEL`/`READY`/`STALE`/`UNAVAILABLE`), `nearestWinner`, `naiveWinner`, `agentResult`, `candidateEvidenceSnapshot[]` | Frozen at decision time; records baseline disagreement. |
| **DispatchOffer** | `id`, `issueId`, `responderId`, `status` (`PENDING`/`ACCEPTED`/`REJECTED`/`CANCELLED`), `rank`, `purpose` (`INITIAL_ASSIGNMENT`/`ASSISTANCE`) | Asynchronous accept/reject. |
| **OperationalEvent** | `id`, `eventType`, `issueId`, `responderId`, `simulationTimestamp`, `payload` | Audit-only append log. Public snapshot returns the most recent 100; full history stays on disk. |
| **ResponderSkill** | `id`, `responderId`, `issueClass`, `trueMedianMinutes`, `trueSuccessProbability` | **HIDDEN simulation truth. See invariant below.** |

Issue lifecycle (`domain.ts`): `PENDING` → `RECOMMENDATION_READY` → `OFFER_PENDING` →
`ASSIGNED` → `RESOLVED` (a failed attempt can send an issue back for a further attempt).

## Invariant: ResponderSkill is hidden truth

> **`ResponderSkill` and every derived hidden number must never cross a public boundary.**
> It is the simulation's ground truth for how good a responder actually is, and the whole
> point of Compass is to rank *without* seeing it.

`createPublicLiveSnapshot()` (`live-schema.mjs`) removes `responderSkills` and
`resolutionHistory` and strips hidden numeric fields (`successDraw`, `durationFactor`,
`workTotal`, `completedWork`, `participantWork`, `contributionShare`, `teamRate`,
`trueSuccessProbability`, `trueMedianMinutes`) before any state reaches the UI, the agent,
the event planner, or analytics. `assertNoResponderSkill()` re-checks serialized public
state for any hidden marker. This invariant is also a binding rule in the repo-root
`AGENTS.md`. See [../concepts/agent-boundary.md](../concepts/agent-boundary.md).

Saved snapshots using the former `suggestedResponseAction` issue field are normalized
back to `responseAction` by `live-migration.mjs`, without changing the caller's input.
Historical extra provenance fields may remain in old files, but are not required or
used for recommendation evidence. New recommendations have aggregate candidate
snapshots and the generic ranking result only.
