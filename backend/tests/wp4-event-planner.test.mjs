import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import {
  buildEventPlannerPacket,
  createEventPlanningService,
  createFallbackEventProposal,
  validateEventProposal,
} from "../src/event-planner.mjs";
import { assertNoResponderSkill } from "../src/live-schema.mjs";
import { createLiveStore } from "../src/live-store.mjs";

const trigger = { kind: "EVENT_DUE", token: "due-1", forced: false, simulationTimestamp: "2026-09-01T08:15:00.000Z" };
const validProposal = {
  schemaVersion: "1.0",
  eventType: "ISSUE_RAISED",
  equipmentId: "EQ-01",
  issueClass: "C",
  description: "Temperature instability detected",
  responseAction: "Inspect process parameters, correct the deviation, and verify stable operation.",
  contextReason: "Current equipment state permits a new issue",
};

async function createFixture(requestProposal) {
  const directory = await mkdtemp(join(tmpdir(), "compass-planner-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  return { store, planner: createEventPlanningService(store, { requestProposal }) };
}

test("planner packet is bounded contextual state with no hidden simulation truth", () => {
  const packet = buildEventPlannerPacket(createLiveSeed());
  assert.equal(packet.equipment.length, 72);
  assert.equal(packet.activeIssues.length, 2);
  assert.ok(packet.recentEvents.length <= 12);
  assert.equal("responders" in packet, false);
  assertNoResponderSkill(packet);
});

test("deterministic fallback carries a bounded narrative for every issue class", () => {
  const seen = new Set();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = createLiveSeed();
    state.simulationState.rngStreams.fallback = attempt * 7919 + 13;
    const proposal = createFallbackEventProposal(state);
    seen.add(proposal.issueClass);
    assert.ok(proposal.description.trim().length > 0, `class ${proposal.issueClass} produced an empty description`);
    assert.ok(proposal.responseAction.trim().length > 0, `class ${proposal.issueClass} produced an empty response action`);
    assert.ok(proposal.description.length <= 180);
    assert.ok(proposal.responseAction.length <= 240);
  }
  assert.deepEqual([...seen].sort(), ["A", "B", "C"]);
});

test("proposal validation rejects malformed, unknown, and occupied equipment events", () => {
  const state = createLiveSeed();
  assert.equal(validateEventProposal(state, validProposal).valid, true);
  assert.equal(validateEventProposal(state, { ...validProposal, issueClass: "Z" }).valid, false);
  assert.equal(validateEventProposal(state, { ...validProposal, equipmentId: "EQ-404" }).valid, false);
  assert.equal(validateEventProposal(state, { ...validProposal, responseAction: "" }).valid, false);
  assert.equal(validateEventProposal(state, { ...validProposal, description: "d".repeat(181) }).valid, false);
  assert.equal(validateEventProposal(state, { ...validProposal, responseAction: "a".repeat(241) }).valid, false);
  assert.equal(validateEventProposal(state, { ...validProposal, description: "d".repeat(180), responseAction: "a".repeat(240) }).valid, true);
  assert.equal(validateEventProposal(state, { ...validProposal, equipmentId: "EQ-03" }).valid, false);
  assert.equal(validateEventProposal(state, { malformed: true }).valid, false);
});

test("valid planner output persists exactly once after an out-of-lock model call", async () => {
  let store;
  const fixture = await createFixture(async () => {
    await store.mutate("prove-model-call-outside-lock", (state) => { state.simulationState.speedMultiplier = 5; });
    return { status: "ok", output: validProposal };
  });
  store = fixture.store;
  const first = await fixture.planner.handleEventDue(trigger);
  assert.equal(first.result.status, "PERSISTED");
  assert.equal(first.result.source, "EVENT_PLANNER");
  const second = await fixture.planner.handleEventDue(trigger);
  assert.equal(second.status, "DUPLICATE");
  const state = await store.snapshot();
  assert.equal(state.issues.filter((issue) => issue.equipmentId === "EQ-01" && issue.status !== "RESOLVED").length, 1);
  assert.equal(state.equipment.find((item) => item.id === "EQ-01").status, "ISSUE_ACTIVE");
  assert.equal(state.operationalEvents.at(-1).payload.dueEventToken, "due-1");
  assert.equal(state.issues.at(-1).responseAction, validProposal.responseAction);
});

test("invalid planner output invokes deterministic fallback without touching other RNG streams", async () => {
  const { store, planner } = await createFixture(async () => ({ status: "ok", output: { ...validProposal, equipmentId: "EQ-03" } }));
  const before = await store.snapshot();
  const result = await planner.handleEventDue(trigger);
  assert.equal(result.result.status, "PERSISTED");
  assert.equal(result.result.source, "DETERMINISTIC_FALLBACK");
  const after = await store.snapshot();
  assert.notEqual(after.simulationState.rngStreams.fallback, before.simulationState.rngStreams.fallback);
  assert.equal(after.simulationState.rngStreams.scheduler, before.simulationState.rngStreams.scheduler);
  assert.equal(after.simulationState.rngStreams.resolution, before.simulationState.rngStreams.resolution);
});

test("provider failure still advances the world through deterministic fallback", async () => {
  const { store, planner } = await createFixture(async () => ({ status: "unavailable", reason: "provider-error" }));
  const result = await planner.handleEventDue(trigger);
  assert.equal(result.result.source, "DETERMINISTIC_FALLBACK");
  assert.equal((await store.snapshot()).issues.length, 3);
});

test("a stale proposal is revalidated against current canonical state before persistence", async () => {
  let store;
  const fixture = await createFixture(async () => {
    await store.mutate("occupy-proposed-equipment", (state) => {
      state.issues.push({ id: "ISS-105", equipmentId: "EQ-01", issueClass: "A", status: "PENDING", createdAt: state.simulationState.simulationTime, raisedAt: state.simulationState.simulationTime, downtimeStartedAt: state.simulationState.simulationTime });
      state.equipment.find((item) => item.id === "EQ-01").status = "ISSUE_ACTIVE";
    });
    return { status: "ok", output: validProposal };
  });
  store = fixture.store;
  const result = await fixture.planner.handleEventDue(trigger);
  assert.equal(result.result.status, "PERSISTED");
  assert.notEqual(result.result.issueId, "ISS-105");
  assert.notEqual((await store.snapshot()).issues.find((row) => row.id === result.result.issueId).equipmentId, "EQ-01");
});
