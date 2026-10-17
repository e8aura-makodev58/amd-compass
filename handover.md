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
| codex | STOP (no open task) |
| gemini | STOP (excluded from tasks) |
| codebuddy | STOP (excluded from tasks) |
| claude | STOP (task taken by the main agent) |

Main agent watcher: polls every 300s for `READY FOR MERGE` / `BLOCKED` on each agent's branch
and stops once no agent has an open assignment.

### Assignments

**Current task per agent** (this table is authoritative; details are in the bullets below):

| Agent | Current task | Round |
|---|---|---|
| codex | Separate model per role (ranking vs event planner) | 4 |
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

- **codex — Separate model per role (ranking vs event planner).** Start with `git merge
  master` and `npm install`; use port 3021.
  - **Goal:** the operator can pick one model + reasoning level for Compass rankings and
    another for the event planner. Default: both MiMo-V2.6-Flash / `none` (no behaviour
    change until someone chooses).
  - **Settings shape** (`backend/src/provider-settings.mjs`, you own it): store a selection
    per role, e.g. `models.amd = { compass: {modelId, reasoningEffort}, eventPlanner: {…} }`
    (your call on naming). **Backward compatible:** an existing
    `provider-settings.json` with the old single `{modelId, reasoningEffort}` must load and
    apply to both roles, and must not be rewritten until the operator saves. Keep the
    owner-only credential file untouched.
  - `requestOptions("compass")` / `requestOptions("event-planner")` return their own role's
    model. The boot catalog check (`modelValidation`) must cover each role separately; a
    missing model falls back to `AMD_DEFAULT_MODEL_ID` for that role only, keeping the
    saved choice and logging `provider_saved_model_missing` with the role.
  - **Env seed:** keep `AMD_TOKEN_FACTORY_MODEL` / `_REASONING_EFFORT` as the seed for both
    roles; add optional `AMD_TOKEN_FACTORY_EVENT_PLANNER_MODEL` /
    `AMD_TOKEN_FACTORY_EVENT_PLANNER_REASONING_EFFORT` that override the planner seed only.
    Add them to `.env.example` and `project-state/operations/running-and-config.md`.
  - **API:** the settings save route accepts a role and validates model + reasoning level
    against the cached catalog as today. Snapshot shows both roles. Reject unknown roles.
  - **UI** (Settings → API in `frontend/app.js`, and its styles if needed): two labelled
    pickers, "Ranking (Compass)" and "Event planner", each with model + reasoning level and
    its own validation status. Keep existing IDs working or update their tests' setup, never
    their assertions' intent. Must fit at 375px and 1280px with no horizontal overflow.
  - **Tests:** unit tests for old-file migration, per-role save/validation, per-role boot
    fallback, env planner override; extend `e2e/provider-settings.spec.mjs` for the two
    pickers. No live AMD calls (fake fetch / mocked catalog).
  - **Do not touch:** `model-provider.mjs`, `provider-controls.mjs`, `agent.mjs`,
    `event-planner.mjs` (callers already take `modelId` from `requestOptions`; if wiring
    truly needs a change there, ask first), `scripts/measure-amd-models.mjs` (main agent).
  - Update `project-state/backend/model-providers.md` (**Selection & discovery** section
    only), add a `docs/decisions.md` entry and a `project-state/log.md` entry.

- **main agent — Larger live measurement at the app's real timeouts.** 10 samples per model,
  60s ranking / 30s planner timeouts (the app defaults), through the provider controls, to
  choose the default model per role. **Done:** MiMo-V2.6-Flash / `none` stays the default
  for both roles (rankings 9/10, planner 10/10; DeepSeek 8/10 and 3/10). Codex: keep both
  role defaults at MiMo.

- **main agent:** reviews and merges. Measured live 2026-10-16 (see codex's bullet). Re-measures with more
  samples once the provider controls land (codex's validity fix is merged).

### Merge log

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

## c## codex

- **Status:** IDLE
- **Updated:** 2026-10-17
- **Task:** None. Round 4 (separate model per role) merged; see `docs/handover-history.md`.


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
