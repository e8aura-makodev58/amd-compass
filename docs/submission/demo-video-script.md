# Demo video

**Recorded:** `ResponseCompass-demo.webm`, 1920×1080, about 1:40, captions burned in, no
audio. Produced by `build/record-video.mjs` (see `build/README.md`). All plant data is
synthetic. Confirm the form's duration limit and accepted formats before uploading; convert
to MP4 if WebM is not accepted (this host has no MP4 encoder).

## What it shows

The recording runs against a **paused scratch copy** of e8-aura-p1 taken on 2026-10-17
after a live capture on AMD Token Factory, with model calls forced off, so it shows saved
records only and nothing changes during the take.

The featured record is **ISS-3642** (station EQ-03, simulated time 6 October 13:33):

- MiMo-V2.6-Flash on AMD Token Factory ranked **Engr370** first for the initial
  assignment. The nearest-responder baseline chose Optr375 (0.8 min away, 11 prior cases,
  62% success); the naive-score baseline chose Tech363.
- Engr370 accepted the offer and resolved the issue successfully in 11.2 minutes.
- In that capture, 7 of 11 live rankings returned valid output; the rest fell back to the
  deterministic path (timeouts and an open circuit breaker while AMD was slow).

One good outcome is not proof of better performance; the captions say the disagreement is
recorded for review, not assumed to be better.

## Shot list and captions

| Shot | Screen | Caption |
|---|---|---|
| 1 | Title card | (title and tagline only) |
| 2 | Room picker | When equipment fails, the nearest technician may not be the best match. ResponseCompass helps a control room choose who to send, and shows why. |
| 3 | Live Floor: floors 2, 3, 1; 2.5D view; back to 2D | This synthetic plant has three floors, seventy-two machines and twenty-four responders. Each control room keeps its own clock and history. |
| 4 | Dispatch / context maximised → Stations → EQ-03 → ISS-3642 | Code establishes eligibility, travel time and observed history. Compass, running live on AMD Token Factory with MiMo-V2.6-Flash, ranks only the eligible candidates it is given. |
| 5 | Initial assignment Compass analysis and evidence table | The nearest responder is under a minute away but has little history with this fault. Compass ranked Engr370 first and explained why; both baselines chose someone else. |
| 6 | Response and resolution | Engr370 accepted the offer and resolved the issue first time, in eleven minutes. Every step, and the action taken, is in the audit trail. |
| 7 | Analytics: Month, Week, Day | A full simulated month: nearly three thousand issues raised in September. Charts show activity and equipment downtime. |
| 8 | Analytics, scrolled | Summaries show denominators, suppress thin samples and never rank people. |
| 9 | Settings → API, credential area hidden | Ranking and event planning each run on their own AMD Token Factory model. Rate limits, bounded retries and a circuit breaker control requests. |
| 10 | Settings → API | If a model is slow or fails, dispatch falls back deterministically, and the simulation clock keeps moving. |
| 11 | Closing card | Next: recommending the fix from past resolutions. The right responder. The right fix. |

## Optional voice-over

The captions are written to be read aloud at a natural pace (about 230 words, roughly 1:40).
To add narration, record the caption text over the video in any editor; keep the captions.

## Rules kept

- No model response is manufactured; the featured ranking is a stored MiMo output.
- The credential area is hidden for the Settings shot; no key, hint or terminal is shown.
- No company logos; "AMD Token Factory" appears only as the provider name.
- Fix recommendations are presented as next, not as built.
