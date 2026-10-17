# Demo video script (reviewed draft)

Target length **3:00**. Times are cumulative. Narration fits about 150 words/minute with
room for clicks and pauses; narration totals **309 words** (about 2.06 minutes at 150 words/minute), leaving about 56 seconds for visual pauses and navigation. Confirm the form's duration limit
before recording. All plant data is synthetic.

## Before recording

- Use the month seed in e8-aura-p1, Live and paused at 6 Oct 08:00 UTC. Do not reset it.
- Rehearse the station-history path: Stations → Station 5 (`EQ-05`) → Observed issues →
  Earlier issues / Show older records → `ISS-105`. It has saved model analysis, baseline
  disagreement, an accepted offer and resolution. Station 4 / `ISS-104` has an override.
  These are existing historical records, not fresh AMD responses. The original week
  predates the current AMD-only integration. Label that footage **Historical simulation
  record — prior provider**; do not attribute it to MiMo or AMD.
- For an AMD-specific ranking shot, the operator must instead capture a genuine new AMD
  decision in a separate rehearsal, identify its issue ID and confirm its stored provider.
  Choose only a record with the outcomes being narrated. Do not assume disagreement,
  acceptance or assistance will occur on demand. If unavailable, use the labelled
  historical walkthrough below; user decision on which version to record is still open.
- Keep the September view paused and separate from any running rehearsal. A ranking can
  take up to 90 seconds including repair; the planner deadline is 30 seconds. Cut or
  explicitly time-compress real waits; never manufacture a response.
- Browser at 1920×1080, zoom 100%, notifications off. Open Settings → API only for a
  tightly cropped shot of the Ranking and Event planner model controls. Configure any
  credential before recording; exclude all credential fields, hints, terminals and logs.

## Script

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Reviewed cover, then room picker. | When equipment fails, the nearest available technician may not be the best match. ResponseCompass helps a control room choose a responder and understand the tradeoffs. |
| 0:15–0:35 | Open e8-aura-p1. Live Floor: pan, change floor, briefly select 2.5D. Stay paused. | This synthetic plant has three floors, seventy-two machines and twenty-four responder profiles. The floor shows locations and current work; shift rules determine who is available. Each control room keeps its own clock and history. |
| 0:35–0:50 | Stations → Station 5 → Observed issues. Cut lengthy pagination; select `ISS-105`. Add historical-provider label. | Here is a saved simulation record. Code establishes eligibility, travel time and observed history. Models cannot access the simulation's private responder skill. |
| 0:50–1:15 | Saved Compass analysis, evidence table, decision-time baselines. Do not claim this historical response came from AMD. | Compass ranks only the eligible candidates supplied by code and explains its choice. In this saved example, its first choice differs from the nearest baseline. That disagreement is inspectable; it does not, by itself, prove a better outcome. |
| 1:15–1:35 | Same record: Dispatch outcome, accepted offer, Response and resolution. | The saved chronology shows the responder offer and its acceptance, followed by the resolution and recorded action. The application handles these steps. The action comes from the incident's planned response; recommending a fix from past repairs is future work. |
| 1:35–1:50 | Return to Station Status. Show an active assigned issue and roster; no forced resolution. | Live work can receive additional help when eligible support is available. Operators can override pending dispatch. Those actions leave an audit trail rather than silently replacing a decision. |
| 1:50–2:00 | Analytics → Compass vs Baselines → Inspect records. | Here, recommendation records show agreement and disagreement with both baselines. This explains choices, rather than claiming a performance win. |
| 2:00–2:25 | Month: complete September, then Week and Day; scroll to responder summaries. | September contains nearly three thousand issue-raised events and a complete month of simulated activity. Charts show activity and downtime. Observed responder summaries show resolution time and success with denominators, suppressing thin samples. This history tests the engine; it is not an AMD-only outcome experiment. |
| 2:25–2:50 | Settings → API, cropped to two model controls; then Live Floor. No settings changes or key fields. | The current integration uses AMD Token Factory, with MiMo-V2.6-Flash as the default for both ranking and event planning. Code validates outputs. Local rate limits, bounded retries and a circuit breaker control requests. When a model fails or times out, deterministic fallback keeps dispatch available. |
| 2:50–3:00 | Reviewed cover. | Next, we plan fix recommendations drawn from comparable past resolutions. ResponseCompass: the right responder, and next, the right fix. |

## Recording checks

- The initial seed already has two assigned issues: starting the clock does not guarantee
  a new incident in fifteen seconds, or a model recommendation in thirty-five seconds.
  Those original live-timing steps have been replaced with saved chronology.
- A newly assigned issue may still be unresolved. Show completed resolution only in a
  completed record. Do not narrate an override or second responder unless present.
- The recent event feed may contain no disagreement marker; use Analytics → Inspect
  records instead. Feed markers, when present, mean disagreement with either baseline.
- All screen steps above are supported by the current code. No manual UI session or live
  provider call was made for this document review; rehearse the final take before filming.
- No company logos, other event/competition names or credential values in any frame.
