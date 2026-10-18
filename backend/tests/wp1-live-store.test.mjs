import { readDurableLiveState } from "../src/live-journal.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { assertNoResponderSkill, createIssueAuditRecord, createPublicLiveSnapshot, validateLiveState } from "../src/live-schema.mjs";
import { createTempAuditStore } from "./helpers/temp-audit-store.mjs";
import { createLiveStore } from "../src/live-store.mjs";
import { createModeService } from "../src/mode-service.mjs";
import { createDemoRuntime } from "../src/server.mjs";

test("v4 live seed has fixed synthetic schema, observed history, and hidden skill rows", () => {
  const state = validateLiveState(createLiveSeed());
  assert.equal(state.equipment.length, 72);
  for (const floor of [1, 2, 3]) assert.equal(state.equipment.filter((item) => item.floor === floor).length, 24);
  assert.equal(state.responders.length, 24);
  assert.deepEqual(state.responders.slice(0, 6).map((responder) => responder.floor), [1, 1, 2, 2, 3, 3]);
  assert.equal(state.resolutionHistory.length, 48);
  assert.equal(state.responderSkills.length, 72);
  assert.equal(state.responderSkills.find((skill) => skill.responderId === "R-TECH216" && skill.issueClass === "B").trueSuccessProbability, 0.72);
});

test("public live snapshots never expose hidden responder skill", () => {
  const publicState = createPublicLiveSnapshot(createLiveSeed());
  assert.equal("responderSkills" in publicState, false);
  assert.equal("resolutionHistory" in publicState, false);
  assert.equal("rngStreams" in publicState.simulationState, false);
  assertNoResponderSkill(publicState);
});

test("issue audit records are complete for their issue and obey public redaction", () => {
  const state = createLiveSeed();
  // Push the issue's own recommendation far outside the polled snapshot window,
  // which keeps only the most recent thirty.
  state.recommendations = [
    { id: "live-rec-target", issueId: "ISS-103", nearestWinner: "R-OPER142", naiveWinner: "R-OPER142", agentResult: null, candidateEvidenceSnapshot: [] },
    ...Array.from({ length: 45 }, (_, index) => ({ id: `live-rec-${index}`, issueId: "ISS-104", nearestWinner: "R-OPER142", naiveWinner: "R-OPER142", agentResult: null, candidateEvidenceSnapshot: [] })),
  ];
  state.dispatchOffers = [{ id: "offer-1", issueId: "ISS-103", responderId: "R-OPER142", rank: 1, status: "ACCEPTED", responseDueToken: "t", responseDispatchToken: "d", acceptanceProbability: 0.9 }];

  assert.equal(createPublicLiveSnapshot(state).recommendations.some((entry) => entry.id === "live-rec-target"), false);

  const record = createIssueAuditRecord(state, "ISS-103");
  assert.equal(record.issue.id, "ISS-103");
  assert.equal(record.equipment.id, "EQ-03");
  assert.deepEqual(record.recommendations.map((entry) => entry.id), ["live-rec-target"]);
  assert.ok(record.operationalEvents.every((event) => event.issueId === "ISS-103"));
  assert.ok(record.operationalEvents.length > 0);
  for (const field of ["responseDueToken", "responseDispatchToken", "acceptanceProbability"]) assert.equal(field in record.dispatchOffers[0], false);
  assertNoResponderSkill(record);
  assert.equal(createIssueAuditRecord(state, "ISS-000"), null);
});

test("live store persists serialized atomic mutations and exact reset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-live-store-"));
  const filePath = join(directory, "live.json");
  const store = createLiveStore({ filePath });
  const initial = await store.snapshot();
  const [first, second] = await Promise.all([
    store.mutate("first", (state) => { state.simulationState.speedMultiplier = 5; return "first"; }),
    store.mutate("second", (state) => { state.simulationState.status = "RUNNING"; return "second"; }),
  ]);
  assert.deepEqual([first.revision, second.revision], [1, 2]);
  const persisted = await readDurableLiveState(filePath);
  assert.equal(persisted.revision, 2);
  assert.equal(persisted.simulationState.speedMultiplier, 5);
  assert.equal(persisted.simulationState.status, "RUNNING");
  assert.deepEqual(await store.reset(), initial);
});

test("required v4 fixtures are present and bounded", async () => {
  const root = new URL("../../fixtures/", import.meta.url);
  const read = async (name) => JSON.parse(await readFile(new URL(name, root), "utf8"));
  const [offline, candidatePacket, compassResult, plannerInput, plannerOutput, analytics] = await Promise.all([
    read("offline-scenario.json"), read("candidate-packet-scenario-a.json"), read("agent-result-scenario-a.json"),
    read("event-planner-input.json"), read("event-planner-output.json"), read("analytics-response.json"),
  ]);
  assert.equal(offline.expectedWinners.compass, "R-ENGR028");
  assert.equal(plannerInput.constraints.maxActiveIssues, 3); // historical fixture remains a v4 artifact
  assert.equal(plannerOutput.eventType, "ISSUE_RAISED");
  assert.equal(analytics.issues.reopenRate.denominator, 0);
  assert.equal(candidatePacket.candidates.length, 4);
  assert.equal(compassResult.topRecommendation.responderId, "R-ENGR028");
  assertNoResponderSkill({ offline, candidatePacket, compassResult, plannerInput, plannerOutput, analytics });
});

test("Offline and Live share a mode service while Offline remains API-free", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-mode-service-"));
  const liveStore = createLiveStore({ filePath: join(directory, "live.json") });
  const offlineRuntime = createDemoRuntime({ mode: "fixture" }, createTempAuditStore());
  const modes = createModeService({ liveStore, offlineRuntime });
  const [live, offline] = await Promise.all([modes.getState("LIVE"), modes.getState("OFFLINE")]);
  assert.equal(live.responderSkills, undefined);
  assert.equal(offline.activeIssueId, "ISS-104");
  await offlineRuntime.raiseIssue("ISS-104");
  await modes.reset("OFFLINE");
  assert.equal((await modes.getState("OFFLINE")).workflow, null);
});
