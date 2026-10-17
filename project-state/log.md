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

## [2026-10-16] chore — Per-agent test ports; shared vendoring script
- `playwright.config.mjs` reads `COMPASS_E2E_PORT` (default 3012) and uses a per-port data folder, so agents can run E2E in parallel. `handover.md` gains a **Ports** table (E2E and manual-preview port per agent; free them right after testing) and `AGENTS.md` rule 9 points to it.
- Added `npm run vendor` (`scripts/vendor-frontend.mjs` + one module per library in `scripts/vendor/`), pinned `dockview-core@8.3.1` and `@fontsource-variable/{inter,jetbrains-mono}@5.3.0` as devDependencies, and taught the static server `.mjs` and `.woff2`, ahead of the round-3 tiling and theme work.
- Pages updated: none beyond this log (operations/testing.md is owned by codebuddy this round; the main agent adds the port note there at merge).

## [2026-10-16] chore — Live AMD model measurement (service busy, rankings mostly invalid)
- `npm run measure:amd`, 3 samples each, sequential:
  - **MiMo-V2.6-Flash (none):** rankings 1/3, median 28.5s; planner 3/3, 4.5s.
  - **GLM-5.3-Flash (low):** rankings 0/3, planner 0/3; timeouts and HTTP 429 "at its concurrency limit (16)".
  - **Qwen3.8-Flash-Next (none):** rankings 0/3, all timed out at 90s; planner 3/3, 27.5s.
  - **DeepSeek-V4-Flash (none):** rankings 0/3; planner 3/3, 6.7s.
  - **MiniCPM5-2B:** rankings 0/3, planner 0/3; schema and eligibility errors.
- Dominant ranking rejection: digits in rationale prose (responder IDs or numbers), which `containsNumericLeakage` forbids. Not an outage: every request was answered or rate-limited, so the model work stays active. Queued for claude: prompt hardening plus one bounded, revalidated repair attempt. The deterministic fallback kept dispatch working throughout.
- Pages updated: none yet (backend/model-providers.md is owned by claude/codebuddy this round; the main agent updates its model table after their merges).

## [2026-10-16] feature — Desktop Live Floor tiling with Dockview
- Added pinned, locally vendored Dockview 8.3.1 and reproducible browser asset extraction. The existing map, issue list, event feed and context nodes become four constrained, movable desktop tiles with keyboard resizing, maximise/restore, validated local layout persistence and reset; narrow screens retain the original flow.
- Added persisted-layout validation tests and six browser journeys; the contrast gate now resolves vendor text aliases to the shared tested inks without lowering AA thresholds. Repaired the existing activity-indicator test delay to match the current room-scoped force-event route, removing a timing race without changing assertions.
- Pages updated: frontend/overview.md, operations/testing.md; docs/decisions.md and vendor provenance also updated.

## [2026-10-16] feature — Modern light theme and local UI fonts
- Completed Gemini's theme WIP: cool-grey/white surfaces, indigo controls, clear status inks, rounded cards and restrained elevation. Isolated dashboard stacking so tile dividers stay behind the search palette. Added reproducible Latin Inter/JetBrains Mono font vendoring, normal/italic faces and the current design spec.
- Contrast checks retain AA 4.5:1 across all five light surfaces and inverse button backgrounds. Updated the responder hover/selection colour expectations and made the tiling outbound-request check use the configured agent test origin.
- Pages updated: frontend/overview.md, operations/testing.md; docs/design/modern-light.md and docs/decisions.md added/updated, Engineering print marked superseded.

## [2026-10-17] process — Theme merged; Gemini excluded from tasks
- Merged the modern light theme (`gemini` branch, finished by Codex after Gemini ran out of tokens) as `87b3a77`. `npm test` 234/234, E2E 38/38, vendored fonts and Dockview regenerate byte-for-byte.
- By user direction, Gemini gets no further tasks: watcher set to STOP, ports retired, noted in `AGENTS.md` rule 10 and `handover.md`.

## [2026-10-17] docs — Model measurement and E2E ports recorded
- `backend/model-providers.md`: added the `npm run measure:amd` tool and its 2026-10-16 three-sample results (rankings mostly rejected for digits in prose; planner reliable on MiMo and DeepSeek).
- `operations/testing.md`: documented `COMPASS_E2E_PORT`, the per-port data root, and that `measure:amd` is the only live-calling script.

## [2026-10-17] behavior — Candidate names allowed in Compass prose
- `agent.mjs`: the no-digits prose check now ignores the supplied candidates' `responderId` / `displayName`; the system instruction allows naming candidates that way. Other digits and unsupplied IDs are still rejected. Test added in `wp5-agent.test.mjs`.
- Pages updated: concepts/agent-boundary.md, backend/model-providers.md; `docs/decisions.md` entry.
- Live re-check after the change (rankings only, 3 samples): MiMo-V2.6-Flash 3/3 valid (was 1/3); DeepSeek-V4-Flash 1/3, now failing on incomplete rankings rather than digits.

## [2026-10-17] fix — Bounded revalidated ranking repair
- Hardened ranking instructions with qualitative alternatives and a compliant example. A validation-failed live ranking can be re-requested once through the shared provider path with bounded validator feedback and the same packet, using only the original deadline's remaining budget. All validators and offline behavior are preserved.
- Added hermetic fake-fetch/clock/timer coverage for successful repair, repeat rejection, feedback bounds, skipping near-expired deadlines, and shared-deadline abort/late-result rejection. Live quality re-measurement belongs to the main agent.
- Pages updated: backend/model-providers.md, concepts/agent-boundary.md; docs/decisions.md records the policy and one-second minimum repair window.

## [2026-10-17] process — Agent roster narrowed
- By user direction: CodeBuddy is excluded from tasks; its header E2E and boot catalog check go to Codex. The main agent (Claude) builds the AMD provider controls itself on master; the separate Claude worker is no longer used.

## [2026-10-17] feature — AMD rate limiting, 429 retry, circuit breaker
- New `backend/src/provider-controls.mjs`; `callChatCompletion` runs every request under it with one deadline covering queueing and retries. Only 429 is retried (guide §9). Five new `AMD_TOKEN_FACTORY_*` env vars.
- Tests: `backend/tests/provider-controls.test.mjs` (fake clock and timers).
- Pages updated: backend/model-providers.md, backend/overview.md, operations/running-and-config.md; `.env.example`; `docs/decisions.md` entry.

## [2026-10-17] measurement — AMD models after repair retry and provider controls
- `npm run measure:amd`, 3 samples: MiMo rankings 2/3 (planner 3/3), DeepSeek rankings 3/3 (planner 1/3), Qwen3.8-Flash-Next and GLM-5.3-Flash rankings timed out. No digit-in-prose failures; every valid ranking picked `R-ENGR028`. The circuit breaker opened during GLM's failures as designed. Recorded in backend/model-providers.md.

## [2026-10-17] fix — Validate saved model at boot and guard header layout
- Added background boot catalog validation with snapshot status and application logging. Confirmed missing saved models use the default model/effort for requests without rewriting the saved pin; failed discovery retains the saved selection. Test-mode boot stays API-free, and stale responses after credential changes are ignored.
- Added eight header geometry checks across Live/Offline and four desktop widths, plus hermetic settings coverage for boot concurrency, fallback (including pending refresh), persistence, outage, malformed catalogs and recovery.
- Pages updated: backend/model-providers.md (Selection & discovery), operations/testing.md.

## [2026-10-17] measurement — 10-sample model choice at app timeouts
- MiMo-V2.6-Flash (none): rankings 9/10, planner 10/10. DeepSeek-V4-Flash: rankings 8/10, planner 3/10 (default or none). MiMo stays the default for both roles. Remaining failures are ranking timeouts (MiMo median 42s vs 60s timeout). Recorded in backend/model-providers.md.

## [2026-10-17] config — Compass agent timeout 90s
- `COMPASS_AGENT_TIMEOUT_MS` default 60000 → 90000 (user decision). `measure:amd` ranking timeout default follows. Pages updated: operations/running-and-config.md, backend/model-providers.md; `docs/decisions.md` entry.

## [2026-10-17] feature — Separate ranking and event-planner models
- Added per-role model/effort persistence, backward-compatible single-pin loading without writes, role-specific validation/fallback/logging and planner-only environment seeds. Credential storage and the provider call path are unchanged.
- Settings now has two independently saved pickers with individual status and draft preservation; mocked browser coverage checks 375px/1280px without API spend or real settings writes.
- Pages updated: backend/model-providers.md (Selection & discovery), backend/http-api.md, frontend/overview.md, operations/running-and-config.md, operations/testing.md; docs/decisions.md and .env.example also updated.

## [2026-10-17] fix — planner seed effort for a different planner model
- A planner-only `AMD_TOKEN_FACTORY_EVENT_PLANNER_MODEL` no longer inherits the shared `AMD_TOKEN_FACTORY_REASONING_EFFORT` (e.g. `none` with GLM would be rejected with HTTP 422); it uses that model's default unless `_EVENT_PLANNER_REASONING_EFFORT` is set. Pages updated: backend/model-providers.md, operations/running-and-config.md.

## [2026-10-17] feature — Reproducible month of offline plant-1 history
- Added `generate:history`, an isolated, guarded offline generator using the real runtime cycle, seeded RNG and deterministic audit timestamps. Short hermetic tests check byte identity, normal-store equivalence/migration, privacy and live-data path rejection; production persistence and retention are unchanged.
- Extended only the plant-1 seed through 6 October 08:00 UTC: September plus four complete operational weeks, 669 issues / 844 history rows, LIVE + PAUSED. Two full generations matched SHA-256. Benchmarked cold load (1.82s), analytics, memory and browser loading; no live data or other seeds touched.
- Pages updated: backend/control-rooms.md, operations/running-and-config.md, operations/testing.md; docs/demo-history.md and docs/decisions.md document reproduction, engine seam and performance/backlog follow-ups.

## [2026-10-17] fix — resolution stall on a short due event; month seed withdrawn
- `attempt-engine.mjs`: resolution due times round up to the next ms. `resolution-engine.mjs`: a `NOT_COMPLETE` finalize replans instead of stalling until the next roster change. Regression test added.
- plant-1 seed restored to the original week; the merged month seed had been built on the defect. A fixed month is 74 MB and too slow to load (~21s room load, ~4.5s `/state`), so it is not committed. Pages updated: backend/control-rooms.md; `docs/decisions.md` entry.

## [2026-10-17] feature — Archive closed Live history and regenerate corrected month
- Added deterministic seven-day retention, durable archive-first recovery, retained exact decision/analytics evidence, bounded public state and paginated station history with archived audits. Regenerated plant-1 to 6 October with companion archives and staged bootstrap; plant-2 and metadata unchanged. Documented residual growth and measured target misses.
- Pages updated: backend/control-rooms.md, backend/domain-model.md, backend/live-runtime.md, backend/overview.md, backend/http-api.md, frontend/overview.md, concepts/analytics-and-ethics.md, operations/running-and-config.md, operations/testing.md. Reader inventory and reproduction: docs/history-retention.md, docs/demo-history.md.

## [2026-10-17] docs — submission drafts
- Added `docs/submission/` with the form answers (page 1 text, technologies, cover image prompt), pitch deck content (10 slides with notes) and a 3:00 demo video script. Drafts by the main agent, sent to codex for factual review (round 7).

## [2026-10-17] docs — Review submission form, deck and video against implementation
- Corrected fix-recommendation scope, dispatch/assistance guarantees, model-measurement context, month event counts, retention/latency claims and historical provider provenance. Replaced timing-dependent video steps with a saved-history walkthrough; verified form limits and narration budget.
- Pages updated: docs/submission/form-answers.md, docs/submission/pitch-deck.md, docs/submission/demo-video-script.md; own handover section records evidence and remaining user choices. Application, seeds and running deployment unchanged.

## [2026-10-17] docs — submission tagline kept; live AMD capture for the video
- User kept "The right responder. The right fix. Learned from every past repair." as the cover/deck tagline (vision); deck slide 1 notes and the video close present fix recommendations as next. Codex's factual corrections otherwise stand.
- The month data holds no successful AMD ranking (month extension ran with models forced off; the original week used earlier providers). By user decision the main agent runs plant-1 live on AMD in the 3200 app to capture genuine MiMo rankings for the video.
