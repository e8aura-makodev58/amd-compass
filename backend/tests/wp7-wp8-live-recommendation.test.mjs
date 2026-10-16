import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertNoResponderSkill } from "../src/live-schema.mjs";
import { createLiveStore } from "../src/live-store.mjs";
import { createLiveRecommendationService } from "../src/live-recommendation-service.mjs";

const fixtureUrl = new URL("../../fixtures/agent-result-scenario-a.json", import.meta.url);

async function fixtureOutcome(packet) {
  const result = JSON.parse(await readFile(fixtureUrl, "utf8"));
  result.recommendationRequestId = packet.recommendationRequestId;
  return { status: "ok", result, modelInfo: { provider: "fixture", modelId: "scenario-a", mode: "fixture" } };
}

async function createFixture(requestRecommendation = fixtureOutcome) {
  const directory = await mkdtemp(join(tmpdir(), "compass-live-recommendation-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  return { store, recommendations: createLiveRecommendationService(store, { requestRecommendation }) };
}

test("live Compass persists bounded observed context, baselines, result, and disagreement", async () => {
  const { store, recommendations } = await createFixture();
  const outcome = await recommendations.recommend("ISS-104");
  assert.equal(outcome.result.status, "READY");
  assert.equal(outcome.result.topResponderId, "R-ENGR028");
  const recommendation = (await store.snapshot()).recommendations[0];
  assert.equal(recommendation.nearestWinner, "R-ENGR104");
  assert.equal(recommendation.naiveWinner, "R-TECH216");
  assert.equal(recommendation.disagreement.compassWinner, "R-ENGR028");
  assert.equal(recommendation.disagreement.naiveAgreement, false);
  assert.equal(recommendation.disagreement.evidenceStrengthDriven, true);
  assert.equal(recommendation.baselineConfig.version, "naive-score-v1");
  assertNoResponderSkill(recommendation);
});

test("live context includes newly observed runtime history and only eligible responders", async () => {
  const { store, recommendations } = await createFixture();
  await store.mutate("add-runtime-observation", (state) => {
    state.resolutionHistory.push({ id: "H-049", responderId: "R-ENGR104", issueClass: "B", resolutionMinutes: 12, success: true, reopened: false, resolvedAt: state.simulationState.simulationTime });
  });
  await recommendations.recommend("ISS-104");
  const snapshot = (await store.snapshot()).recommendations[0].candidateEvidenceSnapshot;
  assert.equal(snapshot.find((candidate) => candidate.responderId === "R-ENGR104").sameIssueHistoricalCount, 7);
  assert.equal(snapshot.some((candidate) => candidate.responderId === "R-OPER142"), false);
  assert.equal(snapshot.some((candidate) => candidate.responderId === "R-TECH073"), false);
});

test("model failure is persisted as unavailable while deterministic baselines remain", async () => {
  const providerMessage = "Compass agent provider responded with HTTP 400: {\"error\":{\"message\":\"Invalid schema for response_format 'compass_agent_result'.\"}}";
  const { store, recommendations } = await createFixture(async () => ({ status: "unavailable", reason: "provider-error", message: providerMessage, modelInfo: { mode: "live" } }));
  const outcome = await recommendations.recommend("ISS-104");
  assert.equal(outcome.result.status, "UNAVAILABLE");
  assert.equal(outcome.result.reason, "provider-error");
  assert.match(outcome.result.message, /400/);
  const persisted = (await store.snapshot()).recommendations[0];
  assert.equal(persisted.status, "UNAVAILABLE");
  assert.equal(persisted.failureReason, "provider-error");
  assert.match(persisted.failureMessage, /400/);
  assert.equal(persisted.nearestWinner, "R-ENGR104");
  assert.equal(persisted.naiveWinner, "R-TECH216");
});

test("a failure outcome carrying only validation errors still persists a readable failure message", async () => {
  const { store, recommendations } = await createFixture(async () => ({
    status: "unavailable",
    reason: "validation-failed",
    errors: ["rankedCandidates references unknown or ineligible candidate R-GHOST"],
    modelInfo: { mode: "live" },
  }));
  await recommendations.recommend("ISS-104");
  const persisted = (await store.snapshot()).recommendations[0];
  assert.equal(persisted.failureReason, "validation-failed");
  assert.match(persisted.failureMessage, /R-GHOST/);
});

test("candidate changes during model inference mark request stale and cannot persist result", async () => {
  let store;
  const fixture = await createFixture(async (packet) => {
    await store.mutate("make-candidate-stale", (state) => {
      state.responders.find((responder) => responder.id === "R-ENGR028").availability = "UNAVAILABLE";
    });
    return fixtureOutcome(packet);
  });
  store = fixture.store;
  const outcome = await fixture.recommendations.recommend("ISS-104");
  assert.equal(outcome.result.status, "STALE_CANDIDATES");
  const persisted = (await store.snapshot()).recommendations[0];
  assert.equal(persisted.status, "STALE");
  assert.equal(persisted.agentResult, null);
});

test("no eligible responders prevents the Compass call and leaves issue pending", async () => {
  let calls = 0;
  const { store, recommendations } = await createFixture(async () => { calls += 1; return { status: "unavailable" }; });
  await store.mutate("remove-eligibility", (state) => {
    for (const responder of state.responders) if (responder.availability === "AVAILABLE") responder.availability = "UNAVAILABLE";
  });
  const outcome = await recommendations.recommend("ISS-104");
  assert.equal(outcome.result.status, "WAITING_FOR_RESPONDER");
  assert.equal(calls, 0);
  assert.equal((await store.snapshot()).issues.find((issue) => issue.id === "ISS-104").status, "PENDING");
});

test("recommendations use aggregate simulation history even when detailed observed actions exist", async () => {
  const { store, recommendations } = await createFixture(async (packet) => {
    assert.equal("caseEvidence" in packet, false);
    assert.equal(JSON.stringify(packet).includes("historic-action-marker"), false);
    return fixtureOutcome(packet);
  });
  const beforeCount = (await store.snapshot()).resolutionHistory.filter((row) => row.responderId === "R-ENGR028" && row.issueClass === "B").length;
  await store.mutate("add-detailed-history", (state) => {
    state.resolutionHistory.push({ id: "H-detailed", issueId: "historic-b", equipmentId: "EQ-04", responderId: "R-ENGR028", issueClass: "B", incidentDescription: "Material flow interruption", resolutionMinutes: 12, success: true, reopened: false, resolvedAt: state.simulationState.simulationTime, actionTaken: "historic-action-marker" });
  });
  const outcome = await recommendations.recommend("ISS-104");
  assert.equal(outcome.result.status, "READY");
  const saved = (await store.snapshot()).recommendations.at(-1);
  assert.equal("caseEvidenceSnapshot" in saved, false);
  assert.equal(saved.candidateEvidenceSnapshot.find((row) => row.responderId === "R-ENGR028").sameIssueHistoricalCount, beforeCount + 1);
});
