# Demo video script (draft)

Target length **3:00**, screen recording of the app on e8-aura-p1 with voice-over. Times are
cumulative. Status: **draft, awaiting codex review**. Confirm the form's length limit before
recording.

## Before recording

- Use the running app with the month-long e8-aura-p1 history (Live, paused at 6 Oct 08:00).
- Set a working AMD key in Settings so the Compass rationale is a live model response.
- Browser at 1920×1080, zoom 100%, notifications off.
- Rehearse once: a live ranking can take up to about a minute, so start the clock early or
  cut the wait in editing. If AMD is unavailable, record the deterministic fallback and say so.

## Script

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Cover image, then the room picker. | "When a machine fails, most control rooms send whoever is closest. ResponseCompass sends whoever makes the most sense, and explains why." |
| 0:15–0:35 | Open e8-aura-p1. Live Floor: pan the map, switch floors, show the 2.5D overview briefly. | "This is a simulated plant: three floors, around seventy machines and twenty-four responders, each with a location, a shift and a history." |
| 0:35–0:50 | Start the clock (60×). An issue appears on the map and in the event feed. | "The event planner, running on AMD Token Factory, proposes a realistic incident. Code validates it before it ever touches the plant." |
| 0:50–1:25 | Select the issue. Show the Compass recommendation: ranked candidates and rationale. Point at the nearest responder not being first. | "Code gathers the evidence: who's eligible, travel time, same-class history. Compass ranks only those candidates. Here the nearest technician isn't first: Compass prefers someone with a stronger record on this class of fault, and says why." |
| 1:25–1:45 | Offer goes out; responder accepts; issue moves to Assigned. Show a second responder joining on a complex issue if one is on screen. | "Offers go out automatically. Responders accept or reject in their own time, and complex work pulls in a second responder." |
| 1:45–2:00 | Open the issue's audit trail: Compass analysis, offers, override, resolution and action taken. | "Every decision is audited: the analysis, every offer, any override by central command, and the action taken to resolve it." |
| 2:00–2:10 | Event feed: point at a baseline-disagreement marker. | "When Compass disagrees with the nearest-responder baseline, the feed flags it, so its value can be checked, not assumed." |
| 2:10–2:35 | Analytics tab: Month view with September complete, then Week and Day. Scroll the Compass-vs-baseline section. | "Here's a full month of operations: nearly three thousand issues in September. Analytics show resolution time, success and downtime, with denominators, and never rank people." |
| 2:35–2:50 | Settings → API: the two model pickers (Ranking, Event planner). | "Both roles run on AMD Token Factory, with MiMo-V2.6-Flash by default. Rate limits, retries and a circuit breaker keep usage within AMD's limits. If the model is slow or unavailable, dispatch falls back deterministically and never stops." |
| 2:50–3:00 | Back to the Live Floor, then the cover image with the tagline. | "Next, Compass will recommend the fix as well, from every past repair. ResponseCompass: the right responder, the right fix." |

## Notes for the editor

- Keep model wait time out of the cut; never fake a model response.
- Say "simulated" at least once; all data is synthetic.
- Do not show the API key, the Settings key field contents or terminal output.
- No company logos other than in the AMD Token Factory name as spoken.
