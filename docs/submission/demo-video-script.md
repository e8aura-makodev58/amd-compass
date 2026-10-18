# Demo video

**Recorded:** `ResponseCompass-demo.webm`, 1920×1080, **2:51**, captions burned in, no
audio, 16.7 MB. Produced by `build/record-video.mjs` (see `build/README.md`). All plant data
is synthetic. Revised 2026-10-18 for the command-center framing and the refined UI. Convert
to MP4 elsewhere if the form does not accept WebM (this host has no MP4 encoder).

## What it shows

The recording runs against a **paused scratch copy** of the 3200 room taken on 2026-10-18,
after a live capture on AMD Token Factory (MiMo-V2.6-Flash), with model calls forced off, so
it shows saved records only. The one live action is approving the pending staffing
recommendation on that copy (deterministic application code; no model call).

- **ISS-3618**, Station 48, simulated 6 October 09:30: MiMo ranked **Engr370** first
  (110 similar cases, 87% observed success, 0.5 min away); the nearest-responder baseline
  chose Engr361 (26 cases). MiMo then ranked **FIX-C-01 Correct mechanical alignment**
  first (agreeing with the most-common-fix baseline); Engr370 applied it and resolved the
  issue first time in 7.0 minutes.
- **staffing-7**: a live MiMo ranking of 16 lawful overtime options; top option Tech363,
  extend shift (agrees with the first-eligible baseline). Approved by central command in the
  recording.
- Capture totals: 15 of 18 responder rankings and 12 of 15 fix rankings returned valid AMD
  output; the rest fell back deterministically.

One good outcome is not proof of better performance; the captions say disagreements are
recorded for review.

## Shot list and captions

| Shot | Screen | Caption |
|---|---|---|
| 1 | Title card | The right responder. The right fix. · Learned from every past repair. · Runs autonomously. Supervised by your control room. |
| 2 | Wall: six live display screens (map, issues, dispatch, events, Issue Pareto, analytics) | Compass runs dispatch on its own. The control room watches it on wall screens, one panel per monitor, and steps in when it matters. |
| 3 | Operator console: floors 2 and 1, 2.5D, back to 2D | The operator console keeps the controls. This synthetic plant has three floors, seventy-two machines and twenty-four responders. |
| 4 | Search palette (types Engr370) | Find any issue, station or responder from the keyboard, and arrange the floor, issues, feed and context as tiles. |
| 5 | Dispatch / context maximised → Stations → Station 48 → ISS-3618 | A live record. Code establishes eligibility, travel time and observed history; Compass, on AMD Token Factory with MiMo-V2.6-Flash, ranks only the eligible responders it is given. |
| 6 | Initial assignment Compass analysis and evidence table | The nearest responder has a thin record on this fault. Compass ranked Engr370 first: a hundred and ten similar cases, the same half-minute away, and explained why. |
| 7 | Recommended fix (AMD model) | Compass then ranks the troubleshooting procedures for the observed symptom, from what actually worked on comparable repairs. Code supplies the procedures and the evidence. |
| 8 | Troubleshooting order and evidence expanded | Each procedure's observed success on this symptom is shown. The most common fix is the baseline, and any disagreement is recorded. |
| 9 | Applied fixes by attempt, resolution | Engr370 applied the top-ranked procedure and fixed it first time, in seven minutes. If an attempt fails, the issue reopens and the next procedure is tried. |
| 10 | Staffing tile maximised: staffing-7 (AMD model) | When the backlog outgrows the shift, code lists only the legal overtime options. Compass ranks them; nothing changes until central command decides. |
| 11 | Ranked options and evidence | Each option shows duty and rest hours and observed coverage of the backlog. Unanswered recommendations expire; they are never applied by default. |
| 12 | Approve top option → Recent decisions | Central command approves the extension. The decision, and who made it, goes into the audit trail. |
| 13 | Offline Demo, Reset, Raise Scenario A | Offline Demo replays a fixed scenario through the same dispatch path with no API calls, for training or when the model is unavailable. |
| 14 | Offer sent, baselines, override control | Baselines and Compass's ranking drive an automatic offer; central command can override it. |
| 15 | Primary assigned, support offer sent | The responder accepts. This work is complex, so a second responder is offered support. |
| 16 | Fixed outcome: issue reopened | Here the first attempt fails, so the issue reopens for another try, using the same resolution math as Live. |
| 17 | Analytics: Month, Week | A full simulated month: nearly three thousand issues in September, with a seventy-three percent first-time fix rate. |
| 18 | Compass vs Baselines | Every Compass ranking is compared with the nearest and naive-score baselines, and each disagreement can be inspected record by record. |
| 19 | Issue Pareto (September) | The Issue Pareto shows which few problems cause most of the work: here, two of three issue classes account for eighty percent of September's issues. |
| 20 | Drill into Material transfer → symptom; Failed attempts | Drill down from issue class to observed symptom to the fix that was applied, and switch to downtime or failed attempts. |
| 21 | Settings → API (credential area hidden) | Ranking and event planning each run on their own AMD Token Factory model. Rate limits, bounded retries and a circuit breaker control requests. |
| 22 | Settings → API | If a model is slow or fails, dispatch falls back deterministically, and the simulation clock keeps moving. |
| 23 | Closing card | The right responder. The right fix. · Runs autonomously. Supervised by your control room. · Built on AMD Token Factory. |

## Re-recording

Restore the paused copy (the approval consumes the pending recommendation), start it on
3013 with forced providers, then run
`node docs/submission/build/record-video.mjs http://127.0.0.1:3013 ISS-3618 EQ-48`.
`FRAMES=<dir>` saves a still per caption for checking.

## Rules kept

- No model response is manufactured; every ranking shown is a stored MiMo output.
- The credential area is hidden for the Settings shot; no key, hint or terminal is shown.
- No company logos; "AMD Token Factory" appears only as the provider name.
