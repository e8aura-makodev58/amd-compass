# Model provider

ResponseCompass calls a model in exactly two places — the **Compass agent** (`agent.mjs`, ranks
candidates) and the **event planner** (`event-planner.mjs`, proposes the next issue). Both
send JSON-output chat-completion requests and parse JSON results. The ranking agent can
make one revalidated repair request within its original deadline. Provider mechanics
are isolated in `model-provider.mjs`; everything that must never depend on the provider
(validation, fallback, never trusting the model) lives in the callers.

ResponseCompass uses **one provider: AMD Radeon Cloud Token Factory**, an OpenAI-compatible
service. This is a hackathon requirement; OpenAI, OpenRouter, and the self-hosted GPT-OSS
provider were removed on 2026-10-16 (see `docs/decisions.md`). Service facts, limits, and
terms are in [`Compass_AMD_Token_Factory_Integration_Guide.md`](../../Compass_AMD_Token_Factory_Integration_Guide.md).

> **Changing the provider is a change to this page.** Update it, plus
> [operations/running-and-config.md](../operations/running-and-config.md) for any env
> vars, and add coverage under `backend/tests/amd-provider.test.mjs`.

## The abstraction (`model-provider.mjs`)

- `PROVIDER_IDS` — `["amd"]`. `providerDef(id)` resolves any id (including a removed one
  recorded in old state) to AMD, so a request never silently goes nowhere.
- `amdBaseUrl()` — `AMD_TOKEN_FACTORY_BASE_URL`, default
  `https://developer.amd.com.cn/radeon/api/v1`, resolved at call time.
- `readAmdApiKey()` — `AMD_TOKEN_FACTORY_API_KEY`, else the contents of
  `AMD_TOKEN_FACTORY_API_KEY_FILE`; an unreadable file yields no key (fail closed).
- `AMD_DEFAULT_MODEL_ID` = `MiMo-V2.6-Flash`; `defaultReasoningEffortFor(modelId)` returns
  `none` for it and `default` (field omitted) for anything else.
- `callChatCompletion({ modelId, apiKey, reasoningEffort, timeoutMs, fetchImpl,
  systemInstruction, userContent, jsonSchemaName, jsonSchema, errorLabel })` — POSTs to
  `/chat/completions`, enforces the timeout via `AbortController`, and returns `JSON.parse`
  of `choices[0].message.content`. It **throws on every failure**: missing credential,
  HTTP error (AMD's `{"error"}` and `{"detail":{"error"}}` wrappers are unwrapped into the
  message), timeout, `finish_reason: "length"` (truncation), or non-JSON content. Callers
  catch broadly and fall back. Errors carry `status`, `retryAfterMs` and `serviceFailure`
  for the runtime controls below.

### Request shape

```text
{ model, messages: [system, user], response_format: { type: "json_object" },
  max_tokens: AMD_TOKEN_FACTORY_MAX_OUTPUT_TOKENS (4096), reasoning_effort?: <unless "default"> }
```

- **`json_object`, not `json_schema`.** AMD's shared endpoints reject strict `json_schema`
  for DeepSeek-V4-Flash (HTTP 400 "does not support JSON schema output mode"), so the
  output schema is appended to the system message as guidance. `json_object` guarantees
  only syntactically valid JSON: **the callers' validators are the real contract** —
  `validateAgentResult` (IDs, ranks, tradeoffs, no digits in prose apart from supplied candidate names) and
  `validateEventProposal` (eligible equipment, issue class, ceilings).
- Any separate reasoning trace (`message.reasoning`) is ignored — never parsed, stored, or
  shown.
- Unsupported optional fields are silently dropped by AMD's gateway, so ResponseCompass does not
  rely on `seed`, `stop`, etc.

## Model choice (measured 2026-10-16)

One live call per model on the Scenario A candidate packet (four candidates), then
repeats for the leaders. Validity means `validateAgentResult` accepted the output.

| Model (reasoning) | Valid | Latency | Notes |
|---|---|---|---|
| **MiMo-V2.6-Flash (none)** | **4/4** | 21–30s | Default. |
| GLM-5.3-Flash (low) | 1/3 | 27–41s | One digit-in-prose failure, one HTTP 502. |
| DeepSeek-V4-Flash (default / none) | 0/3 | 30–39s | Responder IDs and numbers in prose, an invented responder ID, garbled words. |
| Qwen3.8-Flash-Next (none) | 0/1 | 34s | Digits in prose. |
| Qwen3.8-27B (low) | 1/1 | 120s | Too slow for dispatch. |
| DeepSeek-V4.1-Flash, Gemma-4-31B-IT | — | >150s | No reply. |

### Repeat measurement — `npm run measure:amd` (2026-10-16, 3 samples each)

`scripts/measure-amd-models.mjs` makes live calls through `requestAgentRecommendation` and
`requestEventProposal`, so they pass the same provider limits and validators as the app.
It runs one call at a time and prints a Markdown table. It spends the shared team quota, so
it is manual and never part of `npm test`. Options: `--models id[:effort],…` (default
`AMD_DEFAULT_MODEL_ID`), `--samples N` (default 3), `--skip-planner`, `--skip-ranking`,
`--timeout-ms` (ranking, default 90000) and `--planner-timeout-ms` (default 30000); the
timeout defaults match the app's own. Repeated failures are grouped with a count. (Runs
before 2026-10-17 05:30 UTC used one 90s timeout for both roles.) The expected Scenario A top pick is `R-ENGR028`.

| Model (reasoning) | Ranking valid | Ranking median | Planner valid | Planner median | Main failure |
|---|---|---|---|---|---|
| **MiMo-V2.6-Flash (none)** | 1/3 | 28.5s | 3/3 | 4.5s | Digits in rationale prose. |
| GLM-5.3-Flash (low) | 0/3 | — | 0/3 | — | Timeouts; HTTP 429 "concurrency limit (16)". |
| Qwen3.8-Flash-Next (none) | 0/3 | — | 3/3 | 27.5s | Ranking timed out at 90s. |
| DeepSeek-V4-Flash (none) | 0/3 | — | 3/3 | 6.7s | Digits in rationale prose. |
| MiniCPM5-2B (default) | 0/3 | — | 0/3 | — | Schema errors; unknown equipment. |

The single valid MiMo ranking picked `R-ENGR028`. Most ranking failures come from
`containsNumericLeakage` in `agent.mjs`, which then rejected any digit, while models wrote
responder IDs or numbers in their rationale. Since 2026-10-17 (user decision) the supplied
candidates' `responderId` / `displayName` are allowed in prose; every other digit is still
rejected. The ranking prompt now reinforces qualitative prose with a compliant example;
one revalidated repair attempt is available as described below.
A ranking-only re-check right after that change (2026-10-17, 3 samples): **MiMo-V2.6-Flash
3/3 valid** (median 28.4s; it picked `R-ENGR028` in 1 of 3 and other eligible candidates
otherwise). DeepSeek-V4-Flash (default reasoning) was 1/3: it left candidates out of the
ranking.

### After the repair retry and provider controls (2026-10-17, 3 samples, 90s timeout)

| Model (reasoning) | Ranking valid | Picked `R-ENGR028` | Ranking median | Planner valid | Planner median | Failures |
|---|---|---|---|---|---|---|
| **MiMo-V2.6-Flash (none)** | 2/3 | 2/3 | 22.0s | 3/3 | 5.7s | One ranking timed out at 90s. |
| DeepSeek-V4-Flash (default) | **3/3** | **3/3** | 27.9s | 1/3 | 6.9s | Planner: unknown equipment; description over 180 characters. |
| Qwen3.8-Flash-Next (default) | 0/3 | — | — | 3/3 | 30.7s | Every ranking timed out. |
| GLM-5.3-Flash (low) | 0/3 | — | — | 0/3 | — | Timeouts; the circuit breaker then opened and failed the last call at once. |

Rankings went from 1 valid in 15 to 5 valid in 12 across comparable models, and every
valid ranking picked the expected candidate. No digit-in-prose failures remained. MiMo
stays the default: it is the only model valid on both roles. Small samples; the app's own
agent timeout is 60s, shorter than this run's 90s.

### Default-choice measurement (2026-10-17, 10 samples, app timeouts 60s ranking / 30s planner)

| Model (reasoning) | Ranking valid | Picked `R-ENGR028` | Ranking median | Planner valid | Planner median | Failures |
|---|---|---|---|---|---|---|
| **MiMo-V2.6-Flash (none)** | **9/10** | 8/10 | 41.7s | **10/10** | 5.5s | Ranking timeout ×1. |
| DeepSeek-V4-Flash (default) | 8/10 | 8/10 | 33.2s | 3/10 | 5.4s | Ranking timeout ×2; planner unknown equipment ×5, timeout ×2. |
| DeepSeek-V4-Flash (none) | 8/10 | 8/10 | 41.9s | 3/10 | 5.8s | Ranking timeout ×2; planner unknown equipment ×5, `responseAction` over 240 characters ×2. |

**Decision: MiMo-V2.6-Flash / `none` stays the default for both roles.** With the repair
retry it is now the most reliable ranker as well as the planner. DeepSeek is no better at
ranking and much worse at planning. All remaining ranking failures are timeouts, not
invalid answers: MiMo's ranking latencies ran 24–60s (median 42s, some including a repair),
so the 60s agent timeout was tight; it is now 90s (user decision, 2026-10-17). Per-role selection (codex, round 4) stays useful for
operators, but needs no different defaults. The planner is
reliable on MiMo and DeepSeek. Re-measure after that fix and the provider limiter merge.

Output speed is roughly 25 tokens/s, so a ranking takes 20–60s; the agent timeout defaults
to 90s (60s before 2026-10-17) and the planner to 30s. The service has no SLA and was fully down (HTTP 500/502)
later the same day, so the deterministic fallback is a normal operating path. Small
samples: re-measure before relying on these numbers.

## Selection & discovery (`provider-settings.mjs`)

- **Persisted pin.** `backend/data/provider-settings.json` stores
  `{ provider: "amd", models: { amd: { modelId, reasoningEffort } } }`. A file written by an
  older build that names a removed provider loads as AMD with the default model; old pins
  are dropped, never sent to AMD.
- **Env seeding.** A fresh install seeds from `AMD_TOKEN_FACTORY_MODEL` /
  `AMD_TOKEN_FACTORY_REASONING_EFFORT`.
- **Credential.** The env/file key is the bootstrap; a key saved in Settings is kept in the
  owner-only `provider-credentials.json` and takes precedence. Snapshots only ever expose a
  masked hint.
- **Model discovery.** `GET /api/settings/models` fetches AMD's `/models`, keeps chat
  models only (drops OCR-only models such as MinerU), and attaches each model's documented
  reasoning levels via `reasoningEffortsForModel` (DeepSeek-V4, GLM, MiMo, Qwen3.8 families;
  unknown models offer only `default`, since an unsupported value is an HTTP 422).
- **Boot validation.** The server enables a background catalog check after settings and
  credentials load; startup never awaits the network. `NODE_ENV=test` disables this boot
  check. Service-level callers opt in with `checkModelsOnBoot` (tests supply fake fetch).
  Snapshots retain the saved `modelId` and expose `modelValidation` with `status`
  (`UNCHECKED`, `CHECKING`, `VALID`, `MISSING`, `UNAVAILABLE`), `savedModelId`, and
  `effectiveModelId`. A successful catalog missing the saved chat model emits
  `provider_saved_model_missing` to the application log. Both ranking and planner request
  options then use `AMD_DEFAULT_MODEL_ID` and its default reasoning effort, leaving the
  user's saved file untouched. Failed/malformed discovery keeps the saved choice; a later
  successful refresh can restore it. Confirmed fallback remains active during a pending
  refresh. Changing credentials invalidates catalog evidence,
  and stale in-flight responses cannot override the new credential's status.
- **`requestOptions(purpose)`** returns `{ mode, provider: "amd", apiKey, modelId,
  reasoningEffort? }` for `agent.mjs` / `event-planner.mjs`. `mode` is `live` unless
  overridden by `COMPASS_LIVE_COMPASS_MODE` / `COMPASS_EVENT_PLANNER_MODE`.

## Inference modes

Both callers accept a `mode`:

- `live` — call AMD through `callChatCompletion`.
- `fixture` — load a committed JSON fixture (the Offline path; never touches the network).
- `force-failure` — deterministically return "unavailable" (used by tests and the E2E
  suite to prove the fallback).

Any failure resolves to an explicit `{ status: "unavailable" }`, and the runtime falls back
to the deterministic baselines — dispatch always continues.

## Ranking validation repair (`agent.mjs`)

A parsed live ranking that fails `validateAgentResult` can trigger **one** replacement
request through `callLiveModel` → `callChatCompletion`. The replacement receives the same
authoritative candidate packet and bounded validator feedback (at most eight errors,
each at most 256 characters), without echoing the rejected model output. It uses the same
model, reasoning setting and output contract, and passes the full unchanged validator.
Supplied candidate names remain the only digit-bearing prose allowed.

Both calls share the original monotonic deadline (default 90 seconds). Repair starts only
with at least one second remaining and gets only the remaining timeout, so provider
queueing/retries also consume that budget. Even a valid result arriving after the deadline
is unavailable. A second validation failure stays `validation-failed`; provider errors do
not trigger a validation repair. Validation remains outside the provider call so rejected
rankings are not service failures for provider controls. Fixture and force-failure modes
never repair or call the network.

Hermetic coverage lives in `backend/tests/wp5-agent.test.mjs`, using fake fetch, an injected
monotonic clock and mock timers to check successful repair, repeated rejection, feedback
bounds, skipping a near-expired deadline and aborting at the shared deadline. The main agent
must re-measure live validity after merging; these tests establish behavior, not model quality.

## Runtime controls (`provider-controls.mjs`)

Every `callChatCompletion` runs under one set of controls, so the agent, its repair attempt
and the event planner in every control room share the same budget. Controls are kept per
transport: the real `fetch` has a single process-wide set; each injected test `fetchImpl`
gets its own, so hermetic tests never share limiter or breaker state. Env vars are in
[../operations/running-and-config.md](../operations/running-and-config.md).

- **Limiter.** At most `AMD_TOKEN_FACTORY_APP_CONCURRENCY` (2) in flight and
  `AMD_TOKEN_FACTORY_APP_RPM` (10) starts per rolling minute, with up to 32 waiting in a
  FIFO queue. A full queue fails at once (`code: "queue-full"`). A request that cannot
  start before its deadline fails as a timeout (`AbortError`, `code: "deadline"`).
- **Deadline.** `timeoutMs` covers queueing, every attempt and every retry wait; each
  attempt's `AbortController` gets only the time left.
- **Retries.** Only HTTP 429 is retried, following the guide (§9): wait `Retry-After`
  (seconds or HTTP date), or back off exponentially with jitter from 1s when it is absent.
  Retry only while the wait fits the deadline and `AMD_TOKEN_FACTORY_MAX_RETRIES` (2) is not
  used up. 502/503, network errors and other 4xx fail at once so the caller falls back.
- **Circuit breaker.** `AMD_TOKEN_FACTORY_BREAKER_THRESHOLD` (5) consecutive service
  failures (429, 5xx, network errors, timeouts) open it. While open, calls fail at once
  (`code: "circuit-open"`, message names the breaker). After
  `AMD_TOKEN_FACTORY_BREAKER_COOLDOWN_MS` (60s) one probe is allowed; success closes it,
  failure reopens it. Any response from a reachable service (including 4xx, truncation or
  bad JSON) resets the count. Validation rejections happen in the callers and never reach
  the breaker.

Callers already map `AbortError` to `timeout` and anything else to `provider-error`, then
fall back, so these controls needed no caller changes.

## Not yet built

Nothing from the integration guide's runtime list remains open. Catalog validation at
boot is described under Selection & discovery.

## Frontend

The Settings → API tab renders the provider list from the `/api/settings` response
(`settings.providers`), so it shows the single AMD entry with no client change. See
[frontend/overview.md](../frontend/overview.md).
