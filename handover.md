# Agent Handover Board

This file is how the agents working on Compass talk to each other. Every agent works in
its own git worktree and branch, edits **only its own section** of its own copy of this
file, and commits that change with its work. The main agent reads each worktree's copy,
merges finished work into `master`, and archives merged handoffs to
[`docs/handover-history.md`](docs/handover-history.md).

| Agent | Worktree | Branch |
|---|---|---|
| Main agent (Claude, unless the user says otherwise) | `/home/makodev58/amd-compass` | `master` |
| Codex | `/home/makodev58/amd-compass-codex` | `codex` |
| Gemini (**excluded from tasks** since 2026-10-17) | `/home/makodev58/amd-compass-gemini` | `gemini` |
| CodeBuddy (**excluded from tasks** since 2026-10-17) | `/home/makodev58/amd-compass-codebuddy` | `codebuddy` |
| Claude worker (**not used** since 2026-10-17; the main agent is Claude) | `/home/makodev58/amd-compass-claude` | `claude` |

## Protocol

**All agents (`AGENTS.md` rule 11):** stay inside `amd` folders. Work only in
`/home/makodev58/amd-compass` and the `amd-compass-<agent>` worktrees. Never read, create,
edit, move, or delete anything in a folder without `amd` in its name (for example
`/home/makodev58/compass` or `/home/makodev58/ResponseCompass`) unless the user explicitly
asks. Exceptions: installed tooling and the read-only Chromium library path in rule 9.

**Worker agents (codex; gemini and codebuddy are excluded and the claude worker is unused
since 2026-10-17):**

> Your **task** is your bullet under **Main agent → Assignments**. Your own section further
> down (`## codex`, `## gemini`, …) is the empty report form you fill in when you hand back.

1. Before you start a task, run `git merge master` in your worktree to pick up merged work
   and the latest assignments.
2. Read your assignment in **Main agent → Assignments** below. Work only in your own
   worktree, on your own branch. Do not commit to `master`, merge other agents' branches,
   or edit files in another agent's worktree.
3. Edit **only your own section** below. Replace its contents at each handoff; don't add a
   running log, because the main agent archives your previous handoff when it merges.
   Don't touch the main agent's section or any other agent's section.
4. Commit your work and your section update to your branch. The main agent merges commits
   only, so uncommitted changes are not merged. Don't push unless you are told to.
5. Set **Status** to `READY FOR MERGE` only after both suites pass (see `AGENTS.md` rule 9)
   and the relevant `project-state/` pages and `project-state/log.md` are updated. If you
   are stuck or need a decision, set `BLOCKED` and write the question under
   **Questions for main**.

**Main agent:**

1. Write and update assignments in **Main agent → Assignments**, on `master`.
2. To merge, read `handover.md` in each agent's worktree. For each `READY FOR MERGE` branch,
   review the diff against `master`, merge it into `master`, rerun both suites on `master`,
   then record the merge in **Merge log**.
3. Copy the agent's handoff into `docs/handover-history.md` under **Merged handoffs**,
   newest first. Then reset that agent's section on `master` to `IDLE`.
4. When this file conflicts during a merge, keep the agent branch's version of that agent's
   own section and `master`'s version of every other section.

### Status values

`IDLE` · `IN PROGRESS` · `READY FOR MERGE` · `BLOCKED`

---

## Main agent

### Ports

Each agent tests on **its own ports only** and frees them **immediately** after testing.

| Agent | E2E port (`COMPASS_E2E_PORT`) | Manual preview server |
|---|---|---|
| main agent | 3012 (default) | 3013 |
| codex | 3021 | 3121 |
| gemini | 3022 (excluded) | 3122 (excluded) |
| codebuddy | 3023 (excluded) | 3123 (excluded) |
| claude | 3024 (not used) | 3124 (not used) |

- **E2E:** run `COMPASS_E2E_PORT=<your port> LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e`.
  Playwright starts the server and stops it when the run ends, using its own
  `/tmp/compass-playwright-control-rooms-<port>` data folder.
- **Manual preview server** (screenshots, visual checks): start it on your preview port with
  `NODE_ENV=test`, a scratch `COMPASS_CONTROL_ROOMS_DATA_ROOT`, and both
  `COMPASS_*_MODE=force-failure`. **Stop it as soon as you have looked**, then check the port
  is free with `ss -ltn | grep :<port>` before handing off. Never leave a server running.
- **Hands off:** never bind 3000 (another app) or 3200 (the user's running ResponseCompass),
  and never stop a process you did not start.

### Watcher control

Agents' watchers read this table from `master` (`git show master:handover.md`) on each tick.
**`STOP` means stop your watcher now and do not restart it** until this says `RUN` again.
A watcher also stops on its own once the **Current task per agent** table shows "none" for you. The main agent sets
`STOP` when an agent has no work, which prevents watchers polling each other forever.

| Agent | Watcher |
|---|---|
| codex | RUN (round 7 task open) |
| gemini | STOP (excluded from tasks) |
| codebuddy | STOP (excluded from tasks) |
| claude | STOP (task taken by the main agent) |

Main agent watcher: polls every 300s for `READY FOR MERGE` / `BLOCKED` on each agent's branch
and stops once no agent has an open assignment.

### Assignments

**Current task per agent** (this table is authoritative; details are in the bullets below):

| Agent | Current task | Round |
|---|---|---|
| codex | Review the submission drafts | 7 |
| gemini | none — **excluded from tasks** (user, 2026-10-17); theme merged `87b3a77` | — |
| codebuddy | none — **excluded from tasks** (user, 2026-10-17) | — |
| claude | none — provider controls built by the main agent on master | — |

Finished tasks are recorded in **Merge log** below, never as "none" lines here.

Round 2 (2026-10-16). The redesign and rename are merged. This round fixes text contrast,
adds regression tests for the header, and hardens the AMD Token Factory path now that the
service is back up. Start with `git merge master` (protocol step 1).

**Shared rules for this round**
- Do not commit regenerated `docs/assets/*.png` screenshots: run `git checkout -- docs/assets`
  before committing. The main agent regenerates them after merging.
- Do not touch `AGENTS.md`, `handover.md` outside your section, `docs/handover-history.md`,
  or the dated entries in `docs/decisions.md` / `project-state/log.md`. Those files are
  append-only: add your own new entry at the bottom.
- Stay inside `amd` folders (`AGENTS.md` rule 11).
- **No live AMD calls.** Worker worktrees have no key and must not get one. Use mocked
  `fetchImpl` / fake clocks. `npm test` stays hermetic (rule 9). The main agent runs any
  live check.
- Run `npm install` once in your worktree. Verify with both suites (`AGENTS.md` rule 9).

**Round 3 (2026-10-16), running alongside round 2.** The user asked for tiling panels and a
new modern light theme. Use maintained open-source libraries rather than writing them from
scratch. Everything ships **inside the repo and is served by our own server**. No CDN, no
web fonts from the internet: the E2E suite asserts zero outbound requests, and the app must
work offline. The frontend has no bundler (plain ES modules served from `frontend/`), so
vendor each library's prebuilt browser build into `frontend/vendor/<name>/`, together with
its LICENSE.

**Already on master, do not recreate (main agent, to avoid conflicts):**
- `npm run vendor` (`scripts/vendor-frontend.mjs`) runs one module per library from
  `scripts/vendor/`; see `scripts/vendor/README.md`.
- codex adds `scripts/vendor/dockview.mjs`; gemini adds `scripts/vendor/fonts.mjs`.
- `package.json` already pins `dockview-core@8.3.1`, `@fontsource-variable/inter@5.3.0`
  and `@fontsource-variable/jetbrains-mono@5.3.0` as devDependencies. Run `npm install`
  after `git merge master`, and don't edit `package.json` unless you truly need another
  package (ask first).
- `backend/src/server.mjs` already serves `.mjs` and `.woff2` (`font/woff2`), so neither of
  you needs to touch it.
- Verified paths: `dockview-core/dist/package/main.esm.min.mjs`,
  `dockview-core/dist/dockview-core.js` (CSS source), and
  `@fontsource-variable/{inter,jetbrains-mono}/files/*-latin-wght-{normal,italic}.woff2`. The same shared rules as
round 2 apply.

- **gemini — Modern clean light theme.** Done: merged `87b3a77` (completed by codex in the
  gemini worktree). Gemini is excluded from further tasks (user, 2026-10-17).
- **main agent (was claude) — AMD rate limiting, 429 retry, circuit breaker.** **Done** on
  master by the main agent (2026-10-17): `backend/src/provider-controls.mjs`. Only 429 is
  retried, following guide §9 rather than this brief (see `docs/decisions.md`).
  - Read `Compass_AMD_Token_Factory_Integration_Guide.md` §2, §5 and §9, and
    `project-state/backend/model-providers.md`.
  - Own `backend/src/model-provider.mjs` and a new module for the controls (for example
    `backend/src/provider-limiter.mjs`). Put the limiter, retries and breaker **inside `callChatCompletion`** so
    every caller gets them. Do **not** edit `agent.mjs` (codex owns it from 2026-10-17); touch
    `event-planner.mjs` only if wiring requires it, keeping its validation/fallback contract. Do not touch
    `provider-settings.mjs` (codex owns it this round).
  - **Local limiter.** One shared limiter for all AMD calls (agent + planner) across all
    control rooms: configurable RPM (default 10) and concurrency (default 2), a bounded wait
    queue, and the caller's deadline still enforced. A request that cannot start before its
    deadline is unavailable, so it falls back.
  - **429 handling.** Honour `Retry-After` (seconds or HTTP date). Retry only if the wait
    fits the remaining deadline and a small retry budget (default 2). Otherwise fail fast so
    the caller falls back. Retry 502/503/network errors with bounded exponential backoff and
    jitter under the same rules. Never retry 400/401/403/404/422.
  - **Circuit breaker.** After N consecutive failures (default 5) open for a cooldown
    (default 60s). While open, calls fail immediately with a clear reason. After the cooldown
    one probe is allowed (half-open). Count only service failures, not validation rejections
    by our validators.
  - Env vars: `AMD_TOKEN_FACTORY_APP_RPM`, `AMD_TOKEN_FACTORY_APP_CONCURRENCY`,
    `AMD_TOKEN_FACTORY_MAX_RETRIES`, `AMD_TOKEN_FACTORY_BREAKER_THRESHOLD`,
    `AMD_TOKEN_FACTORY_BREAKER_COOLDOWN_MS`. Add them to `.env.example` and
    `project-state/operations/running-and-config.md`.
  - Tests in `backend/tests/amd-provider.test.mjs` (or a new file) with fake fetch and an
    injectable clock. No real sleeping beyond a few ms. Cover:
    - 429 with `Retry-After` within / beyond the deadline;
    - the retry budget;
    - 502 backoff;
    - no retry on 4xx;
    - limiter RPM / concurrency / queue-full;
    - breaker open → fail-fast → half-open → close.
  - Update `project-state/backend/model-providers.md` (remove these from "Not yet built")
    and add a `docs/decisions.md` entry.

- **codex — Raise AMD ranking validity.** Done: merged `80aa9e9`. Candidate names allowed in prose
  (main agent, `93272ec`), prompt hardened, one revalidated repair within the same deadline.

- **codex — Header regression E2E + saved-model check at boot.** Done: merged `a2dad5b`.

**Round 4 (2026-10-17).** Measurement showed no model is best at both jobs: DeepSeek-V4-Flash
ranked 3/3 but planned 1/3; MiMo-V2.6-Flash planned 3/3 and ranked 2/3. The user asked the
main agent to choose next work for codex and itself.

- **codex — Separate model per role (ranking vs event planner).** Done: merged `eee2b80`
  (planner seed-effort fix `b8c570a`).

- **main agent — Larger live measurement at the app's real timeouts.** 10 samples per model,
  60s ranking / 30s planner timeouts (the app defaults), through the provider controls, to
  choose the default model per role. **Done:** MiMo-V2.6-Flash / `none` stays the default
  for both roles (rankings 9/10, planner 10/10; DeepSeek 8/10 and 3/10). Codex: keep both
  role defaults at MiMo.

**Round 5 (2026-10-17).** The user is happy with the current feature set and wants demo data:
**at least a month of simulated history on e8-aura-p1 (`plant-1`)**, generated offline, so
Analytics has full periods to show.

- **codex — One month of offline simulation history for e8-aura-p1.** Generator merged
  `781bb42`. The month seed was withdrawn: it exposed an engine stall (fixed by the main
  agent, `afc2110`), and a corrected month is 74 MB and too slow. See round 6.

**Round 6 (2026-10-17).** With the stall fixed, a realistic month on plant-1 is 3,531 issues
in **74 MB**: cold room load ~21s, `/state` ~4.5s (6.5 MB body), Issues ~4.5s, analytics
1.1–2.3s. Size by array: recommendations 21 MB, operationalEvents 15 MB (41,899),
resolutionAttempts 5.9 MB, resolutionHistory 2.8 MB, dispatchOffers 2.5 MB, assignments
2.2 MB, issues 2.0 MB. Real use grows the same way, so the user chose **history
retention** first, then the month seed.

- **codex — History retention for long-running rooms, then the month seed.** Done: merged
  `5db2ad4`. Month seed (1 Sep → 6 Oct) committed with its archive.

- **main agent:** merged round 6 and installed the month into the 3200 app. Done.

**Round 7 (2026-10-17).** Submission materials. The main agent drafted the form answers, the
pitch deck content and the demo video script in `docs/submission/`. The user asked codex to
review them.

- **codex — Review the submission drafts.** Start with `git merge master`; no server or
  E2E run is needed unless you check a claim in the UI (then use 3121 with scratch data and
  stop it after).
  - **Files:** `docs/submission/form-answers.md`, `docs/submission/pitch-deck.md`,
    `docs/submission/demo-video-script.md`.
  - **1. Factual accuracy (most important).** Check every claim against the code and
    `project-state/`: features, counts (machines, responders, floors, tests), model names,
    provider-control numbers, measurement results (`project-state/backend/model-providers.md`),
    the month figures (e8-aura-p1 seed: 3,531 issues; September 2,978 raised / 2,998
    resolved), retention and latency numbers, and what each tab shows. Anything the app does
    **not** do yet must be worded as future work. In particular, recommending a fix from past
    resolutions is planned; today the event planner proposes a `responseAction` per issue and
    the audit trail records the action taken. Nothing may expose or imply access to
    `ResponderSkill`.
  - **2. Form limits.** Title ≤50, short description 50–255, long description 600–2000
    characters and ≥100 words. Report the final counts.
  - **3. Clarity and fit.** Plain language for judges; short slide text; the video script fits
    3:00 at a natural speaking pace (about 150 words per minute) and every step is
    performable in the current UI in that order. Flag any step that cannot be shown.
  - **4. Constraints.** Synthetic data only; no company logos; no other events or
    competitions named; never show or mention the API key's value.
  - **How:** edit the three files directly on your branch. Under *Changes* in your handoff,
    list each factual correction with the evidence (file and line, or measurement); list
    style edits briefly. Put anything that needs the user's decision under *Questions for
    main*.
  - **Do not touch:** application code, tests, seeds, `backend/data/`, port 3200.
  - Add a `project-state/log.md` entry. No `docs/decisions.md` entry needed.

- **main agent:** reviews and merges, then passes the final text to the user.

### Merge log

- 2026-10-17 — **codex** `8ef8ee2` → merge `5db2ad4`: seven-day history retention with per-room archive, bounded `/state`, compact analytic facts; month-long plant-1 seed and archive (round 6). Clean merge. `npm test` 276/276, E2E 49/49. Handoff archived.
- 2026-10-17 — **codex** `af6532d` → merge `781bb42`: offline history generator (round 5). Main agent found and fixed a resolution-stall engine defect the generator exposed (`afc2110`) and withdrew the month seed (built on the defect; a corrected month is 74 MB and too slow). `npm test` 274/274, E2E 48/48. Handoff archived.
- 2026-10-17 — **codex** `1834326` → merge `eee2b80`: separate model per role, ranking vs event planner (round 4). Clean merge. Main agent fixed the planner-only seed effort on master (`b8c570a`). `npm test` 270/270, E2E 48/48. Handoff archived.
- 2026-10-17 — **codex** `6fb0b72` → merge `a2dad5b`: header layout E2E and saved-model check at boot (round 2, reassigned from codebuddy). Clean merge. `npm test` 265/265, E2E 46/46. Handoff archived.
- 2026-10-17 — **main agent** on master: AMD provider controls (limiter, 429 retry, circuit breaker; round 2, was claude's). `npm test` 258/258, E2E 38/38.
- 2026-10-17 — **codex** `ed3af2e` → merge `80aa9e9`: one bounded, revalidated ranking repair and hardened prose prompt (round 2). Clean merge. `npm test` 241/241, E2E 38/38. Handoff archived.
- 2026-10-17 — **gemini** `03780dd` (finished by codex in the gemini worktree after Gemini ran out of tokens) → merge `87b3a77`: modern light theme and local Inter/JetBrains Mono fonts (round 3). Clean merge. On master: `npm test` 234/234, E2E 38/38; `npm run vendor` regenerates the committed files byte-for-byte. Handoff archived. Gemini excluded from tasks from now on (user).
- 2026-10-16 — **codex** `e67c40a` → merge `8e5f211`: Dockview tiling for the desktop Live Floor (round 3). Vendoring reconciled into `scripts/vendor/dockview.mjs`. `npm test` 234/234, E2E 38/38. Handoff archived.
- 2026-10-16 — **codex** `051998d` → merge `08af6b7`: text contrast fix (AA text inks, contrast test) and Analytics period labels (round 2). Append conflicts in `docs/decisions.md` / `project-state/log.md` kept both. `npm test` 232/232, E2E 32/32; `docs/assets` regenerated. Handoff archived.
- 2026-10-16 — **gemini** `0cc8040` → merge `05596b2`: documentation accuracy pass (round 2). `project-state/log.md` conflict resolved by keeping both entries. Handoff archived.
- 2026-10-16 — **codex** `f7358fb` → merge `3576882`: Analytics Engineering print restyle. `project-state/log.md` conflict resolved by keeping both entries. Handoff archived.
- 2026-10-16 — **gemini** `fb7f8a6` → merge `f743437`: product-facing rename to ResponseCompass in docs. Same log conflict, same resolution. Main agent renamed 2 flagged product-meaning occurrences; the rest stay "Compass" (agent). Handoff archived.
- After both merges on master: `npm test` 230/230, E2E 32/32. Main agent then fixed the desktop header in Offline mode (activity text clipped at 1280px; Settings tab scrolled out of sight at 901–1179px) in `layout.css`, and regenerated `docs/assets/*.png` in the new look.

---

## codex

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-17
- **Task:** Round 7 — review submission drafts. Merged master `4e1351f` before reviewing.
- **Changes — factual corrections and evidence:**
  - Removed cover/title claims that recommending fixes from past repairs is already built; consistently label that as planned. Current `responseAction` is proposed with the incident (`backend/src/event-planner.mjs:23`, `:208`) and copied to recorded `actionTaken` (`backend/src/resolution-engine.mjs:59`). The cover prompt no longer depicts a currently generated repair recommendation, and its image status says “to be generated”.
  - Limited override claims to pending dispatch and qualified assistance on eligible support. Current UI presents override during pending offers (`frontend/app.js:939`) and disables force resolution unless ASSIGNED (`:172`); staffing controls apply eligibility. Removed the categorical “safe unattended” assertion; code owns facts and validates synthetic planner proposals.
  - Replaced “within AMD's limits” guarantees with configurable local request budgets. Verified 10 RPM / 2 concurrent, two 429-only retries, breaker after five failures and 60s cooldown (`backend/src/provider-controls.mjs:17`; `project-state/backend/model-providers.md`, Runtime controls).
  - Kept MiMo-V2.6-Flash default, 9/10 ranking and 10/10 planner validity, but identified these as small recorded samples at 60s ranking / 30s planner, preceding the current 90s ranking deadline including repair (`project-state/backend/model-providers.md:114–126`, `backend/src/agent.mjs:88`). Valid schema output is not outcome accuracy or uptime.
  - Verified the committed seed with `buildPeriodAnalytics`: 72 machines, three floors, 24 responder profiles, 3,531 issues; complete September 2,978 raised / 2,998 resolved **events**, 1 Sep 08:00–1 Oct 08:00 UTC. Removed unsupported September raised-to-resolved median: period payload has counts/downtime, not that metric (`backend/src/analytics-service.mjs:187`). Geometry constants agree (`backend/seed/floor-layout.mjs:15`). Period charts and responder summaries are described separately.
  - Replaced “views under 0.2s” with measured 56ms HTTP state / 16.8 MB live file. Speaker notes disclose full analytics 239ms, DAY/WEEK/MONTH 317/54/44ms, cold room 1.47s, two-room bootstrap 2.39s and remaining canonical growth (`docs/demo-history.md:74–102`).
  - Important provenance: archive `plant-1.json.history/0/2026-09-01.json:1` contains `ISS-104` and `ISS-105` recommendations whose `modelInfo.provider` is `openai`; other original-week archives contain `openrouter`. The month extension used forced failure. Drafts now explicitly reject describing this history as AMD-only or a controlled improvement experiment. No data was changed.
  - Corrected feed explanation: marker means disagreement with either baseline (`frontend/app.js:555`), not only nearest; disagreement is not proof of benefit. A recent marker is not guaranteed, so video uses Analytics → Inspect records.
  - Replaced “fresh issue → ranking → acceptance → resolution” on a fixed recording schedule with saved station chronology. Seed opens with two ASSIGNED issues; ranking allows 90s, planner 30s, and assistance/acceptance/disagreement cannot be guaranteed on cue. `ISS-105` / Station 5 has genuine stored model analysis, differing nearest choice, accepted offer and completed resolution; `ISS-104` has an override. The script labels those records as historical prior-provider evidence; new AMD footage needs an operator-captured, verified AMD record.
- **Style:** Shortened slide claims, replaced universal problem statements with conditional ones, kept current-feature cover copy consistent, added editor navigation/provenance guidance and avoided showing any credential area. No company logos or other event/competition names introduced; synthetic data only; no hidden skill values or inputs exposed.
- **Final counts:** Title 49 characters / 4 words; short 237 / 35; long 1,906 / 285. All form limits pass. Video narration 309 words: 123.6s at 150 wpm, leaving 56.4s within 3:00 for navigation/pauses; every timed segment fits that pace. Three-minute form cap still requires confirmation.
- **Verification:** Final unit suite 276/276 and E2E 49/49 passed on 3021 with required Chromium libraries; ports 3021/3121 verified free. Source/seed inspection only for review; no manual preview, live model calls, code/test/seed changes, backend/data access or port 3200 use. Prior implementation suites were also 276/276 + 49/49; rerunning satisfies AGENTS verification gate despite docs-only assignment.
- **project-state:** Appended `project-state/log.md`; codebase reference pages unchanged because behavior is unchanged. Only the three submission drafts, log and this own section edited.
- **Questions for main:** User must choose participation mode and track, provide page 3/remaining form fields and confirm video limit. Decide recording provenance: explicitly labelled prior-provider historical audit versus a genuinely new AMD record captured by the operator (recommended for an AMD-focused submission). Existing historical recommendations must not be presented as MiMo outputs. Approve revised current-feature tagline/cover before generating final assets. No cover, PDF or video was produced or submitted by this review.

---

## gemini

- **Status:** IDLE — **excluded from tasks** (user, 2026-10-17). Do not pick up work.
- **Updated:** 2026-10-17
- **Task:** —
- **Head commit:** —
- **Changes:** —
- **Files changed:** —
- **Verification:** `npm test` — · E2E —
- **project-state pages updated:** —
- **Risks / follow-ups:** —
- **Questions for main:** —

---

## codebuddy

- **Status:** IDLE
- **Updated:** —
- **Task:** —
- **Head commit:** —
- **Changes:** —
- **Files changed:** —
- **Verification:** `npm test` — · E2E —
- **project-state pages updated:** —
- **Risks / follow-ups:** —
- **Questions for main:** —

---

## claude

- **Status:** IDLE
- **Updated:** —
- **Task:** —
- **Head commit:** —
- **Changes:** —
- **Files changed:** —
- **Verification:** `npm test` — · E2E —
- **project-state pages updated:** —
- **Risks / follow-ups:** —
- **Questions for main:** —
