# Project State — Compass codebase knowledge base

This folder is the **source of truth for how the Compass codebase is built.** It is a
persistent, interlinked wiki that an engineer or an LLM agent reads *before* changing
the code, and updates *after* changing it. Read [index.md](index.md) for the full page
catalog and [log.md](log.md) for the change history.

> **If you are about to modify Compass, start here.** Find the page(s) for the area you
> are touching, read them, make your change, then update those same pages and append a
> line to [log.md](log.md). A change is not finished until this folder reflects it.

The pattern is adapted from [llm-wiki.md](llm-wiki.md): the code is the immutable raw
source, this folder is the compiled-and-maintained knowledge layer, and this README is
the schema that keeps the knowledge layer disciplined.

---

## How this knowledge base is organized

| Layer | What it is | Who owns it |
|-------|------------|-------------|
| **Raw source** | The actual code under `backend/`, `frontend/`, `e2e/`, plus the SOW and `docs/` files. | The build. Never edited to keep this wiki tidy. |
| **The wiki** | Every `.md` under `project-state/`. Summaries, component pages, concept pages. | This folder. Kept current by whoever changes the code. |
| **The schema** | This `README.md`. Conventions, structure, and the maintenance workflow. | Co-evolves as the project changes. |

### Directory map

```
project-state/
  README.md                     ← you are here (schema + workflow)
  index.md                      ← catalog of every page, one line each
  log.md                        ← append-only change history
  architecture.md               ← the whole system on one page
  llm-wiki.md                   ← the pattern this folder implements (reference)
  backend/
    overview.md                 ← every backend module, grouped by subsystem
    domain-model.md             ← state schema, entities, hidden ResponderSkill
    live-runtime.md             ← Live mode: real-time simulation + model calls
    offline-runtime.md          ← Offline mode: API-free fixture path
    control-rooms.md            ← multi-room isolation and the process scheduler
    model-providers.md          ← the AMD Token Factory provider
    simulation.md               ← clock, scheduler, resolution, workforce continuity
    http-api.md                 ← every HTTP route
  frontend/
    overview.md                 ← the single-page app, its tabs and rendering model
  operations/
    running-and-config.md       ← how to run it, every environment variable
    testing.md                  ← the two test suites and how to run them
  concepts/
    agent-boundary.md           ← the deterministic-vs-model invariant
    analytics-and-ethics.md     ← fairness rules for analytics and ranking
```

---

## Page conventions

- **One topic per page.** If a page is growing two unrelated concerns, split it and list
  both in [index.md](index.md).
- **Cite the code.** When a page states a fact about behavior, point at the file (and
  line when it is stable) that proves it, e.g. `backend/src/server.mjs`. Prefer relative
  paths from the repo root so links resolve.
- **Describe intent, not just mechanics.** Explain *why* a thing is the way it is — the
  boundaries and invariants that a future change must not break. The code already shows
  the *what*.
- **State invariants explicitly.** If something must always hold (e.g. "ResponderSkill
  never crosses a public boundary"), say so in bold on the relevant page.
- **Keep it current, not historical.** Pages describe the system as it is *now*. Point-in-time
  narrative belongs in [log.md](log.md), not in the component pages.

---

## Maintenance workflow

Follow this every time you change the code.

1. **Before you start**, read the page(s) covering the area you will touch. Follow their
   cross-links until you understand the invariants involved.
2. **Make the code change.**
3. **Update the wiki in the same change:**
   - Edit the component/concept page(s) whose described behavior changed.
   - If you added or removed a module, route, entity, env var, or test suite, update the
     relevant reference page (`backend/overview.md`, `http-api.md`, `domain-model.md`,
     `running-and-config.md`, `testing.md`).
   - If you added or removed a *page*, update [index.md](index.md).
   - Append one line to [log.md](log.md) using the format below.
4. **Verify** with both suites (see [operations/testing.md](operations/testing.md)) before
   handing off.

### log.md entry format

Append-only. One entry per meaningful change, newest at the bottom of its section:

```
## [YYYY-MM-DD] <type> — <short title>
- What changed and why, in one or two lines.
- Pages updated: <list>.
```

`<type>` is one of `feature`, `fix`, `refactor`, `docs`, `chore`.

---

## Linting this wiki

Periodically (or when something feels stale), do a health pass:

- Do any pages contradict the current code? Re-read the cited files and reconcile.
- Did a recent code change land without a matching wiki update? Backfill it and log it.
- Are there orphan pages (not linked from [index.md](index.md)) or missing pages for a
  new subsystem?
- Are cross-links still valid after renames?

Record the outcome as a `docs` entry in [log.md](log.md).

---

## Relationship to the rest of the repo

- **`AGENTS.md`** (repo root) holds the binding governance rules (the deterministic/agent
  boundary, hidden `ResponderSkill`, verification gates). Those rules are authoritative;
  this wiki explains and cross-references them but does not override them.
- **`docs/decisions.md`** records dated architectural decisions. This wiki summarizes the
  resulting design; the decision log keeps the rationale trail.
- **The SOW files** (`*_SOW_*.md`) are the requirement specifications. This wiki documents
  what was actually built, which is the better reference for *modifying* the code.

Compass is developed for real production use. Describe it as a production system; earlier
requirement documents that frame it as a time-boxed exercise are historical context only.
