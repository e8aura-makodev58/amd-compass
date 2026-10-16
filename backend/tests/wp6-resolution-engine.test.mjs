import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveAssignmentService } from "../src/live-assignment-service.mjs";
import { createLiveStore } from "../src/live-store.mjs";
import { buildResolutionOutcomeProfile, createResolutionEngine } from "../src/resolution-engine.mjs";
import { createScheduler } from "../src/scheduler.mjs";

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "compass-resolution-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  const resolution = createResolutionEngine(store);
  const scheduler = createScheduler(store, { onResolutionDue: (trigger) => resolution.handleResolutionDue(trigger) });
  return { store, scheduler, assignments: createLiveAssignmentService(store) };
}

test("outcome profile blends same-class history without letting it outweigh hidden skill", async () => {
  const { store } = await createFixture();
  const state = await store.snapshot();
  const skill = state.responderSkills.find((entry) => entry.responderId === "R-TECH216" && entry.issueClass === "B");
  const observed = state.resolutionHistory.find((entry) => entry.responderId === "R-TECH216" && entry.issueClass === "B");
  const profile = buildResolutionOutcomeProfile(state, "R-TECH216", "B");
  assert.equal(profile.historicalSampleCount, 1);
  assert.equal(profile.historyWeight, 0.0375);
  assert.equal(profile.skillWeight, 0.9625);
  assert.ok(profile.medianMinutes > Math.min(skill.trueMedianMinutes, observed.resolutionMinutes));
  assert.ok(profile.medianMinutes < Math.max(skill.trueMedianMinutes, observed.resolutionMinutes));
  assert.ok(Math.abs(profile.medianMinutes - skill.trueMedianMinutes) < Math.abs(profile.medianMinutes - observed.resolutionMinutes));
  assert.ok(profile.successProbability > skill.trueSuccessProbability);
  assert.ok(profile.successProbability < Number(observed.success));
});

test("live assignment schedules bounded resolution timing from skill, history, and variability", async () => {
  const { store, assignments } = await createFixture();
  const before = await store.snapshot();
  const profile = buildResolutionOutcomeProfile(before, "R-ENGR028", "B");
  await assignments.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  const state = await store.snapshot();
  const attempt = state.resolutionAttempts.find((entry) => entry.issueId === "ISS-104");
  const scheduledMinutes = (Date.parse(attempt.resolutionDueAt) - Date.parse(attempt.startedAt)) / 60_000;
  assert.ok(scheduledMinutes >= profile.medianMinutes * 0.7);
  assert.ok(scheduledMinutes <= profile.medianMinutes * 1.3);
  assert.notEqual(state.simulationState.rngStreams.attempt, before.simulationState.rngStreams.attempt);
  const publicAssignment = (await store.publicSnapshot()).assignments.find((entry) => entry.issueId === "ISS-104");
  assert.equal("pendingResolutionMinutes" in publicAssignment, false);
  assert.equal("resolutionDueToken" in publicAssignment, false);
});

test("successful resolution appends observed history, closes downtime, and releases responder", async () => {
  const { store, scheduler } = await createFixture();
  await store.mutate("force-hidden-success", (state) => {
    state.responderSkills.find((entry) => entry.responderId === "R-OPER142" && entry.issueClass === "A").trueSuccessProbability = 1;
  });
  const before = await store.snapshot();
  await scheduler.forceResolve("ISS-103");
  const after = await store.snapshot();
  assert.equal(after.resolutionHistory.length, before.resolutionHistory.length + 1);
  assert.equal(after.issues.find((issue) => issue.id === "ISS-103").status, "RESOLVED");
  assert.equal(after.equipment.find((equipment) => equipment.id === "EQ-03").status, "NORMAL");
  assert.equal(after.responders.find((responder) => responder.id === "R-OPER142").availability, "AVAILABLE");
  assert.equal(after.operationalEvents.at(-1).eventType, "ISSUE_RESOLVED");
  assert.equal(after.operationalEvents.at(-1).payload.actionTaken, before.issues.find((issue) => issue.id === "ISS-103").responseAction);
  assert.equal(after.resolutionHistory.at(-1).actionTaken, after.operationalEvents.at(-1).payload.actionTaken);
});

test("resolution falls back to a generic action when the issue carries no response action", async () => {
  const { store, scheduler } = await createFixture();
  await store.mutate("clear-response-action", (state) => {
    delete state.issues.find((issue) => issue.id === "ISS-103").responseAction;
  });
  await scheduler.forceResolve("ISS-103");
  const after = await store.snapshot();
  assert.match(after.resolutionHistory.at(-1).actionTaken, /Inspect the affected process/);
  assert.equal(after.operationalEvents.at(-1).payload.actionTaken, after.resolutionHistory.at(-1).actionTaken);
});

test("fixed failed draw appends evidence, reopens issue, and preserves open downtime", async () => {
  const { store, scheduler } = await createFixture();
  await store.mutate("force-hidden-failure", (state) => {
    state.resolutionAttempts.find((entry) => entry.issueId === "ISS-103").successDraw = 0.99;
  });
  const before = await store.snapshot();
  const downtimeStartedAt = before.issues.find((issue) => issue.id === "ISS-103").downtimeStartedAt;
  await scheduler.forceResolve("ISS-103");
  const after = await store.snapshot();
  const issue = after.issues.find((entry) => entry.id === "ISS-103");
  const observed = after.resolutionHistory.at(-1);
  assert.equal(issue.status, "PENDING");
  assert.equal(issue.downtimeStartedAt, downtimeStartedAt);
  assert.equal(issue.reopenCount, 1);
  assert.equal(observed.success, false);
  assert.equal(observed.reopened, true);
  assert.equal(after.responders.find((responder) => responder.id === "R-OPER142").availability, "AVAILABLE");
  assert.equal(after.operationalEvents.at(-1).eventType, "ISSUE_REOPENED");
});

test("failed attempt changes future observed Compass evidence while hidden skill stays unchanged", async () => {
  const { store, scheduler, assignments } = await createFixture();
  await store.mutate("target-failure", (state) => {
    state.resolutionAttempts.find((entry) => entry.issueId === "ISS-103").successDraw = 0.99;
  });
  const skillsBefore = (await store.snapshot()).responderSkills;
  const beforeCount = (await store.snapshot()).resolutionHistory.filter((entry) => entry.responderId === "R-OPER142" && entry.issueClass === "A").length;
  await scheduler.forceResolve("ISS-103");
  const packetAfter = await assignments.candidatePacket("ISS-103", "after");
  const jordanAfter = packetAfter.packet.candidates.find((candidate) => candidate.responderId === "R-OPER142");
  assert.equal(jordanAfter.sameIssueHistoricalCount, beforeCount + 1);
  assert.deepEqual((await store.snapshot()).responderSkills, skillsBefore);
});
