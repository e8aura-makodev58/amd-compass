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

## [2026-10-16] docs — Removed superseded documents; added AMD integration guide
- Deleted the superseded v2 SOW, the older rebuild specification, `docs/demo-script.md`, and the release copy/checklist documents, and removed the related wording from the v4 SOW, `README.md`, `AGENTS.md`, `docs/assets/README.md`, and `docs/v4-implementation-plan.md`.
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

## [2026-10-16] refactor — Analytics Engineering print restyle
- Restyled Analytics with token-only paper/ink colours, ruled KPI cells and tables, monospaced figures, square controls, and visible keyboard focus. Charts use ink with orange for downtime; long period series scroll locally so dates and completeness labels remain readable at narrow widths.
- Kept report backgrounds at full content height within the shared desktop grid. Application behavior and analytics calculations are unchanged; app.js changes are limited to three chart colour arguments.
- Pages updated: log.md (frontend/overview.md unchanged because behavior is unchanged).

## [2026-10-16] docs — Product-facing rename to ResponseCompass
- Naming pass only: where "Compass" meant the application/product it now reads "ResponseCompass"; where it means the recommendation agent it stays "Compass". No file, env var (`COMPASS_*`), identifier, or data-path renames; nothing under `frontend/` or `backend/` touched.
- Pages updated: README.md, architecture.md, concepts/agent-boundary.md, backend/model-providers.md (plus the repo-level README, defense guide, rebuild SOW).

## [2026-10-16] fix — Merged the Analytics restyle and docs rename; desktop header fit
- Merged `codex` (Analytics restyle) and `gemini` (product-facing ResponseCompass rename in docs) into `master`; renamed two further product-meaning occurrences gemini flagged.
- Desktop header no longer clips: tabs are compact on desktop, the activity wording collapses to its dot below 1360px (was 1280px; Offline's third mode button clipped it), and at 901–1179px the view tabs move to a second header row instead of scrolling out of sight (`layout.css`).
- Regenerated `docs/assets/*.png` in the new look; corrected `docs/assets/README.md`, which claimed the E2E suite captures them.
- Pages updated: none beyond this log (frontend/overview.md already describes `layout.css` as the responsive layer).

## [2026-10-16] chore — Rewrote git history to drop the removed documents
- Folded the first four commits into one new initial commit (the cleaned tree), so the removed documents no longer exist anywhere in the history; later commits and merges were replayed unchanged. Commit IDs from before the rewrite no longer resolve; references in `handover.md` and `docs/handover-history.md` were updated.
- Pages updated: none (history only; no code behaviour changed).

## [2026-10-16] docs — Agents stay inside `amd` folders
- Added `AGENTS.md` rule 11 and a matching note at the top of the `handover.md` protocol: agents work only in `amd-compass` and its `amd-compass-<agent>` worktrees and never touch folders without `amd` in the name (such as the other Compass folders) unless the user explicitly asks.
- Pages updated: none (process change only).

## [2026-10-16] feature — Map/idle polish; live model measurement script
- Issue nodes on the map are now filled with the accent, so the one orange mark on the floor is unmistakable. The idle agent-activity ring no longer shows a dark arc (it read as a stalled spinner); the arc and spin appear only while an agent works, and stop under `prefers-reduced-motion`.
- Added `scripts/measure-amd-models.mjs` (`npm run measure:amd -- --models <id[:effort],…> --samples N`): opt-in live measurement through the app's own agent/planner request functions and validators, run one call at a time; prints a Markdown table. Never part of `npm test`. First run (MiMo, 1 sample): ranking rejected for digits in prose after 47s; planner valid in 8s — MiMo is 6/7 valid across all live runs so far.
- Pages updated: none yet (backend/model-providers.md and operations/testing.md have other owners this round; the main agent documents the script there with the re-measurement).

## [2026-10-16] docs — Documentation accuracy pass
- `operations/running-and-config.md`: replaced the stale `~/opt/node22` tarball advice with general nvm guidance. `frontend/overview.md`: corrected the `app.js` size and the provider-dropdown note (AMD only). `docs/evaluation.md` and `README.md`: updated test counts (230 unit/integration, 32 E2E) and marked the ten-run live gate as run under the removed OpenAI provider. Added the Engineering print / ResponseCompass entry to `docs/decisions.md`.
- Pages updated: operations/running-and-config.md, frontend/overview.md.

## [2026-10-16] fix — Text contrast and Analytics period labels
- Darkened tertiary/muted tokens and routed warning, green and accent text through AA-safe inks; preserved brighter status marks. Added hermetic contrast coverage for paper-facing text tokens on all three paper backgrounds.
- Analytics uses full-width chart rows, nonbreaking dates and whole-word completeness labels so seven Day bars fit at 1280px; long series retain local scrolling on mobile.
- Pages updated: frontend/overview.md, operations/testing.md; design token table and docs/decisions.md also updated.

## [2026-10-16] feature — Desktop Live Floor tiling with Dockview
- Added pinned, locally vendored Dockview 8.3.1 and reproducible browser asset extraction. The existing map, issue list, event feed and context nodes become four constrained, movable desktop tiles with keyboard resizing, maximise/restore, validated local layout persistence and reset; narrow screens retain the original flow.
- Added persisted-layout validation tests and six browser journeys; the contrast gate now resolves vendor text aliases to the shared tested inks without lowering AA thresholds. Repaired the existing activity-indicator test delay to match the current room-scoped force-event route, removing a timing race without changing assertions.
- Pages updated: frontend/overview.md, operations/testing.md; docs/decisions.md and vendor provenance also updated.
