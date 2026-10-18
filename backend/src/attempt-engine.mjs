import { ensureIssueFault, faultEffect } from './fault-truth.mjs';
import { selectAttemptFix } from './fix-evidence.mjs';
import { originalLength } from "./history-retention.mjs";
import { getPerformanceSummary } from "./context-engine.mjs";

export const ATTEMPT_MODEL_VERSION = "team-resolution-v1";
export const TEAM_SYNERGY = 0.60;
export const TEAM_SUCCESS_CAP = 0.98;
const MAX_HISTORY_WEIGHT = 0.30;
const FULL_HISTORY_COUNT = 8;

function nextRandom(state) {
  const current = state.simulationState.rngStreams.attempt;
  const next = (Math.imul(1_664_525, current) + 1_013_904_223) >>> 0;
  state.simulationState.rngStreams.attempt = next;
  return next / 0x1_0000_0000;
}

function skillFor(state, responderId, issueClass) {
  const skill = state.responderSkills.find((row) => row.responderId === responderId && row.issueClass === issueClass);
  if (!skill) throw new Error(`Hidden responder skill is missing for ${responderId}/${issueClass}`);
  return skill;
}

export function internalOutcomeProfile(state, responderId, issueClass) {
  const skill = skillFor(state, responderId, issueClass);
  const observed = getPerformanceSummary(state.resolutionHistory, responderId, issueClass);
  const historyWeight = MAX_HISTORY_WEIGHT * Math.min(observed.effectiveEvidenceWeight / FULL_HISTORY_COUNT, 1);
  return {
    medianMinutes: skill.trueMedianMinutes * (1 - historyWeight) + (observed.medianResolutionMinutes ?? skill.trueMedianMinutes) * historyWeight,
    successProbability: skill.trueSuccessProbability * (1 - historyWeight) + (observed.successRate ?? skill.trueSuccessProbability) * historyWeight,
  };
}

export function teamRate(profiles) {
  const rates = profiles.map((profile) => 1 / profile.medianMinutes).sort((a, b) => b - a);
  return rates.length === 1 ? rates[0] : rates[0] + TEAM_SYNERGY * rates[1];
}

export function teamProbability(profiles) {
  if (profiles.length === 1) return profiles[0].successProbability;
  const high = Math.max(...profiles.map((profile) => profile.successProbability));
  const low = Math.min(...profiles.map((profile) => profile.successProbability));
  return Math.min(TEAM_SUCCESS_CAP, high + TEAM_SYNERGY * low * (1 - high));
}

function effectiveRates(profiles) {
  if (profiles.length === 1) return [1 / profiles[0].medianMinutes];
  const raw = profiles.map((profile, index) => ({ index, rate: 1 / profile.medianMinutes })).sort((a, b) => b.rate - a.rate);
  const result = [];
  result[raw[0].index] = raw[0].rate;
  result[raw[1].index] = TEAM_SYNERGY * raw[1].rate;
  return result;
}

function token(prefix, attempt) {
  return `${prefix}-${attempt.id}-${attempt.scheduleGeneration}`;
}

export function activeRoster(state, issueId) {
  return state.assignments.filter((row) => row.issueId === issueId && row.status === "ACTIVE");
}

export function openRosterSegment(state, attempt, at = state.simulationState.simulationTime) {
  const issue = state.issues.find((row) => row.id === attempt.issueId);
  const roster = activeRoster(state, attempt.issueId).sort((a, b) => a.role.localeCompare(b.role));
  if (!issue || roster.length === 0) return null;
  const profiles = roster.map((row) => internalOutcomeProfile(state, row.responderId, issue.issueClass));
  const effect = attempt.fixApplied ? faultEffect(state, issue, attempt.fixApplied.id) : { durationMultiplier: 1, successMultiplier: 1 };
  const rates = effectiveRates(profiles).map((rate) => rate / effect.durationMultiplier);
  const segment = {
    id: `${attempt.id}-segment-${attempt.segments.length + 1}`,
    startedAt: at,
    endedAt: null,
    roster: roster.map((row, index) => ({ responderId: row.responderId, role: row.role, effectiveRate: rates[index] })),
    teamRate: rates.reduce((sum, value) => sum + value, 0),
    successProbability: Math.min(TEAM_SUCCESS_CAP, Math.max(0, teamProbability(profiles) * effect.successMultiplier)),
    workCompleted: 0,
  };
  attempt.segments.push(segment);
  return segment;
}

export function settleAttempt(state, attempt, at = state.simulationState.simulationTime, { completeRemaining = false } = {}) {
  const segment = attempt.segments.at(-1);
  if (!segment || segment.endedAt) return 0;
  const elapsed = Math.max(0, (Date.parse(at) - Date.parse(segment.startedAt)) / 60_000);
  const remaining = Math.max(0, attempt.workTotal - attempt.completedWork);
  const work = completeRemaining ? remaining : Math.min(remaining, elapsed * segment.teamRate);
  segment.workCompleted += work;
  attempt.completedWork = Math.min(attempt.workTotal, attempt.completedWork + work);
  for (const member of segment.roster) {
    const share = segment.teamRate > 0 ? member.effectiveRate / segment.teamRate : 0;
    attempt.participantWork[member.responderId] = (attempt.participantWork[member.responderId] ?? 0) + work * share;
  }
  segment.endedAt = at;
  return work;
}

export function replanAttempt(state, attempt, { at = state.simulationState.simulationTime, openSegment = true } = {}) {
  attempt.scheduleGeneration += 1;
  attempt.resolutionDueAt = null;
  attempt.resolutionDueToken = null;
  attempt.resolutionDispatchToken = null;
  attempt.resolutionDispatchForced = false;
  if (openSegment) openRosterSegment(state, attempt, at);
  const segment = attempt.segments.at(-1);
  if (segment && !segment.endedAt) {
    const remainingMinutes = Math.max(0, attempt.workTotal - attempt.completedWork) / segment.teamRate;
    // Round up to the next millisecond: a due time truncated early would leave
    // a sliver of work unfinished when the resolution fires.
    attempt.resolutionDueAt = new Date(Math.ceil(Date.parse(at) + remainingMinutes * 60_000)).toISOString();
    attempt.resolutionDueToken = token("resolution", attempt);
  }
  return attempt;
}

export function createAttempt(state, issueId) {
  const faultIssue = state.issues.find((row) => row.id === issueId);
  ensureIssueFault(state, faultIssue);
  const fix = selectAttemptFix(state, faultIssue);
  const id = `attempt-${String(originalLength(state, "resolutionAttempts") + 1).padStart(3, "0")}`;
  const durationFactor = 0.70 + nextRandom(state) * 0.60;
  const attempt = {
    id, issueId, ...fix, modelVersion: ATTEMPT_MODEL_VERSION, status: "ACTIVE",
    startedAt: state.simulationState.simulationTime, completedAt: null,
    durationFactor, successDraw: nextRandom(state), workTotal: durationFactor, completedWork: 0,
    participantWork: {}, segments: [], rosterVersion: 1, scheduleGeneration: 0,
    resolutionDueAt: null, resolutionDueToken: null, resolutionDispatchToken: null,
    resolutionDispatchForced: false,
    assistance: { status: "NONE", generation: 0, trigger: null, cooldownUntil: null },
    reviewDueAt: null, reviewDueToken: null, reviewDispatchToken: null,
  };
  state.resolutionAttempts.push(attempt);
  replanAttempt(state, attempt);
  const initialSegment = attempt.segments.at(-1);
  attempt.initialPlannedCompletionAt = new Date(Date.parse(attempt.startedAt) + (1 / initialSegment.teamRate) * 60_000).toISOString();
  const issue = state.issues.find((row) => row.id === issueId);
  if (issue?.complexity === "STANDARD") {
    const midpoint = Date.parse(attempt.startedAt) + (Date.parse(attempt.initialPlannedCompletionAt) - Date.parse(attempt.startedAt)) / 2;
    attempt.reviewDueAt = new Date(midpoint).toISOString();
    attempt.reviewDueToken = `assistance-review-${attempt.id}-${attempt.scheduleGeneration}`;
  }
  return attempt;
}

export function attemptProbability(attempt) {
  const worked = attempt.segments.filter((segment) => segment.workCompleted > 0);
  const total = worked.reduce((sum, segment) => sum + segment.workCompleted, 0);
  return total === 0 ? 0 : worked.reduce((sum, segment) => sum + segment.successProbability * segment.workCompleted, 0) / total;
}

export function contributionShares(attempt) {
  const total = Object.values(attempt.participantWork).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(attempt.participantWork).map(([id, value]) => [id, total > 0 ? value / total : 0]));
}

export function redactAttempt(attempt) {
  const { durationFactor, successDraw, workTotal, completedWork, participantWork, segments, resolutionDueToken, resolutionDispatchToken, resolutionDispatchForced, reviewDueToken, reviewDispatchToken, ...safe } = structuredClone(attempt);
  return safe;
}
