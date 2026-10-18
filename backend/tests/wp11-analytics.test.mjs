import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAnalytics, buildPeriodAnalytics, rateWithDenominator } from "../src/analytics-service.mjs";
import { assertNoResponderSkill } from "../src/live-schema.mjs";
import { createLiveStore } from "../src/live-store.mjs";

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "compass-analytics-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  // Snapshots are frozen; these tests edit a private copy as their fixture.
  return { store, state: structuredClone(await store.snapshot()) };
}

test("analytics use one fixed simulation timestamp and separate open downtime", async () => {
  const { state } = await createFixture();
  const analytics = buildAnalytics(state);
  assert.equal(analytics.snapshotSimulationTime, state.simulationState.simulationTime);
  const stationThree = analytics.equipment.find((entry) => entry.equipmentId === "EQ-03");
  assert.equal(stationThree.currentOngoingDowntimeMinutes, 15);
  assert.equal(stationThree.completedDowntimeMedianMinutes, null);
  assert.equal(stationThree.completedDowntimeCount, 0);
  assert.equal(stationThree.uptimeDenominatorMinutes, 20);
  assertNoResponderSkill(analytics);
});

test("all outcome rates carry denominators and suppress samples below three", () => {
  assert.deepEqual(rateWithDenominator(1, 1), { numerator: 1, denominator: 1, rate: null, status: "INSUFFICIENT_DATA" });
  assert.deepEqual(rateWithDenominator(2, 4), { numerator: 2, denominator: 4, rate: 0.5, status: "AVAILABLE" });
});

test("Issue-Class Experience is stable alphabetical and emphasizes cases plus median", async () => {
  const { state } = await createFixture();
  const matrix = buildAnalytics(state).issueClassExperience;
  assert.equal(matrix.length, 24);
  assert.deepEqual(matrix.filter((row) => ["R-ENGR028", "R-ENGR104", "R-OPER088", "R-OPER142", "R-TECH073", "R-TECH216"].includes(row.responderId)).map((row) => row.displayName).sort(), ["Engr028", "Engr104", "Optr088", "Optr142", "Tech073", "Tech216"]);
  const observed = matrix.find((row) => row.displayName === "Engr028");
  assert.deepEqual(Object.keys(observed.classes), ["A", "B", "C"]);
  assert.equal(typeof observed.classes.B.cases, "number");
  assert.equal(typeof observed.classes.B.medianResolutionMinutes, "number");
});

test("a runtime resolution changes issue, equipment, and responder analytics", async () => {
  const { state } = await createFixture();
  const before = buildAnalytics(state);
  state.simulationState.simulationTime = "2026-09-01T08:10:00.000Z";
  state.issues.find((issue) => issue.id === "ISS-103").status = "RESOLVED";
  state.issues.find((issue) => issue.id === "ISS-103").resolvedAt = state.simulationState.simulationTime;
  state.equipment.find((equipment) => equipment.id === "EQ-03").status = "NORMAL";
  state.resolutionHistory.push({ id: "H-049", issueId: "ISS-103", responderId: "R-OPER142", issueClass: "A", resolutionMinutes: 16, success: true, reopened: false, resolvedAt: state.simulationState.simulationTime });
  const after = buildAnalytics(state);
  assert.notEqual(after.equipment.find((entry) => entry.equipmentId === "EQ-03").completedDowntimeMedianMinutes, before.equipment.find((entry) => entry.equipmentId === "EQ-03").completedDowntimeMedianMinutes);
  assert.equal(after.issues.resolved, before.issues.resolved + 1);
  assert.equal(after.responders.find((entry) => entry.responderId === "R-OPER142").issuesAttended, before.responders.find((entry) => entry.responderId === "R-OPER142").issuesAttended + 1);
});

test("Compass-vs-baseline metrics derive from explicit persisted disagreement fields", async () => {
  const { state } = await createFixture();
  state.recommendations.push({ agentResult: { topRecommendation: { responderId: "R-ENGR028" } }, disagreement: { nearestAgreement: false, naiveAgreement: false, evidenceStrengthDriven: true } });
  const metrics = buildAnalytics(state).compassVsBaselines;
  assert.equal(metrics.totalRecommendations, 1);
  assert.equal(metrics.disagreementWithNaive.numerator, 1);
  assert.equal(metrics.disagreementWithNaive.denominator, 1);
  assert.equal(metrics.disagreementWithNaive.rate, null);
});

test("operational timeline is a bounded 24-hour, 15-minute event-derived projection", async () => {
  const { state } = await createFixture();
  const analytics = buildAnalytics(state);
  assert.equal(analytics.operationalTimeline.window.durationMinutes, 1440);
  assert.equal(analytics.operationalTimeline.window.binMinutes, 15);
  assert(analytics.operationalTimeline.bins.length >= 96);
  assert(analytics.operationalTimeline.bins.length <= 97);
  assert.equal(analytics.operationalTimeline.window.partial, true);
  assert(analytics.operationalTimeline.bins.some((bin) => bin.raised > 0));
  assert(analytics.operationalTimeline.bins.some((bin) => bin.downtimeMinutes > 0));
  assertNoResponderSkill(analytics.operationalTimeline);
});

test("operational timeline never counts a future event or downtime beyond a partial final bin", async () => {
  const { state } = await createFixture();
  state.simulationState.simulationTime = "2026-09-01T08:07:00.000Z";
  state.operationalEvents.push({ id: "event-future", eventType: "ISSUE_RAISED", simulationTimestamp: "2026-09-01T08:10:00.000Z" });
  const analytics = buildAnalytics(state);
  const timeline = analytics.operationalTimeline;
  assert.equal(timeline.window.end, "2026-09-01T08:07:00.000Z");
  assert.equal(timeline.window.finalBinPartial, true);
  assert.equal(timeline.bins.at(-1).end, "2026-09-01T08:07:00.000Z");
  assert.equal(timeline.bins.reduce((sum, bin) => sum + bin.raised, 0), 2);
  assert(timeline.bins.every((bin) => Date.parse(bin.end) <= Date.parse(timeline.window.end)));
});

test("hour, day, week, and month bar periods use bounded UTC operational intervals", async () => {
  const { state } = await createFixture();
  state.simulationState.simulationTime = "2026-09-01T10:07:00.000Z";
  const hour = buildPeriodAnalytics(state, { level: "HOUR" });
  const day = buildPeriodAnalytics(state, { level: "DAY" });
  const week = buildPeriodAnalytics(state, { level: "WEEK" });
  const month = buildPeriodAnalytics(state, { level: "MONTH" });
  assert.equal(hour.maxPeriods, 12);
  assert.equal(hour.periods.at(-1).start, "2026-09-01T10:00:00.000Z");
  assert.equal(hour.periods.at(-1).status, "PARTIAL");
  assert.equal(day.maxPeriods, 7);
  assert.equal(day.periods.at(-1).start, "2026-09-01T08:00:00.000Z");
  assert.equal(day.periods.at(-1).status, "PARTIAL");
  assert.equal(week.maxPeriods, 4);
  assert.equal(week.periods.at(-1).start, "2026-08-31T08:00:00.000Z");
  assert.equal(month.maxPeriods, 3);
  assert.equal(month.periods.at(-1).start, "2026-09-01T08:00:00.000Z");
  assert.equal(buildAnalytics(state).periodAnalytics.level, "DAY");
  assertNoResponderSkill({ hour, day, week, month });
});

test("period API projection accepts only the four dashboard ranges", async () => {
  const { state } = await createFixture();
  assert.throws(() => buildPeriodAnalytics(state, { level: "SHIFT" }), /Invalid analytics period level/);
  assert.equal(buildPeriodAnalytics(state, { level: "HOUR" }).periodDefinition.includes("clock hour"), true);
  assert.equal(buildPeriodAnalytics(state, { level: "DAY" }).periodDefinition.includes("08:00"), true);
  assert.equal(buildPeriodAnalytics(state, { level: "WEEK" }).periodDefinition.includes("Monday"), true);
});
