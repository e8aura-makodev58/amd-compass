/**
 * Wraps a single already-constructed runtime (an ApplicationRuntime, or a
 * bare Offline runtime for tests that only exercise Offline-only routes) as
 * a manager-shaped object, so existing pre-Control-Rooms tests can keep
 * constructing their runtime exactly as before and only need to adapt how
 * they call createRequestHandler and which URL they hit — never their
 * actual assertions. See Control_Rooms_SOW_v1_DRAFT.md CR-WP3's acceptance
 * criterion: "assertions pass unmodified... constructed through the manager
 * ... instead of the old direct calls."
 */
export function wrapRuntimeAsSingleRoomManager(runtime, { id = "plant-1", label = "Plant #1", health = "READY" } = {}) {
  return {
    getRoom(requestedId) {
      if (requestedId !== id) return null;
      return { id, label, health, reason: null, applicationRuntime: runtime };
    },
    async listRoomsWithStatus() {
      if (health !== "READY") return [{ id, label, health }];
      const snapshot = await runtime.snapshot();
      return [{ id, label, health: "READY", mode: snapshot.mode, simulationStatus: snapshot.simulationState?.status ?? null }];
    },
  };
}

/** `/api/control-rooms/<id>` + the rest of the path, e.g. "/state" -> full URL. */
export function roomUrl(path, id = "plant-1") {
  return `/api/control-rooms/${id}${path}`;
}
