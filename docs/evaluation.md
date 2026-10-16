# Reliability and evaluation

## Deterministic gate results

Run on 2026-09-04 with `npm test` and the versioned synthetic seed:

- 117 unit/integration tests passed.
- 100 recommendation opportunities completed in the deterministic accelerated soak.
- 75/100 recommendations differed from the naive weighted baseline.
- 75/75 disagreements were classified from structured evidence as evidence-strength-driven.
- 149 total observed records remained after the pre-warmed attempt plus 100 soak attempts.
- 397 operational events persisted.
- 0 duplicate active-responder assignments.
- 0 leaked active assignments at completion.
- 0 active issues remained; the ceiling of three was never exceeded.
- latent convergence over 2,000 independent samples moved the misleading Tech216/Class B estimate toward its hidden success and median parameters.

The soak uses `evidence-policy-v1`, a deterministic test policy that produces schema-valid Compass-shaped output. It validates seed disagreement capacity, scheduler/mutation integrity, history growth, and analytics consistency. It is not represented as a live-model quality result.

## Browser gate

`npm run test:e2e` covers all four Chromium journeys after exposing the already-present local browser-library bundle through `LD_LIBRARY_PATH`. Coverage includes Live reset, immediate Compass/event-workflow activity indicators, the dedicated Demo view, Trigger Next Event, event feed, Force Resolve, Analytics, mode switching, Offline fixed winners, Offline confirmation, and Live/Offline assignment overrides held across multiple polling intervals. Explicit test inference modes are honored through provider settings, so the suite makes no provider request and spends no API credits.

## External live-provider gate

The secured local credential and persisted `gpt-5.6-terra` / `medium` selection are configured. Before the synthetic-code migration, the genuine ten-run Scenario A gate completed 10/10 READY with the responder now identified as Engr028 ranked first on every run; the recorded latencies were 7.486–13.011 seconds, with every tradeoff grounded and no numeric leakage. The live 100-opportunity provider evaluation remains outstanding and must confirm the SOW disagreement thresholds. Do not substitute the fixture or deterministic evaluation policy for that claim.
