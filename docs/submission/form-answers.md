# Submission form answers (draft)

Draft text for the submission form. Character limits are the form's; counts are for the
text inside each code block. Status: **revised draft (2026-10-18); user choices, round 9 and final media still pending**.

## Page 1 — Basic information

### Submission Title (max 50)

```
ResponseCompass: Context-Aware Responder Dispatch
```

### Short Description (50–255)

```
An AI dispatch agent for operations control rooms. Compass ranks who to send and which fix to try first on AMD Token Factory models, while code owns every fact and the control room supervises from wall screens and approves overtime.
```

### Long Description (600–2000 characters, 100+ words)

Revised 2026-10-18 for the command-center framing (user direction). Every claim is built and
verified: fix ranking (round 8), overtime recommendations with approval (round 9, merged; live
AMD ranking staffing-7 captured and approved on a copy), wall screens and Issue Pareto.

```
When equipment fails on a factory floor, the closest available technician is often not the best person to send, and the first fix tried is often a guess. ResponseCompass is an AI dispatch agent for operations control rooms. It runs dispatch on its own, and the control room supervises it from wall screens: floor map, issue queue, dispatch context, event feed, analytics and an issue Pareto, each on its own monitor.

Application code establishes the evidence: the simulation clock, each responder's location, shift and workload, eligibility, past resolution history, and transparent baselines. Compass, running on AMD Token Factory (MiMo-V2.6-Flash by default), ranks only what it is given, with a qualitative rationale: the eligible responders for each issue, then the troubleshooting procedures for the observed symptom, from what actually worked on comparable past repairs. Before each shift handover it ranks lawful overtime options for the backlog, and central command approves or rejects them. Every model output is validated; if it is slow or invalid, a deterministic path takes over, so dispatch never stops.

Offers go out automatically, responders accept or reject, complex jobs get a second responder, and central command can override at any time. Every decision has an audit trail and is compared with its baseline.

Responder skill and each fault's true cause are hidden simulation truth that no model or screen sees, so outcomes stay independent of the model's claims. A simulated month shows a 73.5% first-time fix rate and a Pareto from issue class to symptom to applied fix.

Provider controls (rate limiting, bounded retries, a circuit breaker) protect the API budget, and an API-free Offline mode makes the demo reproducible. Built with Node.js and plain JavaScript, with hermetic unit tests and Chromium end-to-end tests.
```

### Reviewed form counts

Counts include paragraph breaks inside each code block, excluding the fences.

| Field | Characters | Words | Requirement |
|---|---:|---:|---|
| Title | 49 | 4 | ≤50 characters |
| Short description | 232 | 40 | 50–255 characters |
| Long description | 1,842 | 287 | 600–2,000 characters; ≥100 words |

### Participation Mode

Online (user, 2026-10-18).

### Categories

- **Business** (primary): dispatch and staffing decisions for operations control rooms.
- **Productivity**: select too if the form allows more than one category.

### Event Tracks

- **Evolus Business Agents on AMD**: an autonomous business agent running on AMD Token
  Factory. Health and Wellbeing does not apply.

### Technologies Used

Select only what the project actually uses:

- **Token Factory**: every Compass ranking and the event planner.
- **Claude Code** and **Anthropic Claude**: used to build it (main agent).
- **Codex**: used to build it (worker agent).

Do not select AMD Developer Cloud or AMD ROCm (not used: inference is the hosted Token
Factory API). Antigravity: only if the user actually used it.

## Page 2 — Media

- **Cover image (16:9):** to be generated from the reviewed prompt below.
- **Video presentation (required):** `ResponseCompass-demo.webm` (≤3:00, captions; being re-recorded); see [demo-video-script.md](demo-video-script.md).
- **Slide presentation (required, PDF):** `ResponseCompass-deck.pdf` (from `ResponseCompass-deck.pptx`); content in [pitch-deck.md](pitch-deck.md).

### Cover image prompt (ChatGPT, 16:9)

The tagline is the product vision, kept by user decision (2026-10-17) after codex flagged
that fix recommendations are not built yet. The long description, deck (slide 10) and video
present fix recommendations as the next step.

```
Create a 16:9 landscape cover image (1920×1080) for a software project called "ResponseCompass".

Concept: an AI agent in an operations control room that, for each equipment issue, recommends both the best responder to send and the best action to fix it, learned from past repair records.

LAYOUT: split composition. The left 45% is a clean text panel; the right 55% is the illustration.

TEXT (most important element; must be large and legible from a thumbnail):
- Title "ResponseCompass": very large, bold geometric sans-serif (like Inter Bold), dark navy. It should span almost the full width of the left panel, roughly 12–14% of the image height. Write it as one word with a capital C.
- Tagline on two short lines below it, about half the title's size, medium weight, slate grey with the key words in teal:
  "The right responder. The right fix."
  "Learned from every past repair."
- Spell all text exactly as written. No other text anywhere in the image.

ILLUSTRATION (right side): a light, top-down digital floor plan of a stylised factory, with soft grey machine outlines and walkways. One machine glows with a small amber alert. Several responder markers (simple circular avatars, no faces) are spread across the floor. The nearest marker is greyed out. A smooth glowing teal route line curves from a farther marker to the alert, showing the better choice. Beside the alert, a floating card shows a short checklist with a check mark and a small wrench icon, representing the recommended fix. Behind it, a faint stack of record cards with a small history/clock icon represents past repair history feeding the recommendation. A subtle compass rose sits behind the chosen route. Use abstract bars and placeholder lines on the cards, never readable text.

STYLE: modern product illustration, flat-to-soft 3D, light theme. Off-white to very pale cool-grey background. Palette: dark navy, teal accent, one amber alert colour, soft greys. Crisp, professional and calm; not sci-fi, no neon, no dark background. Keep the illustration lighter in visual weight than the text so the title dominates.

Do not include: company logos or brand marks, real people or faces, photorealism, cluttered detail, small or garbled text, watermarks.
```

## Page 3

Not received yet.
