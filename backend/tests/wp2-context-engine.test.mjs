import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createInitialDemoState } from "../src/demo-state.mjs";
import {
  NAIVE_SCORE_FORMULA,
  WALKING_SPEED_METRES_PER_SECOND,
  buildCandidatePacket,
  FLOOR_TRANSIT_MINUTES,
  calculateDistance,
  calculateFloorDelta,
  calculateNaiveScore,
  calculateTravelTimeMinutes,
  getAvailableResponders,
  getEvidenceStrengthLabel,
  getNearestAvailableBaseline,
  getNaiveScoreBaseline,
  getPerformanceSummary,
} from "../src/context-engine.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("../../fixtures/candidate-packet-scenario-a.json", import.meta.url), "utf8"),
);

test("distance and travel-time calculations are deterministic", () => {
  assert.equal(calculateDistance({ x: 3, y: 4 }, { x: 3, y: 4 }), 0);
  assert.equal(calculateDistance({ x: 0, y: 0 }, { x: 8, y: 0 }), 8);
  assert.equal(calculateDistance({ x: 0, y: 0 }, { x: 0, y: 6 }), 6);
  assert.equal(calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(calculateTravelTimeMinutes(84), 84 / WALKING_SPEED_METRES_PER_SECOND / 60);
  assert.throws(() => calculateTravelTimeMinutes(-1), /cannot be negative/);
  // Floors add a fixed transit cost on top of the planar walk.
  assert.equal(calculateTravelTimeMinutes(84, 0), 84 / WALKING_SPEED_METRES_PER_SECOND / 60);
  assert.equal(calculateTravelTimeMinutes(84, 2), 84 / WALKING_SPEED_METRES_PER_SECOND / 60 + 2 * FLOOR_TRANSIT_MINUTES);
  assert.throws(() => calculateTravelTimeMinutes(84, -1), /cannot be negative/);
  assert.equal(calculateFloorDelta({ floor: 1 }, { floor: 3 }), 2);
  assert.equal(calculateFloorDelta({ floor: 3 }, { floor: 1 }), 2);
  assert.equal(calculateFloorDelta({ floor: 2 }, { floor: 2 }), 0);
  // Records written before the building existed are treated as ground floor.
  assert.equal(calculateFloorDelta({}, { floor: 1 }), 0);
  assert.equal(calculateFloorDelta({}, { floor: 3 }), 2);
  // Distance stays planar: it is a real same-floor walk in metres.
  assert.equal(calculateDistance({ x: 0, y: 0, floor: 1 }, { x: 3, y: 4, floor: 3 }), 5);
});

test("evidence-strength labels observe every contractual boundary", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 5, 6].map(getEvidenceStrengthLabel),
    ["NONE", "WEAK", "WEAK", "MODERATE", "MODERATE", "STRONG"],
  );
  assert.throws(() => getEvidenceStrengthLabel(-1), /non-negative/);
  assert.equal(getEvidenceStrengthLabel(1.5), "WEAK");
  assert.throws(() => getEvidenceStrengthLabel(Number.NaN), /non-negative/);
});

test("performance summaries use only the same issue class and support even and zero samples", () => {
  const history = [
    { responderId: "R1", issueClass: "B", resolutionMinutes: 20, success: true, reopened: false },
    { responderId: "R1", issueClass: "B", resolutionMinutes: 10, success: false, reopened: true },
    { responderId: "R1", issueClass: "A", resolutionMinutes: 1, success: true, reopened: false },
  ];
  assert.deepEqual(getPerformanceSummary(history, "R1", "B"), {
    sameIssueHistoricalCount: 2,
    effectiveEvidenceWeight: 2,
    soloHistoricalCount: 2,
    assistedHistoricalCount: 0,
    medianResolutionMinutes: 15,
    successRate: 0.5,
    reopenRate: 0.5,
    evidenceStrengthLabel: "WEAK",
  });
  assert.deepEqual(getPerformanceSummary(history, "R2", "B"), {
    sameIssueHistoricalCount: 0,
    effectiveEvidenceWeight: 0,
    soloHistoricalCount: 0,
    assistedHistoricalCount: 0,
    medianResolutionMinutes: null,
    successRate: null,
    reopenRate: null,
    evidenceStrengthLabel: "NONE",
  });
});

test("Scenario A packet is derived from canonical state and excludes ineligible responders", () => {
  const state = createInitialDemoState();
  const packet = buildCandidatePacket(state, state.activeIssueId, fixture.recommendationRequestId);
  assert.deepEqual(packet, fixture);
  assert.deepEqual(
    getAvailableResponders(state).map((responder) => responder.name),
    ["Engr104", "Engr028", "Tech216", "Oper088"],
  );
  for (const candidate of packet.candidates) {
    assert.equal("availability" in candidate, false);
    assert.equal("x" in candidate, false);
    assert.equal("y" in candidate, false);
  }
});

test("Scenario A deterministic baselines expose Engr104 and Tech216 for different reasons", () => {
  const state = createInitialDemoState();
  const nearest = getNearestAvailableBaseline(state, state.activeIssueId);
  const naive = getNaiveScoreBaseline(state, state.activeIssueId);
  assert.equal(nearest.responderId, "R-ENGR104");
  assert.equal(naive.responderId, "R-TECH216");
  assert.equal(NAIVE_SCORE_FORMULA.includes("sameIssueHistoricalCount"), false);
  assert.ok(calculateNaiveScore(naive) > calculateNaiveScore(nearest));
});

test("no eligible responders yields no deterministic baseline", () => {
  const state = createInitialDemoState();
  for (const responder of state.responders) responder.availability = "UNAVAILABLE";
  assert.equal(getNearestAvailableBaseline(state, state.activeIssueId), null);
  assert.equal(getNaiveScoreBaseline(state, state.activeIssueId), null);
});

test("an upstairs responder loses the nearest baseline to a slower same-floor one", () => {
  const state = createInitialDemoState();
  // EQ-04 is on floor one. Put a responder very close but two floors up, and a
  // far one on the same floor; the same-floor responder must win the baseline.
  state.responders = [
    { id: "R-UPSTAIRS", name: "Upstairs", x: 50, y: 50, floor: 3, availability: "AVAILABLE" },
    { id: "R-SAMEFLOOR", name: "Samefloor", x: 130, y: 90, floor: 1, availability: "AVAILABLE" },
  ];
  const packet = buildCandidatePacket(state, state.activeIssueId, "baseline-floor-check");
  const upstairs = packet.candidates.find((candidate) => candidate.responderId === "R-UPSTAIRS");
  const sameFloor = packet.candidates.find((candidate) => candidate.responderId === "R-SAMEFLOOR");
  assert.equal(upstairs.distanceToIssue, 0);
  assert.equal(upstairs.floorsToIssue, 2);
  assert.ok(sameFloor.distanceToIssue > upstairs.distanceToIssue);
  assert.ok(sameFloor.travelTimeMinutes < upstairs.travelTimeMinutes);
  assert.equal(getNearestAvailableBaseline(state, state.activeIssueId).responderId, "R-SAMEFLOOR");
});

test("every building floor holds a workable, non-overlapping machine layout", () => {
  const state = createInitialDemoState();
  for (const floor of [1, 2, 3]) {
    const onFloor = state.equipment.filter((item) => item.floor === floor);
    assert.ok(onFloor.length >= 20 && onFloor.length <= 30, `floor ${floor} holds ${onFloor.length}`);
    for (const item of onFloor) {
      assert.ok(item.x >= 0 && item.x <= 150, `${item.id} x out of bounds`);
      assert.ok(item.y >= 0 && item.y <= 100, `${item.id} y out of bounds`);
    }
    for (const item of onFloor) {
      for (const other of onFloor) {
        if (item.id === other.id) continue;
        assert.ok(Math.hypot(item.x - other.x, item.y - other.y) >= 10, `${item.id} and ${other.id} overlap`);
      }
    }
  }
  assert.equal(new Set(state.equipment.map((item) => item.id)).size, state.equipment.length);
});

test("the building layout is deterministic across rebuilds", () => {
  const first = createInitialDemoState().equipment;
  const second = createInitialDemoState().equipment;
  assert.deepEqual(first, second);
});
