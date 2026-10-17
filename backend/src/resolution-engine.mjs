import { attemptProbability, contributionShares, internalOutcomeProfile, replanAttempt, settleAttempt } from "./attempt-engine.mjs";
import { returnResponderToDutyStation } from "./responder-location.mjs";

function nextId(entries, prefix, highWater = 0) {
  const highest = entries.reduce((max, entry) => Math.max(max, Number(new RegExp(`^${prefix}-(\\d+)$`).exec(entry.id)?.[1] ?? 0)), highWater);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

export function buildResolutionOutcomeProfile(state, responderId, issueClass) {
  const profile = internalOutcomeProfile(state, responderId, issueClass);
  const records = state.resolutionHistory.filter((record) => record.issueClass === issueClass && (record.responderId === responderId || record.participants?.some((row) => row.responderId === responderId)));
  const effective = records.reduce((sum, record) => sum + (record.participants?.find((row) => row.responderId === responderId)?.contributionShare ?? 1), 0);
  const historyWeight = 0.3 * Math.min(effective / 8, 1);
  return { ...profile, historicalSampleCount: records.length, historyWeight, skillWeight: 1 - historyWeight };
}

export function scheduleResolutionAttempt(state, assignment) {
  return state.resolutionAttempts.find((attempt) => attempt.id === assignment.attemptId) ?? null;
}

function appendEvent(state, eventType, issue, responderId, payload) {
  state.operationalEvents.push({ id: nextId(state.operationalEvents, "event", state.historyRetention?.highWater?.operationalEvents ?? 0), simulationTimestamp: state.simulationState.simulationTime,
    eventType, equipmentId: issue.equipmentId, issueId: issue.id, responderId, source: "RESOLUTION_ENGINE", payload,
    createdAtRealTime: new Date().toISOString() });
}

export function finalizeResolutionAttemptState(state, attempt, forced = false) {
  const issue = state.issues.find((row) => row.id === attempt.issueId);
  const equipment = state.equipment.find((row) => row.id === issue.equipmentId);
  for (const offer of (state.dispatchOffers ?? []).filter((row) => row.issueId === issue.id && row.status === "PENDING")) {
    offer.status = "CANCELLED"; offer.completedAt = state.simulationState.simulationTime; offer.responseDueAt = null; offer.responseDueToken = null; offer.responseDispatchToken = null;
    const responder = state.responders.find((row) => row.id === offer.responderId);
    if (responder?.availability === "OFFERED" && responder.currentOfferId === offer.id) { responder.availability = "AVAILABLE"; delete responder.currentOfferId; }
    appendEvent(state, "ASSIGNMENT_OFFER_CANCELLED", issue, offer.responderId, { offerId: offer.id, reason: forced ? "FORCE_RESOLVE" : "ISSUE_COMPLETED" });
  }
  delete issue.pendingOfferId; delete issue.offeredResponderId;
  settleAttempt(state, attempt, state.simulationState.simulationTime, { completeRemaining: forced });
  if (attempt.completedWork + 1e-9 < attempt.workTotal) {
    // settleAttempt closed the segment. Reopen it with a fresh due time so the
    // attempt keeps progressing; otherwise it would stall until the next roster
    // change (often a shift handover hours later).
    replanAttempt(state, attempt);
    return { status: "NOT_COMPLETE", resolutionDueAt: attempt.resolutionDueAt };
  }
  const success = attempt.successDraw < attemptProbability(attempt);
  const assignments = state.assignments.filter((row) => row.attemptId === attempt.id);
  const active = assignments.filter((row) => row.status === "ACTIVE");
  const shares = contributionShares(attempt);
  const durationMinutes = Math.max(0, (Date.parse(state.simulationState.simulationTime) - Date.parse(attempt.startedAt)) / 60_000);
  const participantsByResponder = new Map();
  for (const row of assignments) {
    const participant = participantsByResponder.get(row.responderId) ?? { responderId: row.responderId, roleIntervals: [], participationMinutes: 0, contributionShare: shares[row.responderId] ?? 0 };
    participant.roleIntervals.push(...(row.roleHistory ?? [{ role: row.role, startedAt: row.joinedAt, endedAt: row.endedAt }]).map((interval) => ({ role: interval.role, joinedAt: interval.startedAt, endedAt: interval.endedAt ?? state.simulationState.simulationTime })));
    participant.participationMinutes += Math.max(0, (Date.parse(row.endedAt ?? state.simulationState.simulationTime) - Date.parse(row.joinedAt)) / 60_000);
    participantsByResponder.set(row.responderId, participant);
  }
  const participants = [...participantsByResponder.values()];
  const primary = active.find((row) => row.role === "PRIMARY") ?? [...assignments].reverse().find((row) => row.roleHistory?.at(-1)?.role === "PRIMARY");
  const actionTaken = issue.responseAction ?? "Inspect the affected process, apply the required correction, and verify stable operation.";
  const history = { id: nextId(state.resolutionHistory, "H", state.historyRetention?.highWater?.resolutionHistory ?? 0), issueId: issue.id, attemptId: attempt.id,
    responderId: primary?.responderId, issueClass: issue.issueClass, resolutionMinutes: durationMinutes, success,
    reopened: !success, resolvedAt: state.simulationState.simulationTime, actionTaken, assisted: participants.length > 1, participants };
  state.resolutionHistory.push(history);
  attempt.status = success ? "SUCCEEDED" : "FAILED"; attempt.completedAt = state.simulationState.simulationTime;
  attempt.resolutionDueAt = null; attempt.resolutionDueToken = null; attempt.resolutionDispatchToken = null;
  attempt.resolutionDispatchForced = false;
  attempt.reviewDueAt = null; attempt.reviewDueToken = null; attempt.reviewDispatchToken = null;
  for (const assignment of active) {
    assignment.status = "COMPLETED"; assignment.endedAt = state.simulationState.simulationTime;
    if (assignment.roleHistory?.at(-1) && !assignment.roleHistory.at(-1).endedAt) assignment.roleHistory.at(-1).endedAt = state.simulationState.simulationTime;
    assignment.endReason = success ? "ISSUE_RESOLVED" : "ATTEMPT_FAILED";
    const responder = state.responders.find((row) => row.id === assignment.responderId);
    responder.availability = "AVAILABLE"; delete responder.currentIssueId; returnResponderToDutyStation(state, responder, success ? "ISSUE_RESOLVED" : "ATTEMPT_FAILED");
  }
  delete issue.assignedResponderId;
  if (success) {
    issue.status = "RESOLVED"; issue.resolvedAt = state.simulationState.simulationTime; equipment.status = "NORMAL";
    // A dedicated durability stream creates a specific temporary-repair
    // obligation. It does not alter (or compound with) generic fallback
    // recurrence weighting in the event planner.
    const next = (Math.imul(1_664_525, state.simulationState.rngStreams.durability) + 1_013_904_223) >>> 0;
    state.simulationState.rngStreams.durability = next;
    const selectedScenario = state.workforceContinuity?.scenario?.selected;
    const effectiveScenario = selectedScenario === "AUTO" ? state.workforceContinuity?.scenario?.activeScenario : selectedScenario;
    const temporaryThreshold = effectiveScenario === "RECURRING_TEMPORARY_REPAIRS" ? 55 : 20;
    const temporary = next % 100 < temporaryThreshold;
    history.durability = temporary ? "TEMPORARY" : "DURABLE";
    if (temporary && state.workforceContinuity) {
      const id = `temporary-repair-${attempt.id}`;
      state.workforceContinuity.temporaryRepairs.push({ id, token: `temporary-repair-due-${state.workforceContinuity.temporaryRepairs.length + 1}`, issueId: issue.id, equipmentId: issue.equipmentId, issueClass: issue.issueClass, status: "SCHEDULED", dueAt: new Date(Date.parse(state.simulationState.simulationTime) + (30 + (next % 61)) * 60_000).toISOString() });
    }
    appendEvent(state, "ISSUE_RESOLVED", issue, primary?.responderId, { attemptId: attempt.id, resolutionMinutes: durationMinutes, success: true, forced, issueDescription: issue.description ?? null, actionTaken, participants: participants.map(({ responderId }) => ({ responderId })) });
  } else {
    issue.status = "PENDING"; issue.reopenCount = (issue.reopenCount ?? 0) + 1;
    appendEvent(state, "ISSUE_REOPENED", issue, primary?.responderId, { attemptId: attempt.id, resolutionMinutes: durationMinutes, success: false, forced, issueDescription: issue.description ?? null, actionTaken, participants: participants.map(({ responderId }) => ({ responderId })) });
  }
  return { status: success ? "RESOLVED" : "REOPENED", issueId: issue.id, responderId: primary?.responderId, historyId: history.id,
    pendingIssueIds: state.issues.filter((row) => row.status === "PENDING").map((row) => row.id) };
}

export function createResolutionEngine(store) {
  return { handleResolutionDue(trigger) { return store.mutate("resolution-attempt", (state) => {
    const attempt = state.resolutionAttempts.find((row) => row.id === trigger.attemptId);
    if (!attempt || attempt.status !== "ACTIVE") return { status: "DUPLICATE_OR_STALE" };
    if (attempt.scheduleGeneration !== trigger.generation || attempt.resolutionDispatchToken !== trigger.token) return { status: "TOKEN_MISMATCH" };
    return finalizeResolutionAttemptState(state, attempt, trigger.forced);
  }); } };
}
