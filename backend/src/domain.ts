/**
 * Canonical, application-owned domain contracts for Compass.
 * Model-facing contracts deliberately exclude availability and coordinates.
 */

export const AVAILABILITY = ["AVAILABLE", "OFFERED", "UNAVAILABLE", "ASSIGNED"] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const ISSUE_STATUS = [
  "PENDING",
  "RECOMMENDATION_READY",
  "OFFER_PENDING",
  "ASSIGNED",
  "RESOLVED",
] as const;
export type IssueStatus = (typeof ISSUE_STATUS)[number];

export const EVIDENCE_STRENGTH = ["NONE", "WEAK", "MODERATE", "STRONG"] as const;
export type EvidenceStrengthLabel = (typeof EVIDENCE_STRENGTH)[number];

export interface Position {
  x: number;
  y: number;
  /**
   * Building floor, 1..3. Same-floor distance stays planar; each floor changed
   * adds a fixed transit cost to travel time. Optional only so that states
   * persisted before the building existed still type-check before migration.
   */
  floor?: 1 | 2 | 3;
}

export interface Equipment extends Position {
  id: string;
  name: string;
  status: "NORMAL" | "ISSUE_ACTIVE" | "ATTENTION_REQUIRED" | "OFFLINE";
}

export interface Responder extends Position {
  id: string;
  name: string;
  availability: Availability;
  currentIssueId?: string;
  currentOfferId?: string;
}

export interface Issue {
  id: string;
  equipmentId: string;
  issueClass: "A" | "B" | "C";
  existingPriority: "LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED";
  status: IssueStatus;
  raisedAt: string;
  createdAt?: string;
  downtimeStartedAt?: string;
  description?: string;
  responseAction?: string;
  assignedResponderId?: string;
  pendingOfferId?: string;
  offeredResponderId?: string;
  rematchNotBefore?: string;
  resolvedAt?: string;
  reopenCount?: number;
  complexity: "STANDARD" | "COMPLEX";
}

export interface ResolutionHistory {
  id: string;
  issueId?: string;
  assignmentId?: string;
  responderId: string;
  issueClass: "A" | "B" | "C";
  resolutionMinutes: number;
  success: boolean;
  reopened: boolean;
  resolvedAt: string;
  actionTaken?: string;
  attemptId: string;
  assisted: boolean;
  participants: Array<{
    responderId: string;
    roleIntervals: Array<{ role: "PRIMARY" | "SUPPORT"; joinedAt: string | null; endedAt: string | null }>;
    participationMinutes: number;
    contributionShare: number;
  }>;
}

export interface CandidateEvidence {
  responderId: string;
  displayName: string;
  distanceToIssue: number;
  travelTimeMinutes: number;
  sameIssueHistoricalCount: number;
  effectiveEvidenceWeight: number;
  soloHistoricalCount: number;
  assistedHistoricalCount: number;
  medianResolutionMinutes: number | null;
  successRate: number | null;
  reopenRate: number | null;
  evidenceStrengthLabel: EvidenceStrengthLabel;
}

export interface CandidatePacket {
  schemaVersion: "1.0";
  recommendationRequestId: string;
  issue: Pick<Issue, "issueClass" | "existingPriority"> & {
    issueId: string;
    equipmentId: string;
  };
  candidates: CandidateEvidence[];
  purpose?: "INITIAL_ASSIGNMENT" | "ASSISTANCE";
  currentRoster?: Array<{ responderId: string; role: "PRIMARY" | "SUPPORT" }>;
  assistanceTrigger?: "COMPLEX_ISSUE" | "BEHIND_PLAN" | "OPERATOR_REQUEST";
}

export interface AgentRankedCandidate {
  rank: number;
  responderId: string;
  recommendationSummary: string;
  evidenceReferences: string[];
  tradeoff: {
    comparedToResponderId: string;
    explanation: string;
  };
}

export interface ModelInfo {
  provider: string;
  modelId: string;
  mode: string;
  reasoningEffort?: string;
}

export interface BaselineConfig {
  version: string;
  formula: string;
  weights: Record<string, number>;
  noHistoryPolicy: { successRate: number; medianResolutionMinutes: number };
}

export interface RecommendationDisagreement {
  nearestWinner: string;
  naiveWinner: string;
  compassWinner: string;
  nearestAgreement: boolean;
  naiveAgreement: boolean;
  primaryTradeoffDimension: string;
  evidenceStrengthDriven: boolean;
}

export interface AgentResult {
  schemaVersion: "1.0";
  recommendationRequestId: string;
  rankedCandidates: AgentRankedCandidate[];
  topRecommendation: {
    responderId: string;
    rationale: string;
  };
  uncertaintyNote: string;
}

export interface Recommendation {
  id: string;
  issueId: string;
  createdAt: string;
  requestedAtRevision: number;
  status: "PENDING_MODEL" | "READY" | "UNAVAILABLE" | "STALE";
  candidateEvidenceSnapshot: CandidateEvidence[];
  baselineConfig: BaselineConfig;
  nearestWinner: string;
  naiveWinner: string;
  nearestBaseline: CandidateEvidence;
  naiveScoreBaseline: CandidateEvidence;
  agentResult: AgentResult | null;
  modelInfo: ModelInfo | null;
  disagreement: RecommendationDisagreement | null;
  failureReason?: string;
  failureMessage?: string | null;
  dispatchStatus?: "OFFER_PENDING" | "EXHAUSTED";
  decision: "AUTO_ACCEPTED" | "CONFIRMED" | "OVERRIDDEN" | "STALE" | null;
  decisionResponderId?: string;
  acceptedResponderId?: string | null;
  decisionAt?: string;
  staleReason?: string;
  purpose: "INITIAL_ASSIGNMENT" | "ASSISTANCE";
  assistanceTrigger?: "COMPLEX_ISSUE" | "BEHIND_PLAN" | "OPERATOR_REQUEST" | null;
}

export interface DispatchOffer {
  id: string;
  recommendationId: string;
  issueId: string;
  responderId: string;
  rank: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  responseDueAt?: string | null;
  completedAt?: string;
  purpose: "INITIAL_ASSIGNMENT" | "ASSISTANCE";
  slot: "PRIMARY" | "SUPPORT";
}

export interface Assignment {
  id: string;
  issueId: string;
  responderId: string;
  createdAt: string;
  attemptId: string;
  role: "PRIMARY" | "SUPPORT";
  status: "ACTIVE" | "RELEASED" | "COMPLETED";
  joinedAt: string;
  endedAt: string | null;
  endReason: string | null;
  roleHistory: Array<{ role: "PRIMARY" | "SUPPORT"; startedAt: string; endedAt: string | null }>;
}

/** Internal timing/outcome fields are intentionally omitted from public contracts. */
export interface PublicResolutionAttempt {
  id: string;
  issueId: string;
  modelVersion: "team-resolution-v1";
  status: "ACTIVE" | "SUCCEEDED" | "FAILED";
  startedAt: string;
  completedAt: string | null;
  rosterVersion: number;
  scheduleGeneration: number;
  resolutionDueAt: string | null;
  initialPlannedCompletionAt: string | null;
  assistance: { status: "NONE" | "REQUESTED" | "WAITING" | "STAFFED" | "EXHAUSTED"; generation?: number; trigger: string | null; cooldownUntil?: string | null };
}

export interface OperationalEvent {
  id: string;
  simulationTimestamp: string;
  eventType: string;
  equipmentId?: string;
  issueId?: string;
  responderId?: string;
  source: string;
  payload: Record<string, unknown>;
  createdAtRealTime: string;
}
