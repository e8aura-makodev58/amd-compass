import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createInitialDemoState, resetDemoState } from "../src/demo-state.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { createPublicLiveSnapshot } from "../src/live-schema.mjs";

const readJson = (relativePath) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

const candidatePacket = readJson("../../fixtures/candidate-packet-scenario-a.json");
const agentResult = readJson("../../fixtures/agent-result-scenario-a.json");

function evidenceStrength(count) {
  if (count === 0) return "NONE";
  if (count <= 2) return "WEAK";
  if (count <= 5) return "MODERATE";
  return "STRONG";
}

function summaryFor(history, responderId, issueClass) {
  const records = history
    .filter((record) => record.responderId === responderId && record.issueClass === issueClass)
    .sort((left, right) => left.resolutionMinutes - right.resolutionMinutes);
  const count = records.length;
  const middle = Math.floor(count / 2);
  const medianResolutionMinutes =
    count === 0 ? null : count % 2 ? records[middle].resolutionMinutes : (records[middle - 1].resolutionMinutes + records[middle].resolutionMinutes) / 2;
  return {
    count,
    medianResolutionMinutes,
    successRate: count === 0 ? null : records.filter((record) => record.success).length / count,
    reopenRate: count === 0 ? null : records.filter((record) => record.reopened).length / count,
    evidenceStrengthLabel: evidenceStrength(count),
  };
}

test("Scenario A canonical seed meets the WP1 data shape", () => {
  const state = createInitialDemoState();

  assert.equal(state.equipment.length, 72);
  for (const floor of [1, 2, 3]) assert.equal(state.equipment.filter((item) => item.floor === floor).length, 24);
  // The six original ground-floor machines keep their exact coordinates so
  // Scenario A's committed evidence and expected winner stay valid.
  assert.deepEqual(state.equipment.slice(0, 6).map((item) => [item.id, item.x, item.y, item.floor]), [
    ["EQ-01", 10, 10, 1], ["EQ-02", 30, 15, 1], ["EQ-03", 70, 20, 1],
    ["EQ-04", 50, 50, 1], ["EQ-05", 20, 80, 1], ["EQ-06", 85, 75, 1],
  ]);
  assert.equal(state.responders.length, 6);
  assert.deepEqual([...new Set(state.resolutionHistory.map((record) => record.issueClass))].sort(), ["A", "B", "C"]);
  assert.equal(state.resolutionHistory.length, 48);
  assert.equal(state.activeIssueId, "ISS-104");
  assert.equal(state.issues[0].equipmentId, "EQ-04");
  assert.equal(state.issues[0].issueClass, "B");
  assert.equal(state.responders.filter((responder) => responder.availability === "AVAILABLE").length, 4);
  assert.deepEqual(
    state.responders
      .filter((responder) => responder.availability !== "AVAILABLE")
      .map((responder) => responder.name)
      .sort(),
    ["Oper142", "Tech073"],
  );
});

test("public station metrics are present and do not expose hidden simulation truth", () => {
  const snapshot = createPublicLiveSnapshot(createLiveSeed());
  assert.equal(snapshot.stationMetrics["EQ-03"].issueCount, 1);
  assert.match(snapshot.stationMetrics["EQ-01"].uptime, /^\d+ min$/);
  assert.equal(snapshot.stationMetrics["EQ-01"].mtbf, "No observed failures");
  assert.doesNotMatch(JSON.stringify(snapshot.stationMetrics), /responderSkills|trueMedianMinutes|trueSuccessProbability/);
});

test("Scenario A fixture derives authoritative same-issue metrics from the seed", () => {
  const state = createInitialDemoState();
  const issue = state.issues.find((entry) => entry.id === state.activeIssueId);
  assert.ok(issue);

  for (const candidate of candidatePacket.candidates) {
    const summary = summaryFor(state.resolutionHistory, candidate.responderId, issue.issueClass);
    assert.equal(candidate.sameIssueHistoricalCount, summary.count, candidate.responderId);
    assert.equal(candidate.medianResolutionMinutes, summary.medianResolutionMinutes, candidate.responderId);
    assert.equal(candidate.successRate, summary.successRate, candidate.responderId);
    assert.equal(candidate.reopenRate, summary.reopenRate, candidate.responderId);
    assert.equal(candidate.evidenceStrengthLabel, summary.evidenceStrengthLabel, candidate.responderId);
  }

  assert.equal(candidatePacket.candidates.find((candidate) => candidate.responderId === "R-ENGR104").distanceToIssue, 8);
  assert.equal(candidatePacket.candidates.find((candidate) => candidate.responderId === "R-ENGR028").distanceToIssue, 85);
  assert.equal(candidatePacket.candidates.find((candidate) => candidate.responderId === "R-TECH216").evidenceStrengthLabel, "WEAK");
});

test("candidate packet is bounded to eligible model-facing evidence", () => {
  const state = createInitialDemoState();
  const eligibleIds = new Set(
    state.responders.filter((responder) => responder.availability === "AVAILABLE").map((responder) => responder.id),
  );
  const forbiddenFields = ["availability", "x", "y", "currentIssueId"];

  assert.equal(candidatePacket.schemaVersion, "1.0");
  assert.ok(candidatePacket.recommendationRequestId);
  assert.equal(candidatePacket.candidates.length, 4);
  for (const candidate of candidatePacket.candidates) {
    assert.ok(eligibleIds.has(candidate.responderId), candidate.responderId);
    assert.ok(candidate.travelTimeMinutes > 0);
    for (const field of forbiddenFields) assert.equal(field in candidate, false, `${candidate.responderId}.${field}`);
  }
});

test("valid agent-result fixture is versioned, grounded, and qualitative", () => {
  const candidateIds = new Set(candidatePacket.candidates.map((candidate) => candidate.responderId));
  const prose = [];

  assert.equal(agentResult.schemaVersion, candidatePacket.schemaVersion);
  assert.equal(agentResult.recommendationRequestId, candidatePacket.recommendationRequestId);
  assert.equal(agentResult.topRecommendation.responderId, "R-ENGR028");
  assert.equal(agentResult.rankedCandidates.length, candidatePacket.candidates.length);
  assert.deepEqual(agentResult.rankedCandidates.map((candidate) => candidate.rank), [1, 2, 3, 4]);

  for (const candidate of agentResult.rankedCandidates) {
    assert.ok(candidateIds.has(candidate.responderId), candidate.responderId);
    prose.push(candidate.recommendationSummary);
    if (candidate.tradeoff) {
      assert.ok(candidateIds.has(candidate.tradeoff.comparedToResponderId));
      assert.notEqual(candidate.tradeoff.comparedToResponderId, candidate.responderId);
      prose.push(candidate.tradeoff.explanation);
    }
  }
  const first = agentResult.rankedCandidates[0];
  assert.ok(first.tradeoff);
  assert.ok(candidateIds.has(first.tradeoff.comparedToResponderId));
  prose.push(agentResult.topRecommendation.rationale, agentResult.uncertaintyNote);
  assert.equal(prose.join(" ").match(/\d/), null, "model prose must not introduce numeric evidence");
});

test("reset returns a fresh, identical Scenario A state", () => {
  const initial = createInitialDemoState();
  initial.responders[0].availability = "ASSIGNED";
  initial.issues[0].status = "ASSIGNED";
  initial.issues[0].assignedResponderId = "R-ENGR104";

  const reset = resetDemoState();
  assert.equal(reset.responders[0].availability, "AVAILABLE");
  assert.equal(reset.issues[0].status, "PENDING");
  assert.equal("assignedResponderId" in reset.issues[0], false);
  assert.deepEqual(reset, createInitialDemoState());
});
