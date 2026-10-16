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

### Assignments

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

- **codex — Text contrast fix + Analytics chart polish.**
  - For this round you also own `frontend/tokens.css` and `docs/design/engineering-print.md`
    (token table only). You may change colour values in the other area stylesheets where
    text uses a failing token.
  - Text must meet WCAG AA on `--paper`, `--paper-raised` and `--paper-sunk`: 4.5:1 for normal
    text, 3:1 for large text (≥24px, or ≥18.66px bold). Measured failures today:
    - `--ink-3` 3.96:1 (labels, axis text, inactive tabs);
    - `--muted` 3.08:1 (unavailable / off-shift text);
    - `--warn` 3.23:1 as text ("MODERATE");
    - `--accent` 2.76:1 (the brand mark "Compass").
  - Darken `--ink-3` and `--muted`. Add text-safe tokens `--warn-ink` and an accent text
    colour (or reuse `--accent-ink`), and use them wherever those colours are text. Keep
    `--accent` / `--warn` for dots, rules and fills. Keep the look; change hues as little as
    possible.
  - Add a hermetic unit test, `backend/tests/design-tokens-contrast.test.mjs`. It parses
    `frontend/tokens.css`, computes WCAG contrast, and fails if any text token is below AA
    on the three paper tokens. Use `readFrontendCss` in `backend/tests/helpers/frontend-css.mjs`
    if it helps.
  - Analytics period charts:
    - "insufficient history" and dates must not break mid-word;
    - at 1280px, all 7 Day bars must fit without horizontal scroll;
    - long series (Hour: 12) may still scroll at 375px.
  - If a test asserts an old colour, update it and say so in your handoff. Add a short
    `docs/decisions.md` entry at the bottom for the token change.
  - Done when: contrast test passes, both suites pass, Analytics checked at 1280px and
    375px.

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

- **gemini — Documentation accuracy pass (docs only).**
  - `project-state/operations/running-and-config.md`: replace the stale `~/opt/node22`
    advice. Node 22 is installed via nvm (v22.23.1); describe nvm generally, not this host's
    path. Leave the env-var tables alone, because claude adds rows this round.
  - Check `docs/architecture.md`, `docs/evaluation.md`, `README.md`, and the
    `project-state/frontend/` pages against the current code:
    - AMD-only provider;
    - the split stylesheets;
    - the Engineering print look;
    - the ResponseCompass name.
    Fix factual drift only; do not restructure.
  - Add a `docs/decisions.md` entry at the bottom recording the Engineering print redesign
    and the product-facing rename (the decision, why, and what stays "Compass").
  - Do not edit `project-state/backend/model-providers.md` or `docs/design/engineering-print.md`
    (other owners this round). Put anything you find there under "Questions for main".

- **main agent:** reviews and merges, then re-measures the AMD models live (more samples;
  also the new `MiniCPM5-2B`) after claude's limiter is merged, so measurement runs through
  the limiter.

### Merge log

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
