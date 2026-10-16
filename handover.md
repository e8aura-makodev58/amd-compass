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

Context (2026-10-16): the frontend is being redesigned to the **"Engineering print"** look
and the product is renamed **ResponseCompass** (product-facing only; "Compass" stays the
name of the recommendation agent). Read `docs/design/engineering-print.md` first. The
stylesheet is already split per area; stay inside the files you are assigned.

**Shared rules for this round**
- Do not commit regenerated `docs/assets/*.png` screenshots (the E2E run rewrites them):
  run `git checkout -- docs/assets` before committing. The main agent regenerates them once
  after merging.
- Do not touch `AGENTS.md`, `handover.md` outside your section, `docs/handover-history.md`,
  or the dated entries in `docs/decisions.md` / `project-state/log.md` (append-only: add
  your own new entry at the bottom of `project-state/log.md`).
- Run `npm install` once in your worktree. Verify with both suites (AGENTS.md rule 9).

- **codex — Analytics view restyle.**
  - Own `frontend/analytics.css`. Rewrite it to the design spec using only the tokens in
    `frontend/tokens.css` (no hard-coded colours or fonts).
  - In `frontend/app.js`, change only the analytics chart stroke colours (the
    `#61d7b3` / `#75a7ff` / `#f5b84b` literals in the analytics chart markup, around line
    1075) to token-based values, e.g. `var(--ink)`, `var(--info)`, `var(--accent)`. No other
    `app.js` edits; the main agent is editing that file.
  - Charts: ink strokes, hairline grid, accent only for what needs attention (spec rule 8).
    Tables per spec rule 7. KPI tiles become ruled cells, not rounded cards.
  - Done when: Analytics matches the spec at 1280px and 375px width, both suites pass, and
    you have updated `project-state/frontend/overview.md` only if behaviour changed.
- **gemini — Product-facing rename to ResponseCompass (documentation only).**
  - Where "Compass" means the *application/product*, change it to "ResponseCompass". Where
    it means the *recommendation agent* (Compass ranks candidates, Compass recommendation,
    Compass vs baselines, Compass agent), keep "Compass".
  - Files: `README.md`, every page under `project-state/` except the dated entries in
    `log.md`, `Compass_Application_Defense_Guide.md`, `docs/compass-application-defense-guide.html`,
    `docs/architecture.md`, `docs/evaluation.md`, `Compass_Rebuild_SOW.md`.
  - Do **not** rename files, env vars (`COMPASS_*`), code identifiers, data paths, or
    anything under `frontend/` or `backend/` (the main agent renames UI text).
  - Do not change meaning or restructure documents; this is a naming pass. When unsure
    whether an occurrence means the product or the agent, keep it and list it under
    "Questions for main".
  - Done when: no product-meaning "Compass" remains in those files, both suites pass, and
    your section lists every file you changed.
- **codebuddy:** none
- **claude:** none (the main agent is doing tokens, header, Live Floor, panel, Settings/Demo/Control Rooms, and UI text rename on `master`)

### Merge log

_(no merges yet)_

---

## codex

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-16
- **Task:** Analytics view Engineering print restyle.
- **Head commit:** This handoff's commit on `codex` (see `git log -1 codex`).
- **Changes:** Replaced dark rounded Analytics cards with token-only paper/ink surfaces, ruled KPI cells, square controls, mono figures, table header rules, and visible keyboard focus. Period charts use ink for issue counts and accent for downtime; dates and partial/insufficient-history labels wrap and long series scroll locally. Analytics aligns to its full content height inside the desktop shell.
- **Files changed:** `frontend/analytics.css`, `frontend/app.js` (only the three assigned chart colour literals), `project-state/log.md`, `handover.md` (this section only).
- **Verification:** `npm test` — 230/230 passed; `LD_LIBRARY_PATH=/home/makodev58/rendertest/libs/usr/lib/x86_64-linux-gnu npm run test:e2e` — 32/32 passed; `git diff --check` clean. Chromium inspected at 1280×900 and 375×900: no Analytics content overflow outside local chart/table scroll areas; four desktop KPI columns / one mobile column; paper and table-header tokens verified; keyboard focus is solid 2px. Preview screenshots are in `/tmp/compass-codex-analytics-{1280,375}.png`.
- **project-state pages updated:** `project-state/log.md`; frontend overview unchanged because application behavior did not change, as assigned.
- **Risks / follow-ups:** Shared header/shell retain their existing styling in this branch pending the main agent's changes. Keep the Analytics mobile selector specificity: `layout.css` loads later and otherwise overrides one-column KPI layout below 560px. Initial unit run encountered removed `styles.css` references; incoming commit `236153d` fixed the test readers before successful verification. No screenshot assets included.
- **Questions for main:** None.

---

## gemini

- **Status:** READY FOR MERGE
- **Updated:** 2026-10-16
- **Task:** Product-facing rename to ResponseCompass (documentation only)
- **Head commit:** see branch `gemini` tip
- **Changes:** Product-meaning "Compass" now reads "ResponseCompass"; agent-meaning stays "Compass". No file, env var, identifier, data-path, `frontend/` or `backend/` changes.
- **Files changed:** `README.md`, `Compass_Application_Defense_Guide.md`, `docs/compass-application-defense-guide.html`, `Compass_Rebuild_SOW.md`, `project-state/README.md`, `project-state/architecture.md`, `project-state/backend/model-providers.md`, `project-state/concepts/agent-boundary.md`, `project-state/log.md` (new entry appended). Checked, no change needed: `docs/architecture.md`, `docs/evaluation.md`, other `project-state/` pages (all agent-meaning).
- **Verification:** `npm test` 225 pass / 5 fail (same 5 fail on the base commit: tests read the removed `frontend/styles.css`, ENOENT, from the stylesheet split; not caused by this change) · E2E 32/32
- **project-state pages updated:** README.md, architecture.md, concepts/agent-boundary.md, backend/model-providers.md, log.md
- **Risks / follow-ups:** Main agent should repoint the 5 tests (wp10-control-room-ui, event-feed audit, WP12 analytics UI, map 2D, WP6 recommendation panel) at the split stylesheets.
- **Questions for main:** Kept as "Compass" because ambiguous: `project-state/concepts/agent-boundary.md:50` ("what makes Compass ..."), `project-state/backend/model-providers.md:51` ("so Compass does not ..."), `README.md:5` second sentence ("Compass automatically finds who should respond"), `Compass_Rebuild_SOW.md` line 24/166 ("Compass input"/"stored Compass output").

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
