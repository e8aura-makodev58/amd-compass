import assert from "node:assert/strict";
import test from "node:test";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { buildFixPacket, fallbackFixOrder } from "../src/fix-evidence.mjs";
import { requestFixRanking } from "../src/fix-ranking.mjs";

// Regression: the live runtime calls the fix ranking without a fetchImpl. It must use the
// global fetch (stubbed here, so no network) instead of failing inside the provider
// controls before any request is made, which silently turned every live fix ranking
// into the deterministic fallback.
test("a live fix ranking without an injected transport uses the global fetch", async (t) => {
  const packet = buildFixPacket(createLiveSeed(), "ISS-104");
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ schemaVersion: "1.0", rankedFixes: fallbackFixOrder(packet) }) } }] }) };
  };
  t.after(() => { globalThis.fetch = original; });
  const outcome = await requestFixRanking(packet, { mode: "live", apiKey: "hermetic-test", timeoutMs: 2_000 });
  assert.equal(calls, 1);
  assert.equal(outcome.status, "ok");
  assert.equal(outcome.modelInfo.provider, "amd");
});
