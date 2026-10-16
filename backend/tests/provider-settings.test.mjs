import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProviderSettingsService, reasoningEffortsForModel } from "../src/provider-settings.mjs";
import { createRequestHandler } from "../src/server.mjs";

async function scratchPath() {
  const directory = await mkdtemp(join(tmpdir(), "compass-provider-settings-"));
  return join(directory, "provider-settings.json");
}

/** A stubbed AMD /models catalog, shaped like the live one. */
function stubAmdModelList(models) {
  return async (url) => {
    assert.match(String(url), /\/models$/);
    return { ok: true, status: 200, json: async () => ({ data: models }) };
  };
}

const chatModel = (id) => ({ id, architecture: { output_modalities: ["text"] } });
const AMD_CATALOG = [chatModel("GLM-5.3-Flash"), chatModel("DeepSeek-V4-Flash"), { id: "MinerU2.5-Pro", architecture: { output_modalities: ["ocr"] } }];

function responseCapture() {
  const capture = {};
  return { capture, writeHead(status) { capture.status = status; }, end(body) { capture.body = body; } };
}

async function invoke(handler, method, url, body = null) {
  const response = responseCapture();
  const request = {
    method,
    url,
    headers: { host: "localhost" },
    async *[Symbol.asyncIterator]() { if (body !== null) yield Buffer.from(JSON.stringify(body)); },
  };
  await handler(request, response);
  return { status: response.capture.status, json: JSON.parse(response.capture.body) };
}

test("reasoningEffortsForModel maps documented AMD model families and falls back to default", () => {
  assert.deepEqual(reasoningEffortsForModel("DeepSeek-V4-Flash"), ["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"]);
  assert.deepEqual(reasoningEffortsForModel("GLM-5.3-Flash"), ["default", "low", "medium", "high"]);
  assert.deepEqual(reasoningEffortsForModel("Qwen3.8-Flash-Next"), ["default", "none", "low", "medium", "xhigh"]);
  assert.deepEqual(reasoningEffortsForModel("Qwen3.8-27B"), ["default", "low", "medium", "xhigh"]);
  assert.deepEqual(reasoningEffortsForModel("Gemma-4-31B-IT"), ["default"]);
});

test("snapshot reports only AMD Token Factory, defaults to MiMo-V2.6-Flash with reasoning off, and never returns the key", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {} });
  const snapshot = await service.snapshot();
  assert.equal(snapshot.provider, "amd");
  assert.equal(snapshot.modelId, "MiMo-V2.6-Flash");
  assert.equal(snapshot.reasoningEffort, "none");
  assert.equal(snapshot.credentialConfigured, true);
  assert.equal(JSON.stringify(snapshot).includes("rc-test-key"), false);
  assert.deepEqual(snapshot.providers, [
    { id: "amd", label: "AMD Token Factory", enabled: true, credentialConfigured: true, credentialSource: "environment", credentialHint: "••••-key" },
  ]);
});

test("the environment seeds the model and reasoning effort on a fresh install", async () => {
  const service = createProviderSettingsService({
    filePath: await scratchPath(),
    apiKeys: { amd: "rc-test-key" },
    environment: { AMD_TOKEN_FACTORY_MODEL: "GLM-5.3-Flash", AMD_TOKEN_FACTORY_REASONING_EFFORT: "low" },
  });
  const options = await service.requestOptions();
  assert.equal(options.modelId, "GLM-5.3-Flash");
  assert.equal(options.reasoningEffort, "low");
});

test("a Settings API key is persisted separately with owner-only permissions, is write-only in snapshots, and can be removed", async () => {
  const filePath = await scratchPath();
  const credentialsFilePath = join(filePath, "..", "provider-credentials.json");
  const service = createProviderSettingsService({ filePath, credentialsFilePath, apiKeys: { amd: "" }, environment: {} });

  const saved = await service.updateCredential({ provider: "amd", apiKey: "rc-secret-9876" });
  assert.equal(saved.providers[0].credentialConfigured, true);
  assert.equal(saved.providers[0].credentialSource, "settings");
  assert.equal(saved.providers[0].credentialHint, "••••9876");
  assert.equal(JSON.stringify(saved).includes("rc-secret-9876"), false);
  assert.equal((await service.requestOptions()).apiKey, "rc-secret-9876");
  assert.match(await readFile(credentialsFilePath, "utf8"), /rc-secret-9876/);
  assert.equal((await stat(credentialsFilePath)).mode & 0o777, 0o600);

  const removed = await service.removeCredential("amd");
  assert.equal(removed.providers[0].credentialConfigured, false);
  assert.equal((await service.requestOptions()).apiKey, "");
  await assert.rejects(() => service.updateCredential({ provider: "openai", apiKey: "sk-x" }), /Select an available provider/);
});

test("refreshModels is explicit-unavailable without a credential, never guessing a model list", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "" }, environment: {}, fetchImpl: async () => { throw new Error("must not be called"); } });
  const result = await service.refreshModels();
  assert.equal(result.modelDiscovery.status, "UNAVAILABLE");
  assert.match(result.modelDiscovery.reason, /AMD Token Factory credential is not configured/);
  assert.deepEqual(result.models, []);
});

test("refreshModels keeps chat models only, sorts by ID, and attaches per-model reasoning efforts", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  const result = await service.refreshModels();
  assert.equal(result.modelDiscovery.status, "READY");
  assert.equal(result.modelDiscovery.provider, "amd");
  assert.deepEqual(result.models.map((model) => model.id), ["DeepSeek-V4-Flash", "GLM-5.3-Flash"]);
  assert.deepEqual(result.models.find((model) => model.id === "GLM-5.3-Flash").reasoningEfforts, ["default", "low", "medium", "high"]);
});

test("refreshModels fails closed on a provider HTTP error or a timeout rather than guessing", async () => {
  const httpError = createProviderSettingsService({
    filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {},
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
  });
  const errorResult = await httpError.refreshModels();
  assert.equal(errorResult.modelDiscovery.status, "UNAVAILABLE");
  assert.match(errorResult.modelDiscovery.reason, /401/);

  const hangs = createProviderSettingsService({
    filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {},
    timeoutMs: 10,
    fetchImpl: (url, init) => new Promise((_, reject) => { init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); }),
  });
  const timeoutResult = await hangs.refreshModels();
  assert.equal(timeoutResult.modelDiscovery.status, "UNAVAILABLE");
  assert.match(timeoutResult.modelDiscovery.reason, /timed out/);
});

test("update rejects a removed provider, an unselectable or undiscovered model, and an unsupported reasoning level", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  await assert.rejects(() => service.update({ provider: "openai", modelId: "gpt-5.1-mini", reasoningEffort: "low" }), /Select an available provider/);
  await assert.rejects(() => service.update({ provider: "amd", modelId: "not a model", reasoningEffort: "default" }), /Select an available/);
  await service.refreshModels();
  await assert.rejects(() => service.update({ provider: "amd", modelId: "MinerU2.5-Pro", reasoningEffort: "default" }), /not available to this AMD Token Factory credential/);
  await assert.rejects(() => service.update({ provider: "amd", modelId: "GLM-5.3-Flash", reasoningEffort: "xhigh" }), /Reasoning level/);
});

test("update persists a valid selection atomically and it survives a reload", async () => {
  const filePath = await scratchPath();
  const service = createProviderSettingsService({ filePath, apiKeys: { amd: "rc-test-key" }, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  await service.refreshModels();
  const saved = await service.update({ provider: "amd", modelId: "GLM-5.3-Flash", reasoningEffort: "medium" });
  assert.equal(saved.modelId, "GLM-5.3-Flash");
  assert.equal(saved.reasoningEffort, "medium");

  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  const onDisk = JSON.parse(await readFile(filePath, "utf8"));
  assert.equal(onDisk.provider, "amd");
  assert.equal(onDisk.models.amd.modelId, "GLM-5.3-Flash");

  const reloaded = createProviderSettingsService({ filePath, apiKeys: { amd: "rc-test-key" }, environment: {} });
  const snapshot = await reloaded.snapshot();
  assert.equal(snapshot.modelId, "GLM-5.3-Flash");
  assert.equal(snapshot.reasoningEffort, "medium");
});

test("a settings file naming a removed provider loads as AMD with its default model, never sending the old pin", async () => {
  const filePath = await scratchPath();
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, JSON.stringify({
    provider: "gpt-oss",
    models: { openai: { modelId: "gpt-5.6-terra", reasoningEffort: "medium" }, "gpt-oss": { modelId: "openai/gpt-oss-20b", reasoningEffort: "low" } },
    updatedAt: "2026-09-15T00:00:00.000Z",
  }));
  const service = createProviderSettingsService({ filePath, apiKeys: { amd: "rc-test-key" }, environment: {} });
  const options = await service.requestOptions();
  assert.equal(options.provider, "amd");
  assert.equal(options.modelId, "MiMo-V2.6-Flash");
  assert.equal(options.reasoningEffort, "none");
});

test("requestOptions returns a live-mode call configuration and omits a 'default' reasoning level", async () => {
  const service = createProviderSettingsService({ filePath: await scratchPath(), apiKeys: { amd: "rc-test-key" }, environment: {}, fetchImpl: stubAmdModelList(AMD_CATALOG) });
  assert.deepEqual(await service.requestOptions(), { mode: "live", provider: "amd", apiKey: "rc-test-key", modelId: "MiMo-V2.6-Flash", reasoningEffort: "none" });
  await service.refreshModels();
  await service.update({ provider: "amd", modelId: "DeepSeek-V4-Flash", reasoningEffort: "default" });
  assert.deepEqual(await service.requestOptions(), { mode: "live", provider: "amd", apiKey: "rc-test-key", modelId: "DeepSeek-V4-Flash" });
});

test("requestOptions preserves independent explicit inference modes for hermetic runs", async () => {
  const service = createProviderSettingsService({
    filePath: await scratchPath(),
    apiKeys: { amd: "rc-test-key" },
    environment: { COMPASS_LIVE_COMPASS_MODE: "force-failure", COMPASS_EVENT_PLANNER_MODE: "fixture" },
  });
  assert.equal((await service.requestOptions("compass")).mode, "force-failure");
  assert.equal((await service.requestOptions("event-planner")).mode, "fixture");
});

test("settings routes are wired end to end: snapshot, credentials, model discovery, and save — deployment-global, not gated by any one room's mode", async () => {
  const settingsService = createProviderSettingsService({
    filePath: await scratchPath(),
    apiKeys: { amd: "rc-environment-key" },
    environment: {},
    fetchImpl: stubAmdModelList(AMD_CATALOG),
  });
  // /api/settings and /api/settings/models never touch the manager (see
  // control-room-manager.mjs / server.mjs createRequestHandler) — settings
  // are deployment-global, shared across every Control Room, so `null` here
  // stands in for "manager is irrelevant to this route".
  const handler = createRequestHandler(null, null, settingsService);

  const snapshot = await invoke(handler, "GET", "/api/settings");
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.json.provider, "amd");
  assert.equal(snapshot.json.providers.length, 1);

  const credentialSaved = await invoke(handler, "POST", "/api/settings/credentials", { provider: "amd", apiKey: "rc-secret-9876" });
  assert.equal(credentialSaved.status, 200);
  assert.equal(credentialSaved.json.providers[0].credentialSource, "settings");
  assert.equal(JSON.stringify(credentialSaved.json).includes("rc-secret-9876"), false);

  const credentialRemoved = await invoke(handler, "DELETE", "/api/settings/credentials?provider=amd");
  assert.equal(credentialRemoved.status, 200);
  // The injected environment key remains available after a saved override is
  // removed, rather than leaving a shared deployment without its credential.
  assert.equal(credentialRemoved.json.providers[0].credentialSource, "environment");

  const models = await invoke(handler, "GET", "/api/settings/models");
  assert.equal(models.status, 200);
  assert.deepEqual(models.json.models.map((model) => model.id), ["DeepSeek-V4-Flash", "GLM-5.3-Flash"]);

  const saved = await invoke(handler, "POST", "/api/settings", { provider: "amd", modelId: "GLM-5.3-Flash", reasoningEffort: "low" });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.modelId, "GLM-5.3-Flash");

  const rejected = await invoke(handler, "POST", "/api/settings", { provider: "openrouter", modelId: "deepseek/deepseek-v4-flash", reasoningEffort: "default" });
  assert.equal(rejected.status, 400);

  const noServiceHandler = createRequestHandler(null, null, null);
  const unavailable = await invoke(noServiceHandler, "GET", "/api/settings");
  assert.equal(unavailable.status, 503);
});
