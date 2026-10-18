import assert from "node:assert/strict";
import test from "node:test";
import { buildParetoAnalytics } from "../src/pareto-analytics.mjs";
import { compactHistory } from "../src/history-retention.mjs";
import { assertNoResponderSkill } from "../src/live-schema.mjs";

const SYMPTOMS = { "B-SLOW": "Transfer progresses intermittently.", "B-STOP": "Transfer stops before the expected endpoint.", "A-DRIFT": "Output drifts from the operating reference." };

/** Ten September issues on two floors, with fix attempts, then a snapshot on 6 October. */
function fixture() {
  const equipment = [{ id: "EQ-01", name: "Station 1", floor: 1 }, { id: "EQ-30", name: "Station 30", floor: 2 }];
  const rows = [
    ["B", "B-SLOW", "EQ-01", 30, [["FIX-B-01", false], ["FIX-B-03", true]]],
    ["B", "B-SLOW", "EQ-01", 20, [["FIX-B-01", true]]],
    ["B", "B-SLOW", "EQ-30", 25, [["FIX-B-03", true]]],
    ["B", "B-SLOW", "EQ-30", 15, [["FIX-B-01", false], ["FIX-B-01", false], ["FIX-B-02", true]]],
    ["B", "B-STOP", "EQ-01", 10, [["FIX-B-02", true]]],
    ["B", "B-STOP", "EQ-01", 12, [["FIX-B-02", true]]],
    ["A", "A-DRIFT", "EQ-30", 40, [["FIX-A-01", false], ["FIX-A-02", true]]],
    ["A", "A-DRIFT", "EQ-30", 8, [["FIX-A-01", true]]],
    ["A", null, "EQ-01", 50, []],
    ["B", "B-SLOW", "EQ-01", 5, [["FIX-B-01", true]]],
  ];
  const issues = [], resolutionHistory = [], operationalEvents = [];
  rows.forEach(([issueClass, code, equipmentId, minutes, attempts], index) => {
    const raised = Date.parse("2026-09-03T10:00:00Z") + index * 86_400_000;
    const id = `ISS-${index + 1}`;
    const resolvedAt = new Date(raised + minutes * 60_000).toISOString();
    issues.push({ id, equipmentId, issueClass, status: "RESOLVED", raisedAt: new Date(raised).toISOString(), downtimeStartedAt: new Date(raised).toISOString(), resolvedAt, description: "Synthetic", ...(code ? { symptom: { code, text: SYMPTOMS[code] } } : {}) });
    operationalEvents.push({ id: `E-${index}`, issueId: id, eventType: "ISSUE_RAISED", simulationTimestamp: new Date(raised).toISOString() });
    attempts.forEach(([fixId, success], attempt) => resolutionHistory.push({ id: `H-${index}-${attempt}`, issueId: id, issueClass, equipmentId, symptomCode: code, success, resolutionMinutes: 4,
      resolvedAt: new Date(raised + (attempt + 1) * 60_000).toISOString(), fixApplied: { id: fixId, title: `Procedure ${fixId}`, steps: "Synthetic steps." }, legacyFix: false, fixAttemptNumber: attempt + 1 }));
  });
  operationalEvents.unshift({ id: "E-start", eventType: "SIMULATION_STARTED", simulationTimestamp: "2026-08-31T08:00:00.000Z" });
  return {
    simulationState: { simulationTime: "2026-10-06T08:00:00.000Z" }, equipment, issues, resolutionHistory, operationalEvents,
    recommendations: [], dispatchOffers: [], resolutionAttempts: [], assignments: [],
    faultTruth: { version: 1, causes: Object.fromEntries(issues.map((issue) => [issue.id, "hidden-cause-B-2"])) },
  };
}

test("Pareto defaults to the latest complete period and ranks class → symptom → applied fix", () => {
  const pareto = buildParetoAnalytics(fixture(), { level: "MONTH" });
  assert.equal(pareto.period.start, "2026-09-01T08:00:00.000Z");
  assert.equal(pareto.period.status, "COMPLETE");
  assert.deepEqual(pareto.totals, { issues: 10, downtimeMinutes: 215, failedAttempts: 4, fixAttempts: 13 });
  const [transfer, output] = pareto.dimensions.type.nodes;
  assert.deepEqual([transfer.key, transfer.label, transfer.count, transfer.failedAttempts], ["B", "Material transfer (Class B)", 7, 3]);
  assert.deepEqual([output.key, output.count, output.downtimeMinutes, output.failedAttempts], ["A", 3, 98, 1]);
  const slow = transfer.children[0];
  assert.deepEqual([slow.key, slow.label, slow.count, slow.failedAttempts], ["B-SLOW", "Transfer progresses intermittently", 5, 3]);
  assert.deepEqual(slow.children.map((fix) => [fix.key, fix.count, fix.failedAttempts]), [["FIX-B-01", 5, 3], ["FIX-B-03", 2, 0], ["FIX-B-02", 1, 0]]);
  assert.deepEqual(output.children.map((node) => [node.key, node.count]), [["A-DRIFT", 2], ["UNRECORDED", 1]]);
  assert.deepEqual(pareto.dimensions.location.nodes.map((floor) => [floor.label, floor.count, floor.children.map((station) => station.label)]), [["Floor 1", 6, ["Station 1"]], ["Floor 2", 4, ["Station 30"]]]);
});

test("Pareto never reads the private fault cause or responder skill", () => {
  const state = fixture();
  state.responderSkills = { "R-1": { A: .9 } };
  const pareto = buildParetoAnalytics(state, { level: "MONTH" });
  assert.equal(JSON.stringify(pareto).includes("hidden-cause"), false);
  assertNoResponderSkill(pareto);
});

test("Pareto period selection is explicit, bounded and validated", () => {
  const state = fixture();
  const current = buildParetoAnalytics(state, { level: "MONTH", period: "0" });
  assert.equal(current.period.status, "PARTIAL");
  assert.equal(current.totals.issues, 0);
  assert.equal(buildParetoAnalytics(state, { level: "WEEK" }).periods.length, 4);
  for (const query of [{ level: "HOUR" }, { level: "MONTH", period: "9" }, { level: "MONTH", period: "-1" }, { level: "MONTH", period: "x" }]) {
    assert.throws(() => buildParetoAnalytics(state, query), (error) => error.statusCode === 400);
  }
});

test("archived history gives the same Pareto as unarchived history", () => {
  const full = buildParetoAnalytics(fixture(), { level: "MONTH" });
  const state = fixture();
  compactHistory(state, 7, { force: true });
  assert.ok(state.issues.length < 10, "fixture issues were archived");
  assert.deepEqual(buildParetoAnalytics(state, { level: "MONTH" }), full);
});
