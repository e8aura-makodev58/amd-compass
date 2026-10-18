import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { teamProbability, teamRate } from "../src/attempt-engine.mjs";
import { createLiveAssignmentService } from "../src/live-assignment-service.mjs";
import { createLiveStore } from "../src/live-store.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { createResolutionEngine, finalizeResolutionAttemptState } from "../src/resolution-engine.mjs";
import { createScheduler } from "../src/scheduler.mjs";
import { createLiveRecommendationService } from "../src/live-recommendation-service.mjs";
import { createLiveRuntime } from "../src/live-runtime.mjs";
import { migrateLiveState } from "../src/live-migration.mjs";
import { createIssueAuditRecord, validateLiveState } from "../src/live-schema.mjs";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "compass-team-"));
  const store = createLiveStore({ filePath: join(directory, "live.json") });
  return { directory, store, service: createLiveAssignmentService(store) };
}

test("team resolution v1 applies sixty percent of the slower rate and bounded synergy", () => {
  const profiles = [{ medianMinutes: 10, successProbability: 0.8 }, { medianMinutes: 20, successProbability: 0.6 }];
  assert.equal(teamRate(profiles), 0.13);
  assert.equal(teamProbability(profiles), 0.872);
  assert.ok(teamProbability(profiles) >= 0.8);
  assert.ok(teamProbability([{ medianMinutes: 1, successProbability: 0.99 }, { medianMinutes: 1, successProbability: 0.99 }]) <= 0.98);
});

test("joining and releasing support replans without rerolling the attempt", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  const solo = (await store.snapshot()).resolutionAttempts.find((row) => row.issueId === "ISS-104");
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR104", purpose: "ASSISTANCE" });
  const joined = (await store.snapshot()).resolutionAttempts.find((row) => row.id === solo.id);
  assert.equal(joined.durationFactor, solo.durationFactor);
  assert.equal(joined.successDraw, solo.successDraw);
  assert.equal(joined.rosterVersion, solo.rosterVersion + 1);
  assert.equal((await store.snapshot()).assignments.filter((row) => row.issueId === "ISS-104" && row.status === "ACTIVE").length, 2);
  await service.releaseResponder({ issueId: "ISS-104", responderId: "R-ENGR028", expectedRosterVersion: joined.rosterVersion });
  const state = await store.snapshot();
  const after = state.resolutionAttempts.find((row) => row.id === solo.id);
  assert.equal(after.durationFactor, solo.durationFactor);
  assert.equal(after.successDraw, solo.successDraw);
  assert.equal(state.issues.find((row) => row.id === "ISS-104").assignedResponderId, "R-ENGR104");
  assert.equal(state.assignments.find((row) => row.responderId === "R-ENGR104" && row.status === "ACTIVE").role, "PRIMARY");
});

test("cross-issue transfer is atomic and guarded by both roster versions", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR104", purpose: "ASSISTANCE" });
  await store.mutate("target", (state) => state.issues.push({ id: "ISS-105", equipmentId: "EQ-05", issueClass: "C", complexity: "STANDARD", existingPriority: "LOW", status: "PENDING", createdAt: state.simulationState.simulationTime, raisedAt: state.simulationState.simulationTime, downtimeStartedAt: state.simulationState.simulationTime }));
  const version = (await store.snapshot()).resolutionAttempts.find((row) => row.issueId === "ISS-104").rosterVersion;
  const stale = await service.transferResponder({ responderId: "R-ENGR104", sourceIssueId: "ISS-104", targetIssueId: "ISS-105", sourceRosterVersion: version - 1 });
  assert.equal(stale.result.reason, "STALE_ROSTER_VERSION");
  const moved = await service.transferResponder({ responderId: "R-ENGR104", sourceIssueId: "ISS-104", targetIssueId: "ISS-105", sourceRosterVersion: version });
  assert.equal(moved.result.status, "TRANSFERRED");
  const state = await store.snapshot();
  assert.equal(state.responders.find((row) => row.id === "R-ENGR104").currentIssueId, "ISS-105");
  assert.equal(state.assignments.filter((row) => row.responderId === "R-ENGR104" && row.status === "ACTIVE").length, 1);
});

test("public state and issue audit fully redact fixed draws and internal work math", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  const serialized = JSON.stringify(await store.publicSnapshot());
  for (const field of ["successDraw", "durationFactor", "workTotal", "completedWork", "participantWork", "effectiveRate", "teamRate", "successProbability", "contributionShare"]) assert.equal(serialized.includes(`\"${field}\"`), false);
});

test("assistance waits without corrupting a staffed issue when no responder is available", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  await store.mutate("remove-support-capacity", (state) => {
    for (const responder of state.responders) if (responder.availability === "AVAILABLE") responder.availability = "UNAVAILABLE";
  });
  await service.requestAssistance("ISS-104", "OPERATOR_REQUEST");
  const recommendation = createLiveRecommendationService(store, { requestRecommendation: async () => { throw new Error("must not call provider"); } });
  const result = await recommendation.recommend("ISS-104", { purpose: "ASSISTANCE", trigger: "OPERATOR_REQUEST" });
  assert.equal(result.result.status, "WAITING_FOR_RESPONDER");
  const state = await store.snapshot();
  assert.equal(state.issues.find((row) => row.id === "ISS-104").status, "ASSIGNED");
  assert.equal(state.resolutionAttempts.find((row) => row.issueId === "ISS-104").assistance.status, "WAITING");
});

test("removing the original primary promotes and attributes the final outcome to support", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR104", purpose: "ASSISTANCE" });
  const version = (await store.snapshot()).resolutionAttempts.find((row) => row.issueId === "ISS-104").rosterVersion;
  await service.releaseResponder({ issueId: "ISS-104", responderId: "R-ENGR028", expectedRosterVersion: version });
  await store.mutate("force-success", (state) => { state.resolutionAttempts.find((row) => row.issueId === "ISS-104").successDraw = 0; });
  const engine = createResolutionEngine(store);
  await createScheduler(store, { onResolutionDue: (trigger) => engine.handleResolutionDue(trigger) }).forceResolve("ISS-104");
  const history = (await store.snapshot()).resolutionHistory.at(-1);
  assert.equal(history.responderId, "R-ENGR104");
  assert.equal(new Set(history.participants.map((row) => row.responderId)).size, history.participants.length);
});

test("leaving and rejoining one attempt consolidates participant evidence exactly once", async () => {
  const { store, service } = await fixture();
  await store.mutate("add-target", (state) => state.issues.push({ id: "ISS-105", equipmentId: "EQ-05", issueClass: "C", complexity: "STANDARD", existingPriority: "LOW", status: "PENDING", createdAt: state.simulationState.simulationTime, raisedAt: state.simulationState.simulationTime, downtimeStartedAt: state.simulationState.simulationTime }));
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR104", purpose: "ASSISTANCE" });
  await service.assign({ issueId: "ISS-105", responderId: "R-TECH216" });
  let state = await store.snapshot();
  let source = state.resolutionAttempts.find((row) => row.issueId === "ISS-104");
  let target = state.resolutionAttempts.find((row) => row.issueId === "ISS-105");
  await service.transferResponder({ responderId: "R-ENGR104", sourceIssueId: "ISS-104", targetIssueId: "ISS-105", sourceRosterVersion: source.rosterVersion, targetRosterVersion: target.rosterVersion });
  state = await store.snapshot(); source = state.resolutionAttempts.find((row) => row.issueId === "ISS-105"); target = state.resolutionAttempts.find((row) => row.issueId === "ISS-104");
  await service.transferResponder({ responderId: "R-ENGR104", sourceIssueId: "ISS-105", targetIssueId: "ISS-104", sourceRosterVersion: source.rosterVersion, targetRosterVersion: target.rosterVersion });
  await store.mutate("force-success", (draft) => { draft.resolutionAttempts.find((row) => row.issueId === "ISS-104").successDraw = 0; });
  const engine = createResolutionEngine(store);
  await createScheduler(store, { onResolutionDue: (trigger) => engine.handleResolutionDue(trigger) }).forceResolve("ISS-104");
  const history = (await store.snapshot()).resolutionHistory.at(-1);
  assert.equal(history.participants.filter((row) => row.responderId === "R-ENGR104").length, 1);
  assert.ok(Math.abs(history.participants.reduce((sum, row) => sum + row.contributionShare, 0) - 1) < 1e-9);
  assert.equal(JSON.stringify(createIssueAuditRecord(await store.snapshot(), "ISS-104")).includes("contributionShare"), false);
});

test("a sequential handover retains all contributors while the active roster remains capped at two", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR104", purpose: "ASSISTANCE" });
  let attempt = (await store.snapshot()).resolutionAttempts.find((row) => row.issueId === "ISS-104");
  await service.releaseResponder({ issueId: "ISS-104", responderId: "R-ENGR028", expectedRosterVersion: attempt.rosterVersion });
  await service.assign({ issueId: "ISS-104", responderId: "R-TECH216", purpose: "ASSISTANCE" });
  attempt = (await store.snapshot()).resolutionAttempts.find((row) => row.issueId === "ISS-104");
  assert.equal((await store.snapshot()).assignments.filter((row) => row.attemptId === attempt.id && row.status === "ACTIVE").length, 2);
  await store.mutate("force-success", (state) => { state.resolutionAttempts.find((row) => row.id === attempt.id).successDraw = 0; });
  const engine = createResolutionEngine(store);
  await createScheduler(store, { onResolutionDue: (trigger) => engine.handleResolutionDue(trigger) }).forceResolve("ISS-104");
  const history = (await store.snapshot()).resolutionHistory.at(-1);
  assert.deepEqual(history.participants.map((row) => row.responderId).sort(), ["R-ENGR028", "R-ENGR104", "R-TECH216"].sort());
  validateLiveState(await store.snapshot());
});

test("schema rejects broken canonical roster and offer projections", () => {
  const mutations = [
    (state) => { state.issues.find((row) => row.status === "ASSIGNED").status = "PENDING"; },
    (state) => { state.responders.find((row) => row.availability === "ASSIGNED").availability = "AVAILABLE"; },
    (state) => { state.assignments.find((row) => row.status === "ACTIVE").attemptId = "missing"; },
    (state) => { state.resolutionAttempts.push({ ...structuredClone(state.resolutionAttempts[0]), id: "attempt-duplicate" }); },
    (state) => { state.issues.find((row) => row.status === "PENDING").assignedResponderId = "R-ENGR028"; },
    (state) => { state.responders.find((row) => row.availability === "AVAILABLE").currentIssueId = "ISS-104"; },
    (state) => { state.resolutionAttempts[0].assistance.status = "UNKNOWN"; },
  ];
  for (const mutate of mutations) {
    const state = createLiveSeed(); mutate(state);
    assert.throws(() => validateLiveState(state), /Invalid live simulation state/);
  }
});

test("an assisted outcome contributes fractional evidence to the next Compass packet", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR104", purpose: "ASSISTANCE" });
  await store.mutate("force-team-failure", (state) => { state.resolutionAttempts.find((row) => row.issueId === "ISS-104").successDraw = 0.999; });
  const resolution = createResolutionEngine(store);
  await createScheduler(store, { onResolutionDue: (trigger) => resolution.handleResolutionDue(trigger) }).forceResolve("ISS-104");
  const packet = await service.candidatePacket("ISS-104", "after-assisted-outcome");
  const evidence = packet.packet.candidates.find((row) => row.responderId === "R-ENGR028");
  assert.ok(evidence.effectiveEvidenceWeight > 0);
  assert.ok(Number.isFinite(evidence.effectiveEvidenceWeight));
  assert.ok(["WEAK", "MODERATE", "STRONG"].includes(evidence.evidenceStrengthLabel));
  const state = structuredClone(await store.snapshot());
  const completed = state.resolutionAttempts.find((row) => row.issueId === "ISS-104");
  completed.resolutionDueToken = "stale-token";
  assert.throws(() => validateLiveState(state), /retains resolutionDueToken/);
  const malformed = structuredClone(await store.snapshot());
  malformed.resolutionHistory.at(-1).participants[0].contributionShare = Number.NaN;
  assert.throws(() => validateLiveState(malformed), /participant share is invalid/);
});

test("v1 migration is idempotent, preserves the due trigger, and creates one backup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-migrate-"));
  const filePath = join(directory, "live.json");
  const legacy = createLiveSeed(); legacy.schemaVersion = "1.0"; delete legacy.resolutionAttempts; delete legacy.simulationState.rngStreams.attempt;
  for (const issue of legacy.issues) delete issue.complexity;
  legacy.issues.find((row) => row.status === "PENDING").assignedResponderId = "R-ENGR104";
  legacy.responders.find((row) => row.availability === "AVAILABLE").currentIssueId = "ISS-104";
  for (const assignment of legacy.assignments) Object.assign(assignment, { pendingResolutionMinutes: 16, resolutionDueAt: "2026-09-01T08:02:00.000Z", resolutionDueToken: "resolution-1", resolutionDispatchToken: null });
  await writeFile(filePath, JSON.stringify(legacy));
  const store = createLiveStore({ filePath });
  const migrated = await store.snapshot();
  assert.equal(migrated.schemaVersion, "2.1");
  assert.equal(migrated.resolutionAttempts[0].resolutionDueToken, "resolution-1");
  assert.equal(migrated.issues.find((row) => row.status === "PENDING").assignedResponderId, undefined);
  assert.equal(migrated.responders.find((row) => row.id === "R-ENGR104").currentIssueId, undefined);
  assert.equal(JSON.parse(await readFile(`${filePath}.pre-v2.bak`, "utf8")).schemaVersion, "1.0");
  assert.deepEqual((await createLiveStore({ filePath }).snapshot()), migrated);
});

test("startup repairs an early 2.0 assignment that predates role history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-team-early-v2-"));
  const filePath = join(directory, "live.json");
  const early = migrateLiveState(createLiveSeed());
  delete early.assignments[0].roleHistory;
  await writeFile(filePath, `${JSON.stringify(early, null, 2)}\n`, "utf8");
  const repaired = await createLiveStore({ filePath }).snapshot();
  assert.deepEqual(repaired.assignments[0].roleHistory, [{
    role: early.assignments[0].role,
    startedAt: early.assignments[0].joinedAt,
    endedAt: early.assignments[0].endedAt,
  }]);
});

test("v1 migration keeps completed reassignment history separate from the active attempt", () => {
  const legacy = createLiveSeed();
  legacy.schemaVersion = "1.0";
  delete legacy.resolutionAttempts;
  delete legacy.simulationState.rngStreams.attempt;
  const active = legacy.assignments[0];
  for (const field of ["attemptId", "role", "joinedAt", "endedAt", "endReason", "roleHistory"]) delete active[field];
  Object.assign(active, { pendingResolutionMinutes: 16, resolutionDueAt: "2026-09-01T08:02:00.000Z", resolutionDueToken: "resolution-1", resolutionDispatchToken: null });
  legacy.assignments.unshift({ id: "assignment-old", issueId: active.issueId, responderId: "R-ENGR028", createdAt: "2026-09-01T07:20:00.000Z", completedAt: "2026-09-01T07:35:00.000Z", status: "COMPLETED" });
  legacy.resolutionHistory.push({ id: "H-049", issueId: active.issueId, assignmentId: "assignment-old", responderId: "R-ENGR028", issueClass: "A", resolutionMinutes: 15, success: false, reopened: true, resolvedAt: "2026-09-01T07:35:00.000Z" });
  const rngBefore = structuredClone(legacy.simulationState.rngStreams);
  const migrated = migrateLiveState(legacy);
  assert.equal(migrated.assignments.find((row) => row.id === "assignment-old").attemptId, "legacy-H-049");
  assert.equal(migrated.resolutionHistory.find((row) => row.id === "H-049").attemptId, "legacy-H-049");
  assert.notEqual(migrated.assignments.find((row) => row.id === active.id).attemptId, "legacy-H-049");
  const corrupted = structuredClone(migrated);
  corrupted.assignments.find((row) => row.id === "assignment-old").attemptId = corrupted.assignments.find((row) => row.id === active.id).attemptId;
  assert.throws(() => validateLiveState(corrupted), /matching terminal history/);
  for (const [name, value] of Object.entries(rngBefore)) assert.equal(migrated.simulationState.rngStreams[name], value);
});

test("a roster change invalidates a resolution trigger that was already claimed", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  let claimed;
  const scheduler = createScheduler(store, { onResolutionDue: async (trigger) => { claimed = trigger; } });
  await scheduler.forceResolve("ISS-104");
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR104", purpose: "ASSISTANCE" });
  const result = await createResolutionEngine(store).handleResolutionDue(claimed);
  assert.equal(result.result.status, "TOKEN_MISMATCH");
  assert.equal((await store.snapshot()).resolutionAttempts.find((row) => row.issueId === "ISS-104").status, "ACTIVE");
});

test("only one support offer can be pending and rejection retains the staffed issue", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR104" });
  const recommendations = createLiveRecommendationService(store, { requestRecommendation: async (packet) => ({ status: "unavailable", reason: "forced", modelInfo: { mode: "force-failure" } }) });
  const recommended = await recommendations.recommend("ISS-104", { purpose: "ASSISTANCE", trigger: "OPERATOR_REQUEST" });
  const first = await service.offerNextCandidate(recommended.result.recommendationId);
  const duplicate = await service.offerNextCandidate(recommended.result.recommendationId);
  assert.equal(first.result.status, "OFFERED");
  assert.equal(duplicate.result.reason, "OFFER_ALREADY_PENDING");
  await store.mutate("reject", (state) => { const offer = state.dispatchOffers.find((row) => row.id === first.result.offerId); offer.acceptanceProbability = 0; offer.responseDispatchToken = offer.responseDueToken; offer.responseDueToken = null; offer.responseDueAt = null; });
  const rejected = await service.handleOfferDue({ offerId: first.result.offerId, token: (await store.snapshot()).dispatchOffers.find((row) => row.id === first.result.offerId).responseDispatchToken });
  assert.equal(rejected.result.status, "REJECTED");
  assert.equal((await store.snapshot()).issues.find((row) => row.id === "ISS-104").status, "ASSIGNED");
});

test("force resolve cancels pending support without rerolling the attempt", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR104" });
  const recommendations = createLiveRecommendationService(store, { requestRecommendation: async () => ({ status: "unavailable", reason: "forced", modelInfo: { mode: "force-failure" } }) });
  const recommended = await recommendations.recommend("ISS-104", { purpose: "ASSISTANCE", trigger: "OPERATOR_REQUEST" });
  const offered = await service.offerNextCandidate(recommended.result.recommendationId);
  const before = (await store.snapshot()).resolutionAttempts.find((row) => row.issueId === "ISS-104");
  const resolution = createResolutionEngine(store);
  await createScheduler(store, { onResolutionDue: (trigger) => resolution.handleResolutionDue(trigger) }).forceResolve("ISS-104");
  const state = await store.snapshot();
  assert.equal(state.dispatchOffers.find((row) => row.id === offered.result.offerId).status, "CANCELLED");
  assert.equal(state.responders.find((row) => row.id === offered.result.responderId).availability, "AVAILABLE");
  assert.equal(state.resolutionAttempts.find((row) => row.id === before.id).successDraw, before.successDraw);
});

test("startup reconciliation delivers a claimed resolution exactly once", async () => {
  const { store } = await fixture();
  let trigger;
  await createScheduler(store, { onResolutionDue: async (value) => { trigger = value; } }).forceResolve("ISS-103");
  assert.ok(trigger);
  const runtime = createLiveRuntime({ store, plannerOptions: { mode: "force-failure" }, agentOptions: { mode: "force-failure" } });
  await runtime.reconcileStartup();
  const after = await store.snapshot();
  assert.notEqual(after.resolutionAttempts.find((row) => row.id === trigger.attemptId).status, "ACTIVE");
  const count = after.resolutionHistory.filter((row) => row.attemptId === trigger.attemptId).length;
  await runtime.reconcileStartup();
  assert.equal((await store.snapshot()).resolutionHistory.filter((row) => row.attemptId === trigger.attemptId).length, count);
});

test("complex issues automatically request assistance after primary acceptance without hidden foresight", async () => {
  const { store } = await fixture();
  const runtime = createLiveRuntime({ store, plannerOptions: { mode: "force-failure" }, agentOptions: { mode: "force-failure" } });
  await runtime.recommend("ISS-104");
  await store.mutate("accept-primary", (state) => { state.dispatchOffers.find((row) => row.issueId === "ISS-104").acceptanceProbability = 1; });
  await runtime.resume();
  await runtime.tick(20_000);
  const state = await store.snapshot();
  assert.equal(state.issues.find((row) => row.id === "ISS-104").status, "ASSIGNED");
  assert.equal(state.resolutionAttempts.find((row) => row.issueId === "ISS-104").assistance.trigger, "COMPLEX_ISSUE");
  assert.equal(state.dispatchOffers.filter((row) => row.issueId === "ISS-104").at(-1).purpose, "ASSISTANCE");
  assert.equal(JSON.stringify(state.recommendations.at(-1)).includes("successDraw"), false);
});

test("standard issues request help only when observable progress is behind the initial plan", async () => {
  const { store, service } = await fixture();
  await store.mutate("slow-attempt-seed", (state) => { state.simulationState.rngStreams.attempt = 1714; state.issues.find((row) => row.id === "ISS-104").complexity = "STANDARD"; });
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  const armed = await store.mutate("arm-review", (state) => {
    const attempt = state.resolutionAttempts.find((row) => row.issueId === "ISS-104");
    state.simulationState.simulationTime = attempt.reviewDueAt;
    const token = attempt.reviewDueToken; attempt.reviewDueToken = null; attempt.reviewDueAt = null; attempt.reviewDispatchToken = token;
    return { kind: "ASSISTANCE_REVIEW_DUE", token, attemptId: attempt.id, issueId: attempt.issueId, generation: attempt.scheduleGeneration };
  });
  const reviewed = await service.handleAssistanceReview(armed.result);
  assert.equal(reviewed.result.status, "REQUESTED");
  assert.equal(reviewed.result.trigger, "BEHIND_PLAN");
  const recommendationSafePacket = await service.candidatePacket("ISS-104", "support-check", "ASSISTANCE");
  assert.equal(JSON.stringify(recommendationSafePacket).includes("durationFactor"), false);
  assert.equal(JSON.stringify(recommendationSafePacket).includes("successDraw"), false);
});

test("resolution due times round up, and a due event that lands short replans instead of stalling", async () => {
  const { store, service } = await fixture();
  await service.assign({ issueId: "ISS-104", responderId: "R-ENGR028" });
  const state = structuredClone(await store.snapshot());
  const attempt = state.resolutionAttempts.find((row) => row.issueId === "ISS-104");
  const segment = attempt.segments.at(-1);
  const exactMs = Date.parse(segment.startedAt) + ((attempt.workTotal - attempt.completedWork) / segment.teamRate) * 60_000;
  assert.ok(Date.parse(attempt.resolutionDueAt) >= exactMs, "due time is never before the work finishes");

  // Fire one millisecond before the work finishes, as a truncated due time once did.
  state.simulationState.simulationTime = new Date(Math.ceil(exactMs) - 1).toISOString();
  const generation = attempt.scheduleGeneration;
  const outcome = finalizeResolutionAttemptState(state, attempt);
  assert.equal(outcome.status, "NOT_COMPLETE");
  assert.equal(attempt.status, "ACTIVE");
  assert.equal(attempt.scheduleGeneration, generation + 1);
  assert.equal(attempt.segments.at(-1).endedAt, null, "a new segment is open");
  assert.ok(attempt.resolutionDueToken, "a new resolution is scheduled");
  assert.ok(Date.parse(attempt.resolutionDueAt) - Date.parse(state.simulationState.simulationTime) <= 1_000, "within a second, not the next roster change");

  state.simulationState.simulationTime = attempt.resolutionDueAt;
  assert.ok(["RESOLVED", "REOPENED"].includes(finalizeResolutionAttemptState(state, attempt).status));
});
