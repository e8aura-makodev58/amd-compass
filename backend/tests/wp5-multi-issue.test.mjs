import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveAssignmentService } from "../src/live-assignment-service.mjs";
import { createLiveStore } from "../src/live-store.mjs";

async function createFixture() {
  const directory = await mkdtemp(join(tmpdir(), "compass-multi-issue-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  return { store, assignments: createLiveAssignmentService(store) };
}

test("assigning one live issue immediately changes another issue candidate set", async () => {
  const { store, assignments } = await createFixture();
  const before = await assignments.candidatePacket("ISS-104", "rec-104");
  assert.equal(before.status, "READY");
  assert.equal(before.packet.candidates.some((candidate) => candidate.responderId === "R-ENGR028"), true);
  const assigned = await assignments.assign({ issueId: "ISS-104", responderId: "R-ENGR028", eligibleResponderIds: before.packet.candidates.map((candidate) => candidate.responderId) });
  assert.equal(assigned.result.status, "ASSIGNED");

  await store.mutate("add-independent-pending-issue", (state) => {
    state.issues.push({ id: "ISS-105", equipmentId: "EQ-01", issueClass: "B", existingPriority: "UNSPECIFIED", status: "PENDING", createdAt: state.simulationState.simulationTime, raisedAt: state.simulationState.simulationTime, downtimeStartedAt: state.simulationState.simulationTime });
    state.equipment.find((equipment) => equipment.id === "EQ-01").status = "ISSUE_ACTIVE";
  });
  const next = await assignments.candidatePacket("ISS-105", "rec-105");
  assert.equal(next.status, "READY");
  assert.equal(next.packet.candidates.some((candidate) => candidate.responderId === "R-ENGR028"), false);
  assert.equal(next.packet.candidates.some((candidate) => candidate.responderId === "R-OPER142"), false);
});

test("two issues cannot claim the same responder from stale candidate snapshots", async () => {
  const { store, assignments } = await createFixture();
  await store.mutate("add-second-pending-issue", (state) => {
    state.issues.push({ id: "ISS-105", equipmentId: "EQ-01", issueClass: "C", existingPriority: "UNSPECIFIED", status: "PENDING", createdAt: state.simulationState.simulationTime, raisedAt: state.simulationState.simulationTime, downtimeStartedAt: state.simulationState.simulationTime });
    state.equipment.find((equipment) => equipment.id === "EQ-01").status = "ISSUE_ACTIVE";
  });
  const [packetA, packetB] = await Promise.all([
    assignments.candidatePacket("ISS-104", "rec-a"),
    assignments.candidatePacket("ISS-105", "rec-b"),
  ]);
  assert.equal(packetA.packet.candidates.some((candidate) => candidate.responderId === "R-ENGR104"), true);
  assert.equal(packetB.packet.candidates.some((candidate) => candidate.responderId === "R-ENGR104"), true);
  const first = await assignments.assign({ issueId: "ISS-104", responderId: "R-ENGR104", eligibleResponderIds: packetA.packet.candidates.map((candidate) => candidate.responderId) });
  const stale = await assignments.assign({ issueId: "ISS-105", responderId: "R-ENGR104", eligibleResponderIds: packetB.packet.candidates.map((candidate) => candidate.responderId) });
  assert.equal(first.result.status, "ASSIGNED");
  assert.deepEqual(stale.result, { status: "STALE", reason: "RESPONDER_NOT_AVAILABLE", responderId: "R-ENGR104" });
  assert.equal((await store.snapshot()).assignments.filter((assignment) => assignment.responderId === "R-ENGR104" && assignment.status === "ACTIVE").length, 1);
});

test("no eligible responder leaves a live issue pending", async () => {
  const { store, assignments } = await createFixture();
  await store.mutate("make-all-responders-unavailable", (state) => {
    for (const responder of state.responders) {
      if (responder.availability === "AVAILABLE") responder.availability = "UNAVAILABLE";
    }
  });
  const ready = await assignments.markRecommendationReady("ISS-104");
  assert.equal(ready.result.status, "WAITING_FOR_RESPONDER");
  const packet = await assignments.candidatePacket("ISS-104", "rec-waiting");
  assert.equal(packet.status, "WAITING_FOR_RESPONDER");
  assert.equal(packet.packet.candidates.length, 0);
  assert.equal((await store.snapshot()).issues.find((issue) => issue.id === "ISS-104").status, "PENDING");
});

test("assignment mutation records canonical assignment and operational event", async () => {
  const { store, assignments } = await createFixture();
  const result = await assignments.assign({ issueId: "ISS-104", responderId: "R-OPER088", decision: "OVERRIDDEN" });
  assert.equal(result.result.status, "ASSIGNED");
  const state = await store.snapshot();
  assert.equal(state.issues.find((issue) => issue.id === "ISS-104").assignedResponderId, "R-OPER088");
  assert.equal(state.responders.find((responder) => responder.id === "R-OPER088").currentIssueId, "ISS-104");
  assert.equal(state.operationalEvents.at(-1).eventType, "ASSIGNMENT_OVERRIDDEN");
});
