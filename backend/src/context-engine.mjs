/**
 * Deterministic context engine.
 *
 * This module owns facts used by Compass: eligibility, geometry, historical
 * summaries, candidate packets, and both comparison baselines. It deliberately
 * contains no model calls and does not rank the Compass recommendation.
 */

export const SCHEMA_VERSION = "1.0";
export const WALKING_SPEED_METRES_PER_SECOND = 1.4;

/**
 * Minutes added for each floor a responder must change to reach the equipment.
 *
 * The building is three floors. Rather than model stairwell positions, a fixed
 * transit cost per floor is added on top of the planar walk. `distanceToIssue`
 * therefore stays a real same-floor distance in metres, and `travelTimeMinutes`
 * is the value that accounts for the whole journey.
 */
export const FLOOR_TRANSIT_MINUTES = 1.5;
export const BUILDING_FLOORS = 3;

/**
 * A deliberately simple comparator used only as a visible baseline.
 * It intentionally ignores evidence strength/sample count.
 */
export const NAIVE_SCORE_FORMULA =
  "(100 * successRate) - (2 * medianResolutionMinutes) - (3 * travelTimeMinutes)";
const NO_HISTORY_MEDIAN_MINUTES = 60;

function requireEntity(entity, description) {
  if (!entity) throw new Error(`${description} was not found`);
  return entity;
}

function requireFiniteNumber(value, description) {
  if (!Number.isFinite(value)) throw new TypeError(`${description} must be a finite number`);
  return value;
}

export function getIssue(state, issueId) {
  return requireEntity(state.issues.find((issue) => issue.id === issueId), `Issue ${issueId}`);
}

export function getEquipment(state, equipmentId) {
  return requireEntity(
    state.equipment.find((equipment) => equipment.id === equipmentId),
    `Equipment ${equipmentId}`,
  );
}

export function getAvailableResponders(state) {
  return state.responders.filter((responder) => responder.availability === "AVAILABLE");
}

export function calculateDistance(from, to) {
  const fromX = requireFiniteNumber(from?.x, "Origin x");
  const fromY = requireFiniteNumber(from?.y, "Origin y");
  const toX = requireFiniteNumber(to?.x, "Destination x");
  const toY = requireFiniteNumber(to?.y, "Destination y");
  return Math.hypot(fromX - toX, fromY - toY);
}

/** Number of floors between two positions. Absent floors are treated as floor one. */
export function calculateFloorDelta(from, to) {
  const fromFloor = from?.floor ?? 1;
  const toFloor = to?.floor ?? 1;
  requireFiniteNumber(fromFloor, "Origin floor");
  requireFiniteNumber(toFloor, "Destination floor");
  return Math.abs(fromFloor - toFloor);
}

export function calculateTravelTimeMinutes(distanceMetres, floorDelta = 0) {
  const distance = requireFiniteNumber(distanceMetres, "Distance");
  if (distance < 0) throw new RangeError("Distance cannot be negative");
  const floors = requireFiniteNumber(floorDelta, "Floor delta");
  if (floors < 0) throw new RangeError("Floor delta cannot be negative");
  return distance / WALKING_SPEED_METRES_PER_SECOND / 60 + floors * FLOOR_TRANSIT_MINUTES;
}

export function getEvidenceStrengthLabel(sampleCount) {
  if (!Number.isFinite(sampleCount) || sampleCount < 0) {
    throw new RangeError("Evidence weight must be a non-negative finite number");
  }
  if (sampleCount === 0) return "NONE";
  if (sampleCount <= 2) return "WEAK";
  if (sampleCount <= 5) return "MODERATE";
  return "STRONG";
}

export function getPerformanceSummary(resolutionHistory, responderId, issueClass) {
  const records = resolutionHistory
    .flatMap((record) => {
      if (record.issueClass !== issueClass) return [];
      const participant = record.participants?.find((row) => row.responderId === responderId);
      if (participant) return [{ ...record, evidenceWeight: participant.contributionShare, weightedMinutes: record.resolutionMinutes * participant.contributionShare }];
      return record.responderId === responderId ? [{ ...record, evidenceWeight: 1, weightedMinutes: record.resolutionMinutes }] : [];
    })
    .sort((left, right) => left.resolutionMinutes - right.resolutionMinutes);
  const sameIssueHistoricalCount = records.length;
  const effectiveEvidenceWeight = records.reduce((sum, record) => sum + record.evidenceWeight, 0);

  if (sameIssueHistoricalCount === 0) {
    return {
      sameIssueHistoricalCount,
      effectiveEvidenceWeight,
      soloHistoricalCount: 0,
      assistedHistoricalCount: 0,
      medianResolutionMinutes: null,
      successRate: null,
      reopenRate: null,
      evidenceStrengthLabel: getEvidenceStrengthLabel(effectiveEvidenceWeight),
    };
  }

  let medianResolutionMinutes;
  if (records.every((record) => record.evidenceWeight === 1)) {
    const midpoint = Math.floor(records.length / 2);
    medianResolutionMinutes = records.length % 2 ? records[midpoint].resolutionMinutes : (records[midpoint - 1].resolutionMinutes + records[midpoint].resolutionMinutes) / 2;
  } else {
    const targetWeight = effectiveEvidenceWeight / 2;
    let accumulated = 0;
    medianResolutionMinutes = records.find((record) => ((accumulated += record.evidenceWeight) >= targetWeight))?.resolutionMinutes ?? null;
  }
  const weightedSuccesses = records.reduce((sum, record) => sum + (record.success ? record.evidenceWeight : 0), 0);
  const weightedReopens = records.reduce((sum, record) => sum + (record.reopened ? record.evidenceWeight : 0), 0);

  return {
    sameIssueHistoricalCount,
    effectiveEvidenceWeight,
    soloHistoricalCount: records.filter((record) => !record.assisted).length,
    assistedHistoricalCount: records.filter((record) => record.assisted).length,
    medianResolutionMinutes,
    successRate: effectiveEvidenceWeight ? weightedSuccesses / effectiveEvidenceWeight : null,
    reopenRate: effectiveEvidenceWeight ? weightedReopens / effectiveEvidenceWeight : null,
    evidenceStrengthLabel: getEvidenceStrengthLabel(effectiveEvidenceWeight),
  };
}

export function buildCandidatePacket(state, issueId, recommendationRequestId) {
  if (!recommendationRequestId) throw new Error("A recommendation request ID is required");
  const issue = getIssue(state, issueId);
  const equipment = getEquipment(state, issue.equipmentId);
  const candidates = getAvailableResponders(state).map((responder) => {
    const distanceToIssue = calculateDistance(responder, equipment);
    const floorsToIssue = calculateFloorDelta(responder, equipment);
    return {
      responderId: responder.id,
      displayName: responder.name,
      distanceToIssue,
      floorsToIssue,
      travelTimeMinutes: calculateTravelTimeMinutes(distanceToIssue, floorsToIssue),
      ...getPerformanceSummary(state.resolutionHistory, responder.id, issue.issueClass),
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    recommendationRequestId,
    issue: {
      issueId: issue.id,
      equipmentId: equipment.id,
      issueClass: issue.issueClass,
      existingPriority: issue.existingPriority,
    },
    candidates,
  };
}

export function getNearestAvailableBaseline(state, issueId) {
  const packet = buildCandidatePacket(state, issueId, "baseline-nearest");
  if (packet.candidates.length === 0) return null;
  // Ranked on travel time, not planar distance: in a three-floor building the
  // physically closest responder on paper can be two floors away.
  return packet.candidates.reduce((nearest, candidate) =>
    candidate.travelTimeMinutes < nearest.travelTimeMinutes ? candidate : nearest,
  );
}

/**
 * This is intentionally not an optimizer. It is a fixed, inspectable
 * comparison that omits the evidence-strength adjustment Compass must weigh.
 */
export function calculateNaiveScore(candidate) {
  const successRate = candidate.successRate ?? 0;
  const medianResolutionMinutes = candidate.medianResolutionMinutes ?? NO_HISTORY_MEDIAN_MINUTES;
  return (
    100 * successRate -
    2 * medianResolutionMinutes -
    3 * candidate.travelTimeMinutes
  );
}

export function getNaiveScoreBaseline(state, issueId) {
  const packet = buildCandidatePacket(state, issueId, "baseline-naive-score");
  if (packet.candidates.length === 0) return null;
  return packet.candidates.reduce((winner, candidate) => {
    const candidateScore = calculateNaiveScore(candidate);
    const winnerScore = calculateNaiveScore(winner);
    return candidateScore > winnerScore ? candidate : winner;
  });
}
