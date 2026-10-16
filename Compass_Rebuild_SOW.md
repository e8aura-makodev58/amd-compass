# ResponseCompass — Rebuild Statement of Work

**Purpose:** Define a standalone, production-oriented specification for rebuilding ResponseCompass: a synthetic operational-control-room simulation that dispatches responders to equipment issues, maintains auditable operational state, and exposes safe operator views.

**Usage note:** Use this SOW with independent agents to develop ResponseCompass from scratch, without relying on an existing codebase. Compare the resulting designs, behavior, verification evidence, and tradeoffs against one another to evaluate how faithfully each rebuild satisfies the specification.

## 1. Product and scope

ResponseCompass shall provide independently selectable manufacturing **Control Rooms** in one deployment. A Control Room is a complete simulated operating environment with its own equipment, personnel, issues, assignments, history, clock, scenario policy, deterministic random state, and audit data.

ResponseCompass shall support bounded queue dispatch, shift continuity, handover, surge staffing, recurring temporary repairs, contextual responder assignment, and drill-down analytics. It shall use synthetic, domain-neutral data only. It shall not connect to real machinery, personnel, payroll, scheduling, or production systems.

The product answers two application-owned questions in order:

1. Which actionable unresolved issue should receive available capacity next?
2. For that issue, which eligible responder is the best fit?

This is bounded operational dispatch, not enterprise-wide mathematical workforce optimization or automated real-world scheduling.

## 2. Non-negotiable boundaries

- Application code owns facts, eligibility, queue priority, calendars, staffing, metrics, baselines, simulation timing, random draws, outcomes, validation, and every state mutation.
- A model may only propose one bounded operational event or rank an application-supplied eligible candidate set with qualitative tradeoffs. It may not create canonical facts, set priority, select staffing, alter a shift, choose overtime, mutate state, or invoke tools.
- `ResponderSkill` is hidden simulation truth. It shall never appear in browser/API payloads, analytics, event-planner input, Compass input, audit prose, priority logic, staffing logic, or any responder-specific observable.
- Priority shall use only deterministic issue facts. Neither priority nor staffing may use responder-specific outcome records, hidden skill, or any signal shaped by responder identity.
- Model output is untrusted. The backend shall schema-validate, constrain, and persist only valid application-owned transitions.
- Live and Offline are shared domain paths, not separate applications. Offline must make zero provider calls.
- LLM credentials remain server-side. Public data shall contain no real people, organizations, facilities, equipment facts, maintenance history, customer data, proprietary rules, or credentials. Synthetic maps and synthetic operational facts are required.

## 3. Runtime and tenancy

### 3.1 Control Rooms

The initial room registry shall expose `plant-1` (Plant #1) and `plant-2` (Plant #2). The operator experience shall provide a room picker before entering a room and a room-identity navigation contract that preserves the selected room on reload or direct navigation. A Control Room Management area shall let an operator select another room and rename its display name without changing its stable ID.

Room state is canonical server state shared by all viewers of the same room. Browsers may view different rooms simultaneously. A room-scoped mutation shall use revision/conflict protection; polling and another viewer’s mutation must never silently overwrite an operator’s action.

Each room shall have separate state, audit history, hidden truth, random streams, and simulation clock. Identical entity IDs in different rooms are valid. Provider settings and deployment-level application logs are shared. No room-scoped fact may leak across rooms.

The process shall own one scheduler interval. It shall dispatch room ticks concurrently; a slow or failed room tick must not delay another room. A per-room re-entry guard prevents overlapping ticks for that room.

Each room shall report `READY` or `FAILED` independently. `READY` rooms separately report `RUNNING` or `PAUSED`; a failed room has no clock state. A failed room must be visible as unavailable and must not make other rooms unavailable.

### 3.2 Persistence and lifecycle

Persist canonical state atomically with serialized read-modify-write operations. State shall include versioned schema and policy data, simulation time, random-stream state, equipment, responders, assignments, attempts, issues, historical outcomes, events, recommendations, calendar state, deferred demand, and scenario/audit state.

On restart, simulation resumes at the stored simulated timestamp. It must not advance while stopped and must not create wall-clock catch-up events. Startup reconciliation shall preserve valid state, repair only explicitly defined derived state, and isolate an unresolvable room as `FAILED` rather than guessing or discarding facts.

## 4. Simulation model

### 4.1 Equipment, issues, and lifecycle

Seed a manufacturing floor with stations/equipment across multiple floors and public coordinates. Equipment is `NORMAL` or `ISSUE_ACTIVE`. An unresolved issue opens downtime; downtime ends only after a final successful resolution. Failed attempts and reopen events do not reset the original downtime interval.

An issue lifecycle shall support at least queued/pending work, recommendation or offer pending, assigned work, resolved work, failed/reopened work, and queued handover/replan obligations. Normal event validation shall prevent a second unresolved issue at the same station. Any multiple-active-issue station behavior is a defensive rendering fallback, not a normal generation policy.

Active rosters permit at most one PRIMARY and one SUPPORT simultaneously. A responder cannot have concurrent active assignments. A resolution record shall retain all unique lifetime contributors to that attempt; this historical contributor list has no artificial maximum.

When a responder moves because of assignment, assistance, transfer, release, resolution, handover, or reconciliation, their canonical location changes once at that event snapshot. Active responders shall render adjacent to the assigned station at deterministic, non-overlapping offsets; released responders return to a persisted duty station. Every real move records a public `RESPONDER_MOVED` event. ResponseCompass shall not fabricate continuous or per-second tracking.

### 4.2 Hidden truth and outcomes

For every responder and issue class, persist hidden `ResponderSkill` values for true median resolution duration and true success probability. The resolution engine shall use hidden truth plus bounded, persisted deterministic random draws to produce duration and success/failure. Observed outcomes, not hidden truth, become future application-visible evidence.

Observed history must remain capable of disagreeing with hidden truth at small sample sizes and converging only across independent observations. Hidden values remain immutable except for reproducible provisioning of newly created synthetic responders.

A resolution attempt may succeed, fail and reopen through the normal pending path, or be a temporary repair. Force Resolve shall bypass only waiting for the due time; it must consume the same one-shot resolution trigger and use the same outcome logic. It must not guarantee success.

Temporary repairs shall create one dedicated, deterministic recurrence window 30–90 simulated minutes after resolution for the affected equipment. Its recurrence shall produce one new linked issue, not rewrite history or duplicate a current issue. It must not compound general recurrence weighting and shall respect equipment constraints and the actionable-issue ceiling.

### 4.3 Clock, scheduler, and event generation

Expose 1×, 5×, 10×, and 60× simulation speed plus pause/resume. Paused simulation advances neither time nor scheduled work. Changes in speed must preserve ordering and must not duplicate events, offers, resolutions, staffing reviews, or handovers.

Persist all due times and claimable trigger tokens. A scheduler must claim a due trigger before dispatching asynchronous work and be safe to retry after interruption. Scheduled and forced paths must use the same validation and caps.

The event planner may receive bounded, public operational context: simulation time, equipment status, active issues, bounded recent events, recurrence summaries, allowed issue classes, and constraints. It may propose an issue event and descriptive narrative only. The backend validates IDs, class, equipment eligibility, state transition, and capacity. If the provider fails, is malformed, or is unavailable, a deterministic weighted fallback shall produce a valid event without an API call.

## 5. Workforce continuity and demand

### 5.1 Calendar and personnel

Each room shall model four six-person crews (24 synthetic responders), using a persisted 14-day 2-2-3 rotation anchored at `2026-08-31T08:00:00.000Z`. A/C are complementary day crews; B/D are complementary night crews. Exactly one normal six-person crew is on duty at every 08:00 and 20:00 boundary.

Normal duty is 12 hours. Minimum rest before recall is 12 hours. Continuous duty may not exceed 16 hours. Public responder display names must follow `EngrNNN`, `TechNNN`, or `OptrNNN`; internal crew metadata must not become a person name.

### 5.2 Staffing review and handover

The application shall run deterministic staffing reviews at 06:00 and 18:00 simulated time, plus explicitly enumerated rechecks after `ISSUE_RAISED`, `ASSIGNMENT_RELEASED`, `ISSUE_ESCALATED`, and `RESPONDER_AVAILABLE`. Each review shall be a persisted, claimable trigger.

Normal staffing is six. Up to two legal surge responders may raise active staffing to eight. A staffing review shall deterministically prefer a legal outgoing-shift extension of up to four hours; only when extension is not selected or not legal may it select one legal off-shift 12-hour call-in. It may instead record no action or unmet staffing risk when no legal capacity exists. A call-in must satisfy rest and duty constraints. Extensions end at their persisted legal end time.

At each 08:00/20:00 handover, unresolved work shall retain priority, age, active roster, current attempt, outstanding work, and staffing decision. Legal work may transfer or promote a support responder. Work without a lawful replacement shall become an explicit queued handover/replan obligation, never be silently dropped, duplicated, or resolved by fabricated history.

### 5.3 Demand queue and priority

Each room permits at most ten actionable unresolved issues, including pending, recommendation-ready, offer-pending, and assigned work. When capacity is full, event generation shall create a deterministic deferred-demand ledger entry rather than an eleventh actionable issue. Deferred demand is visible only in Settings → Demo with a clear note that the limit is a demonstration safety cap. It shall not appear as an active issue, normal feed item, or dispatch candidate.

Actionable priority bands are Critical, High, and Standard. Deferred demand is a separate capacity-ledger category, not an actionable priority band. Priority shall use a deterministic formula over serious synthetic operational risk/impact, issue complexity, and age. Aging promotes lower work to prevent starvation. Critical work must never be demoted below lower-impact work. Planning requirements may inform synthetic impact but are never the sole priority signal.

When capacity becomes eligible, the application selects the next queue item deterministically, then runs bounded per-issue responder selection. A queued issue may survive multiple reviews without losing age, being retriggered, or receiving duplicate offers.

### 5.4 Scenarios

Settings → Demo shall provide Normal operations, Elevated demand, Personnel shortage, Recurring temporary repairs, and Auto. The selected scenario and its revision are canonical room state. The supported policy effect is that Recurring temporary repairs changes temporary-repair likelihood; the other presets and Auto preserve their selected state without changing event cadence, demand, staffing, or shift-boundary behavior. No preset alters hidden skill or rewrites history.

Do not expose raw random seeds in ordinary settings. A future, separately specified expansion may give Elevated demand and Personnel shortage deterministic policy effects and make Auto select a preset at a shift boundary from persisted random state. That expansion must persist transitions, be auditable, and never rewrite an accumulated room’s seed.

## 6. Responder recommendation and dispatch

For an issue selected by the queue, deterministic code shall build a bounded eligible-candidate packet containing public responder ID/name, distance, travel time, same-class observed count, median resolution time, success rate, reopen rate, and evidence strength. Evidence labels are `NONE` (0), `WEAK` (1–2), `MODERATE` (3–5), and `STRONG` (6+). No-history responders remain eligible.

Packets shall exclude hidden skill, responder coordinates, availability fields, and unbounded history. Provide and audit two deterministic comparators: nearest available and a documented naive weighted score based on travel, observed median time, and success rate without evidence-strength adjustment.

Compass may rank only supplied candidates and explain qualitative tradeoffs and uncertainty. Its output must use a strict schema, reference valid IDs, avoid invented numeric confidence, and compare its first choice with a meaningful alternative. The application revalidates all recommendations after asynchronous model gaps.

Dispatch shall offer the issue to responders one at a time. Acceptance produces the canonical assignment atomically; rejection advances to the next eligible ranked responder; exhaustion returns work to a deterministic rematch queue. A control-room operator may override an offer with another currently eligible responder. A stale recommendation, offer, or browser action must not assign an ineligible responder. When a provider fails, deterministic candidate ordering maintains dispatch. Offline uses a fixture and scripted acceptance without a provider.

Record recommendation winners, baseline winners, agreement/disagreement, evidence-strength role, decision source, offer sequence, confirmation/override, and eventual outcome. UI language must say assigned only after successful canonical mutation.

## 7. Operator experience

### 7.1 Navigation and Control Room management

Provide Live Floor, Analytics, Settings, and Control Room Management. The management view lists rooms with display name, stable identifier, health, mode, and clock state; supports non-destructive rename; and switches rooms through the room URL. Destructive room lifecycle actions are excluded pending dedicated administrator authorization.

Settings shall have API and Demo subtabs. API configuration is deployment-global: provider choice, provider-specific model/reasoning settings, guarded catalog refresh, and secure server-side credentials. Demo is room-scoped and includes agent activity, simulation overrides, scenario selector, staffing outlook, surge actions, workforce-continuity handover information, deferred demand, and cap explanation. Mode, speed, pause/resume, reset, Trigger Next Event, and Force Resolve belong in the Live Floor simulation bar.

### 7.2 Live Floor

The desktop layout shall keep core control-room information and the floor viewport visible without ordinary page scrolling at a 19:10 desktop viewport; responsive/mobile or reduced-window layouts may scroll. Floor pan and zoom must be deliberate: normal page navigation must not accidentally pan or zoom the map.

The Manufacturing Floor heading uses title case. The viewport provides floor selection, station/equipment state, current issue/assignment visibility, and safe map focus. Floor labels must avoid collisions: search all usable lanes above an anchor first, then use below-anchor lanes only if upper space is exhausted; leader lines must meet the correct label edge.

Only on-duty personnel (`AVAILABLE`, `OFFERED`, `ASSIGNED`) appear by default on the floor and in **Shift Personnel**. Off-shift personnel remain in a collapsed disclosure. Personnel visuals are neutral by default and highlight only on hover or selection. Selecting a person focuses their map location without replacing the last station selection.

Shift Personnel and **Stations** are tabs. Station rows with active issues appear first; healthy stations are collapsed by default. Selecting a station or a station-focused issue brings the map to the correct floor/station. Clicking an active/waiting issue entry, event-feed issue record, or search result must focus its station and floor.

The right-side panel is **Station Status**. For a station with active work it displays the applicable issue, dispatch, baselines, recommendation, offer/assignment controls, and audit context. For a healthy station it displays public application-derived status, uptime, observed issue count, and MTBF. If multiple active issues share a station, use the oldest by timestamp then ID. Station metrics must derive from public station/issue/event/clock facts only.

The operational event feed must show selectable public-safe details for issue, assignment, movement, resolution, and system events. Workforce-continuity handovers are durable continuity records shown in the appropriate staffing/Demo context, not ordinary feed entries. Opening event detail shall not lose the last station selection; closing it restores Station Status.

The smart search shall search active issues, all stations, and all personnel including off-shift personnel within the open room. With an empty query it may prioritize context around the selected issue. Typed results are global within that room, not cross-room and not resolved-history search. Display at most five matches per category and state that cap in the search interface.

### 7.3 Analytics

Analytics must be derived from the same canonical room state, never a duplicate data store. It shall present a dashboard hierarchy: key metrics and time/metric charts first, with click-through drill-down to an equipment/station, issue grouping, or appropriate detail. Any operational-flow visualization must label its data source and meaning, be derived from actual canonical data, and provide a meaningful click action; it must not imply simulated flow that is neither defined nor actionable.

Core analytics shall include equipment uptime, completed median downtime, current open downtime, station issue counts/status, active/resolved/reopened issues, issue counts by class/equipment, responder issue-response summaries, Issue-Class Experience, Compass-versus-baseline results, and 24-hour timelines. The workforce presentation shall include backlog by actionable priority, cap-deferred demand, staffing actions, and handover records.

Time to first response, queue-aging trends, aggregate shortage/surge rates, temporary-repair recurrence rates, durable-repair rate, repeat-failure rate, and broader MTBF/observed-interval analytics are explicit future rebuild expansions. They require their own metric definitions, denominator rules, and acceptance tests before becoming required dashboard measures.

Show denominators with rates. Suppress or mark rates with fewer than three observations as insufficient data. Do not performance-sort people, use performance heatmaps, expose employee rankings, or expose hidden truth. Analytics requests shall use one snapshot simulation timestamp; refresh only while Analytics is visible and preserve a selected drill-down across polling.

## 8. API, privacy, and reliability

Provide a room-scoped API contract for room state, simulation controls, issues, assignments, analytics, and audits. Unknown rooms return not found; known failed rooms return a distinct unavailable error. Shared provider settings and deployment logs remain deployment-scoped. Enforce mode errors explicitly: Live-only operations cannot run in Offline and vice versa.

Public projection must use an allowlist. It shall redact hidden skills, contributor weighting, internal resolution mechanics, credentials, and arbitrary event payload JSON. Event narratives use only approved public fields. Validate route input, method, content type, body size, and schema. Log structured request lifecycle and operational mutation events without secrets.

Provider support shall use AMD Token Factory only, with persisted model/reasoning configuration. Provider-specific request shapes are centralized. Provider failure, timeout, malformed output, or unavailable credentials must leave canonical state valid and activate deterministic fallback where applicable.

## 9. Offline mode

Offline mode is a deterministic, API-free shared-mode path. It shall present a fixed scenario with predefined issue/candidates, fixed baselines, stored Compass output, real offer/assignment/override mutation behavior, public audit data, and exact reset of operational scenario state. It shall require no provider configuration, network, or API credit.

## 10. Deployment and operations

Package ResponseCompass as a single Docker container using a supported Node 22 LTS runtime. Configure one explicit persistent data root that contains per-room state/audits, room metadata, provider settings, offline audit records, and deployment-level application events. The implementation shall use a safe local default and an explicit production mount without scattering persistence paths through application modules.

Provide Docker Compose deployment exposing port 3000 with a named persistent volume. The image shall exclude secrets and local runtime data, run as non-root, use a read-only root filesystem, mount temporary writable storage separately, drop capabilities, and enable no-new-privileges. Test data-root overrides must be unavailable in production.

An empty named volume shall initialize deterministic seed data for the registered rooms. State migration shall otherwise be explicit and conservative: take a verified backup; validate an empty target volume; stop the prior writer; copy the full data directory exactly once; start; verify every room’s health and preserved state; retain a documented rollback path. No automatic copy or merge into a nonempty deployment volume is permitted.

## 11. Acceptance and verification

Implementation is acceptable only when the following are automated and demonstrated:

- Unit/integration tests are hermetic: no network and no writes to production data.
- Chromium end-to-end tests run with providers forced to fail and make no paid API calls.
- Both Live and Offline exercise the shared domain invariants, and Offline makes zero provider calls.
- Two simultaneous browser contexts prove room isolation: mutations/time in one room do not affect another; provider settings intentionally remain shared.
- Per-room startup/migration failure isolates to `FAILED` while other rooms serve.
- Pause, restart, all speed changes, scheduled triggers, and forced triggers preserve time/order and fire exactly once.
- No responder is off shift, under-rested, over 16 continuous hours, concurrently assigned, or rendered as on-floor while off shift.
- Handover preserves lawful work; no assignment, offer, history record, or queue item is silently lost or duplicated.
- Sustained contention reaches ten actionable issues; excess demand is deferred only; queued work ages correctly and cannot be double-offered.
- Priority determinism, Critical guardrails, scenario persistence, staffing-review triggers/outcomes, extension/call-in legality, and the single temporary-repair recurrence are reproducible from the same state/random streams.
- Hidden-skill redaction is asserted for every room, public endpoint, model packet, event/audit view, and analytics payload. Provisioning/migration preserves existing hidden rows byte-for-byte and reproducibly creates new rows from a dedicated seed.
- Invalid/malformed provider output, provider failure, stale recommendation, competing confirmation, offer rejection, override race, and failed resolution cannot corrupt state.
- Station and personnel selection, floor focus, healthy Station Status, issue Station Status, tab behavior, collapsed lists, search cap note, map label non-overlap, and event-detail restoration are covered in browser tests.
- Analytics measures are reproducible from one state snapshot, exclude open intervals from completed medians, display denominators, and suppress thin-sample rates.
- Container build, Compose syntax, non-root hardening, persistent-volume behavior, data migration procedure, port-3000 health checks, and room readiness are verified.

Every material design deviation shall be recorded in the project decision record; each handoff shall include scope, verification, deployment state, and remaining risks.

## 12. Explicit non-goals

- Real people, employment records, labor-law advice, payroll, messaging, or automatic real-world overtime/shift changes.
- Real sensors, real facility maps, real equipment facts, real maintenance/failure history, predictive-maintenance claims, or real production prioritization.
- Generic chat, unbounded autonomous agents, direct model mutation, or model-owned staffing/priority.
- Exposure of hidden truth, employee-performance leaderboards, universal personnel scores, biometrics, demographics, disciplinary data, or HR evaluations.
- Cross-room global optimization, room deletion, or room creation by ordinary operators.
- Automated unsafe data merges, silent migration conflict resolution, or a separate analytics data store.
