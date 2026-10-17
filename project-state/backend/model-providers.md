# Model provider

ResponseCompass calls a model in exactly two places — the **Compass agent** (`agent.mjs`, ranks
candidates) and the **event planner** (`event-planner.mjs`, proposes the next issue). Both
send one JSON-output chat-completion request and parse one JSON result. Provider mechanics
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
  catch broadly and fall back.

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
`AMD_DEFAULT_MODEL_ID`), `--samples N` (default 3), `--skip-planner`, `--timeout-ms`
(default 90000). The expected Scenario A top pick is `R-ENGR028`.

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
rejected. Prompt hardening plus one revalidated repair attempt is being built on top. The planner is
reliable on MiMo and DeepSeek. Re-measure after that fix and the provider limiter merge.

Output speed is roughly 25 tokens/s, so a ranking takes 20–40s; the agent timeout defaults
to 60s and the planner to 30s. The service has no SLA and was fully down (HTTP 500/502)
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

## Not yet built

From the integration guide, still open: a local rate limiter (AMD allows ~30 RPM per team
key, shared by the whole team), bounded retry of HTTP 429 honoring `Retry-After`, a circuit
breaker, and catalog validation of the saved model at boot.

## Frontend

The Settings → API tab renders the provider list from the `/api/settings` response
(`settings.providers`), so it shows the single AMD entry with no client change. See
[frontend/overview.md](../frontend/overview.md).
