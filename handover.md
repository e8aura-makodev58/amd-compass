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
| Gemini | `/home/makodev58/amd-compass-gemini` | `gemini` |
| CodeBuddy | `/home/makodev58/amd-compass-codebuddy` | `codebuddy` |
| Claude | `/home/makodev58/amd-compass-claude` | `claude` |

## Protocol

**All agents (`AGENTS.md` rule 11):** stay inside `amd` folders. Work only in
`/home/makodev58/amd-compass` and the `amd-compass-<agent>` worktrees. Never read, create,
edit, move, or delete anything in a folder without `amd` in its name (for example
`/home/makodev58/compass` or `/home/makodev58/ResponseCompass`) unless the user explicitly
asks. Exceptions: installed tooling and the read-only Chromium library path in rule 9.

**Worker agents (codex, gemini, codebuddy, claude):**

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
| gemini | 3022 | 3122 |
| codebuddy | 3023 | 3123 |
| claude | 3024 | 3124 |

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
| codex | RUN (round 3 task open) |
| gemini | RUN (round 3 task open) |
| codebuddy | RUN (round 2 task open) |
| claude | RUN (round 2 task open) |

Main agent watcher: polls every 300s for `READY FOR MERGE` / `BLOCKED` on each agent's branch
and stops once no agent has an open assignment.

### Assignments

**Current task per agent** (this table is authoritative; details are in the bullets below):

| Agent | Current task | Round |
|---|---|---|
| codex | Tiling panel layout for the Live Floor (Dockview) | 3 |
| gemini | Modern clean light theme (replaces "Engineering print") | 3 |
| codebuddy | Header regression E2E + saved-model check at boot | 2 |
| claude | AMD rate limiting, 429 retry, circuit breaker; **next:** ranking-validity fix (prompt + one repair retry) | 2 |

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

- **codex — Tiling panel layout for the Live Floor (desktop).**
  - **Behaviour:** like Omarchy/Zellij tiling. On the desktop Live Floor (≥901px wide) these
    panels are tiles that always fill the frame with no gaps or overlaps:
    - map (`.floor-section`);
    - issue list (`#issue-list`);
    - event feed (`#event-feed`);
    - dispatch/context panel (`.context-panel`).
    Dragging a divider resizes both neighbours, so tiles stay locked together. A tile can be
    moved (dragged to another edge/position) and maximised/restored. Every tile has a minimum
    size, so no tile can be dragged to zero.
  - **Library: Dockview** (`dockview-core`, vanilla, MIT). The user's other Compass app
    ("Polaris", a folder you must not open under rule 11) already runs `dockview-core@8.3.1`
    in production, so use the same version unless a newer 8.x is clearly better. Golden
    Layout 2 is the fallback only if Dockview cannot do the job. Record the choice in
    `docs/decisions.md`. Facts the main agent learned from that app:
    - **Vendoring:** the ESM build is `dist/package/main.esm.min.mjs`. Serve it as `.js` (or
      add an `.mjs` MIME type), because our static server types by extension.
    - **CSS:** the package ships **no `.css` file**, and the ESM build does not inject styles.
      The stylesheet is the CSS string that `dist/dockview-core.js` injects at load. Extract
      it verbatim into `frontend/vendor/dockview/dockview.css` (with a provenance header) in
      the vendor script. Add a `README.md` there with the version, the source paths and
      `LICENCE.md`.
    - **Imports:** keep the library import in exactly one module (`frontend/tiling.js`).
    - **Adopting the page:** that app moves the page's existing DOM regions into Dockview
      panels (a region map of panel id → node selectors, resolved once before any node moves),
      so every element ID and handler keeps working. Do the same here.
    - **Initial layout:** build it with `api.addPanel({ id, component, title, position:
      { referencePanel, direction } , initialWidth/initialHeight })`, for example:
      - map left;
      - the context panel to its right (about 440px wide);
      - the issue list below the map, with the event feed to its right.
    - **Stored layouts:** validate them before `api.fromJSON` and fall back to the default
      on any error:
      - a version field;
      - a size cap (that app uses 200,000 chars);
      - only known panel ids/components.
      Save on `api.onDidLayoutChange` (debounced).
    - **What makes those panels "detached":** that app enables floating groups
      (`addFloatingGroup`, a "Float" toggle) and "Move to new window" pop-outs.
      **Do not enable either here.** No floating groups, no popouts, no
      `getTabContextMenuItems` entries for float/new-window: the user wants every panel
      locked into the tiling grid, Omarchy/Zellij style.
    - **Theme:** that app uses `themeDark`. Use a light Dockview theme (for example
      `themeLight`), overridden with our CSS tokens so it follows gemini's new theme.
    - **Controls:** maximise/restore of a group is fine (Dockview's `group.api.maximize()`).
  - **Persistence:** the layout persists per browser in `localStorage`, wrapped in
    try/catch; a corrupt or old value falls back to the default. A visible "Reset layout"
    control restores the default.
  - **Keyboard:** dividers are keyboard-resizable with focus visible (spec rule 9), using the
    library's support or a small addition.
  - **Narrow screens:** below 901px, keep today's stacked document flow (no tiling).
  - **Don't break the app:**
    - Keep every element ID, class and ARIA attribute that `app.js`/tests use. Move the
      existing DOM nodes into tiles rather than re-creating them, because `app.js` holds
      references and the render lifecycle (`render-lifecycle.js`) must keep working.
    - The map must re-fit when its tile resizes; use a `ResizeObserver`.
  - **Files:** you own `frontend/layout.css`, a new `frontend/tiling.js` (+ `tiling.css` if
    needed), `frontend/vendor/<tiling lib>/`, and the `index.html` lines that load them. In
    `app.js`, only add the minimal wiring (init call, resize hooks). gemini is restyling all
    other CSS this round, so don't edit `tokens.css` / `base.css` / `floor.css` / `panel.css`
    / `ops.css` / `analytics.css`. Style the tiling chrome (dividers, tile headers) with
    tokens only, so it picks up gemini's theme.
  - **Tests:** add `e2e/tiling.spec.mjs` with these assertions:
    - the tiles fill the frame with no gap;
    - dragging a divider grows one tile and shrinks its neighbour by the same amount;
    - minimum sizes hold;
    - the layout persists across reload, and Reset restores it;
    - no outbound requests;
    - below 901px the page stacks.
    Existing E2E tests must still pass, so update selectors only where the DOM really moved,
    and say so in your handoff.
  - **Docs:** update `project-state/frontend/overview.md` (layout section).

- **gemini — Modern clean light theme (replaces "Engineering print").**
  - **Look:** white and cool-grey surfaces, subtle rounded corners (6–10px), soft 1px borders,
    light elevation (very subtle shadows allowed), one accent colour, clear status colours,
    modern controls (pill/segmented buttons, styled selects/inputs/checkboxes, visible focus
    rings).
  - **Fonts:** **Inter** for UI and **JetBrains Mono** (or Geist Mono) for figures/IDs.
    Install via `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` (or
    equivalents), vendor only the latin `woff2` files plus their CSS into
    `frontend/vendor/fonts/`, and load them from `tokens.css`.
  - **Spec:** write `docs/design/modern-light.md` (tokens, rules, ownership), modelled on
    `docs/design/engineering-print.md`. Mark that file "Superseded by modern-light.md" at the
    top; don't delete it.
  - **Files:** you own `frontend/tokens.css`, `base.css`, `floor.css`, `panel.css`,
    `ops.css` and `analytics.css`. Do **not** edit `layout.css`, `tiling.*` or `index.html`
    (codex owns them this round). If you need a new stylesheet link, ask under "Questions
    for main".
  - **Contrast:** all text must still pass `backend/tests/design-tokens-contrast.test.mjs`
    (AA 4.5:1 on every surface token). Update the test's surface/text token names if you
    rename tokens; don't weaken the threshold.
  - **Keep behaviour:** no ID/class/ARIA changes. Charts stay token-driven. The map's 3D
    scene is untouched apart from colours.
  - **Tests:** if an E2E test asserts an old colour (for example the responder-row hover
    `rgb(234, 230, 220)`), update it and list it in your handoff.
  - **Done when:** both suites pass, every view (Live Floor, Control Rooms, Analytics,
    Settings, Offline, the room picker, the search palette) has been checked at 1280px and
    375px with no leftover paper/ink colours, and `docs/decisions.md` has an entry (append).

- **claude — AMD rate limiting, 429 retry, circuit breaker.**
  - Read `Compass_AMD_Token_Factory_Integration_Guide.md` §2, §5 and §9, and
    `project-state/backend/model-providers.md`.
  - Own `backend/src/model-provider.mjs` and a new module for the controls (for example
    `backend/src/provider-limiter.mjs`). Touch `agent.mjs` / `event-planner.mjs` only if the
    wiring requires it, and keep their validation/fallback contract unchanged. Do not touch
    `provider-settings.mjs` (codebuddy owns it this round).
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

- **claude — NEXT, after the limiter is READY FOR MERGE: raise AMD ranking validity.**
  - Live measurement on 2026-10-16 (main agent, `npm run measure:amd`, 3 samples each):
    - **rankings:** only 1 of 15 valid across MiMo, GLM-5.3, Qwen3.8-Flash-Next, DeepSeek-V4-Flash
      and MiniCPM5-2B;
    - **planner:** MiMo 3/3 in about 4.5s, DeepSeek 3/3 in about 7s.
  - **Main failure:** `prose introduces numeric evidence`. `containsNumericLeakage` in
    `agent.mjs` rejects any digit, and models write responder IDs (`Engr028`) or numbers in
    their rationale.
  - **Do, in order:**
    1. Harden `SYSTEM_INSTRUCTION`: no digits anywhere in prose, including responder IDs;
       say "this candidate", "the nearer candidate", and so on. Add one short compliant
       example.
    2. Add **one** bounded repair attempt: on `validation-failed`, re-ask once with the
       validator's error list. It must fit the remaining deadline and use the limiter, and
       it counts toward the retry budget. The result is still fully revalidated; never
       accept unvalidated output.
  - **Do not** loosen `containsNumericLeakage` or any validator (`AGENTS.md` rule 3) without
    asking the main agent first.
  - Hermetic tests with fake fetch: a numeric-prose reply triggers exactly one repair; a
    second failure falls back; the repair is skipped when the deadline is too short.
  - Record it in `docs/decisions.md`. The main agent re-measures live afterwards.

- **codebuddy — Header regression E2E + saved-model check at boot.**
  - **E2E.** Add `e2e/header-layout.spec.mjs`. At 920, 1024, 1280 and 1440px, in Live and in
    Offline (Offline adds "Reset Offline"), assert:
    - all four view tabs are fully visible (not clipped by the tab bar's scroll box);
    - `.topbar` has no horizontal overflow;
    - the activity indicator is not clipped.
    Measure with `getBoundingClientRect` / `scrollWidth`. The fix being protected is the
    `layout.css` header rules (901–1179px two-row header; activity text collapses to its
    dot below 1360px).
  - **Boot catalog check.** You own `backend/src/provider-settings.mjs` this round. When AMD
    discovery succeeds and the saved model is not in the catalog, the settings must:
    - report it (snapshot field and a log event);
    - use `AMD_DEFAULT_MODEL_ID` for requests;
    - keep the user's saved choice on disk.
    When discovery fails, keep the saved model; never block startup and never call AMD at
    boot in `npm test`. Use a mocked fetch in unit tests.
  - Do not touch `model-provider.mjs` (claude owns it this round).
  - Update `project-state/backend/model-providers.md` (Selection & discovery section only)
    and `project-state/operations/testing.md` for the new spec.

- **main agent:** reviews and merges. Re-measuring the AMD models live with `npm run measure:amd` now (user request), again after claude's limiter merges (more samples;
  also the new `MiniCPM5-2B`) after claude's limiter is merged, so measurement runs through
  the limiter.

### Merge log

- 2026-10-16 — **codex** `051998d` → merge `08af6b7`: text contrast fix (AA text inks, contrast test) and Analytics period labels (round 2). Append conflicts in `docs/decisions.md` / `project-state/log.md` kept both. `npm test` 232/232, E2E 32/32; `docs/assets` regenerated. Handoff archived.
- 2026-10-16 — **gemini** `0cc8040` → merge `05596b2`: documentation accuracy pass (round 2). `project-state/log.md` conflict resolved by keeping both entries. Handoff archived.
- 2026-10-16 — **codex** `f7358fb` → merge `3576882`: Analytics Engineering print restyle. `project-state/log.md` conflict resolved by keeping both entries. Handoff archived.
- 2026-10-16 — **gemini** `fb7f8a6` → merge `f743437`: product-facing rename to ResponseCompass in docs. Same log conflict, same resolution. Main agent renamed 2 flagged product-meaning occurrences; the rest stay "Compass" (agent). Handoff archived.
- After both merges on master: `npm test` 230/230, E2E 32/32. Main agent then fixed the desktop header in Offline mode (activity text clipped at 1280px; Settings tab scrolled out of sight at 901–1179px) in `layout.css`, and regenerated `docs/assets/*.png` in the new look.

---

## codex

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

## gemini

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
