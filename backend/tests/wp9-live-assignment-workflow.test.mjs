import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveAssignmentService } from "../src/live-assignment-service.mjs";
import { createLiveStore } from "../src/live-store.mjs";
import { createLiveRecommendationService } from "../src/live-recommendation-service.mjs";

async function fixtureOutcome(packet) {
  const result = JSON.parse(await readFile(new URL("../../fixtures/agent-result-scenario-a.json", import.meta.url), "utf8"));
  result.recommendationRequestId = packet.recommendationRequestId;
  return { status: "ok", result, modelInfo: { provider: "fixture", modelId: "scenario-a", mode: "fixture" } };
}

async function createFixture(requestRecommendation = fixtureOutcome) {
  const directory = await mkdtemp(join(tmpdir(), "compass-live-decision-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  return {
    store,
    recommendations: createLiveRecommendationService(store, { requestRecommendation }),
    assignments: createLiveAssignmentService(store),
  };
}

async function dispatchPendingOffer(store, assignments, acceptanceProbability) {
  const armed = await store.mutate("test-arm-offer", (state) => {
    const offer = state.dispatchOffers.find((entry) => entry.status === "PENDING");
    offer.acceptanceProbability = acceptanceProbability;
    offer.responseDispatchToken = offer.responseDueToken;
    offer.responseDueToken = null;
    offer.responseDueAt = null;
    return { offerId: offer.id, token: offer.responseDispatchToken };
  });
  return assignments.handleOfferDue(armed.result);
}

test("automatic dispatch offers the strongest match without human confirmation", async () => {
  const { store, recommendations, assignments } = await createFixture();
  const recommended = await recommendations.recommend("ISS-104");
  const offered = await assignments.offerNextCandidate(recommended.result.recommendationId);
  assert.equal(offered.result.status, "OFFERED");
  assert.equal(offered.result.responderId, "R-ENGR028");
  const state = await store.snapshot();
  assert.equal(state.issues.find((issue) => issue.id === "ISS-104").status, "OFFER_PENDING");
  assert.equal(state.responders.find((responder) => responder.id === "R-ENGR028").availability, "OFFERED");
  const publicOffer = (await store.publicSnapshot()).dispatchOffers[0];
  assert.equal("acceptanceProbability" in publicOffer, false);
  assert.equal("responseDueToken" in publicOffer, false);
});

test("a rejected offer advances to the next ranked available responder", async () => {
  const { store, recommendations, assignments } = await createFixture();
  const recommended = await recommendations.recommend("ISS-104");
  await assignments.offerNextCandidate(recommended.result.recommendationId);
  const rejected = await dispatchPendingOffer(store, assignments, 0);
  assert.equal(rejected.result.status, "REJECTED");
  const next = await assignments.offerNextCandidate(recommended.result.recommendationId);
  assert.equal(next.result.status, "OFFERED");
  assert.equal(next.result.responderId, "R-ENGR104");
  assert.equal((await store.snapshot()).dispatchOffers.map((offer) => offer.status).join(","), "REJECTED,PENDING");
});

test("an accepted offer assigns atomically while central override can win the same race", async () => {
  const acceptedFixture = await createFixture();
  const acceptedRecommendation = await acceptedFixture.recommendations.recommend("ISS-104");
  await acceptedFixture.assignments.offerNextCandidate(acceptedRecommendation.result.recommendationId);
  const accepted = await dispatchPendingOffer(acceptedFixture.store, acceptedFixture.assignments, 1);
  assert.equal(accepted.result.status, "ASSIGNED");
  assert.equal(accepted.result.decision, "AUTO_ACCEPTED");
  assert.equal((await acceptedFixture.store.snapshot()).recommendations[0].decision, "AUTO_ACCEPTED");

  const overrideFixture = await createFixture();
  const overrideRecommendation = await overrideFixture.recommendations.recommend("ISS-104");
  await overrideFixture.assignments.offerNextCandidate(overrideRecommendation.result.recommendationId);
  const overridden = await overrideFixture.assignments.decideRecommendation({ recommendationId: overrideRecommendation.result.recommendationId, responderId: "R-ENGR104", decision: "OVERRIDDEN" });
  assert.equal(overridden.result.status, "ASSIGNED");
  const overrideState = await overrideFixture.store.snapshot();
  assert.equal(overrideState.dispatchOffers[0].status, "CANCELLED");
  assert.equal(overrideState.issues.find((issue) => issue.id === "ISS-104").assignedResponderId, "R-ENGR104");
});

test("confirm atomically records the recommendation decision and canonical assignment", async () => {
  const { store, recommendations, assignments } = await createFixture();
  const recommended = await recommendations.recommend("ISS-104");
  const result = await assignments.decideRecommendation({ recommendationId: recommended.result.recommendationId, responderId: "R-ENGR028", decision: "CONFIRMED" });
  assert.equal(result.result.status, "ASSIGNED");
  const state = await store.snapshot();
  assert.equal(state.recommendations[0].decision, "CONFIRMED");
  assert.equal(state.recommendations[0].acceptedResponderId, "R-ENGR028");
  assert.equal(state.issues.find((issue) => issue.id === "ISS-104").assignedResponderId, "R-ENGR028");
});

test("override persists the human choice and assignment", async () => {
  const { store, recommendations, assignments } = await createFixture();
  const recommended = await recommendations.recommend("ISS-104");
  const result = await assignments.decideRecommendation({ recommendationId: recommended.result.recommendationId, responderId: "R-ENGR104", decision: "OVERRIDDEN" });
  assert.equal(result.result.status, "ASSIGNED");
  const state = await store.snapshot();
  assert.equal(state.recommendations[0].decision, "OVERRIDDEN");
  assert.equal(state.operationalEvents.at(-1).eventType, "ASSIGNMENT_OVERRIDDEN");
});

test("stale confirmation cannot assign a responder claimed by another issue", async () => {
  const { store, recommendations, assignments } = await createFixture();
  const recommended = await recommendations.recommend("ISS-104");
  await store.mutate("add-competing-issue", (state) => state.issues.push({ id: "ISS-105", equipmentId: "EQ-05", issueClass: "C", complexity: "STANDARD", existingPriority: "LOW", status: "PENDING", createdAt: state.simulationState.simulationTime, raisedAt: state.simulationState.simulationTime, downtimeStartedAt: state.simulationState.simulationTime }));
  await assignments.assign({ issueId: "ISS-105", responderId: "R-ENGR028", decision: "OVERRIDDEN" });
  const beforeAssignments = (await store.snapshot()).assignments.length;
  const stale = await assignments.decideRecommendation({ recommendationId: recommended.result.recommendationId, responderId: "R-ENGR028", decision: "CONFIRMED" });
  assert.equal(stale.result.status, "STALE");
  const state = await store.snapshot();
  assert.equal(state.assignments.length, beforeAssignments);
  assert.equal(state.issues.find((issue) => issue.id === "ISS-104").status, "RECOMMENDATION_READY");
  assert.equal(state.recommendations[0].decision, "STALE");
});

test("manual override remains available when Compass is unavailable", async () => {
  const { store, recommendations, assignments } = await createFixture(async () => ({ status: "unavailable", reason: "provider-error", modelInfo: { mode: "live" } }));
  const unavailable = await recommendations.recommend("ISS-104");
  const result = await assignments.decideRecommendation({ recommendationId: unavailable.result.recommendationId, responderId: "R-OPER088", decision: "OVERRIDDEN" });
  assert.equal(result.result.status, "ASSIGNED");
  assert.equal((await store.snapshot()).recommendations[0].acceptedResponderId, "R-OPER088");
});
