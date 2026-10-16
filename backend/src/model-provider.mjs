/**
 * Provider-specific chat-completion mechanics, shared by the Compass agent and
 * the event planner. Both send one JSON-output request and parse one JSON
 * result. Everything else — validation, fallback, never trusting the model —
 * stays in the caller, not here.
 *
 * Compass uses exactly one provider: AMD Radeon Cloud Token Factory, an
 * OpenAI-compatible endpoint. See Compass_AMD_Token_Factory_Integration_Guide.md.
 */

import { readFileSync } from "node:fs";

export const PROVIDER_IDS = Object.freeze(["amd"]);

export const AMD_DEFAULT_BASE_URL = "https://developer.amd.com.cn/radeon/api/v1";
// Chosen by measurement, not by the guide's suggestion: on Compass's own
// candidate packet, MiMo-V2.6-Flash with reasoning off returned contract-valid
// rankings on every trial, while DeepSeek-V4-Flash and Qwen3.8-Flash-Next
// repeatedly broke the no-IDs/no-digits prose rule. See docs/decisions.md.
export const AMD_DEFAULT_MODEL_ID = "MiMo-V2.6-Flash";
// MiMo thinks by default, which is slower and spends output tokens on a trace
// Compass never uses; "none" turns that off.
export const AMD_DEFAULT_REASONING_EFFORT = "none";

/** The reasoning effort to use when none is configured for a model. */
export function defaultReasoningEffortFor(modelId) {
  return modelId === AMD_DEFAULT_MODEL_ID ? AMD_DEFAULT_REASONING_EFFORT : "default";
}
// Bounds output size (and shared team quota). Reasoning tokens count against
// this budget, so it is deliberately generous; a truncated reply fails closed.
const AMD_DEFAULT_MAX_OUTPUT_TOKENS = 4_096;

export function amdBaseUrl(environment = process.env) {
  return String(environment.AMD_TOKEN_FACTORY_BASE_URL || AMD_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function amdMaxOutputTokens(environment = process.env) {
  const parsed = Number.parseInt(environment.AMD_TOKEN_FACTORY_MAX_OUTPUT_TOKENS, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : AMD_DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * The team key comes from AMD_TOKEN_FACTORY_API_KEY, or from the file named by
 * AMD_TOKEN_FACTORY_API_KEY_FILE so the secret never has to sit in .env or a
 * process listing. An unreadable file yields no key, so calls fail closed.
 */
export function readAmdApiKey(environment = process.env) {
  if (environment.AMD_TOKEN_FACTORY_API_KEY) return String(environment.AMD_TOKEN_FACTORY_API_KEY).trim();
  if (!environment.AMD_TOKEN_FACTORY_API_KEY_FILE) return "";
  try {
    return readFileSync(environment.AMD_TOKEN_FACTORY_API_KEY_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

const PROVIDER_DEFS = Object.freeze({
  amd: {
    id: "amd",
    label: "AMD Token Factory",
    apiKeyEnv: "AMD_TOKEN_FACTORY_API_KEY",
    get chatCompletionsUrl() { return `${amdBaseUrl()}/chat/completions`; },
    // The shared endpoints reject strict json_schema for the default model, so
    // Compass requests json_object and the caller validates the full contract.
    // "default" means the operator left reasoning effort unset (for
    // MiMo-V2.6-Flash, that means thinking is on).
    buildBody({ modelId, reasoningEffort, messages }) {
      return {
        model: modelId,
        ...(reasoningEffort && reasoningEffort !== "default" ? { reasoning_effort: reasoningEffort } : {}),
        messages,
        response_format: { type: "json_object" },
        max_tokens: amdMaxOutputTokens(),
      };
    },
  },
});

export function providerDef(providerId) {
  return PROVIDER_DEFS[providerId] ?? PROVIDER_DEFS.amd;
}

/**
 * json_object mode guarantees syntactically valid JSON but not its shape, so
 * the contract travels in the system message. It is guidance only: the caller
 * still validates every field before using the result.
 */
function systemMessageWithSchema(systemInstruction, jsonSchemaName, jsonSchema) {
  return `${systemInstruction}

Respond with exactly one JSON object and nothing else (no Markdown). The object must conform to this JSON Schema named "${jsonSchemaName}":
${JSON.stringify(jsonSchema)}`;
}

/** AMD wraps errors as {"error": ...} or {"detail": {"error": ...}}. */
function upstreamErrorDetail(text) {
  try {
    const parsed = JSON.parse(text);
    const error = parsed?.error ?? parsed?.detail?.error ?? parsed?.detail;
    const message = typeof error === "string" ? error : error?.message;
    if (typeof message === "string" && message) return message;
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return text;
}

/**
 * One JSON-output chat-completion call. Never trusts the shape of what comes
 * back — it only parses the response envelope; the caller validates the
 * parsed content against its own contract before using it for anything.
 *
 * Throws on every failure (missing credential, HTTP error, timeout, truncated
 * or malformed envelope). Callers already catch broadly and fail closed to a
 * deterministic fallback, so this never needs its own fallback path.
 */
export async function callChatCompletion({
  provider = "amd",
  modelId,
  apiKey,
  reasoningEffort,
  timeoutMs,
  fetchImpl,
  systemInstruction,
  userContent,
  jsonSchemaName,
  jsonSchema,
  errorLabel,
}) {
  const def = providerDef(provider);
  if (!apiKey) throw new Error(`${def.apiKeyEnv} is not configured`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(def.chatCompletionsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(def.buildBody({
        modelId,
        reasoningEffort,
        messages: [
          { role: "system", content: systemMessageWithSchema(systemInstruction, jsonSchemaName, jsonSchema) },
          { role: "user", content: userContent },
        ],
      })),
      signal: controller.signal,
    });
    if (!response.ok) {
      // The provider's own words are the only thing that distinguishes a bad
      // parameter from a bad key from a retired model. Bounded, and never
      // includes the request body or headers.
      const detail = upstreamErrorDetail(await response.text().catch(() => ""));
      throw new Error(`${errorLabel} responded with HTTP ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`);
    }
    const payload = await response.json();
    const choice = payload?.choices?.[0];
    if (choice?.finish_reason === "length") throw new Error(`${errorLabel} response was truncated at the output-token limit`);
    // Any separate reasoning trace (message.reasoning) is deliberately ignored:
    // only the normal content payload is ever parsed, validated, or stored.
    const content = choice?.message?.content;
    if (typeof content !== "string") throw new Error(`${errorLabel} response was missing structured content`);
    return JSON.parse(content);
  } catch (error) {
    if (controller.signal.aborted) {
      throw Object.assign(new Error(`${errorLabel} call timed out`), { name: "AbortError" });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
