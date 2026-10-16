# Workforce Continuity & Demand Simulation — Proposed SOW

**Status:** Draft for external review; no implementation authorization

> **[Review — Claude Opus 5, 2026-09-08]:** Full annotated review below, inline as blockquotes immediately after each section. Every claim is checked against the actual current code (exact file:line citations given), not against memory of what the codebase probably does. Overall disposition: **the design is careful and mostly consistent with this codebase's existing discipline — but it has one unresolved conflict with this project's own foundational rule, one significant hidden-truth risk that the doc's own boundary language doesn't quite close, and several concrete gaps between what §9 tests and what the design in §3–§6 actually requires.** None of these are reasons to reject the proposal; they're reasons to resolve explicitly before implementation, exactly as the doc's own "no implementation authorization" status invites.
>
> **The one thing I'd want settled before anything else:** §1 reframes Compass around "which unresolved issue should receive the next available responder" — that is issue-priority logic. `AGENTS.md` rule 2 currently reads, verbatim: *"Keep Compass focused on per-issue responder assignment; do not add global workforce optimization or issue-priority logic."* This SOW's own §11 non-goals list "Global mathematical workforce optimization" as out of scope, which is a narrower exclusion than what rule 2 currently states — the SOW is proposing to keep the workforce-optimization half of rule 2 but override the issue-priority half. That's a legitimate scope decision, but it's a change to this project's own standing rules, not just a new feature, and it should be made explicitly by the user updating `AGENTS.md` alongside approving this SOW — not left implicit for whoever implements this to notice or not.

**Scope:** Per-Control-Room simulation of shift coverage, workload contention, handover, overtime, deferred demand, and recurring equipment failures.

This document proposes a controlled expansion to Compass. It does not change the running application until it is reviewed and explicitly approved.

## 1. Purpose

Compass must simulate sustained operations, not only select a responder for a small number of independent issues. The simulation will make personnel shortage, backlog, shift handover, overtime, and recurring temporary repairs visible while retaining deterministic, explainable backend decisions.

Compass will answer two sequential questions:

1. Which unresolved issue should receive the next available responder?
2. Which eligible responder is the best fit for that selected issue?

This is bounded queue dispatch, not unconstrained workforce optimization.

> **[Review]:** See the disposition note above — this is the section that creates the `AGENTS.md` rule-2 tension. Separately from that governance question, "bounded queue dispatch, not unconstrained workforce optimization" is a good, precise framing on its own terms, and worth keeping verbatim in whatever document ends up authorizing this — it's exactly the kind of sentence that stops a well-intentioned future contributor from quietly adding cross-issue load-balancing.

## 2. Non-negotiable boundaries

- All operational facts, shift calendars, eligibility, urgency bands, workload estimates, staffing triggers, mutations, and simulation outcomes are application-owned and deterministic.
- Models may only produce bounded qualitative explanations or rank candidates supplied by application code. They cannot create an issue, set issue priority, trigger staffing, select an overtime responder, alter a shift, or write state.
- `ResponderSkill` remains hidden simulation truth. It must not appear in UI/API payloads, analytics, planner packets, Compass packets, priority logic, staffing logic, or audit explanations.
- Priority uses synthetic operational facts and observed historical evidence only; it must not infer employee performance from hidden skill.
- Live and Offline remain shared-mode paths. Offline remains API-free.
- All data remains synthetic and domain-neutral.

> **[Review]:** This section is well written and correctly extends the existing hidden-truth boundary (`AGENTS.md` rule 4, `assertNoResponderSkill` in `backend/src/live-schema.mjs:254`) to the new priority/staffing surfaces rather than treating them as exempt. One thing worth making sharper: "observed historical evidence" for issue-level priority (§5's "expected effort" and "observed likelihood of timely stabilization") is not yet defined precisely enough to audit against this boundary. The existing evidence model (`context-engine.mjs`'s `getPerformanceSummary`) is *responder*-scoped — it answers "how has this responder performed on this issue class." Issue-level priority needs an *issue-class*-scoped aggregate (e.g., median resolution time and success rate across all responders for that class), which is a new aggregation, not a relabeling of the existing one. If that new aggregate is computed carelessly — e.g., by looking at which specific responder handled past instances and weighting by their skill — hidden truth leaks into priority through the back door even though no line of code ever reads `ResponderSkill` directly, because the input data was already shaped by it. Worth stating explicitly in the boundary section: **issue-priority evidence must be responder-anonymized aggregate history, never traceable to which specific responder produced a given data point.**

## 3. Per-room operating model

Each Control Room has four crews of six responders: **24 synthetic personnel** in total.

- Normal shift duration: 12 hours.
- Shift boundaries: 08:00 and 20:00 simulated local time.
- Normal active shift staffing: 6 responders.
- Surge staffing maximum: 8 responders.
- At most 2 surge responders may be active at once.
- A surge responder is either a four-hour extension from the outgoing shift or a 12-hour overtime call-in from an eligible off-shift crew.
- A responder may not work more than 16 consecutive hours. Extension is therefore capped at four hours after a normal 12-hour shift.

The concrete four-crew rotation calendar is a policy input. The initial implementation must persist the configured rotation and calculate each responder's current shift, rest state, duty start, and next eligibility deterministically. It must not use a simplistic random or round-robin selection.

> **[Review]:** Two concrete gaps, one structural note:
>
> 1. **No minimum-rest-before-recall constraint is stated, and this is a real hole, not a nitpick.** The doc bounds a single continuous duty block at 16 hours, but says nothing about the *gap* between blocks. As written, a responder could finish a 16-hour block, and — if the rotation calendar or an overtime call-in logic doesn't independently prevent it — be called back with zero rest, repeatedly. §9's acceptance criteria only test "never works beyond 16 consecutive hours," which this scenario technically satisfies while still being obviously wrong. I'd add an explicit minimum-rest-hours parameter to §3 and a corresponding acceptance criterion in §9.
> 2. **This is a 4× personnel scale-out with an unaddressed hidden-skill migration cost.** Today's seed has exactly 6 responders with 18 hidden skill rows (6 × 3 classes — `backend/seed/live-simulation.mjs:4-11`, confirmed by direct read). Scaling to 24 per room means 72 hidden skill rows per room, and — per §10's migration requirements — the *existing* 6 responders' hidden truth must not change (that would retroactively invalidate their accumulated historical evidence), while 18 new synthetic responders per room need newly-generated hidden skill rows that are plausible but arbitrary. §10 doesn't mention this at all. It's a solvable problem (generate new rows with a documented distribution, seeded from the room's own persisted RNG so it's reproducible) but it needs to be specified, not left implicit, given how careful this document is everywhere else about exactly this class of detail.
> 3. Structural note, not a problem: this section correctly avoids "simplistic random or round-robin selection" for shift calculation — good, matches the existing codebase's general allergy to non-deterministic behavior where determinism is cheap and valuable.

## 4. Staffing review and handover

The backend runs a staffing review at 06:00 and 18:00 simulated time, two hours before handover, and re-evaluates when a material workload or staffing mutation occurs.

The review evaluates:

- unresolved issue count and priority bands;
- waiting time and aging risk;
- active assignments and available incoming-shift capacity;
- observed effort/time-to-stabilize estimates;
- issues unlikely to stabilize before handover;
- duty-duration and rest eligibility constraints.

It returns one deterministic outcome:

1. incoming crew coverage is sufficient;
2. extend one or two eligible outgoing responders for up to four hours;
3. call in one or two eligible off-shift responders for a 12-hour overtime shift; or
4. record an unmet staffing-risk state if no legal surge option exists.

At 08:00 and 20:00, each unresolved issue receives a durable handover record containing its current priority band, age, active roster, latest attempt, outstanding work, and any staffing decision. An extender remains only until the recorded extension end time. Handover must never duplicate an assignment or permit a responder beyond the 16-hour maximum.

> **[Review]:** "Re-evaluates when a material workload or staffing mutation occurs" is the one genuinely under-specified phrase in an otherwise precise document. "Material" isn't defined anywhere, and this codebase's whole design philosophy (persisted RNG streams, trigger tokens, one-shot claim-then-dispatch — see `backend/src/scheduler.mjs`'s token mechanism) is built around *exactly enumerable* triggers, specifically so nothing depends on an implementer's judgment call about what counts. I'd replace "material" with an explicit list — e.g., "an issue escalates into Critical," "an active assignment is released mid-shift," "the unresolved count crosses a configured threshold" — the same way §5 enumerates priority-band factors precisely. Left as "material," two different implementations of this SOW could reasonably disagree about when a review re-runs, which is a determinism/reproducibility risk in a codebase that otherwise tests reproducibility explicitly (e.g. the deterministic soak in `docs/evaluation.md`).
>
> Separately: this section composes with the *existing* scheduler's due-token claim mechanism (`backend/src/scheduler.mjs:38-61` for the event-due pattern), and the doc doesn't say whether the staffing review is a new scheduled-trigger *kind* alongside `EVENT_DUE`/`RESOLUTION_DUE`/`OFFER_RESPONSE_DUE`/`ASSISTANCE_REVIEW_DUE`, or something else entirely. Given how central that token pattern is to this codebase's idempotency-under-crash guarantees, I'd expect this SOW to say explicitly "this is a fifth scheduled-trigger kind, following the existing claim-then-dispatch-outside-the-lock pattern" — worth adding a sentence so an implementer doesn't invent a sixth mechanism where a fourth was already the right shape.

## 5. Demand queue and issue triage

The current three-active-issue ceiling will be replaced by a maximum of **10 unresolved issues per Control Room**. Unresolved includes pending, recommendation-ready, offer-pending, and assigned issues.

When the ten-issue limit is reached:

- no eleventh actionable issue is persisted;
- the simulator records a deterministic deferred-demand record rather than silently dropping the event;
- deferred demand is visible only in Settings → Demo, alongside an explicit statement that the ten-issue cap exists for demo safety;
- deferred demand is not presented as an active issue, put in the normal event feed, or assigned a responder.

Each actionable issue receives an application-owned priority band:

- **Critical:** severe synthetic production/delivery impact or serious operational risk.
- **High:** significant business impact, escalating downtime, or complex unresolved work.
- **Standard:** normal operational work.
- **Deferred:** lower-impact work, subject to deterministic aging promotion.

Within a band, deterministic ordering considers wait time, age-based escalation, expected effort, and observed likelihood of timely stabilization. Complexity and lower likelihood of success are escalation signals; they must never demote a Critical issue below lower-impact work. Existing planning/production priority is an input, not the sole determinant.

Whenever a responder becomes eligible, the backend selects the next queue item first and then invokes the existing bounded per-issue responder-fit process. This must be deterministic, auditable, and independent of model availability.

> **[Review]:** The "must never demote a Critical issue below lower-impact work" clause is the best sentence in the document — it's precisely the kind of guardrail that stops a well-intentioned scoring formula from producing a perverse result under load, and it should survive into whatever the final implementation's tests assert.
>
> Two things worth tightening:
>
> 1. **`maxActiveIssues === 3` is currently a schema-validated invariant, not a soft default** — confirmed directly: `backend/src/live-schema.mjs:58` asserts `state.simulationConfig?.maxActiveIssues === 3` and *fails validation* if it's anything else. Raising it to 10 means bumping the schema version and updating that assertion, which §10 (migration) correctly anticipates in spirit ("version the simulation configuration") but doesn't call out this specific line as the concrete blocker it is. Minor, but worth naming so whoever implements this doesn't discover it by a failing test they didn't expect.
> 2. **The 3→10 ceiling change with unchanged event cadence (8–25 simulated minutes, `backend/src/scheduler.mjs:3-4`) creates a genuinely new steady state this document doesn't fully test for.** With today's ceiling of 3 and 6 responders, an issue is almost always assigned quickly — real queueing rarely happens. With a ceiling of 10 against 6–8 staffed responders, sustained contention (issues legitimately waiting, un-assigned, for multiple ticks) becomes the *normal* case, not an edge case. §9 says "the simulation can create realistic backlog up to 10 actionable issues," which covers the cap being enforced, but I don't see an acceptance criterion for the specific new failure mode this introduces: an issue sitting queued across several staffing-review cycles without being silently re-triggered twice, losing its wait-time-based aging, or being double-offered when a responder frees up mid-tick. I'd add an explicit criterion here.
> 3. As flagged in §2's review: "expected effort" and "observed likelihood of timely stabilization" need an explicit, responder-anonymized definition before implementation, not left to be inferred from context.

## 6. Recurring temporary repairs and MTBF

Resolution outcomes add a deterministic durability classification:

- **Durable repair:** equipment returns to normal baseline failure behavior.
- **Temporary repair:** equipment enters a reduced-MTBF state and receives a deterministic recurrence window.
- **Failed repair:** the issue remains in, or returns through, the normal unresolved-resolution path.

A temporary-repair recurrence is a new issue with explicit recurrence context tied to the prior repair. It is not a disguised duplicate or a rewrite of historical state. The generator must respect equipment eligibility and the 10-issue cap.

Analytics must distinguish observed issue intervals, temporary-repair recurrence rate, repeat-failure rate, durable-repair rate, and deferred demand. No latent responder-skill data may be exposed.

> **[Review]:** This section doesn't acknowledge that a *recurrence-weighting* mechanism already exists today: `backend/src/event-planner.mjs`'s `createFallbackEventProposal` already weights equipment/class selection by recent recurrence count (`recurrenceFor`, confirmed by direct read of that file). This new "temporary repair, reduced-MTBF, deterministic recurrence window" mechanic is either meant to **replace** that existing weighting with something more principled, or **layer on top of** it (existing fallback recurrence handles "this equipment tends to fail often" generally; the new mechanic handles "this *specific* repair was temporary and *this* equipment specifically will recur soon"). Those are different designs with different edge cases — e.g. do the two recurrence-weighting signals compound multiplicatively for equipment that both has a general recurrence history *and* an active temporary-repair window? The document should say explicitly which of these it means, since an implementer has to guess otherwise, and the two readings produce different observable behavior in exactly the analytics metrics (§6's own paragraph 3) this feature is supposed to make legible.

## 7. Scenario controls

The existing top-level Demo tab moves under **Settings**, which has two sub-tabs:

- **API** — deployment-global provider configuration.
- **Demo** — Control-Room-scoped simulation controls and explanations.

Settings → Demo contains current Live/Offline controls, reset, Force Next Event, Force Resolve, the operating-scenario selector, deferred demand, and the demo-cap explanation.

The manually selectable presets are:

1. Normal operations
2. Elevated demand
3. Personnel shortage
4. Recurring temporary repairs
5. Auto

Presets change versioned, deterministic simulation-policy parameters such as incident cadence, temporary-repair likelihood, and workload pressure. They do not alter hidden skill or rewrite existing history.

**Auto** selects among the first four presets using the persisted simulation RNG and changes only at shift boundaries. Every transition is persisted and auditable. Raw RNG seeds are not exposed in ordinary Settings because changing a seed mid-run would alter future history and compromise auditability. A future privileged-admin/debug workflow may create a new deterministic scenario from an explicit seed; it must never rewrite an accumulated room's seed.

Demo settings are canonical shared room state. Concurrent updates require revision-based conflict handling, with visible current values and no silent overwrite.

> **[Review]:** This section is the strongest in the document and needs no changes. The RNG-seed reasoning is exactly right and matches the existing codebase's actual practice precisely: every RNG stream in `backend/src/live-schema.mjs` (`scheduler`, `fallback`, `resolution`, `attempt`, `dispatch`) is persisted uint32 state with no manual-override UI anywhere today, for precisely the auditability reason stated here. The Settings API/Demo split is also a clean, low-risk reorganization — it's worth noting this reorganization is now the *second* thing to touch the Settings tab this week (OpenRouter provider support just landed there), so whoever implements this should check the current `frontend/app.js` Settings-tab code fresh rather than against an older mental model of it.
>
> One small addition worth considering: "Concurrent updates require revision-based conflict handling" is stated as a requirement but not connected to the existing mechanism that already does exactly this — `backend/src/live-store.mjs`'s revision-bump-on-mutate pattern, and the existing "stale recommendation" revalidation pattern in `live-recommendation-service.mjs` (compare candidate evidence byte-for-byte after an async gap; reject if it moved). Naming that as the pattern to reuse, rather than leaving "revision-based conflict handling" abstract, would save an implementer from re-deriving a solution this codebase already has twice.

## 8. UI and analytics requirements

The Control Room must show actionable issues with priority band, waiting time, queue position, assignment state, and a concise deterministic rationale for why the current issue is receiving attention. It must not imply that ordinary operators can alter priority rules.

Settings → Demo must show:

- active crew, incoming crew, off-shift eligibility, and surge staffing;
- next handover and current staffing outlook;
- extensions/call-ins with their legal end times;
- selected scenario and scenario-transition audit;
- deferred demand and the ten-issue demo-cap notice.

Analytics must add backlog by priority band, time to first response, handover workload, staffing shortages, surge actions, deferred demand, and temporary-repair/MTBF measures. These are observed simulation metrics, not employee rankings.

> **[Review]:** No structural objection. One consistency check for whoever implements this: the existing Analytics service suppresses any rate with a denominator under 3 (`backend/src/analytics-service.mjs:28-29`, `rateWithDenominator`) rather than showing a misleadingly precise small-sample percentage. Every new metric this section introduces (surge-action rate, temporary-repair recurrence rate, etc.) should go through that same suppression discipline rather than a bespoke one — the doc doesn't say this explicitly, but it should, given how much of this document's own careful language elsewhere is about not letting small-sample or hidden data mislead an operator.

## 9. Acceptance criteria

- Four six-person crews are persisted and only legal on-shift/off-shift personnel are eligible for each staffing action.
- A responder never works beyond 16 consecutive hours, has concurrent assignments, or is assigned while ineligible.
- Handover preserves unresolved issues and assignments without duplication or lost context.
- The simulation can create realistic backlog up to 10 actionable issues; the eleventh demand is recorded only as deferred demand.
- Scheduled and forced event paths both respect the 10-issue limit.
- Queue dispatch serves higher-priority work first, while deterministic aging prevents indefinite starvation.
- Staffing review produces reproducible extension/call-in/no-action outcomes for a fixed state and RNG stream.
- Temporary repairs produce deterministic, auditable reduced-MTBF recurrence without violating equipment or issue constraints.
- Preset and Auto transitions are persisted, room-scoped, deterministic, and revision-conflict safe.
- Settings navigation exposes API and Demo sub-tabs; no top-level Demo tab remains.
- API-free Offline behavior remains API-free.
- Unit/integration and Chromium suites cover the above, including multiple Control Rooms and concurrent viewers.

> **[Review]:** Solid list overall. Three additions I'd want before calling this complete, each tracing back to a gap flagged above rather than a new concern:
>
> 1. **A minimum-rest-before-recall criterion** (from §3's review) — as written, nothing here would catch a responder being recalled with zero rest between two legal 16-hour blocks.
> 2. **An explicit sustained-contention criterion** (from §5's review) — something like "an issue can remain queued across multiple staffing-review cycles without losing wait-time-based aging, being silently re-triggered, or being double-offered when capacity frees up." The current list tests the cap being *enforced*, not the *queued-and-waiting* steady state the cap is designed to produce.
> 3. **A hidden-skill migration criterion** (from §3's review) — something like "migrating an existing room's responder count from 6 to 24 does not alter the hidden skill values of the original 6, and the 18 newly-generated responders' hidden skill rows are reproducible from the room's own persisted RNG." §10 requires the migration; §9 doesn't test its most sensitive property.
>
> Also worth noting explicitly, since it's implied but not stated: this feature needs its own `wp`-numbered test files and its own `docs/decisions.md` entry per `AGENTS.md` rule 7, exactly like every other work package in this codebase — worth adding a line to that effect here so it's an acceptance criterion rather than an assumed convention.

## 10. Migration and rollout

This is a persisted-state migration. It must version the simulation configuration and add crew, duty, handover, deferred-demand, recurrence, scenario, and staffing-audit data without exposing hidden skill.

The migration must preserve historical issues, assignments, recommendations, provider settings, room IDs, display names, and current simulation time. Existing rooms must receive an explicit initial scenario and valid shift-calendar state. Rollout requires a backup/preflight, both test suites, room-by-room post-migration health checks, and a documented rollback path.

> **[Review]:** The room-by-room health-check requirement is exactly right and, encouragingly, already has a real precedent to build on: the Control Rooms feature that just shipped (`Control_Rooms_SOW_v1_DRAFT.md`, implemented and — per the current handover — deployed) established a `READY`/`FAILED` per-room health model specifically so one room's migration problem can't become a deployment-wide outage. This migration should explicitly reuse that same health model rather than inventing a parallel one: a room whose 6→24 responder migration or whose shift-calendar backfill fails should land in the *same* `FAILED` state the Control Rooms manager already tracks, not a new bespoke error path.
>
> The one gap: as flagged in §3 and §9's reviews, this section doesn't mention the hidden-skill-matrix expansion (18 rows → 72 rows per room) as a distinct migration concern with its own correctness property (existing responders' hidden truth unchanged; new responders' hidden truth reproducible from the room's own RNG). Given how much weight this document correctly puts on hidden-truth non-leakage everywhere else, its silence on hidden-truth correctness *during migration specifically* is the one place the document's own standard slips.

## 11. Explicit non-goals

- Real personnel records, real labor law advice, payroll, or external calling/messaging.
- Automatic changes to real shifts or overtime.
- Global mathematical workforce optimization across the enterprise.
- Model-owned priority, staffing, or mutation decisions.
- Exposure of hidden responder-skill truth or employee-performance leaderboards.

> **[Review]:** Good list, and "employee-performance leaderboards" is a welcome explicit callout — it correctly extends the existing Issue-Class Experience matrix's "context, not ranking" principle (`AGENTS.md` and the existing Analytics section's own framing) into the new staffing-visibility surfaces, where the temptation to build exactly that kind of leaderboard would otherwise be highest. As noted at the top: this list's narrower "global mathematical workforce optimization" (vs. `AGENTS.md` rule 2's broader "workforce optimization... or issue-priority logic") is the crux of the one open governance question in this document. Everything else here is ready to build once that's resolved.

---

## Summary disposition

**Recommendation: sound design, not yet ready for implementation authorization — one governance decision and a handful of concrete spec gaps stand between this and a green light.**

**Must resolve before authorization:**
1. The `AGENTS.md` rule 2 conflict (§1) — this needs the user to explicitly amend that rule, not be implemented around it silently.
2. A precise, responder-anonymized definition of the issue-level historical-evidence aggregate used for priority (§2, §5) — currently under-specified enough that two correct-looking implementations could leak hidden truth differently.
3. A minimum-rest-before-recall constraint (§3, §9).
4. The hidden-skill-matrix migration plan for the 6→24 responder scale-out (§3, §9, §10) — reuse the just-shipped Control Rooms `READY`/`FAILED` health model rather than inventing a parallel one.
5. A precise, enumerable list replacing "material workload or staffing mutation" (§4).
6. An explicit choice between "replaces" and "layers on top of" the existing recurrence-weighted event-planner fallback (§6).
7. An explicit sustained-contention acceptance criterion for the new normal-queueing steady state a 10-issue ceiling creates (§5, §9).

**Nothing here is a reason to reject the proposal.** The document's own instincts — determinism over convenience, explicit enumeration over vague triggers, hidden-truth discipline extended rather than exempted, "never demote Critical" as a hard guardrail — are consistently the right calls, and every gap flagged above is a place where the document didn't quite reach the standard it set for itself elsewhere, not a place where its judgment was wrong.

## Review resolutions — approved 2026-09-08

The inline review remains part of the record. The following resolutions are authoritative for implementation:

- Rule 2 is superseded; rules 3 and 4 remain binding. Queue, staffing, calendar, durability, and mutations are deterministic application logic. Models never own priority, staffing, or workforce decisions.
- Priority uses issue facts plus responder-anonymized issue-class aggregates only. Responder-specific history, `ResponderSkill`, and any skill-shaped signal are excluded.
- The initial calendar is a persisted four-crew 14-day 2-2-3 rotation anchored at `2026-08-31T08:00:00.000Z`. Minimum rest is 12 hours. Normal duty is 12 hours; extension is at most four hours; total continuous duty is at most 16 hours.
- The 6-to-24 migration preserves original responders and all 18 original hidden-skill rows byte-for-byte. New rows are generated reproducibly from a dedicated persisted `workforceProvisioningSeed`, never by advancing a live RNG stream. A migration failure uses the existing per-room `FAILED` isolation state.
- Staffing/handover work uses explicit claimable trigger kinds and enumerated rechecks, rather than subjective "material" changes. Queue state must remain stable through contention and no issue may receive two simultaneous offers.
- A temporary-repair recurrence is a dedicated scheduled recurrence for that repair and does not compound the existing general recurrence weighting. New rates use the existing small-sample suppression convention.

## WC-2 corrective clarification — approved 2026-09-08

- The 2-2-3 calendar must have exactly one normal six-person crew on duty at every 08:00/20:00 boundary: A/C are complementary day crews and B/D are complementary night crews.
- A persisted wc-1 room with extra active staff is migrated deterministically to wc-2. It must not retain illegal off-duty assignments. Unfinished work is recorded as a queued handover/replan obligation; it is never silently dropped. The migration does not advance live RNG or alter hidden-skill rows.
- All public responder display names use `EngrNNN`, `TechNNN`, or `OptrNNN`; `Crew …` and legacy public `OperNNN` labels are not permitted.
