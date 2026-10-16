# Change log

Append-only history of meaningful changes to the Compass codebase, newest at the bottom.
See [README.md](README.md#logmd-entry-format) for the entry format. `<type>` is one of
`feature`, `fix`, `refactor`, `docs`, `chore`.

---

## [2026-09-15] docs — Established the project-state knowledge base

- Created this `project-state/` wiki as the source of truth for the Compass codebase,
  adapting the pattern in [llm-wiki.md](llm-wiki.md). Documented the architecture, backend
  subsystems, domain model, HTTP API, frontend, simulation mechanics, model-provider
  abstraction, operations, and the core boundaries — describing the system as a production
  application.
- Pages updated: all initial pages (see [index.md](index.md)).

## [2026-09-15] feature — Added the self-hosted GPT-OSS provider

- Added `gpt-oss` as a third model provider (a vLLM server exposing an OpenAI-compatible
  API on an internal host, serving `openai/gpt-oss-20b`) alongside OpenAI and OpenRouter.
  New `gptOssBaseUrl()` helper and a configurable base URL; the credential defaults to
  `dummy-key` (the server has no real auth); model discovery and the strict `json_schema`
  path reuse the shared abstraction unchanged. `COMPASS_DEFAULT_PROVIDER` selects the
  active provider (this deployment sets it to `gpt-oss` via `.env`).
- Made the Compass-agent and event-planner request timeouts configurable
  (`COMPASS_AGENT_TIMEOUT_MS`, `COMPASS_EVENT_PLANNER_TIMEOUT_MS`) and raised them for the
  self-hosted model, whose latency varies more than a hosted API. Failures still fall back
  to the deterministic baseline.
- Verified: `npm test` 234/234; live end-to-end calls to the model succeed for both the
  event planner and the Compass agent (validated output), with safe fallback when the
  shared model is slow.
- Pages updated: [backend/model-providers.md](backend/model-providers.md),
  [operations/running-and-config.md](operations/running-and-config.md).

## [2026-10-16] refactor — Remove MES feature and restore generic rooms
- Removed the MES adapter, comparable-case retrieval, case-guided outputs, and their SOW; restored direct aggregate-history ranking and generic response-action fields.
- Restored canonical `plant-1` / `plant-2` paths and `e8-aura-p1` / `e8-aura-p2` defaults with saved-state compatibility and conflict protection. Stubbed inherited provider-discovery test networking.
- Pages updated: architecture, backend/overview, backend/control-rooms, backend/http-api, backend/live-runtime, backend/domain-model, frontend/overview, operations/testing.
- Verification: `npm test` passed (37 test files); forced-provider Chromium E2E passed 32/32; `git diff --check` passed.

## [2026-10-16] docs — Multi-agent worktrees and handover board
- Set up separate worktrees and branches for Codex, Gemini, CodeBuddy, and Claude; the main agent merges into `master`.
- Replaced root `handover.md` with a per-agent handover board and protocol; moved the previous handover log to `docs/handover-history.md`. Added `AGENTS.md` rule 10 and updated `README.md` links.
- Pages updated: none (process change only; no code behaviour changed).

## [2026-10-16] docs — Removed earlier event material; added AMD integration guide
- Deleted the superseded v2 SOW, the older rebuild specification, `docs/demo-script.md`, and the release copy/checklist documents. Removed event-specific wording from the v4 SOW, `README.md`, `AGENTS.md`, `docs/assets/README.md`, and `docs/v4-implementation-plan.md`. Event references in the dated history (`docs/decisions.md`, `docs/handover-history.md`) were reworded neutrally; the entries themselves are kept.
- Added `Compass_AMD_Token_Factory_Integration_Guide.md` (AMD Token Factory provider plan) and referenced it from `AGENTS.md` rule 1.
- Pages updated: none (documentation only; no code behaviour changed).

## [2026-10-16] feature — AMD Token Factory is the only model provider
- Removed the OpenAI, OpenRouter, and GPT-OSS providers; added AMD Token Factory (`json_object` output with the schema in the system message, key from env or key file, `max_tokens` cap, truncation and AMD error-wrapper handling). Default model `MiMo-V2.6-Flash` with reasoning `none`, chosen by live measurement; agent/planner timeouts raised to 60s/30s.
- Replaced `gpt-oss-provider` and `wp21-openrouter-provider` tests with `amd-provider.test.mjs`; rewrote the settings tests and the Settings E2E spec for the single provider.
- Pages updated: backend/model-providers.md, operations/running-and-config.md, operations/testing.md, index.md.

## [2026-10-16] refactor — Split the stylesheet for the redesign
- Split `frontend/styles.css` into `tokens.css`, `base.css`, `floor.css`, `panel.css`, `ops.css`, `analytics.css`, and `layout.css` (linked in that order; no visual change, E2E 32/32). Added the "Engineering print" design spec at `docs/design/engineering-print.md` and its tokens.
- Pages updated: frontend/overview.md.

## [2026-10-16] feature — "Engineering print" redesign of the shell, Live Floor, panel, and Settings; ResponseCompass brand
- Restyled `base.css`, `floor.css`, `panel.css`, `ops.css`, and `layout.css` onto the design tokens: paper/ink palette, square corners, hairline rules, mono data and labels, outlined default buttons with solid-ink primaries, accent underline on the active tab, neutral machines so only issues carry the accent. Analytics (`analytics.css`) is assigned separately.
- Header and page title now read **ResponseCompass** (Compass remains the recommendation agent's name). E2E expectations updated for the brand heading and the new hover colour.
- Layout fixes revealed by the light theme: non-floor views scroll inside their frame on the bounded desktop layout, and the search palette is sized to the viewport rather than the opener's column.
- Pages updated: none beyond frontend/overview.md (already lists the per-area files).
