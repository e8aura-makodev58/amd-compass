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
