import {createStaffingReview,decideStaffing} from '../src/staffing-service.mjs';
import { initializeFaults } from '../src/fault-truth.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { migrateLiveState } from "../src/live-migration.mjs";
import { validateLiveState } from "../src/live-schema.mjs";
import { activeIssueCount, priorityForIssue, selectNextQueuedIssue, crewForTime, reconcileWorkforceDuty } from "../src/workforce-continuity.mjs";
import { applyWorkforceTrigger, claimWorkforceDueTriggers } from "../src/workforce-continuity.mjs";

function withActiveAssignment(state, { responder, issueId, role = "PRIMARY", otherRoster = [] }) {
  const now = state.simulationState.simulationTime;
  responder.availability = "ASSIGNED";
  responder.currentIssueId = issueId;
  const attemptId = `attempt-${issueId}`;
  let attempt = state.resolutionAttempts.find((row) => row.id === attemptId);
  if (!attempt) {
    attempt = { id: attemptId, issueId, modelVersion: "team-resolution-v1", status: "ACTIVE",
      startedAt: now, completedAt: null, durationFactor: 1, completedWork: 0, successDraw: 0.1, workTotal: 5,
      participantWork: {}, segments: [{ id: `${attemptId}-segment-1`, startedAt: now, endedAt: null,
        roster: [{ responderId: responder.id, role, effectiveRate: 1 }, ...otherRoster.map((row) => ({ responderId: row.id, role: "SUPPORT", effectiveRate: 0.6 }))],
        teamRate: 1, successProbability: 0.9, workCompleted: 0 }],
      rosterVersion: 1, scheduleGeneration: 1, resolutionDueAt: new Date(Date.parse(now) + 60_000).toISOString(),
      resolutionDueToken: `resolution-${attemptId}-1`, resolutionDispatchToken: null, resolutionDispatchForced: false,
      assistance: { status: otherRoster.length ? "STAFFED" : "NONE", generation: 0, trigger: null, cooldownUntil: null },
      reviewDueAt: null, reviewDueToken: null, reviewDispatchToken: null };
    state.resolutionAttempts.push(attempt);
  }
  state.assignments.push({ id: `assignment-${issueId}-${responder.id}`, issueId, responderId: responder.id, createdAt: now,
    status: "ACTIVE", attemptId, role, joinedAt: now, endedAt: null, endReason: null,
    roleHistory: [{ role, startedAt: now, endedAt: null }] });
  if (!state.issues.some((row) => row.id === issueId)) {
    state.issues.push({ id: issueId, equipmentId: state.equipment[0].id, issueClass: "A", complexity: "STANDARD",
      status: "ASSIGNED", raisedAt: now, createdAt: now, downtimeStartedAt: now, description: "test", responseAction: "test",
      assignedResponderId: role === "PRIMARY" ? responder.id : state.issues.find((row) => row.id === issueId)?.assignedResponderId });
  }
  initializeFaults(state);
  return attempt;
}

test("workforce provisioning is deterministic, keeps original hidden truth, and never advances live RNG", () => {
  const seed = createLiveSeed();
  assert.equal(seed.responders.length, 24);
  assert.equal(seed.responderSkills.length, 72);
  assert.deepEqual(seed.responders.slice(0, 6).map((row) => row.crewId), Array(6).fill("A"));
  const legacy = structuredClone(seed);
  const originalSkills = legacy.responderSkills.slice(0, 18);
  const rng = structuredClone(legacy.simulationState.rngStreams);
  legacy.schemaVersion = "2.0";
  legacy.responders = legacy.responders.slice(0, 6);
  legacy.responderSkills = legacy.responderSkills.slice(0, 18);
  delete legacy.workforceContinuity;
  const migrated = migrateLiveState(legacy);
  assert.equal(migrated.responders.length, 24);
  assert.deepEqual(migrated.responderSkills.slice(0, 18), originalSkills);
  assert.deepEqual(migrated.simulationState.rngStreams, rng);
  assert.deepEqual(migrateLiveState(migrated), migrated);
});

test("wc-2 migration repairs the observed twelve-on-shift wc-1 state without changing hidden truth or live RNG", () => {
  const legacy = createLiveSeed();
  legacy.workforceContinuity.version = "wc-1";
  const skills = structuredClone(legacy.responderSkills);
  const rng = structuredClone(legacy.simulationState.rngStreams);
  // This reproduces the deployed wc-1 display defect: two crews visible as
  // active even though the room has one normal six-person shift.
  for (const responder of legacy.responders.filter((row) => ["A", "B"].includes(row.crewId))) responder.availability = "AVAILABLE";
  const migrated = migrateLiveState(legacy);
  assert.equal(migrated.workforceContinuity.version, "wc-2");
  assert.equal(migrated.responders.filter((row) => row.availability !== "UNAVAILABLE").length, 6);
  assert.deepEqual(migrated.responders.filter((row) => row.availability !== "UNAVAILABLE").map((row) => row.crewId), Array(6).fill(crewForTime(migrated.simulationState.simulationTime)));
  assert.deepEqual(migrated.responderSkills, skills);
  assert.deepEqual(migrated.simulationState.rngStreams, rng);
});

test("all public responder names use the Engr, Tech, or Optr convention and no Crew label leaks", () => {
  const state = createLiveSeed();
  assert.equal(state.responders.length, 24);
  assert.ok(state.responders.every((row) => /^(Engr|Tech|Optr)\d{3}$/.test(row.name)));
  assert.equal(state.responders.find((row) => row.id === "R-OPER088").name, "Optr088");
  assert.equal(state.responders.find((row) => row.id === "R-OPER142").name, "Optr142");
  assert.ok(!JSON.stringify(state).includes("Crew "));
});

test("four crew 2-2-3 calendar has exactly one normal crew on every day and night boundary", () => {
  const anchor = Date.parse("2026-08-31T08:00:00.000Z");
  const seen = new Set();
  for (let boundary = 0; boundary < 28; boundary += 1) seen.add(crewForTime(new Date(anchor + boundary * 12 * 3_600_000).toISOString()));
  assert.deepEqual([...seen].sort(), ["A", "B", "C", "D"]);
});

test("missed staffing and handover boundaries replay chronologically at immutable effective timestamps", () => {
  const state = createLiveSeed();
  state.simulationState.status = "RUNNING";
  state.simulationState.simulationTime = "2026-09-01T21:42:00.000Z";
  const triggers = claimWorkforceDueTriggers(state);
  assert.deepEqual(triggers.filter((entry) => ["STAFFING_REVIEW_DUE", "SHIFT_HANDOVER_DUE"].includes(entry.kind)).map((entry) => [entry.kind, entry.effectiveAt]), [
    ["STAFFING_REVIEW_DUE", "2026-09-01T18:00:00.000Z"],
    ["SHIFT_HANDOVER_DUE", "2026-09-01T20:00:00.000Z"],
  ]);
  for (const trigger of triggers) applyWorkforceTrigger(state, trigger);
  const handover = state.workforceContinuity.handovers.at(-1);
  assert.equal(handover.simulationTimestamp, "2026-09-01T20:00:00.000Z");
  assert.equal(handover.outgoingCrew, "A");
  assert.equal(handover.incomingCrew, "B");
  assert.equal(state.responders.filter((entry) => entry.availability !== "UNAVAILABLE").length, 6);
  assert.ok(state.responders.filter((entry) => entry.availability !== "UNAVAILABLE").every((entry) => entry.crewId === "B"));
  // The seed's own scripted issue (ISS-103, held by a crew-A responder) has
  // no lawful survivor on its roster, but crew B has free capacity -- it
  // must be handed to a free crew-B responder, not dropped or left with an
  // off-duty holder.
  const iss103 = state.issues.find((entry) => entry.id === "ISS-103");
  const previousHolder = state.responders.find((entry) => entry.id === "R-OPER142");
  assert.equal(iss103.status, "ASSIGNED");
  assert.notEqual(iss103.assignedResponderId, previousHolder.id);
  assert.equal(state.responders.find((entry) => entry.id === iss103.assignedResponderId)?.crewId, "B");
  assert.equal(previousHolder.availability, "UNAVAILABLE");
  validateLiveState({ ...state, schemaVersion: "2.1" });
});

test("a released PRIMARY promotes a surviving lawful SUPPORT instead of orphaning the issue", () => {
  const state = createLiveSeed();
  state.simulationState.status = "RUNNING";
  state.issues = [];
  state.assignments = [];
  state.resolutionAttempts = [];
  for (const responder of state.responders) { responder.availability = "AVAILABLE"; delete responder.currentIssueId; }
  const normalCrew = crewForTime(state.simulationState.simulationTime);
  const offDutyPrimary = state.responders.find((row) => row.crewId !== normalCrew);
  const onDutySupport = state.responders.find((row) => row.crewId === normalCrew && row.id !== offDutyPrimary.id);
  withActiveAssignment(state, { responder: offDutyPrimary, issueId: "ISS-PRIMARY-SUPPORT", role: "PRIMARY", otherRoster: [onDutySupport] });
  withActiveAssignment(state, { responder: onDutySupport, issueId: "ISS-PRIMARY-SUPPORT", role: "SUPPORT" });
  reconcileWorkforceDuty(state, { reason: "TEST_HANDOVER" });
  const issue = state.issues.find((row) => row.id === "ISS-PRIMARY-SUPPORT");
  assert.equal(issue.status, "ASSIGNED");
  assert.equal(issue.assignedResponderId, onDutySupport.id);
  const primaryAssignment = state.assignments.find((row) => row.responderId === offDutyPrimary.id && row.issueId === issue.id);
  const supportAssignment = state.assignments.find((row) => row.responderId === onDutySupport.id && row.issueId === issue.id);
  assert.equal(primaryAssignment.status, "RELEASED");
  assert.equal(supportAssignment.status, "ACTIVE");
  assert.equal(supportAssignment.role, "PRIMARY");
  assert.ok(state.workforceContinuity.handovers.some((entry) => entry.reason === "QUEUED_HANDOVER" && entry.outgoingResponderId === offDutyPrimary.id));
  validateLiveState({ ...state, schemaVersion: "2.1" });
});

test("a fully off-duty roster with no free lawful responder is deferred, not dropped or fabricated", () => {
  const state = createLiveSeed();
  state.simulationState.status = "RUNNING";
  // Clear the seed's own scripted assignment so this fixture starts from a
  // clean roster instead of double-booking its scripted responder.
  state.issues = [];
  state.assignments = [];
  state.resolutionAttempts = [];
  for (const responder of state.responders) { responder.availability = "AVAILABLE"; delete responder.currentIssueId; }
  const normalCrew = crewForTime(state.simulationState.simulationTime);
  const offDutyResponder = state.responders.find((row) => row.crewId !== normalCrew);
  // Occupy every lawful (on-duty) responder so no replacement is available.
  const onDutyResponders = state.responders.filter((row) => row.crewId === normalCrew);
  onDutyResponders.forEach((responder, index) => withActiveAssignment(state, { responder, issueId: `ISS-BUSY-${index}` }));
  withActiveAssignment(state, { responder: offDutyResponder, issueId: "ISS-STRANDED" });
  const attemptsBefore = structuredClone(state.resolutionAttempts.find((row) => row.issueId === "ISS-STRANDED"));
  reconcileWorkforceDuty(state, { reason: "TEST_HANDOVER" });
  const issue = state.issues.find((row) => row.id === "ISS-STRANDED");
  const assignment = state.assignments.find((row) => row.issueId === "ISS-STRANDED");
  assert.equal(issue.status, "ASSIGNED");
  assert.equal(issue.assignedResponderId, offDutyResponder.id);
  assert.equal(assignment.status, "ACTIVE");
  assert.equal(offDutyResponder.availability, "ASSIGNED");
  assert.deepEqual(state.resolutionAttempts.find((row) => row.issueId === "ISS-STRANDED"), attemptsBefore);
  assert.ok(state.workforceContinuity.handovers.some((entry) => entry.reason === "HANDOVER_DEFERRED_NO_REPLACEMENT" && entry.issueId === "ISS-STRANDED"));
  validateLiveState({ ...state, schemaVersion: "2.1" });
});

test("cancelling an off-duty ASSISTANCE offer never disturbs the already-ASSIGNED issue it supports", () => {
  const state = createLiveSeed();
  state.simulationState.status = "RUNNING";
  state.issues = [];
  state.assignments = [];
  state.resolutionAttempts = [];
  state.dispatchOffers = [];
  for (const responder of state.responders) { responder.availability = "AVAILABLE"; delete responder.currentIssueId; }
  const normalCrew = crewForTime(state.simulationState.simulationTime);
  const onDutyPrimary = state.responders.find((row) => row.crewId === normalCrew);
  const offDutyCandidate = state.responders.find((row) => row.crewId !== normalCrew);
  const attempt = withActiveAssignment(state, { responder: onDutyPrimary, issueId: "ISS-ASSIST", role: "PRIMARY" });
  attempt.assistance = { status: "REQUESTED", generation: 1, trigger: "OPERATOR_REQUEST", cooldownUntil: null };
  const now = state.simulationState.simulationTime;
  offDutyCandidate.availability = "OFFERED";
  offDutyCandidate.currentOfferId = "offer-assist-1";
  const issue = state.issues.find((row) => row.id === "ISS-ASSIST");
  issue.pendingOfferId = "offer-assist-1";
  issue.offeredResponderId = offDutyCandidate.id;
  state.dispatchOffers.push({ id: "offer-assist-1", recommendationId: "rec-1", issueId: "ISS-ASSIST", responderId: offDutyCandidate.id,
    rank: 1, status: "PENDING", purpose: "ASSISTANCE", slot: "SUPPORT", createdAt: now,
    responseDueAt: new Date(Date.parse(now) + 30_000).toISOString(), responseDueToken: "offer-response-1", responseDispatchToken: null,
    acceptanceProbability: 0.8 });
  reconcileWorkforceDuty(state, { reason: "TEST_HANDOVER" });
  const reconciledIssue = state.issues.find((row) => row.id === "ISS-ASSIST");
  const offer = state.dispatchOffers.find((row) => row.id === "offer-assist-1");
  assert.equal(offer.status, "CANCELLED");
  assert.equal(reconciledIssue.status, "ASSIGNED");
  assert.equal(reconciledIssue.assignedResponderId, onDutyPrimary.id);
  const primaryAssignment = state.assignments.find((row) => row.issueId === "ISS-ASSIST");
  assert.equal(primaryAssignment.status, "ACTIVE");
  assert.equal(state.resolutionAttempts.find((row) => row.issueId === "ISS-ASSIST").assistance.status, "NONE");
  validateLiveState({ ...state, schemaVersion: "2.1" });
});

test("queue selection is deterministic, critical work precedes lower bands, and aging promotes work", () => {
  const state = createLiveSeed();
  state.issues = [
    { id: "ISS-STANDARD", status: "PENDING", complexity: "STANDARD", productionImpact: 10, raisedAt: "2026-09-01T07:55:00.000Z" },
    { id: "ISS-CRITICAL", status: "PENDING", complexity: "STANDARD", productionImpact: 90, raisedAt: "2026-09-01T07:59:00.000Z" },
  ];
  assert.equal(activeIssueCount(state), 2);
  assert.equal(priorityForIssue(state.issues[0], state.simulationState.simulationTime), "STANDARD");
  assert.equal(selectNextQueuedIssue(state).issue.id, "ISS-CRITICAL");
});

test("staffing and handover triggers are claimable once and honor rest before call-in", () => {
  const state = createLiveSeed();
  state.simulationState.status = "RUNNING";
  state.simulationState.simulationTime = "2026-09-01T18:00:00.000Z";
  for (let i = 0; i < 8; i += 1) state.issues.push({ id: `ISS-Q${i}`, status: "PENDING", issueClass: "A", complexity: "STANDARD", raisedAt: state.simulationState.simulationTime });
  const triggers = claimWorkforceDueTriggers(state);
  assert.equal(triggers.filter((entry) => entry.kind === "STAFFING_REVIEW_DUE").length, 1);
  assert.equal(claimWorkforceDueTriggers(state).length, 0);
  const pending = createStaffingReview(state, triggers[0]);
  assert.equal(pending.status, 'PENDING');
  assert.equal(state.responders.some((r)=>r.surgeKind), false);
  const rec = state.workforceContinuity.staffingRecommendations[0];
  assert.equal(decideStaffing(state, rec.id, {decision:'approve',optionId:rec.rankedOptions[0].optionId,expectedRevision:rec.revision}).status, 'APPROVED_TOP');
  const extended = state.responders.find((row) => row.surgeKind === "EXTENSION");
  assert.ok(extended?.extensionEndsAt);
  extended.availability = "UNAVAILABLE";
  extended.lastDutyEndedAt = state.simulationState.simulationTime;
  state.workforceContinuity.nextStaffingReviewAt = state.simulationState.simulationTime;
  const again = claimWorkforceDueTriggers(state).find((entry) => entry.kind === "STAFFING_REVIEW_DUE");
  createStaffingReview(state, again);
  assert.equal(extended.availability, "UNAVAILABLE");
});

test("temporary repair recurrence is a dedicated obligation and recovers after the issue cap", () => {
  const state = createLiveSeed();
  state.simulationState.status = "RUNNING";
  state.workforceContinuity.temporaryRepairs.push({ id: "repair-1", token: "temporary-repair-due-1", equipmentId: "EQ-01", issueClass: "A", status: "SCHEDULED", dueAt: state.simulationState.simulationTime });
  const trigger = claimWorkforceDueTriggers(state).find((entry) => entry.kind === "TEMPORARY_REPAIR_RECURRENCE_DUE");
  assert.equal(applyWorkforceTrigger(state, trigger).status, "RECURRENCE_RAISED");
  assert.equal(state.issues.at(-1).recurrenceContext, "TEMPORARY_REPAIR");
  assert.equal(state.operationalEvents.at(-1).eventType, "ISSUE_RAISED");
  assert.equal(state.operationalEvents.at(-1).source, "WORKFORCE_CONTINUITY");
});

test("extension expiry is claimable and ends idle surge duty without touching assignments", () => {
  const state = createLiveSeed();
  state.simulationState.status = "RUNNING";
  const responder = state.responders.find((row) => row.availability === "AVAILABLE");
  responder.surgeKind = "EXTENSION";
  responder.extensionEndsAt = state.simulationState.simulationTime;
  const trigger = claimWorkforceDueTriggers(state).find((entry) => entry.kind === "EXTENSION_EXPIRY_DUE");
  assert.equal(applyWorkforceTrigger(state, trigger).status, "EXTENSION_ENDED");
  assert.equal(responder.availability, "UNAVAILABLE");
  assert.equal(state.assignments.filter((entry) => entry.status === "ACTIVE").length, 1);
});
