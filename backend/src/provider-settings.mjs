import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AMD_DEFAULT_MODEL_ID, PROVIDER_IDS, amdBaseUrl, defaultReasoningEffortFor, readAmdApiKey } from "./model-provider.mjs";
import { compassDataPath } from "./data-root.mjs";
import { logEvent } from "./application-log-store.mjs";

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Reasoning-effort levels per AMD Token Factory model family, from the AMD
 * documentation. "default" omits the field so the model uses its own default
 * (for DeepSeek-V4-Flash, no thinking; for MiMo, thinking on). Unknown models only offer "default",
 * since an unsupported value is rejected with HTTP 422.
 */
export function reasoningEffortsForModel(modelId) {
  const id = String(modelId);
  if (/^DeepSeek-V4/i.test(id)) return ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"];
  if (/^GLM-/i.test(id)) return ["default", "low", "medium", "high"];
  if (/^MiMo-/i.test(id)) return ["default", "none"];
  if (/^Qwen3\.8-Flash-Next/i.test(id)) return ["default", "none", "low", "medium", "xhigh"];
  if (/^Qwen3\.8-27B/i.test(id)) return ["default", "low", "medium", "xhigh"];
  return ["default"];
}

/** Chat models only: the catalog also lists OCR-only models such as MinerU. */
function isSelectableAmdModel(model) {
  const id = model?.id;
  if (typeof id !== "string" || !id.trim() || /\s/.test(id)) return false;
  const outputs = model?.architecture?.output_modalities ?? model?.output;
  if (Array.isArray(outputs) && outputs.length > 0 && !outputs.includes("text")) return false;
  return true;
}

const PROVIDER_CATALOG = Object.freeze({
  amd: {
    id: "amd",
    label: "AMD Token Factory",
    enabled: true,
    get modelsUrl() { return `${amdBaseUrl()}/models`; },
    isSelectable: isSelectableAmdModel,
    toOption: (model) => ({ id: model.id, ownedBy: "amd", reasoningEfforts: reasoningEffortsForModel(model.id) }),
    fallbackReasoningEfforts: (modelId) => reasoningEffortsForModel(modelId),
  },
});

function normalizeProviderId(value) {
  return PROVIDER_IDS.includes(value) ? value : "amd";
}

function normalizeModelEntry(value = {}) {
  return {
    modelId: typeof value.modelId === "string" ? value.modelId.trim() : "",
    reasoningEffort: typeof value.reasoningEffort === "string" ? value.reasoningEffort : "default",
  };
}

/**
 * A settings file written by an older build may name a removed provider
 * (openai, openrouter, gpt-oss). Those pins are dropped rather than sent to
 * AMD, and the AMD defaults apply instead.
 */
function normalizeSettings(value = {}, defaults = { modelId: AMD_DEFAULT_MODEL_ID, reasoningEffort: defaultReasoningEffortFor(AMD_DEFAULT_MODEL_ID) }) {
  const models = {};
  for (const id of PROVIDER_IDS) {
    const normalized = normalizeModelEntry(value.models?.[id]);
    models[id] = normalized.modelId ? normalized : { ...defaults };
  }
  return { provider: normalizeProviderId(value.provider), models, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null };
}

function maskCredential(apiKey) {
  if (!apiKey) return null;
  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`;
}

function providerList(apiKeys, storedCredentials = {}) {
  return PROVIDER_IDS.map((id) => ({
    id,
    label: PROVIDER_CATALOG[id].label,
    enabled: PROVIDER_CATALOG[id].enabled,
    credentialConfigured: Boolean(apiKeys[id]),
    credentialSource: storedCredentials[id] ? "settings" : (apiKeys[id] ? "environment" : null),
    credentialHint: maskCredential(apiKeys[id]),
  }));
}

/**
 * The flat shape the frontend and every other caller read: the CURRENTLY
 * SELECTED provider's own model/effort at the top level, plus the full
 * provider list (each with its own credential status) so the UI can render
 * every provider without a round trip per provider.
 */
function previewSettings(settings, apiKeys, storedCredentials, providerId = settings.provider) {
  const id = normalizeProviderId(providerId);
  const current = settings.models[id];
  return {
    provider: id,
    modelId: current.modelId,
    reasoningEffort: current.reasoningEffort,
    updatedAt: settings.updatedAt,
    credentialConfigured: Boolean(apiKeys[id]),
    providers: providerList(apiKeys, storedCredentials),
  };
}

export function createProviderSettingsService({
  filePath = compassDataPath("provider-settings.json"),
  credentialsFilePath = join(dirname(filePath), "provider-credentials.json"),
  apiKeys = { amd: readAmdApiKey() },
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  environment = process.env,
  checkModelsOnBoot = false,
  logger = null,
} = {}) {
  // Environment variables remain a safe deployment bootstrap. A credential
  // saved through Settings takes precedence and is kept in its own owner-only
  // file, never in the model-settings file or API payload.
  const environmentApiKeys = apiKeys;
  let storedCredentials = {};
  // Seeds a fresh install; a persisted settings file, once written, takes
  // precedence over these on later boots.
  const seedModelId = environment.AMD_TOKEN_FACTORY_MODEL || AMD_DEFAULT_MODEL_ID;
  const seed = {
    modelId: seedModelId,
    reasoningEffort: environment.AMD_TOKEN_FACTORY_REASONING_EFFORT || defaultReasoningEffortFor(seedModelId),
  };
  let settings = normalizeSettings({ models: { amd: seed } }, seed);
  // Cached so a save can validate against the list the operator actually saw,
  // without re-fetching.
  let availableModelsByProvider = Object.fromEntries(PROVIDER_IDS.map((id) => [id, []]));
  let initialization;
  let catalogState = { status: "UNCHECKED" };
  let catalogRevision = 0;

  function modelValidation(providerId = settings.provider) {
    const savedModelId = settings.models[providerId].modelId;
    const missing = catalogState.status === "READY" && !availableModelsByProvider[providerId].some((model) => model.id === savedModelId);
    return {
      ...catalogState,
      status: catalogState.status === "READY" ? (missing ? "MISSING" : "VALID") : catalogState.status,
      savedModelId,
      effectiveModelId: missing ? AMD_DEFAULT_MODEL_ID : savedModelId,
    };
  }

  function preview(providerId = settings.provider) {
    return { ...previewSettings(settings, currentApiKeys(), storedCredentials, providerId), modelValidation: modelValidation(providerId) };
  }

  function invalidateCatalog() {
    catalogRevision += 1;
    catalogState = { status: "UNCHECKED" };
    availableModelsByProvider = Object.fromEntries(PROVIDER_IDS.map((id) => [id, []]));
  }

  function currentApiKeys() {
    return Object.fromEntries(PROVIDER_IDS.map((id) => [id, storedCredentials[id] || environmentApiKeys[id] || ""]));
  }

  function initialize() {
    return initialization ??= loadSettings();
  }

  async function loadSettings() {
    try {
      settings = normalizeSettings(JSON.parse(await readFile(filePath, "utf8")), seed);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    try {
      const parsed = JSON.parse(await readFile(credentialsFilePath, "utf8"));
      storedCredentials = Object.fromEntries(PROVIDER_IDS
        .filter((id) => typeof parsed?.[id] === "string" && parsed[id].trim())
        .map((id) => [id, parsed[id].trim()]));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // Never await the network during startup. Production opts in at the server
    // entrypoint; tests must explicitly opt in with a fake fetch.
    if (checkModelsOnBoot) void refreshModels();
  }

  async function persist() {
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, filePath);
  }

  async function persistCredentials() {
    await mkdir(dirname(credentialsFilePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${credentialsFilePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(storedCredentials, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, credentialsFilePath);
  }

  async function refreshModels(providerId) {
    await initialize();
    const id = normalizeProviderId(providerId ?? settings.provider);
    const catalog = PROVIDER_CATALOG[id];
    const apiKeys = currentApiKeys();
    const apiKey = apiKeys[id];
    const revision = ++catalogRevision;
    const base = () => preview(id);
    if (!apiKey) {
      catalogState = { status: "UNAVAILABLE", reason: `${catalog.label} credential is not configured` };
      return { ...base(), modelDiscovery: { ...catalogState, provider: id }, models: [] };
    }
    // Keep confirmed catalog evidence in force while a refresh is pending;
    // do not briefly resume calls to a model already known to be missing.
    if (catalogState.status !== "READY") catalogState = { status: "CHECKING" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(catalog.modelsUrl, { headers: { authorization: `Bearer ${apiKey}` }, signal: controller.signal });
      if (!response.ok) throw new Error(`${catalog.label} model discovery responded with HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.data)) throw new Error(`${catalog.label} model discovery returned an invalid catalog`);
      const models = payload.data
        .filter((model) => typeof model?.id === "string" && catalog.isSelectable(model))
        .map((model) => catalog.toOption(model))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (revision === catalogRevision) {
        availableModelsByProvider[id] = models;
        catalogState = { status: "READY", checkedAt: new Date().toISOString() };
        const validation = modelValidation(id);
        if (validation.status === "MISSING") {
          logEvent(logger, "provider_saved_model_missing", { provider: id, savedModelId: validation.savedModelId, effectiveModelId: validation.effectiveModelId });
        }
      }
      return { ...base(), modelDiscovery: { status: "READY", provider: id, fetchedAt: new Date().toISOString() }, models };
    } catch (error) {
      if (revision === catalogRevision) catalogState = { status: "UNAVAILABLE" };
      return { ...base(), modelDiscovery: { status: "UNAVAILABLE", provider: id, reason: controller.signal.aborted ? `${catalog.label} model discovery timed out` : error.message }, models: [] };
    } finally {
      clearTimeout(timer);
    }
  }

  async function update(input) {
    await initialize();
    const providerId = input?.provider;
    const catalog = PROVIDER_IDS.includes(providerId) ? PROVIDER_CATALOG[providerId] : null;
    if (!catalog || !catalog.enabled) throw new Error("Select an available provider");
    const modelId = typeof input.modelId === "string" ? input.modelId.trim() : "";
    const cached = availableModelsByProvider[providerId] ?? [];
    const cachedEntry = cached.find((model) => model.id === modelId);
    if (!modelId || (cached.length > 0 ? !cachedEntry : !catalog.isSelectable({ id: modelId }))) {
      throw new Error(cached.length > 0 ? `Selected model is not available to this ${catalog.label} credential` : `Select an available ${catalog.label} text model`);
    }
    const supportedEfforts = cachedEntry?.reasoningEfforts ?? catalog.fallbackReasoningEfforts(modelId);
    const reasoningEffort = typeof input.reasoningEffort === "string" ? input.reasoningEffort : "";
    if (!supportedEfforts.includes(reasoningEffort)) throw new Error(`Reasoning level is not supported for ${modelId}`);
    settings = { provider: providerId, models: { ...settings.models, [providerId]: { modelId, reasoningEffort } }, updatedAt: new Date().toISOString() };
    await persist();
    return preview();
  }

  return {
    initialize,
    async snapshot() { await initialize(); return preview(); },
    refreshModels,
    update,
    async updateCredential(input) {
      await initialize();
      const providerId = input?.provider;
      if (!PROVIDER_IDS.includes(providerId)) throw new Error("Select an available provider");
      const apiKey = typeof input?.apiKey === "string" ? input.apiKey.trim() : "";
      if (!apiKey || apiKey.length > 1_000) throw new Error("Enter a valid API key");
      storedCredentials = { ...storedCredentials, [providerId]: apiKey };
      invalidateCatalog();
      await persistCredentials();
      return preview(providerId);
    },
    async removeCredential(providerId) {
      await initialize();
      if (!PROVIDER_IDS.includes(providerId)) throw new Error("Select an available provider");
      if (storedCredentials[providerId]) {
        const { [providerId]: removed, ...remaining } = storedCredentials;
        storedCredentials = remaining;
        invalidateCatalog();
        await persistCredentials();
      }
      return preview(providerId);
    },
    async requestOptions(purpose = "compass") {
      await initialize();
      const mode = purpose === "event-planner"
        ? environment.COMPASS_EVENT_PLANNER_MODE ?? "live"
        : environment.COMPASS_LIVE_COMPASS_MODE ?? "live";
      const providerId = settings.provider;
      const current = modelValidation(providerId).status === "MISSING"
        ? { modelId: AMD_DEFAULT_MODEL_ID, reasoningEffort: defaultReasoningEffortFor(AMD_DEFAULT_MODEL_ID) }
        : settings.models[providerId];
      return {
        mode,
        provider: providerId,
        apiKey: currentApiKeys()[providerId] ?? "",
        modelId: current.modelId || AMD_DEFAULT_MODEL_ID,
        ...(current.reasoningEffort && current.reasoningEffort !== "default" ? { reasoningEffort: current.reasoningEffort } : {}),
      };
    },
  };
}
