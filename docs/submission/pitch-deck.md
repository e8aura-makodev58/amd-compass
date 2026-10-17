# Pitch deck (draft)

Slide-by-slide content for the required PDF deck, 16:9, 10 slides. Each slide has the
on-slide text (keep it short) and speaker notes. Screenshots come from the running app with
the month-long e8-aura-p1 history. Status: **draft, awaiting codex review**.

Style: match the cover image and the app's light theme (Inter, dark navy text, teal accent,
amber for alerts, off-white background). No company logos.

---

## 1. Title

**On slide**
- ResponseCompass
- The right responder. The right fix. Learned from every past repair.
- Visual: the cover image.

**Notes**
ResponseCompass is a dispatch agent for operations control rooms, built on AMD Token Factory.

---

## 2. The problem

**On slide**
- When a machine fails, control rooms send whoever is **closest** or **free**.
- The nearest technician may never have fixed this kind of fault.
- Every wrong dispatch costs downtime, a reopened issue, or a second trip.
- The knowledge of who fixes what, and how, lives in people's heads and old tickets.

**Notes**
Proximity is easy to compute and easy to defend, but it ignores fit. What actually matters
is who is likely to resolve this class of issue on the first attempt, given where everyone is
and what they are already doing.

---

## 3. What ResponseCompass does

**On slide**
- For every new issue, Compass **ranks the eligible responders** and explains the tradeoffs.
- Offers go out automatically; responders accept or reject; complex work pulls in a second responder.
- Central command can override any decision, and every step is audited.
- Each issue carries a **response action**; next, Compass recommends the fix from past resolutions.
- Visual: Live Floor screenshot (floor map, selected issue, Compass recommendation).

**Notes**
Compass does not replace the operator. It proposes a ranked shortlist with reasons, and the
system dispatches automatically with a human able to step in.

---

## 4. Code owns the facts; the model ranks the match

**On slide**
- **Application code:** clock, locations, shifts, eligibility, history, baselines, every mutation.
- **Compass (AMD model):** ranks only the candidates it is given, with a qualitative rationale.
- **Event planner (AMD model):** proposes one bounded, validated incident at a time.
- Every output is validated; invalid, slow or rate-limited → deterministic fallback.
- Visual: the boundary diagram (Clock → Scheduler → Context → Compass / Baselines → Dispatch → Store).

**Notes**
The model never invents facts and never mutates state. That makes it safe to run unattended
and easy to audit: if the model is wrong or unavailable, dispatch keeps going.

---

## 5. Honest by design

**On slide**
- Each responder's **true skill is hidden** simulation truth: no model, UI or analytics sees it.
- Outcomes are simulated from that hidden skill, so results reflect real fit, not what the model was told.
- Two transparent baselines (nearest, naive score) run alongside; disagreements are flagged.
- Analytics show denominators, suppress thin samples, and are not an employee leaderboard.
- Excluded from ranking: pay, seniority, demographics, fatigue, HR data.

**Notes**
We wanted the demo to be able to show Compass being wrong as well as right. Hidden truth plus
baselines make its added value measurable rather than assumed.

---

## 6. Built on AMD Token Factory

**On slide**
- OpenAI-compatible API, `json_object` output, our validators as the contract.
- Default model **MiMo-V2.6-Flash**; ranking and event planner can use different models.
- Provider controls: 10 requests/min, 2 concurrent, retry only on 429 (honouring Retry-After), circuit breaker.
- Measured live, 10 samples per model: MiMo **9/10** valid rankings, **10/10** valid event plans.
- Ranking time limit 90 s; a timeout falls back without blocking dispatch.

**Notes**
We measured several Token Factory models against the same scenario and chose the default
per role from the data. Ranking is the heavier task; the provider controls keep us within
AMD's limits even under load.

---

## 7. Live demo highlights

**On slide**
- Live Floor: three floors, 2D map with 2.5D overview, issues and responders in real time.
- Compass recommendation with rationale; offer, accept, reject; second responder for complex work.
- Override and force-resolve controls; one-click audit trail per issue.
- Two independent control rooms (e8-aura-p1, e8-aura-p2).
- Visual: 2–3 screenshots (issue audit trail, Compass rationale, event feed disagreement marker).

**Notes**
Point out the disagreement marker in the event feed: that is where Compass chose differently
from the nearest-responder baseline, and why.

---

## 8. A month of operations

**On slide**
- e8-aura-p1 runs a full simulated month: **3,531 issues** from 1 September to 6 October.
- September: **2,978 raised, 2,998 resolved**, median under 15 minutes from raised to resolved.
- Day, week and month analytics; Compass-vs-baseline comparison; equipment and responder views.
- Seven-day history retention keeps the live state small: views load in under 0.2 s.
- Visual: Analytics tab screenshot (Month view with September complete).

**Notes**
This history was generated with the app's own engine, offline and deterministically, so every
record is one the app itself would produce. Retention archives older detail without changing
any analytics number.

---

## 9. Engineering quality

**On slide**
- Live and Offline are one app; Offline makes no API calls and is fully reproducible.
- 276 unit/integration tests (hermetic, no network) and 49 Chromium end-to-end tests.
- Deterministic seeded simulation; restart-safe scheduler; atomic, crash-safe persistence.
- Runs with Node.js 22 and Docker; no external services besides the model API.

**Notes**
Everything that matters is tested without spending API credits; the browser tests force
provider failures to prove the fallbacks.

---

## 10. What's next

**On slide**
- **Recommended fixes:** Compass suggests the response action from similar past resolutions.
- Learn from outcomes: feed accepted and successful fixes back into the evidence.
- Connect to real CMMS / ticketing systems in place of the simulated floor.
- Long-run storage: compact the remaining growing history for year-long runs.
- Closing line: **The right responder. The right fix.**

**Notes**
The dispatch half is built and measured. The next step uses the same boundary for actions:
code retrieves the comparable past resolutions, and the model ranks and explains the fix.
