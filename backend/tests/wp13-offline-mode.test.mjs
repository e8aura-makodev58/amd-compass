import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveStore } from "../src/live-store.mjs";
import { createTempAuditStore } from "./helpers/temp-audit-store.mjs";
import { createApplicationRuntime, createLiveRuntime } from "../src/live-runtime.mjs";
import { createDemoRuntime } from "../src/server.mjs";

async function createOfflineApp() {
  const directory = await mkdtemp(join(tmpdir(), "compass-offline-"));
  const liveRuntime = createLiveRuntime({ store: createLiveStore({ filePath: join(directory, "live.json") }) });
  return createApplicationRuntime({ liveRuntime, offlineRuntime: createDemoRuntime({ mode: "fixture" }, createTempAuditStore()), initialMode: "OFFLINE" });
}

test("Offline remains API-free and preserves fixed Engr104/Tech216/Engr028 winners", async () => {
  const app = await createOfflineApp();
  await app.raiseIssue("ISS-104");
  const recommended = await app.requestRecommendation("ISS-104");
  assert.equal(recommended.workflow.nearestBaseline.responderId, "R-ENGR104");
  assert.equal(recommended.workflow.naiveScoreBaseline.responderId, "R-TECH216");
  assert.equal(recommended.workflow.agentOutcome.result.topRecommendation.responderId, "R-ENGR028");
  assert.equal(recommended.workflow.agentOutcome.modelInfo.mode, "fixture");
  assert.deepEqual(recommended.workflow.offer, { status: "PENDING", responderId: "R-ENGR028", rank: 1 });
});

test("Offline automatically assigns when the scripted responder accepts", async () => {
  let currentTime = 1_000;
  const directory = await mkdtemp(join(tmpdir(), "compass-offline-auto-"));
  const liveRuntime = createLiveRuntime({ store: createLiveStore({ filePath: join(directory, "live.json") }) });
  const offlineRuntime = createDemoRuntime(
    { mode: "fixture" },
    createTempAuditStore(),
    null,
    { now: () => currentTime, offerDelayMs: 5_000 },
  );
  const app = createApplicationRuntime({ liveRuntime, offlineRuntime, initialMode: "OFFLINE" });
  const offered = await app.raiseIssue("ISS-104");
  assert.equal(offered.issues[0].status, "OFFER_PENDING");
  assert.equal(offered.responders.find((responder) => responder.id === "R-ENGR028").availability, "OFFERED");
  currentTime += 5_000;
  const accepted = await app.snapshot();
  assert.equal(accepted.workflow.decision.status, "AUTO_ACCEPTED");
  assert.equal(accepted.issues[0].assignedResponderId, "R-ENGR028");
  await new Promise((resolve) => setImmediate(resolve));
  const audit = await offlineRuntime.getAuditEvent(accepted.workflow.candidatePacket.recommendationRequestId);
  assert.equal(audit.decision, "AUTO_ACCEPTED");
  assert.equal(audit.humanDecision, null);
});

test("Offline confirm, override, and exact reset use real mutations", async () => {
  const app = await createOfflineApp();
  const initial = await app.snapshot();
  await app.raiseIssue("ISS-104");
  await app.requestRecommendation("ISS-104");
  const confirmed = await app.decideAssignment("ISS-104", "R-ENGR028", "CONFIRMED");
  assert.equal(confirmed.issues.find((issue) => issue.id === "ISS-104").assignedResponderId, "R-ENGR028");
  await app.reset();
  await app.raiseIssue("ISS-104");
  await app.requestRecommendation("ISS-104");
  const overridden = await app.decideAssignment("ISS-104", "R-ENGR104", "OVERRIDDEN");
  assert.equal(overridden.issues.find((issue) => issue.id === "ISS-104").assignedResponderId, "R-ENGR104");
  await app.reset();
  assert.deepEqual(await app.snapshot(), initial);
});

test("Offline uses the same two-person roles with scripted API-free support acceptance", async () => {
  let currentTime = 1_000;
  const directory = await mkdtemp(join(tmpdir(), "compass-offline-support-"));
  const liveRuntime = createLiveRuntime({ store: createLiveStore({ filePath: join(directory, "live.json") }) });
  const offlineRuntime = createDemoRuntime({ mode: "fixture" }, createTempAuditStore(), null, { now: () => currentTime, offerDelayMs: 100 });
  const app = createApplicationRuntime({ liveRuntime, offlineRuntime, initialMode: "OFFLINE" });
  await app.raiseIssue("ISS-104");
  currentTime += 100;
  let state = await app.snapshot();
  assert.equal(state.workflow.supportOffer.status, "PENDING");
  assert.equal(state.assignments.filter((row) => row.issueId === "ISS-104" && row.status === "ACTIVE").length, 1);
  const soloDueAt = state.resolutionAttempts.find((row) => row.issueId === "ISS-104").resolutionDueAt;
  currentTime += 100;
  state = await app.snapshot();
  assert.equal(state.workflow.supportOffer.status, "ACCEPTED");
  assert.deepEqual(state.assignments.filter((row) => row.issueId === "ISS-104" && row.status === "ACTIVE").map((row) => row.role).sort(), ["PRIMARY", "SUPPORT"]);
  assert.ok(Date.parse(state.resolutionAttempts.find((row) => row.issueId === "ISS-104").resolutionDueAt) < Date.parse(soloDueAt));
  currentTime += 30_000;
  state = await app.snapshot();
  const finalIssue = state.issues.find((row) => row.id === "ISS-104");
  assert.equal(finalIssue.status, state.workflow.resolution.status === "RESOLVED" ? "RESOLVED" : "RECOMMENDATION_READY");
  assert.ok(state.resolutionHistory.some((row) => row.issueId === "ISS-104" && row.fixApplied?.id), "the completed attempt records the applied catalog fix");
  assert.ok(["RESOLVED", "REOPENED"].includes(state.workflow.resolution.status));
  assert.equal(JSON.stringify(state).includes("contributionShare"), false);
  await assert.rejects(() => app.transferResponder({}), (error) => error.statusCode === 409 && error.code === "OFFLINE_TRANSFER_UNAVAILABLE");
});

test("Offline success applies the shared canonical completion and audit mutations", async () => {
  let currentTime = 1_000;
  const directory = await mkdtemp(join(tmpdir(), "compass-offline-success-"));
  const liveRuntime = createLiveRuntime({ store: createLiveStore({ filePath: join(directory, "live.json") }) });
  const offlineRuntime = createDemoRuntime({ mode: "fixture" }, createTempAuditStore(), null, { now: () => currentTime, offerDelayMs: 1, attemptSeed: 36 });
  const app = createApplicationRuntime({ liveRuntime, offlineRuntime, initialMode: "OFFLINE" });
  await app.raiseIssue("ISS-104");
  let state = await app.decideAssignment("ISS-104", "R-ENGR028", "CONFIRMED");
  const attempt = state.resolutionAttempts.find((row) => row.issueId === "ISS-104");
  currentTime += Math.ceil((Date.parse(attempt.resolutionDueAt) - Date.parse(state.simulationState.simulationTime)) / 60) + 1_000;
  state = await app.snapshot();
  const issue = state.issues.find((row) => row.id === "ISS-104");
  const history = state.resolutionHistory.at(-1);
  assert.equal(issue.status, "RESOLVED");
  assert.ok(issue.resolvedAt);
  assert.equal(state.equipment.find((row) => row.id === issue.equipmentId).status, "NORMAL");
  assert.ok(history.actionTaken);
  assert.equal(state.operationalEvents.at(-1).eventType, "ISSUE_RESOLVED");
  assert.equal(state.operationalEvents.at(-1).payload.actionTaken, history.actionTaken);
});

test("Offline failure emits reopen history and immediately starts an API-free rematch", async () => {
  let currentTime = 1_000;
  const directory = await mkdtemp(join(tmpdir(), "compass-offline-failure-"));
  const liveRuntime = createLiveRuntime({ store: createLiveStore({ filePath: join(directory, "live.json") }) });
  const offlineRuntime = createDemoRuntime({ mode: "fixture" }, createTempAuditStore(), null, { now: () => currentTime, offerDelayMs: 1, attemptSeed: 63 });
  const app = createApplicationRuntime({ liveRuntime, offlineRuntime, initialMode: "OFFLINE" });
  await app.raiseIssue("ISS-104");
  let state = await app.decideAssignment("ISS-104", "R-ENGR028", "CONFIRMED");
  const attempt = state.resolutionAttempts.find((row) => row.issueId === "ISS-104");
  currentTime += Math.ceil((Date.parse(attempt.resolutionDueAt) - Date.parse(state.simulationState.simulationTime)) / 60) + 1_000;
  await app.snapshot();
  for (let index = 0; index < 100; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    state = await app.snapshot();
    if (state.issues.find((row) => row.id === "ISS-104").status === "OFFER_PENDING") break;
  }
  const issue = state.issues.find((row) => row.id === "ISS-104");
  assert.equal(issue.status, "OFFER_PENDING");
  assert.equal(issue.resolvedAt, undefined);
  assert.equal(state.equipment.find((row) => row.id === issue.equipmentId).status, "ATTENTION_REQUIRED");
  assert.equal(state.resolutionHistory.at(-1).reopened, true);
  assert.ok(state.resolutionHistory.at(-1).actionTaken);
  assert.equal(state.operationalEvents.at(-1).eventType, "ISSUE_REOPENED");
  assert.equal(state.workflow.resolution.status, "REOPENED");
  assert.equal(state.workflow.offer.status, "PENDING");
});
