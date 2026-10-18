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
| codex | RUN (round 8 task open) |
| gemini | STOP (excluded from tasks) |
| codebuddy | STOP (excluded from tasks) |
| claude | STOP (task taken by the main agent) |

Main agent watcher: polls every 300s for `READY FOR MERGE` / `BLOCKED` on each agent's branch
and stops once no agent has an open assignment.

### Assignments

**Current task per agent** (this table is authoritative; details are in the bullets below):

| Agent | Current task | Round |
|---|---|---|
| codex | Hidden fault causes, fix catalog and ranked fix recommendations | 8 |
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

- **codex — Review the submission drafts.** Done: merged `5cf085a`.

- **main agent:** reviews and merges, then passes the final text to the user.

**Round 8 (2026-10-17).** The user requires **troubleshooting and fix recommendations** as a
real feature in the submission, and chose the measurable design: the fix applied must change
the simulated outcome, and Compass must rank fixes from evidence. The main agent meanwhile
extends the demo video (other features) and will add the fix segment after this merges.

- **codex — Hidden fault causes, a fix catalog, and ranked fix recommendations.** Start with
  `git merge master` and `npm install`; use port 3021. This is a large change: commit in
  coherent steps on your branch, keep both suites green at each, and read
  `project-state/backend/simulation.md`, `domain-model.md`, `concepts/agent-boundary.md` and
  `docs/history-retention.md` first.
  - **1. Hidden fault truth (like `ResponderSkill`, AGENTS.md rule 4).** Each issue gets a
    hidden **fault cause** drawn with the seeded RNG when it is created: 3–4 causes per
    issue class from an application-owned catalog (synthetic, domain-neutral), with priors
    that may vary by equipment. The cause drives an **observable symptom** (a short symptom
    code/text from the catalog shown on the issue), so similar symptoms carry real signal,
    but the cause itself is never exposed: not to Compass, the event planner, normal UI or
    API payloads, analytics, logs or archives readable by the UI. Add a schema guard in the
    style of `assertNoResponderSkill`, and tests that scan every public payload and model
    packet for it.
  - **2. Fix catalog with hidden effectiveness.** Application-owned fixes per issue class
    (about 5–6 each): id, short title, troubleshooting steps text. A hidden
    effectiveness table per (cause, fix) multiplies the attempt's success probability and
    scales its duration. When work starts, the attempt records the **fix applied**; outcome =
    existing team model × fix effectiveness, still seeded and deterministic. A failed attempt
    reopens the issue and the next attempt tries the next-ranked fix (a troubleshooting
    sequence). `actionTaken` in history becomes the applied fix (id + title + steps). The
    planner's free-text `responseAction` stays accepted for compatibility but is no longer
    the action taken; decide whether to keep showing it as the incident note and document it.
  - **3. Evidence and recommendation (rule 3 boundary).** Code builds the candidate fixes for
    the issue (that class's catalog) with **observed** evidence from history: attempts and
    first-time success for the same symptom, same issue class, same equipment, smoothed
    success, median minutes, last used. Compass (the **ranking role's** model and settings,
    through `callChatCompletion` and the provider controls) ranks **only the supplied fix
    ids** with a short rationale and a troubleshooting order; validate exactly like the
    responder ranking (supplied ids only, no invented fixes, bounded prose, no numbers that
    are not in the packet). **Deterministic fallback** ranks by smoothed same-symptom success,
    then evidence count, then catalog order. **Baseline for comparison:** the most frequently
    applied fix for the class. Store the recommendation on the issue with model info, the
    fallback/baseline picks and any disagreement, in the audit trail.
  - **4. Runtime.** Fix ranking runs as model-bound work in the live agent lane (it must never
    hold the clock; see `live-runtime.md`) and must not block responder dispatch: if it is
    not ready when work starts, use the deterministic pick and record that. Offline mode uses
    the fixture path, API-free. Event planner untouched apart from the catalog link.
  - **5. UI.** Issue panel: a **Recommended fix** section (ranked fixes, rationale,
    troubleshooting steps, evidence table, source: AMD model or deterministic, disagreement
    with the baseline). Audit trail: fix applied per attempt and the outcome. Analytics: a
    **first-time fix rate** by period, and recommended-vs-baseline agreement with
    denominators and the thin-sample rule. Must fit 375px and 1280px; Live Floor tiles keep
    working.
  - **6. History and the month seed.** Existing rooms migrate: open issues get a seeded hidden
    cause and symptom; resolved history keeps its legacy actions (marked legacy, excluded
    from fix evidence). Regenerate plant-1 with `generate:history` from the original week
    (`962ac7f`) to `2026-10-06T08:00Z` so the month shows fix evidence accumulating and the
    first-time fix rate improving week to week **if and only if the engine produces that**;
    report the weekly numbers either way. Retention must carry whatever fix evidence the
    engine and analytics need (compact facts), with archived/unarchived equality tests
    extended. Keep each committed seed file under 20 MB.
  - **7. Tests and docs.** Hermetic unit tests: hidden-cause privacy, catalog validation,
    outcome depends on fix as specified, deterministic fallback order, validator rejects
    unknown/invented fixes, lane non-blocking, migration, retention equality, generator
    determinism. E2E: the Recommended fix section and audit entries with forced provider
    failure. Update `project-state/` (simulation, domain-model, agent-boundary, live-runtime,
    http-api, frontend overview, analytics-and-ethics, log) and add a `docs/decisions.md`
    entry stating how this fits rules 3 and 4. You may now edit `agent.mjs` /
    `model-provider.mjs` as needed for the fix-ranking call; keep `provider-controls.mjs`
    unchanged.
  - **Do not touch:** `backend/data/`, port 3200, `docs/submission/` (the main agent updates
    the deck and video after the merge).
  - In your handoff, include sample IDs of resolved issues whose fix was ranked
    deterministically, with the symptom, the ranked fixes and the outcome, so the main agent
    can find good records quickly.

- **main agent:** extends the demo video to about 2:50 with more features meanwhile; after
  the merge, captures live AMD fix rankings on 3200, adds the fix segment, and updates the
  deck and form text.

### Merge log

- 2026-10-17 — **codex** `0a1062c` → merge `5cf085a`: factual review of the submission drafts (round 7). Clean merge. Docs only; codex ran `npm test` 276/276, E2E 49/49. Handoff archived.
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
- **Updated:** 2026-10-18
- **Task:** Round 8 — hidden fault causes, measurable catalog fixes and ranked troubleshooting. Master `11ba02c` merged; rechecked after resume, no newer assignment. Coherent commits `fca4b40` (281 unit / 51 E2E green) and `ff2593a` (286 / 53 green); final seed/proof commit contains this handoff.
- **Changes:** Four private seeded causes per class, equipment-dependent priors and overlapping public symptoms; six public synthetic fixes per class. Applied fix scales the existing team success probability and duration, stays frozen across roster changes and progresses to the next untried ranked procedure after failure. Legacy running attempts retain mechanics/actions. New actionTaken contains the actual applied ID, title and steps; planner responseAction is labelled Incident note.
- **Ranking / boundary:** Code aggregates same-class/symptom/equipment attempts, successes, first-time successes, smoothed success, median and last use. Compass ranks only supplied IDs through ranking-role settings, a strict validator, one deadline-bounded repair and unchanged provider controls. Fallback is smoothed symptom success → evidence count → catalog order; baseline is class-frequency. Recorded source, model info, packet, fallback/baseline and disagreement are audited. One tracked fix provider wait per room is initiated from the live agent lane and yields that lane to responder work. Pending work uses and records deterministic selection; late responses cannot rewrite applied attempts. Paused rooms start no inference. Offline shares the machinery with a stored API-free fixture.
- **UI / analytics:** Recommended fix section, ranked procedures, rationale, observed evidence table, source and baseline disagreement; active applied fix labelled separately. Both issue audit paths show each applied fix/outcome or mark legacy evidence. First-time fix and recommendation/baseline agreement rates include denominators, period boundaries, thin-sample suppression and one-decimal percentages. Audit/table widths checked at 375px and 1280px; existing tiles retained.
- **Privacy:** Root private faultTruth and effectiveness never enter issue/audit bundles, public payloads, model packets, analytics or logs. The existing privacy guard now invokes the fault guard. Retention keeps exact outcome observations and compact recommendation facts; equality proof extends to fix packets, private RNG state and analytics. No provider-controls changes, live provider calls, backend/data access, port 3200 access, other worktree edits or docs/submission edits.
- **Seed:** Original week `962ac7f` → `2026-10-06T08:00Z`, LIVE + PAUSED. **3,512 issues / 4,820 observations**, including **4,237 catalog-fix outcomes**; 733 hot / 2,779 archived. September: **2,966 raised / 2,985 resolved events**, first-time fix **1,858/2,527 (73.5%)**. Extension uses deterministic fallback, with zero fetches/credential reads; original-week responder records retain historical provider provenance. Plant-2 and metadata unchanged.
- **Weekly first-time fixes:** 7–14 Sep **460/686 (67.1%)**; 14–21 Sep **547/730 (74.9%)**; 21–28 Sep **631/825 (76.5%)**; 28 Sep–5 Oct **531/702 (75.6%)**, all Monday 08:00 UTC boundaries. This is **not monotonic** and not a controlled model-versus-baseline improvement result. Legacy actions/retries are excluded as documented.
- **Packaging / install:** Restored live JSON **26,996,348 bytes**, SHA-256 `da39d2d25188f6d6d452f035c31e6758409c6c20d20bd3e399774574c42d03a7`. To satisfy the per-file limit without dropping evidence, `plant-1.json` is now a checksum manifest for **1,753,758-byte `plant-1.state.json.gz`**. The reader is used by bootstrap and generation and restores exact bytes. **Do not copy the manifest into live-simulation.json.** Back up the entire current room, materialize normal JSON with `readDemoSeedBytes`, and install that JSON plus the companion archive tree together. The complete scratch-materialization command is in `docs/demo-history.md`. Archives: 29 daily files, total **63,148,637 bytes**, largest **3,272,445 bytes**; every committed seed file <20 MB. Compression does not reduce runtime JSON/memory or change outcomes.
- **Sample records:** `ISS-3599` / Station 47 / `B-SLOW`: deterministic order **B-05 → B-01 → B-03 → B-06 → B-04 → B-02**, with `FIX-` prefix; first two failed (16.66 / 13.87 min), B-03 succeeded (11.61 min). `ISS-3595` / Station 42 / `C-MISMATCH`: **C-02 → C-04 → C-05 → C-01 → C-06 → C-03**; C-02 failed (19.73 min), C-04 succeeded (15.03 min). Archived `ISS-563` / Station 71 / `C-INTERRUPT`: C-01 through C-06; C-01 failed, C-02 succeeded. Choose Stations → Healthy stations → station → Observed issues, expanding Earlier issues/Show older records as needed.
- **Measurements:** Cold plant-1 store **3,324ms**; fresh two-room bootstrap/manager **4,368ms**, both exceed the earlier 2s target. HTTP state **71ms / 838,146 bytes**; issues **26ms**, responders **44ms**, analytics **216ms**, DAY/WEEK/MONTH **100/66/56ms**; complete hot audit **764ms**. Shared-host point measurements, not guarantees. Runtime state still grows with exact observations/facts. Scratch month browser walkthrough showed a full troubleshooting sequence and weekly rates, with no page errors/outbound requests; preview stopped.
- **Verification:** Final unit suite **291/291 passed**. Final E2E **53/53 passed** on 3021 with required Chromium libraries, including added audit overflow assertions. Coverage includes privacy/model packets, catalog/validator rejection, equal-draw fix effects, fallback order, actual automatic dispatch while fix inference waits, paused no-call behavior, late/reset/restart handling, Offline fixture privacy, exact archived/unarchived metrics, repeated generation bytes and compressed-seed integrity/bootstrap. Ports 3021 and 3121 verified free; complete month archive privacy and per-file size checks passed.
- **Docs:** Updated simulation, domain-model, boundary, live-runtime, HTTP API, frontend overview, analytics/ethics, provider/overview, control-rooms, running/config, testing and log; README, history-retention, demo-history and decision log updated. Submission assets/text left to main.
- **Questions for main / follow-ups:** Review the cold-start regression and 27 MB runtime-state growth; repository compression addresses only the artifact limit. Installation requires the manifest-aware materialization above. Main should capture/re-measure genuine AMD **fix** rankings before claiming model validity for this new task; prior 9/10 responder results do not measure fix ranking. Update submission figures/footage after merge. No requested implementation work is blocked on a decision.

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
