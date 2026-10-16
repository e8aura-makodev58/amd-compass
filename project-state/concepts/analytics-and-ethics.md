# Concept: analytics & fairness rules

Analytics are computed by `analytics-service.mjs` as a **fixed snapshot** over Live state,
and rendered in the Analytics tab. The rules below are deliberate and must be preserved —
they keep the metrics honest and prevent the analytics from becoming an employee-ranking
tool.

## Statistical honesty

- **Rates always carry denominators.** A rate is never shown without the count it was
  computed from.
- **Thin samples are suppressed.** A rate computed from fewer than three observations is
  shown as **Insufficient data**, not as a misleadingly precise number.
- **Snapshots are fixed.** A snapshot is computed at a point in time with stable
  denominators, so a figure does not shift underneath the reader mid-view.

## Fairness

- **Issue-Class Experience is not a leaderboard.** It is alphabetically ordered, emphasizes
  cases handled, and is explicitly not a ranking of employees.
- **No history is not a penalty.** A responder with no prior history in an issue class
  remains fully eligible; absence of data is not treated as poor performance.
- **Excluded from Compass entirely:** compensation, seniority, demographics, biometrics,
  personality, fatigue, disciplinary data, and general HR scoring. Compass ranks on
  operational evidence (proximity/travel time, same-class success and reopen history,
  evidence strength and sample size) only.

## Relationship to hidden truth

Analytics are built from the **public** state only. The hidden `ResponderSkill` and the
per-attempt hidden numbers never reach the analytics layer, exactly as they never reach the
UI or the models. See
[../backend/domain-model.md](../backend/domain-model.md#invariant-responderskill-is-hidden-truth)
and [agent-boundary.md](agent-boundary.md).

## Baseline comparison

Analytics also surface where Compass **disagreed** with the deterministic baselines
(nearest-available and the `naive-score-v1` formula in `BASELINE_CONFIG`), and along which
dimension (travel time, observed performance, evidence strength, or a qualitative
tradeoff). This is what makes the agent's added value auditable rather than assumed.
