# Submission form answers (draft)

Draft text for the submission form. Character limits are the form's; counts are for the
text inside each code block. Status: **draft, awaiting codex review**.

## Page 1 — Basic information

### Submission Title (max 50)

```
ResponseCompass: Context-Aware Responder Dispatch
```

### Short Description (50–255)

```
An AI dispatch agent for operations control rooms. When equipment fails, Compass ranks which responder should go, explaining why, using AMD Token Factory models while deterministic code owns every fact and keeps dispatch running offline.
```

### Long Description (600–2000 characters, 100+ words)

```
When equipment fails on a factory floor, the closest available technician is often not the best person to send. ResponseCompass is a context-aware dispatch agent inside a persistent, simulated control room. It finds who should respond to each issue right now, and explains why.

Application code establishes the evidence: the simulation clock, each responder's location, shift and workload, eligibility, past resolution history, and two transparent baselines (nearest responder and a naive score). Compass, running on AMD Token Factory (MiMo-V2.6-Flash by default), then ranks only the eligible candidates it is given and writes a qualitative rationale. A second model acts as an event planner that proposes realistic incidents and a response action for each. Every model output is validated; if it is slow, rate-limited or invalid, the system falls back to a deterministic path, so dispatch never stops.

Offers go out automatically. Responders accept or reject asynchronously, complex jobs pull in a second responder, and central command can override at any time. Each decision keeps a full audit trail, and the event feed flags where Compass disagreed with the baselines.

Each responder's true skill is hidden simulation truth that no model ever sees, so outcomes reflect real fit rather than anything the model was told. Operators get a live floor map, issue and responder views, and day, week and month analytics on resolution time, success and downtime. Next, Compass will also recommend the fix, drawing on the actions recorded in past resolutions.

Provider controls (rate limiting, 429 retries, a circuit breaker) keep usage within AMD's limits, and an API-free Offline mode makes the demo reproducible. Built with Node.js, plain JavaScript and a 270+ test suite including Chromium end-to-end tests.
```

### Participation Mode

Open: the user chooses Online or Onsite.

### Categories / Event Tracks

Open: the form did not show the options. Pick after the user pastes them.

### Technologies Used

- AMD Token Factory (OpenAI-compatible API)
- MiMo-V2.6-Flash
- Node.js 22
- JavaScript (ES modules)
- HTML/CSS
- Dockview
- Playwright
- Docker

## Page 2 — Media

- **Cover image (16:9):** generated from the prompt below.
- **Video presentation (required):** script in [demo-video-script.md](demo-video-script.md).
- **Slide presentation (required, PDF):** content in [pitch-deck.md](pitch-deck.md).

### Cover image prompt (ChatGPT, 16:9)

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
