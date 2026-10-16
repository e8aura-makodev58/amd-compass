/**
 * The list of Control Rooms this deployment hosts. Hardcoded and frozen for
 * v1 — see Control_Rooms_SOW_v1_DRAFT.md §4.1 and §9. A writable registry
 * opens real lifecycle questions (validation, atomic updates, deletion,
 * renames, ID stability, duplicate IDs) that are administrator functionality,
 * not required infrastructure for this MVP.
 *
 * Consumers must only ever call listRooms()/getRoom() — never read
 * ROOM_DESCRIPTORS directly — so swapping this for a file-backed list later
 * is a one-module change with zero consumer changes.
 */

const ROOM_DESCRIPTORS = Object.freeze([
  Object.freeze({ id: "plant-1", label: "e8-aura-p1" }),
  Object.freeze({ id: "plant-2", label: "e8-aura-p2" }),
]);

// Every existing top-level /api/* route segment. A registry room id must
// never equal one of these, or it could silently shadow a real route once
// nested under /api/control-rooms/:id — asserted at manager construction
// time (control-room-manager.mjs), not just checked here once.
export const RESERVED_ROOM_IDS = Object.freeze([
  "settings", "logs", "mode", "simulation", "issues", "responders", "events",
  "analytics", "compass", "assignments", "audit", "state", "reset", "control-rooms",
]);

export function listRooms() {
  return ROOM_DESCRIPTORS;
}

export function getRoom(id) {
  return ROOM_DESCRIPTORS.find((room) => room.id === id) ?? null;
}
