# COMPASS / ResponseCompass — Detailed Statement of Work (SOW) v4-FINAL

**Project:** Compass / ResponseCompass  
**Document Status:** **FINAL — post-Claude-review implementation specification**  
**Primary Product Name:** **Compass**  
**Repository / Formal Project Name:** **ResponseCompass**  
**Working Tagline:** **Not just who's closest. Who makes the most sense.**

---

# 1. Purpose

This SOW supersedes the earlier single-issue demo plan and the v3 draft.

It defines the final product architecture, runtime modes, persistent simulation model, agent boundaries, analytics scope, work packages, test gates, demo controls, risks, and coding-agent handoff rules for Compass.

The revised product is a **persistent live control room** rather than a scripted recommendation demo.

The central product idea is:

> **Context is not a static prompt. Context is the accumulated state of the environment.**

The implementation must preserve another core rule learned from LOCI:

> **Agents propose. Backend validates. Database remembers.**

And for responder assignment:

> **Code establishes the evidence. Compass weighs the tradeoff. The human makes the call.**

---

# 2. Build Context

ResponseCompass is a net-new project, separate from LOCI.

Requirements:

- do not fork, rename, or extend LOCI as Compass;
- do not copy LOCI source code wholesale;
- architectural lessons, generic patterns, prompts, libraries, and reusable components may be reused where allowed;
- keep repository history clear enough to show ResponseCompass began as a separate project.

---

# 3. Product Summary

Operational environments often already have systems that decide:

> **What needs attention first?**

Compass does not replace that logic.

Compass answers:

> **Given an issue that already needs attention, who should respond right now?**

Compass runs inside a simulated but persistent operational environment that continuously accumulates:

- equipment state;
- active issues;
- responder state;
- assignments;
- issue-response history;
- resolution outcomes;
- reopen events;
- Compass recommendations;
- human confirmations and overrides;
- operational timestamps.

Every completed event can influence future context.

---

# 4. Runtime Modes

The application must expose two runtime modes that share the same domain model and state-mutation logic.

## 4.1 Live Simulation

This is the primary showcase.

Live Simulation requires:

- persistent simulation time;
- persistent operational database;
- multiple concurrent active issues;
- contextual Event-Planning Agent;
- deterministic event-generator fallback;
- Compass Agent;
- deterministic baselines;
- human confirmation / override;
- runtime resolution engine;
- evolving history;
- live Control Room;
- Analytics tab.

## 4.2 Offline Demo

This is the deterministic test and presentation fallback.

Offline Demo requires:

- no LLM API;
- one predefined issue;
- fixed candidate state;
- fixed nearest baseline;
- fixed naive weighted baseline;
- stored Compass result fixture;
- real confirm / override mutation logic;
- exact reset.

Offline Demo must be built early enough to remain a genuine fallback, not at the end of development.

---

# 5. Shared Application Rule

Do not create two separate applications.

Both modes must reuse:

- domain models;
- database schema where practical;
- floor/control-room components;
- candidate evidence presentation;
- assignment mutation logic;
- responder/equipment rendering;
- analytics primitives;
- validation utilities.

Only the event source and Compass-response source differ.

```text
                 RESPONSECOMPASS
                       │
          ┌────────────┴────────────┐
          │                         │
      OFFLINE                    LIVE
          │                         │
 fixed event fixture      contextual event planner
 fixed Compass fixture    Compass API
          │                         │
          └────────────┬────────────┘
                       │
                 shared state model
                 shared UI
                 shared mutations
```

---

# 6. Final Live Architecture

```text
                     SIMULATION CLOCK
                            │
                            ▼
                 DETERMINISTIC SCHEDULER
                            │
                   event is now due
                            │
                            ▼
                 EVENT-PLANNING AGENT
                  (contextual proposal)
                            │
                      proposes event
                            │
                            ▼
                    BACKEND VALIDATOR
                            │
                  valid? ───┴─── invalid
                    │              │
                    ▼              ▼
             OPERATIONAL DB   deterministic
                    │         fallback generator
                    │              │
                    └──────┬───────┘
                           ▼
                  LIVE CONTROL ROOM
                           │
                 new issue needs response
                           ▼
                  CONTEXT ENGINE
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 nearest baseline    naive weighted       COMPASS
                         baseline           AGENT
        │                  │                  │
        └──────────────────┴──────────┬───────┘
                                     ▼
                           proposed assignment
                                     │
                           confirm / override
                                     │
                                     ▼
                            CANONICAL MUTATION
                                     │
                                     ▼
                              RESOLUTION ENGINE
                                     │
                                     ▼
                           OBSERVED RUNTIME HISTORY
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                    future Compass          Analytics
                       context
```

---

# 7. Hidden Simulation Truth

The simulation must not generate future outcomes from the same observed history Compass is using.

That creates circular, self-confirming evidence.

Instead, seed a hidden simulation-only truth model.

## 7.1 ResponderSkill

```text
ResponderSkill
--------------
responderId
issueClass
trueMedianMinutes
trueSuccessProbability
```

Rules:

- hidden from UI;
- never sent to Compass;
- never sent to the event-planning model;
- used only by the deterministic resolution simulator and evaluation tooling;
- represents the simulated world's latent ground truth.

Observed history is a noisy estimate of this hidden truth.

This makes Compass falsifiable: runtime outcomes can contradict its recommendation.

---

# 8. Resolution Outcome Model

Resolution outcomes must be generated from `ResponderSkill`, not from observed runtime history.

Conceptually:

```text
actualResolutionTime
=
trueMedianMinutes × boundedRandom(0.75, 1.30)
```

```text
success
=
Bernoulli(trueSuccessProbability)
```

Observed outcomes are appended to `ResolutionHistory`.

Compass sees only the resulting observed history.

The hidden truth must not leak into Compass context.

---

# 9. Why Hidden Skill Matters

Without latent skill:

```text
observed history
→ generates new outcome
→ new outcome updates observed history
```

This manufactures confidence and creates self-validation.

With latent skill:

```text
hidden truth
→ noisy outcome
→ observed history
→ Compass evidence
```

More observations now genuinely improve the estimate.

A responder may start with a misleading one-case record and later regress toward the hidden truth.

This is intentionally useful for the demo and soak tests.

---

# 10. Seed Design

Recommended seed:

- 6 equipment items;
- 6 responders;
- 3 issue classes;
- 48–72 observed historical resolution records;
- one `ResponderSkill` row per responder × issue class;
- persistent simulation timestamp;
- no requirement that the live world starts empty.

At least one responder/issue-class combination should intentionally contain a misleading small sample.

Example pattern:

```text
Observed:
1 case
100% success

Hidden trueSuccessProbability:
~0.70–0.75
```

This is the live analogue of the Chen case.

---

# 11. Persistent Simulation Clock

The simulated world has its own clock.

Example seed:

```text
2026-09-01 08:00:00
```

If the app stops at:

```text
2026-09-01 11:42:00
```

then reopening the application resumes from that same simulation timestamp.

## 11.1 No Wall-Clock Catch-Up

If the application is closed for eight real hours:

- simulation time does not advance while closed;
- no backdated events are generated;
- no catch-up burst occurs;
- the app resumes from the persisted simulation timestamp.

This simple restart behavior remains required because persistent simulation time is a direct product requirement.

Full crash-reconciliation/event-replay semantics are not required.

---

# 12. Simulation Speed

Required:

```text
1×
5×
10×
60×
Pause
Resume
```

Usage:

- `10×` is appropriate for visible live-demo operation;
- `60×` is for pre-warming and soak preparation;
- `1×` and `5×` are useful for debugging.

Changing speed must not duplicate scheduled events.

---

# 13. Deterministic Scheduler

The scheduler decides **when** an event is due.

The model does not run continuously.

Conceptually:

```text
nextEventAt = currentSimulationTime + boundedRandomDelay
```

When simulation time reaches `nextEventAt`:

```text
request next contextual event
```

Default cadence may be tuned, e.g.:

```text
8–25 simulated minutes
```

Requirements:

- one scheduled event trigger per due timestamp;
- speed changes do not duplicate firing;
- pause freezes scheduling;
- max-active-issue ceiling enforced;
- scheduler remains deterministic about timing even if event content is agent-generated.

---

# 14. Demo Timing Controls

Live stochastic behavior must never control the presentation timing.

Required visible controls:

```text
FORCE NEXT EVENT
FORCE RESOLVE
```

Suggested endpoints:

```text
POST /api/simulation/force-event
POST /api/issues/{issueId}/force-resolve
```

These controls do not bypass validation.

They instruct deterministic scheduling to execute immediately.

`FORCE RESOLVE` still generates the resolution outcome from hidden `ResponderSkill`.

---

# 15. Contextual Event-Planning Agent

The event generator remains an LLM-backed capability, but it must do more than choose a random equipment ID and issue class.

Its role is:

> **Propose the next plausible operational event in light of recent environment history.**

The agent may consider:

- current simulation time;
- equipment state;
- current active issues;
- recent notable events;
- issue recurrence counts;
- recent issue classes per equipment;
- bounded allowed issue classes;
- max-active-issue constraints;
- current operational narrative.

It may produce context-sensitive descriptions such as:

> “Recurring alignment instability on EQ-04 after two similar events earlier this shift.”

The description is narrative only. Backend logic must not parse free text to determine canonical state.

---

# 16. Event-Planning Agent Input Contract

Conceptual packet:

```json
{
  "schemaVersion": "1.0",
  "simulationTime": "2026-09-01T10:24:00",
  "equipment": [
    {"equipmentId": "EQ-01", "status": "NORMAL"}
  ],
  "activeIssues": [],
  "recentEvents": [
    {
      "eventType": "ISSUE_RESOLVED",
      "equipmentId": "EQ-04",
      "issueClass": "B"
    }
  ],
  "recentRecurrenceSummary": {
    "EQ-04:B": 2
  },
  "allowedIssueClasses": ["A", "B", "C"],
  "constraints": {
    "maxActiveIssues": 3
  }
}
```

Do not send:

- hidden `ResponderSkill`;
- complete unbounded history;
- HR attributes;
- responder performance data unless clearly necessary for event plausibility.

---

# 17. Event-Planning Agent Output Contract

Conceptual output:

```json
{
  "schemaVersion": "1.0",
  "eventType": "ISSUE_RAISED",
  "equipmentId": "EQ-04",
  "issueClass": "B",
  "description": "Recurring alignment instability detected",
  "contextReason": "Two similar events occurred recently on this equipment"
}
```

Backend validates:

- schema version;
- event type;
- equipment exists;
- issue class exists;
- equipment is eligible;
- active-issue ceiling;
- legal state transition.

The model never writes directly to the DB.

---

# 18. Deterministic Event Fallback

Live simulation should continue even if the event-planning API fails.

Implement a deterministic weighted fallback generator.

Fallback may use:

- weighted equipment selection;
- issue-class probabilities;
- recurrence weighting;
- fixed seeded RNG for reproducibility if needed.

Flow:

```text
Event-planning API fails
        ↓
weighted deterministic fallback
        ↓
backend validation
        ↓
valid event persisted
```

The fallback should not require an LLM.

---

# 19. Multi-Issue Model

Live mode supports:

```text
0..N active issues
```

Recommended demo ceiling:

```text
maxActiveIssues = 3
```

Compass does **not** perform global workforce optimization.

Each issue is evaluated independently using state at decision time.

Example:

```text
Issue A raised
→ Priya assigned

Issue B raised
→ Priya now ASSIGNED
→ Priya excluded
→ Compass sees updated candidate set
```

If asked why Compass does not globally optimize all open issues:

> Global scheduling is explicitly outside scope. Each dispatch decision is made against the current canonical state, which keeps the product focused and mirrors a practical sequential dispatch workflow.

---

# 20. Issue / Responder Concurrency Rules

Deterministic backend rules:

- a responder cannot be assigned to two active issues;
- an `ASSIGNED` responder is excluded from new candidate sets;
- an `UNAVAILABLE` responder is excluded;
- one equipment item may not receive another unresolved issue unless explicitly enabled later;
- agent-proposed invalid events are rejected;
- recommendation is revalidated at confirmation time.

---

# 21. No Eligible Responder Behavior

If an issue has no eligible responders:

- issue remains `PENDING`;
- downtime continues;
- Compass is not called with an empty candidate set;
- UI shows:

```text
Waiting for an available responder
```

When responder availability changes, the backend reevaluates pending issues.

---

# 22. Issue Lifecycle

Required statuses:

```text
PENDING
RECOMMENDATION_READY
ASSIGNED
RESOLVED
```

A failed resolution does not become a permanently resolved issue.

It transitions through the reopen path.

---

# 23. Reopen / Failed Resolution Path

Reopen is P0 because it demonstrates runtime evidence feeding back into future decisions.

Flow:

```text
Issue assigned
    ↓
resolution attempt completes
    ↓
SUCCESS? ───── yes ───→ RESOLVED
    │
    no
    ▼
failed ResolutionHistory record appended
reopened = true
RESPONDER freed
issue returns to PENDING
original downtime interval remains open
Compass re-runs when eligible responders exist
```

Persist event:

```text
ISSUE_REOPENED
```

The failed attempt becomes part of future observed history.

---

# 24. Equipment Status / Downtime

MVP equipment status:

```text
NORMAL
ISSUE_ACTIVE
```

Definitions:

```text
UPTIME
simulation time equipment is NORMAL

DOWNTIME
simulation time equipment has an unresolved ISSUE_ACTIVE
```

Downtime begins at first `ISSUE_RAISED` and ends only on final successful `ISSUE_RESOLVED`.

A failed resolution/reopen does not reset the downtime start.

---

# 25. Open Downtime Intervals

Analytics must distinguish completed downtime intervals from currently open ones.

For completed statistics:

- median downtime uses only completed intervals;
- success/reopen analytics use completed attempts as defined.

For currently active equipment:

- show current ongoing downtime separately;
- calculate using one query snapshot timestamp.

Do not mix a partial open interval into completed median downtime.

---

# 26. Compass Context Engine

For each issue needing assignment, deterministic code computes:

- eligible responders;
- distance;
- travel time;
- same-issue observed historical count;
- observed median resolution time;
- observed success rate;
- observed reopen rate;
- evidence-strength label;
- nearest baseline;
- naive weighted baseline.

The engine uses:

```text
seed observed history + all valid runtime observed history
```

It never uses hidden `ResponderSkill`.

---

# 27. Evidence Strength

Mandatory deterministic label:

```text
0 records    → NONE
1–2 records  → WEAK
3–5 records  → MODERATE
6+ records   → STRONG
```

Zero-history responders remain valid candidates.

Compass must not interpret “no history” as “bad responder.”

---

# 28. Compass Candidate Packet

Required fields:

```text
responderId
displayName
distanceToIssue
travelTimeMinutes
sameIssueHistoricalCount
medianResolutionMinutes
successRate
reopenRate
evidenceStrengthLabel
```

Do not send:

```text
availability
x
y
ResponderSkill
```

The packet must remain bounded regardless of history growth.

---

# 29. Compass Agent Role

Compass may:

- compare eligible responders;
- weigh proximity/travel;
- compare issue-specific observed performance;
- consider sample strength;
- recognize misleading thin evidence;
- rank candidates;
- explain tradeoffs;
- express qualitative uncertainty.

Compass must not:

- add candidates;
- invent metrics;
- alter issue priority;
- access latent skill;
- modify DB state;
- claim assignment completed before backend mutation succeeds.

---

# 30. Compass Output Contract

Required conceptual schema:

```text
schemaVersion
recommendationRequestId

rankedCandidates[]
    rank
    responderId
    recommendationSummary
    evidenceReferences[]
    tradeoff
        comparedToResponderId
        explanation

topRecommendation
    responderId
    rationale

uncertaintyNote
```

Rules:

- no model-generated numeric confidence;
- rank-1 must compare itself against at least one meaningful alternative;
- generated prose should remain qualitative;
- UI renders authoritative numbers from deterministic state.

---

# 31. Deterministic Baselines

## 31.1 Nearest Available

Simple proximity heuristic.

## 31.2 Naive Weighted Score

A documented deterministic score using:

- travel/proximity;
- observed median resolution time;
- observed success rate;

and intentionally **not** adjusting for evidence strength.

Persist the baseline formula/version/weights with the recommendation audit record so the comparison can be reconstructed.

The baseline is a comparator, not a strawman claimed to represent optimal dispatch.

Plain-language explanation:

> Nearest-available represents a common informal heuristic. The naive score is a stronger deterministic comparator. More sophisticated deterministic models are absolutely possible; Compass is not claimed to be mathematically necessary.

---

# 32. Human Assignment Flow

Compass prepares a pre-filled assignment.

Buttons:

```text
CONFIRM ASSIGNMENT — <recommended responder>
CHOOSE SOMEONE ELSE
```

Before mutation:

- backend revalidates responder eligibility;
- recommendation timestamp/request is checked;
- stale client state cannot override current backend truth.

If stale:

```text
Recommended responder is no longer available.
Re-run Compass.
```

No assignment occurs.

---

# 33. Canonical Assignment Mutation

On successful confirmation:

```text
issue.assignedResponderId = responderId
issue.status = ASSIGNED
responder.availability = ASSIGNED
responder.currentIssueId = issueId
assignment.createdAt = currentSimulationTime
```

Persist:

```text
RESPONDER_ASSIGNED
```

UI may say “assigned” only after backend success.

---

# 34. Operational Event Log

Persist a chronological audit/event stream.

```text
OperationalEvent
----------------
id
simulationTimestamp
eventType
equipmentId?
issueId?
responderId?
source
payload
createdAtRealTime
```

Supported P0 event types:

```text
ISSUE_RAISED
RESPONDER_ASSIGNED
ASSIGNMENT_OVERRIDDEN
ISSUE_RESOLVED
ISSUE_REOPENED
SIMULATION_STARTED
SIMULATION_PAUSED
SIMULATION_RESUMED
```

The event log is **not** the source used to reconstruct current state.

Current state remains in normal domain tables.

---

# 35. Core Persistence Tables

Required:

```text
SimulationState
Equipment
Responder
ResponderSkill
Issue
Assignment
ResolutionHistory
Recommendation
OperationalEvent
```

Optional:

```text
SimulationConfig
```

Document deliberate denormalization between `Assignment` and `ResolutionHistory` rather than attempting to collapse them.

Recommended index:

```text
ResolutionHistory(responderId, issueClass)
```

because Compass context builds repeatedly query this pair.

---

# 36. Live Control Room UI

Primary tab:

# **LIVE CONTROL ROOM**

Must show:

- simulation date/time;
- simulation speed;
- pause/resume;
- Force Next Event;
- equipment layout;
- equipment status;
- responders;
- responder availability;
- active issues;
- waiting issues;
- current assignments;
- nearest baseline;
- naive weighted baseline;
- Compass recommendation;
- confirm/override controls;
- recent event feed;
- visible disagreement marker when Compass differs from a baseline.

---

# 37. Event Feed

Example:

```text
10:24  EQ-04 raised Class B issue
10:25  ⚡ Compass differs from naive score
       Naive → Chen | Compass → Priya
10:26  Priya assigned to EQ-04
10:37  EQ-04 resolution failed; issue reopened
10:38  Compass reassessing EQ-04 with updated history
10:41  EQ-02 raised Class A issue
```

The disagreement marker is P0.

It gives the presenter a naturally occurring moment to point at.

---

# 38. Analytics Tab — P0 Scope

Analytics is a derived view of the same DB.

Do not create a separate analytics dataset.

P0 includes only the most useful views.

## 38.1 Equipment

Per equipment:

- uptime %;
- completed downtime median;
- current ongoing downtime if active;
- issue count;
- current status.

## 38.2 Issues

- issue count by class;
- issue count by equipment;
- active vs resolved count;
- reopen count/rate with denominator.

## 38.3 Responder Issue-Response Summary

Per responder:

- issues attended;
- successful resolutions;
- success rate **with denominator**;
- median resolution time;
- reopen count/rate **with denominator**;
- current status;
- current assignment.

## 38.4 Issue-Class Experience Matrix

Label:

> **Issue-Class Experience**

Display:

```text
cases / median resolution
```

Rules:

- responders sorted alphabetically or by stable ID;
- never sort by performance;
- no red/green performance heatmap;
- sample count has equal or greater visual emphasis than median;
- no overall employee ranking.

## 38.5 Compass vs Baselines

Show current-run counts/rates:

- total Compass recommendations;
- agreement with nearest;
- agreement with naive score;
- disagreement with naive score;
- disagreement with both;
- evidence-strength-driven disagreement count.

This is a primary demo analytics panel.

---

# 39. Analytics Sample-Size Safeguard

Every displayed rate must show its denominator.

For `n < 3`:

- grey/suppress the rate; or
- show:

```text
Insufficient data (n=1)
```

Do not prominently display `100%` or `0%` based on one observation.

This is the same evidence-quality discipline Compass applies internally.

---

# 40. Analytics P1

Move the following out of P0:

- time filters;
- detailed issue timeline page;
- multiple time-series charts;
- average alongside median where redundant;
- rich audit viewer;
- complex drill-downs.

These may be added after P0 freeze.

---

# 41. Frontend Update Mechanism

Use simple polling unless the existing implementation strongly favors another approach.

Recommended:

```text
GET /api/state every 1–2 seconds
GET /api/analytics every 1–2 seconds while Analytics is visible
```

Reason:

- tiny state payload;
- 6 equipment;
- 6 responders;
- ≤3 active issues;
- simpler reconnect behavior;
- lower demo risk than WebSocket/SSE.

Snapshot one simulation timestamp per analytics query so metrics do not disagree while the clock advances mid-query.

---

# 42. Suggested API Surface

```text
GET  /api/state
GET  /api/issues
GET  /api/responders
GET  /api/events
GET  /api/analytics

POST /api/simulation/start
POST /api/simulation/pause
POST /api/simulation/resume
POST /api/simulation/reset
POST /api/simulation/force-event
POST /api/issues/{id}/force-resolve

POST /api/compass/recommend

POST /api/assignments/confirm
POST /api/assignments/override

GET  /api/offline/scenario
POST /api/offline/reset
```

Exact names may adapt to the existing repository.

---

# 43. Offline Demo Contract

Offline mode remains deterministic and API-free.

Reference behavior:

```text
one predefined issue
nearest baseline → Alex
naive weighted baseline → Chen
stored Compass fixture → Priya
```

Offline must exercise real:

- candidate display;
- confirm assignment;
- override;
- mutation;
- stale protection where testable;
- reset.

Offline mode is a fallback during live demonstrations; it should not consume live-demo time unless needed.

---

# 44. Live Disagreement Instrumentation

For every Compass recommendation, record:

```text
nearestWinner
naiveWinner
compassWinner
nearestAgreement
naiveAgreement
primaryTradeoffDimension
```

Track whether evidence strength materially drove a disagreement.

The event feed must flag live disagreement.

---

# 45. Soak / Seed-Tuning Gate

Before demo freeze, run an evaluation across at least:

```text
100 simulated recommendation opportunities
```

Acceptance target:

```text
Compass differs from naive baseline on ≥25% of cases
```

and:

```text
≥10% of Compass-vs-naive disagreements
explicitly involve evidence strength / sample quality
as a primary reason
```

If below target:

- do not weaken the model prompt just to force divergence;
- retune seed observed history and hidden skill distributions;
- preserve plausible behavior.

This is a seed-quality test, not a runtime hack.

---

# 46. Latent-Skill Validation

Add an offline/statistical test showing that observed estimates are capable of converging toward hidden skill with more independent observations.

Example requirement:

- choose a responder/issue pair with misleading initial observed history;
- simulate many outcomes from latent truth;
- verify observed median/success estimate moves toward the true parameter within reasonable tolerance.

This test is for engineering validation.

Do **not** expose hidden skill as a normal production dashboard metric.

---

# 47. Resolution Narrative

A separate LLM call for every resolution is not P0.

If a narrative is useful:

- generate lazily;
- batch it;
- or derive a deterministic sentence from the numeric outcome.

Numeric resolution outcome always comes from deterministic latent-skill simulation.

---

# 48. Agent Failure Behavior

## 48.1 Event-Planning Agent Failure

- no state corruption;
- deterministic weighted fallback generates a valid candidate event;
- world may continue.

## 48.2 Compass Agent Failure

Show:

```text
Compass recommendation unavailable.
```

Still show:

- nearest baseline;
- naive weighted baseline;
- eligible responders.

Human may manually choose a responder.

Offline mode remains the full no-API fallback.

---

# 49. Security / Data Boundary

Requirements:

- LLM keys server-side only;
- no secrets in frontend;
- no arbitrary shell/tool access from agents;
- structured outputs;
- backend validation before mutation;
- only synthetic public data;
- no proprietary company data.

Never include:

- real employee names;
- real company names;
- real facility maps;
- real equipment IDs;
- real maintenance/failure history;
- customer data;
- proprietary priority logic;
- production credentials.

---

# 50. Personnel / Ethics Boundary

Compass evaluates **issue-specific response evidence**, not general employee worth.

Explicitly excluded:

- compensation;
- seniority;
- personality;
- biometrics;
- fatigue;
- demographic attributes;
- disciplinary information;
- HR reviews;
- universal employee scores.

A responder with no history remains a valid candidate.

Plain-language answer:

> Compass discounts thin evidence rather than penalizing the person it belongs to. It evaluates evidence for one operational response decision, not a general employee score.

---

# 51. Work Breakdown Structure

## WP0 — Current Repo Assessment / Spec Alignment

- inspect existing implementation;
- map working features to v4;
- preserve functioning behavior;
- identify migrations;
- choose final stack based on current repo, not theoretical preference.

**Acceptance:** gap list and implementation plan exist before architectural rewrite.

---

## WP1 — Schema / Fixtures / Hidden Skill

- finalize persistent schema;
- add `ResponderSkill`;
- add/confirm event log;
- persist naive baseline configuration/version;
- add indexes;
- commit fixtures:
  - offline scenario;
  - Compass candidate packet;
  - Compass result;
  - event-planner input/output;
  - analytics response.

**Acceptance:** fixtures validate and frontend/backend teams can work independently.

---

## WP2 — Simulation Clock / State

- persistent simulation timestamp;
- 1×/5×/10×/60×;
- pause/resume;
- no wall-clock catch-up;
- persistent next event timestamp.

**Acceptance:** restart resumes from stored simulation timestamp without generating missed events.

---

## WP3 — Scheduler / Demo Controls

- bounded event cadence;
- speed-change correctness;
- Force Next Event;
- Force Resolve;
- active-issue ceiling.

**Acceptance:** no duplicate event firing across repeated speed changes and force controls.

---

## WP4 — Event Planner + Fallback

- contextual LLM event planner;
- bounded contract;
- validator;
- deterministic weighted fallback;
- recent-context narrative generation.

**Acceptance:** invalid model outputs cannot persist; simulated world continues after forced API failure.

---

## WP5 — Multi-Issue State

- ≥2 concurrent issues;
- max 3 by default;
- responder exclusivity;
- pending/no-responder behavior;
- stale confirmation protection.

**Acceptance:** assigning one issue changes the candidate set for another.

---

## WP6 — Resolution / Reopen Engine

- latent-skill outcome generation;
- resolution timing;
- success/failure;
- failed attempt history;
- reopen flow;
- responder release;
- final resolution.

**Acceptance:** failed attempt changes future observed Compass evidence.

---

## WP7 — Live Compass Context

- aggregate seed + runtime observed history;
- candidate filter;
- evidence strength;
- both baselines;
- bounded packet.

**Acceptance:** hidden `ResponderSkill` never appears in the Compass packet.

---

## WP8 — Compass Agent

- structured output;
- ID/schema validation;
- qualitative rationale;
- audit persistence;
- failure fallback.

**Acceptance:** all displayed numeric evidence resolves from deterministic application state.

---

## WP9 — Assignment Workflow

- confirm;
- override;
- revalidation;
- mutation;
- operational events.

**Acceptance:** stale responder cannot be assigned.

---

## WP10 — Live Control Room UI

- clock;
- speed;
- force controls;
- floor;
- responders;
- issues;
- recommendations;
- event feed;
- disagreement marker.

**Acceptance:** live control room visibly changes without manual scenario reset.

---

## WP11 — Analytics Backend

P0 queries only:

- equipment uptime/current downtime;
- completed downtime median;
- issue counts;
- responder summaries;
- issue-class experience matrix;
- Compass-vs-baselines metrics.

**Acceptance:** results reproducible from DB rows at a fixed query snapshot timestamp.

---

## WP12 — Analytics UI

- KPI summaries;
- equipment panel;
- issue counts;
- responder detail/summary;
- Issue-Class Experience matrix;
- Compass vs Baselines panel;
- insufficient-data handling.

**Acceptance:** runtime resolution changes at least one visible analytics value without restart.

---

## WP13 — Offline Demo

Build/confirm early, not last.

- API-free fixture path;
- real assignment mutation;
- reset;
- deterministic Alex/Chen/Priya scenario.

**Acceptance:** works with all LLM credentials removed/unavailable.

---

## WP14 — Reliability / Evaluation

- 100-case disagreement evaluation;
- latent-skill convergence test;
- speed-change duplicate-firing tests;
- race/stale tests;
- no-eligible-responder tests;
- API failure tests;
- analytics consistency;
- live soak.

---

## WP15 — Documentation / Demo Package

- README;
- architecture diagram;
- exact live demo script;
- offline fallback instructions;
- public repo review;
- screenshots/video.

---

# 52. Parallel Team Work

The project should be easy to split if teammates join.

## Critical backend path

```text
WP1 → WP2 → WP3
```

## Parallel after WP1

```text
WP4 Event Planner
WP6 Resolution Engine
WP11 Analytics Backend
```

## UI parcels against fixtures

```text
WP10 Live Control Room
WP12 Analytics UI
WP13 Offline Demo
```

## Presentation parcel

```text
WP15 README / diagrams / video
```

No teammate should need to understand the full backend before contributing.

---

# 53. P0 Scope

P0 now includes:

1. schema + hidden `ResponderSkill`;
2. persistent simulation clock with no catch-up;
3. deterministic scheduler;
4. 1×/5×/10×/60×;
5. Force Next Event;
6. Force Resolve;
7. contextual event-planning agent;
8. deterministic event fallback;
9. multi-issue state;
10. no-eligible-responder waiting behavior;
11. latent-skill resolution engine;
12. failed resolution / reopen path;
13. persistent runtime observed history;
14. Compass live context;
15. nearest baseline;
16. naive weighted baseline + persisted config;
17. Compass Agent;
18. confirm / override;
19. stale revalidation;
20. event feed + disagreement marker;
21. trimmed P0 Analytics;
22. denominator / insufficient-data safeguards;
23. Compass-vs-baselines analytics;
24. Offline Demo;
25. disagreement instrumentation;
26. evaluation / soak tests;
27. public-safe repository.

---

# 54. P1

- detailed time filters;
- time-series charts;
- rich event timeline;
- audit viewer UI;
- extra issue classes;
- extra floor layouts;
- elaborate resolution narratives;
- advanced restart reconciliation;
- simulated breaks/shift-change availability events;
- richer chart styling.

---

# 55. Out of Scope

- global workforce optimization;
- predictive maintenance;
- real sensors;
- real employee data;
- real production data;
- multi-site orchestration;
- universal personnel ranking;
- route-aware indoor navigation;
- long-term model training;
- vector DB / embeddings;
- generic operations chatbot;
- autonomous assignment without human confirmation.

---

# 56. Deterministic Test Matrix

## Simulation clock

- pause freezes time;
- speed change preserves ordering;
- restart resumes stored simulation timestamp;
- no wall-clock catch-up.

## Scheduler

- no event before due time;
- exactly one event at due time;
- Force Event fires once;
- changing 1×→10×→60× does not duplicate a pending event.

## Event planner

- unknown equipment rejected;
- invalid class rejected;
- duplicate unresolved equipment issue rejected;
- malformed output rejected;
- API failure invokes deterministic fallback.

## Multi-issue

- two simultaneous issues supported;
- assigned responder excluded from second issue;
- no eligible responder → `PENDING`/waiting;
- stale recommendation cannot assign.

## Resolution

- outcome drawn from hidden skill;
- observed history appended;
- hidden skill unchanged;
- success resolves;
- failure reopens;
- responder released after attempt;
- downtime stays open through reopen.

## Compass

- hidden skill absent from packet;
- only eligible responders present;
- runtime history included;
- both baselines present;
- schema-valid result only.

## Analytics

- uptime correct;
- open downtime shown separately;
- median downtime excludes open interval;
- rates include denominator;
- `n < 3` suppressed/marked insufficient;
- experience matrix not performance-sorted;
- disagreement metrics correct.

## Offline

- no API required;
- fixed scenario stable;
- confirm/override real;
- exact reset.

---

# 57. Race-Condition Tests

Explicitly test:

1. Issue A and Issue B recommend the same responder.
2. Issue A is confirmed first.
3. Issue B client still displays the old recommendation.
4. User confirms Issue B.
5. Backend revalidation rejects the stale responder.
6. UI requires a rerun.

Client-side cached recommendation state must never bypass backend truth.

---

# 58. Soak Test

Before demo freeze:

```text
60× for pre-warm / seed tuning
10× for presentation-like soak
```

Run enough accelerated simulation to evaluate at least 100 recommendation opportunities.

Monitor:

- event storms;
- duplicate events;
- timer drift;
- issue ceiling;
- assignment races;
- resolution completion;
- reopen loop;
- DB growth;
- agent API error rate;
- API cost/rate limit;
- disagreement rate;
- analytics consistency.

---

# 59. Demo Readiness Gates

The live demo is not ready until:

- pre-warmed state exists;
- at least one active issue can be shown immediately;
- Force Next Event works;
- Force Resolve works;
- event feed is populated;
- disagreement marker is visible when applicable;
- candidate set changes after assignment;
- Analytics visibly changes after a resolution;
- Offline mode can be opened in under 30 seconds;
- live script completes in ≤2 minutes without developer intervention.

---

# 60. Two-Minute Live Demo Script

## 0:00–0:20 — Enter a world already running

Show:

- persistent simulation time;
- accumulated event feed;
- meaningful existing history;
- one active issue or a pre-warmed state.

Narration:

> This isn't a reset scenario. The simulated floor has been running and everything that happened is already part of the context.

## 0:20–0:45 — Force a new event

Click:

```text
Force Next Event
```

Show:

- issue appears;
- deterministic baselines;
- Compass recommendation.

## 0:45–1:08 — Explain the disagreement

Point to:

- nearest choice;
- naive weighted choice;
- Compass choice;
- evidence strength/sample size.

If this event does not produce a disagreement, point to a recent disagreement in the event feed and use the current recommendation only as a live-state example.

## 1:08–1:25 — Confirm

Click:

```text
Confirm assignment — <responder>
```

Show responder becomes `ASSIGNED`.

## 1:25–1:40 — Context changes immediately

Force/allow another issue.

Show that the assigned responder is absent from the new candidate set.

Narration:

> The next decision is already different because the environment changed.

## 1:40–2:00 — Analytics payoff

Force Resolve if necessary.

Switch to Analytics.

Point to **one visible delta** caused by what the audience just watched:

- issue count;
- downtime;
- responder sample count;
- Compass-vs-baseline metric.

Close:

> The important part is not a single recommendation. The environment remembers what happened, and the next decision is made with that new context.

---

# 61. Offline Fallback Script

Do not demonstrate Offline unless Live fails.

Fallback process:

1. switch mode to Offline Demo;
2. load predefined issue;
3. show nearest = Alex;
4. show naive = Chen;
5. show Compass fixture = Priya;
6. confirm or override;
7. show real state mutation.

Mention in README and, if useful, one sentence during closing:

> We also keep an API-free deterministic mode for regression and presentation fallback.

---

# 62. Risk Register

## Risk 1 — Circular simulated evidence

**Mitigation:** hidden `ResponderSkill`; outcomes never generated from observed medians.

## Risk 2 — Live demo has no interesting disagreement

**Mitigation:** disagreement instrumentation, 100-case threshold, tuned seed/latent distributions, event-feed disagreement markers.

## Risk 3 — Stochastic timing ruins two-minute demo

**Mitigation:** Force Next Event, Force Resolve, pre-warmed persistent world, exact timed script.

## Risk 4 — Event planner is perceived as random-choice theater

**Mitigation:** contextual recent-event input, recurrence-aware narrative planning, deterministic weighted fallback, avoid claiming two agents merely for count.

## Risk 5 — Model chooses an unexpected responder live

**Mitigation:** human override remains authoritative; do not fake output; use disagreement history or Offline fallback if necessary.

## Risk 6 — Event-planner API unavailable

**Mitigation:** deterministic weighted fallback keeps live world moving.

## Risk 7 — Compass API unavailable

**Mitigation:** baselines remain available; manual assignment remains possible; Offline Demo available.

## Risk 8 — Timer storm after speed change

**Mitigation:** unique due-event token/idempotency; explicit tests across speed transitions.

## Risk 9 — Recommendation-confirmation race

**Mitigation:** server-side revalidation immediately before mutation.

## Risk 10 — Misleading analytics from thin samples

**Mitigation:** always show `n`; `n < 3` suppressed/insufficient; no performance heatmap.

## Risk 11 — Personnel dashboard appears to rank employees

**Mitigation:** Issue-Class Experience framing, alphabetical sort, no global score, no HR data.

## Risk 12 — Analytics changes while query executes

**Mitigation:** snapshot simulation timestamp per analytics query.

## Risk 13 — Excess API cost during soak

**Mitigation:** one event-planner call per due event, no mandatory resolution-narrative call, configurable soak speed/cadence, monitor request count.

## Risk 14 — Public repo leaks proprietary context

**Mitigation:** synthetic-only data and public-safe review.

## Risk 15 — P0 expansion threatens reliability

**Mitigation:** trimmed Analytics, no global optimization, no rich timelines, freeze after DoD.

---

# 63. Frequently Asked Questions

## Why an agent for Compass?

> Compass interprets bounded, current operational evidence and explains a responder tradeoff. Deterministic code owns facts, baselines, and assignment state.

## Why not a weighted score?

> A weighted score is a valid engineering alternative. Compass does not claim an LLM is mathematically necessary. We show deterministic baselines beside it and use Compass as an explainable contextual judgment layer.

## Why keep an event-planning model?

> Code decides when an event is due and validates every state change. The model proposes context-aware scenario evolution using recent environment history, while a deterministic generator remains available as fallback.

## Why multiple active issues but no global scheduler?

> Each dispatch decision is evaluated against the state that exists at that moment. Global workforce optimization is a different problem and deliberately outside this build.

## Is this employee scoring?

> No. The application evaluates issue-specific observed evidence for one response decision. It never creates a general employee score and explicitly excludes HR, demographic, compensation, personality, and biometric data.

## How do you know simulated history is meaningful?

> The simulator has hidden per-responder/per-issue ground-truth parameters that Compass cannot see. Runtime outcomes are sampled from that truth, so observed history can improve, regress, or contradict prior estimates instead of merely echoing them.

---

# 64. README Requirements

README must include:

- product summary;
- Live vs Offline modes;
- architecture diagram;
- deterministic/agent boundary;
- hidden simulation-truth explanation;
- setup;
- API configuration;
- demo controls;
- Offline fallback;
- public synthetic-data statement;
- ethics boundary;
- how to run the two-minute demo.

---

# 65. Recommended Repository Structure

```text
responsecompass/
│
├── README.md
├── AGENTS.md
├── .env.example
├── docs/
│   ├── SOW.md
│   ├── architecture.md
│   ├── decisions.md
│   └── evaluation.md
│
├── frontend/
├── backend/
├── data/
│   └── seed/
├── fixtures/
│   ├── offline-scenario.json
│   ├── compass-candidate-packet.json
│   ├── compass-result.json
│   ├── event-planner-input.json
│   ├── event-planner-output.json
│   └── analytics-response.json
└── tests/
```

Adapt to the current repository rather than rewriting a sound existing structure.

---

# 66. AGENTS.md Rules for Coding Agent

The coding agent must be told:

1. Read `docs/SOW.md` first.
2. Inspect the existing implementation before changing architecture.
3. Preserve working behavior unless the SOW requires replacement.
4. Treat `ResponderSkill` as hidden simulation truth.
5. Never expose latent skill to Compass or normal UI.
6. Agents never mutate canonical state directly.
7. Backend validates all proposed events and assignments.
8. Offline mode must remain API-free.
9. Do not add global workforce scheduling.
10. Do not add employee ranking.
11. Implement P0 before P1.
12. Run regression tests after each major work package.
13. Record material deviations in `docs/decisions.md`.
14. Freeze architecture once Definition of Done passes.

---

# 67. Change Control

Any proposed feature must answer:

1. Does it strengthen the live-control-room story?
2. Does it strengthen evolving context?
3. Does it improve reliability or operator clarity?
4. Is it required by P0?
5. Can it be added without risking Offline fallback?

If not:

> defer.

---

# 68. Definition of Done

The project is complete when:

1. Live and Offline modes both exist.
2. Offline works with LLM APIs unavailable.
3. Live simulation time persists and resumes without wall-clock catch-up.
4. Scheduler runs without duplicate events across speed changes.
5. Force Next Event works.
6. Force Resolve works.
7. Contextual event planner works.
8. Deterministic event fallback works.
9. Backend rejects illegal events.
10. Multiple active issues are supported.
11. Assigned responders are excluded from other candidate sets.
12. No-eligible-responder issues wait safely.
13. Hidden `ResponderSkill` exists for every responder × issue class.
14. Resolution outcomes come from latent skill, not observed history.
15. Failed attempts append observed history and reopen correctly.
16. Future Compass context includes new runtime observed history.
17. Compass never receives hidden skill.
18. Nearest baseline works.
19. Naive weighted baseline works and its config is auditable.
20. Compass Agent returns validated bounded output.
21. Confirm/override mutate canonical state.
22. Stale confirmation is rejected.
23. Event feed shows ongoing state changes.
24. Event feed marks Compass/baseline disagreement.
25. P0 Analytics exists.
26. Analytics show denominators.
27. `n < 3` rates are suppressed/marked insufficient.
28. Issue-Class Experience is not performance-ranked.
29. Compass-vs-baselines panel exists.
30. 100-case disagreement evaluation meets the agreed threshold or seed tuning is explicitly revisited.
31. Latent-skill convergence test passes.
32. Live soak shows no event storm/state corruption.
33. A two-minute live demo completes without developer intervention.
34. Offline fallback can be opened in under 30 seconds.
35. Public repository contains only synthetic/public-safe data.

Once these conditions pass:

> **Freeze the core.**

---

# 69. Final Product Contract

```text
The simulated environment already has history.

Its clock continues.

The scheduler decides an event is due.

The event-planning agent proposes what happens next.

The backend validates it.

The control room changes.

A new issue needs a responder.

Deterministic code builds grounded evidence.

Nearest says one person.

A fixed weighted score may say another.

Compass interprets the current evidence and recommends.

The supervisor confirms or overrides.

The backend mutates the assignment.

The resolution engine samples an outcome from hidden simulation truth.

That observed outcome is stored.

The dashboards update.

The next Compass decision uses what the environment has now learned.
```

---

# 70. Final Build Principle

> **Compass should feel like a live control room, not a scripted AI demo.**

And:

> **The environment remembers. The agent reasons over what the environment now knows.**
