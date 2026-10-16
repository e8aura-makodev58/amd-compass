# v4 implementation plan

`Compass_ResponseCompass_SOW_v4_FINAL.md` is authoritative. This WP0 plan was independently reviewed before coding begins.

## Current-state assessment

The current dependency-free Node application is a strong Offline Demo base: synthetic Scenario A data, deterministic context/evidence/baselines, bounded Compass validation, human confirmation/override, audit records, and reset tests already exist. It is not v4 Live Simulation: canonical state is in memory, it assumes one active issue and one workflow, and it has no persistent clock, scheduler, latent skill, runtime resolution, event planner, event feed, or analytics.

## Architecture decision

Keep native Node ESM and the static browser UI. Add one versioned JSON-backed live store under ignored `backend/data/` with normal-domain tables: `SimulationState`, `Equipment`, `Responder`, `ResponderSkill`, `Issue`, `Assignment`, `ResolutionHistory`, `Recommendation`, `OperationalEvent`, and `SimulationConfig`.

All live mutations use one serialized transaction queue and one atomic file write. The store is single-process only. `OperationalEvent` is audit-only, never a source for rebuilding current state. The pre-existing Scenario A seed remains Offline-only; Offline and Live use common store/service interfaces and mutation validation.

`ResponderSkill` is simulation-only and excluded from all public state, planner packets, Compass packets, recommendation views, and analytics.

## Reviewed delivery order

1. **WP1 foundation:** update v4 docs; define shared mode/store interfaces; commit all required fixtures; add live schema, 6×3 hidden-skill seed, baseline config/version, atomic persistence tests, and hidden-skill non-leak tests. Port Offline through the shared interface now, retaining exact fixture behavior.
2. **WP2–WP3 clock/scheduler:** persist simulation time, speed, pause state, due token, and separate versioned PRNG streams. Use pure tick logic, no wall-clock catch-up, idempotent force controls, and ordinary resolution due times.
3. **WP4 planner:** bounded contextual packet/output validator; API failure/malformed result falls back to deterministic weighted generation. Model calls occur outside the state lock and outputs revalidate under lock.
4. **WP5 shared persistent assignment + multi-issue:** move transactional assignment/revalidation ahead of the original WP9 UI package so two-issue exclusion and stale races are testable. Limit active issues to three.
5. **WP6 resolution/reopen:** derive outcomes only from hidden skill; append observed runtime history; free responder; preserve downtime across failed/reopened attempts.
6. **WP7–WP9 live Compass and assignment UI:** derive context from seed plus runtime history; persist full recommendation snapshot, baseline configuration/winners, revision, disagreement instrumentation, validated result, and human action. UI routes remain later integration work.
7. **WP10 control room, WP11–WP12 analytics, WP13 Offline verification:** polling UI, feed/disagreement marker, fixed-snapshot analytics with denominators and `n < 3` safeguards, then explicit Offline parity/reset verification.
8. **WP14–WP15 reliability/documentation:** per-package tests culminate in race tests, convergence, 100-opportunity disagreement evaluation, soak, and presentation artifacts.

## Required transaction/model safeguards

- Never hold the live mutation lock while awaiting either model. Persist a request/revision, call outside the lock, then accept the result only if issue and candidate state still validate.
- Persist independent deterministic RNG state for timing, fallback selection, and resolution outcomes. Do not use `Math.random()` for live transitions.
- Persist baseline formula/version/weights, candidate snapshot, winners, agreements, and a bounded tradeoff dimension. Do not reconstruct evidence-strength disagreement from model prose.
- Every package ships its own acceptance tests; WP14 adds the 100-opportunity, convergence, and soak gates rather than replacing earlier tests.

## First coding slice

Only WP1: shared mode/store contracts, full v4 fixtures, live schema/seed with 18 hidden skills, atomic persistence/validation tests, and Offline adapter preservation. No clock, live routes, scheduler, or UI rewrite in this first slice.
