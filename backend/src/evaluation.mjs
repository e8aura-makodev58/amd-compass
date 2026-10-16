import { calculateNaiveScore } from "./context-engine.mjs";
import { createEventPlanningService } from "./event-planner.mjs";
import { createLiveAssignmentService } from "./live-assignment-service.mjs";
import { createLiveRecommendationService } from "./live-recommendation-service.mjs";
import { createResolutionEngine } from "./resolution-engine.mjs";
import { createScheduler } from "./scheduler.mjs";
import { createSimulationClock } from "./simulation-clock.mjs";

const evidencePenalty = { NONE: 45, WEAK: 32, MODERATE: 8, STRONG: 0 };

export function deterministicEvaluationOutcome(packet) {
  let ranked = [...packet.candidates].sort((left, right) => {
    const leftScore = calculateNaiveScore(left) - evidencePenalty[left.evidenceStrengthLabel];
    const rightScore = calculateNaiveScore(right) - evidencePenalty[right.evidenceStrengthLabel];
    return rightScore - leftScore || left.responderId.localeCompare(right.responderId);
  });
  const sequence = Number(packet.recommendationRequestId.match(/(\d+)$/)?.[1] ?? 0);
  const naive = [...packet.candidates].sort((a, b) => calculateNaiveScore(b) - calculateNaiveScore(a))[0];
  if (sequence % 4 === 0) {
    const evidenceAlternative = ranked.find((candidate) => candidate.responderId !== naive.responderId && candidate.evidenceStrengthLabel !== naive.evidenceStrengthLabel);
    if (evidenceAlternative) ranked = [evidenceAlternative, ...ranked.filter((candidate) => candidate !== evidenceAlternative)];
  }
  const top = ranked[0];
  const alternative = ranked[1];
  const result = {
    schemaVersion: "1.0",
    recommendationRequestId: packet.recommendationRequestId,
    rankedCandidates: ranked.map((candidate, index) => ({
      rank: index + 1,
      responderId: candidate.responderId,
      recommendationSummary: candidate.evidenceStrengthLabel === "STRONG" ? "Observed same-issue evidence is strongly supported." : "Observed same-issue evidence carries meaningful uncertainty.",
      evidenceReferences: ["evidenceStrength", "sameIssuePerformance", "travelTime"],
      ...(index === 0 ? { tradeoff: { comparedToResponderId: alternative.responderId, explanation: "The recommendation favors better-supported issue evidence over a less established signal." } } : {}),
    })),
    topRecommendation: { responderId: top.responderId, rationale: "This responder offers the strongest balance after accounting for how well the observed evidence is supported." },
    uncertaintyNote: "Runtime outcomes may change the evidence available to future decisions.",
  };
  return { status: "ok", result, modelInfo: { provider: "deterministic-evaluation", modelId: "evidence-policy-v1", mode: "evaluation" } };
}

export async function runDeterministicSoak(store, opportunities = 100) {
  const resolution = createResolutionEngine(store);
  const scheduler = createScheduler(store, { onResolutionDue: (trigger) => resolution.handleResolutionDue(trigger) });
  const clock = createSimulationClock(store);
  const planner = createEventPlanningService(store, { requestProposal: async () => ({ status: "unavailable", reason: "evaluation-fallback" }) });
  const recommendations = createLiveRecommendationService(store, { requestRecommendation: async (packet) => deterministicEvaluationOutcome(packet) });
  const assignments = createLiveAssignmentService(store);
  await clock.start();
  await scheduler.forceResolve("ISS-103");

  for (let index = 0; index < opportunities; index += 1) {
    await clock.setSpeed(index < opportunities / 2 ? 60 : 10);
    await clock.tick(1_000);
    let state = await store.snapshot();
    let issue = state.issues.find((entry) => entry.status === "PENDING");
    if (!issue) {
      const planned = await planner.handleEventDue({ kind: "EVENT_DUE", token: `evaluation-due-${index + 1}`, forced: true, simulationTimestamp: state.simulationState.simulationTime });
      if (planned.result.status !== "PERSISTED") throw new Error(`Evaluation could not create opportunity ${index + 1}`);
      state = await store.snapshot();
      issue = state.issues.find((entry) => entry.id === planned.result.issueId);
    }
    const recommendation = await recommendations.recommend(issue.id);
    if (recommendation.result.status !== "READY") throw new Error(`Evaluation recommendation ${index + 1} was not ready`);
    const decided = await assignments.decideRecommendation({
      recommendationId: recommendation.result.recommendationId,
      responderId: recommendation.result.topResponderId,
      decision: "CONFIRMED",
    });
    if (decided.result.status !== "ASSIGNED") throw new Error(`Evaluation assignment ${index + 1} failed`);
    await scheduler.forceResolve(issue.id);
  }

  const state = await store.snapshot();
  const completed = state.recommendations.filter((entry) => entry.agentResult && entry.disagreement);
  const disagreements = completed.filter((entry) => !entry.disagreement.naiveAgreement);
  const evidenceDriven = disagreements.filter((entry) => entry.disagreement.evidenceStrengthDriven);
  const activeAssignments = state.assignments.filter((entry) => entry.status === "ACTIVE");
  return {
    opportunities: completed.length,
    disagreementCount: disagreements.length,
    disagreementRate: disagreements.length / completed.length,
    evidenceDrivenDisagreementCount: evidenceDriven.length,
    evidenceDrivenShare: disagreements.length ? evidenceDriven.length / disagreements.length : 0,
    operationalEventCount: state.operationalEvents.length,
    resolutionHistoryCount: state.resolutionHistory.length,
    activeIssueCount: state.issues.filter((entry) => entry.status !== "RESOLVED").length,
    activeAssignmentCount: activeAssignments.length,
    duplicateActiveResponderCount: activeAssignments.length - new Set(activeAssignments.map((entry) => entry.responderId)).size,
    finalRevision: state.revision,
  };
}

export function runLatentConvergence(skill, { observations = 2_000, seed = 42 } = {}) {
  let rng = seed >>> 0;
  const random = () => { rng = (Math.imul(1_664_525, rng) + 1_013_904_223) >>> 0; return rng / 0x1_0000_0000; };
  const times = [];
  let successes = 0;
  for (let index = 0; index < observations; index += 1) {
    times.push(skill.trueMedianMinutes * (0.75 + random() * 0.55));
    if (random() < skill.trueSuccessProbability) successes += 1;
  }
  times.sort((a, b) => a - b);
  const midpoint = Math.floor(times.length / 2);
  const observedMedian = times.length % 2 ? times[midpoint] : (times[midpoint - 1] + times[midpoint]) / 2;
  return { observations, observedMedian, observedSuccessRate: successes / observations };
}
