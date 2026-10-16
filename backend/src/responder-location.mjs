/**
 * Event-snapshot responder location model. Locations change only when an
 * operational mutation changes where someone is working; there is no pretend
 * second-by-second tracking.
 */
function nextId(entries, prefix) {
  const highest = entries.reduce((max, entry) => Math.max(max, Number(new RegExp(`^${prefix}-(\\d+)$`).exec(entry.id)?.[1] ?? 0)), 0);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

function ensureDutyStation(responder) {
  responder.dutyStation ??= { x: responder.x, y: responder.y, floor: responder.floor };
  return responder.dutyStation;
}

function offsetFor(responderId, role) {
  const value = [...responderId].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, role === "SUPPORT" ? 17 : 7);
  const angle = (value % 8) * (Math.PI / 4);
  const distance = role === "SUPPORT" ? 13 : 10;
  return { x: Math.round(Math.cos(angle) * distance), y: Math.round(Math.sin(angle) * distance) };
}

function appendSnapshot(state, responder, issue, from, reason) {
  state.operationalEvents ??= [];
  const simulationTimestamp = state.simulationState?.simulationTime ?? null;
  state.operationalEvents.push({
    id: nextId(state.operationalEvents, "event"),
    simulationTimestamp,
    eventType: "RESPONDER_MOVED",
    equipmentId: issue?.equipmentId ?? null,
    issueId: issue?.id ?? null,
    responderId: responder.id,
    source: "LOCATION_ENGINE",
    payload: { reason, from, to: { x: responder.x, y: responder.y, floor: responder.floor } },
    // A location snapshot is simulation-owned, so its audit timestamp is
    // deterministic and survives an exact Offline reset.
    createdAtRealTime: simulationTimestamp,
  });
}

export function moveResponderToIssue(state, responder, issue, role = "PRIMARY", reason = "ASSIGNMENT") {
  const equipment = state.equipment.find((entry) => entry.id === issue?.equipmentId);
  if (!responder || !issue || !equipment) return false;
  ensureDutyStation(responder);
  const from = { x: responder.x, y: responder.y, floor: responder.floor };
  const offset = offsetFor(responder.id, role);
  responder.x = equipment.x + offset.x;
  responder.y = equipment.y + offset.y;
  responder.floor = equipment.floor;
  if (from.x === responder.x && from.y === responder.y && from.floor === responder.floor) return false;
  appendSnapshot(state, responder, issue, from, reason);
  return true;
}

export function returnResponderToDutyStation(state, responder, reason = "ASSIGNMENT_ENDED") {
  if (!responder) return false;
  const station = ensureDutyStation(responder);
  const from = { x: responder.x, y: responder.y, floor: responder.floor };
  responder.x = station.x;
  responder.y = station.y;
  responder.floor = station.floor;
  if (from.x === responder.x && from.y === responder.y && from.floor === responder.floor) return false;
  appendSnapshot(state, responder, null, from, reason);
  return true;
}

/** Bring legacy/current active assignments into the same snapshot convention. */
export function reconcileResponderLocations(state) {
  for (const responder of state.responders) ensureDutyStation(responder);
  for (const assignment of state.assignments.filter((entry) => entry.status === "ACTIVE")) {
    moveResponderToIssue(state, state.responders.find((entry) => entry.id === assignment.responderId), state.issues.find((entry) => entry.id === assignment.issueId), assignment.role, "STATE_RECONCILIATION");
  }
  return state;
}
