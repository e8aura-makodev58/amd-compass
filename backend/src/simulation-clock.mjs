import { originalLength } from "./history-retention.mjs";
/** Persistent v4 simulation clock. Real time is supplied explicitly by the
 * runtime loop; loading this module or reopening the store never advances it. */

const SPEEDS = new Set([1, 5, 10, 60]);

function simulationMilliseconds(state) {
  const value = Date.parse(state.simulationState.simulationTime);
  if (Number.isNaN(value)) throw new Error("Simulation time is invalid");
  return value;
}

function eventId(state) {
  return `event-${String(originalLength(state, "operationalEvents") + 1).padStart(3, "0")}`;
}

function appendEvent(state, eventType, payload = {}) {
  state.operationalEvents.push({
    id: eventId(state),
    simulationTimestamp: state.simulationState.simulationTime,
    eventType,
    source: "SIMULATION_CLOCK",
    payload,
    createdAtRealTime: new Date().toISOString(),
  });
}

export function advanceSimulationTime(state, realElapsedMilliseconds) {
  if (!Number.isFinite(realElapsedMilliseconds) || realElapsedMilliseconds < 0) {
    throw new Error("Real elapsed time must be a non-negative finite number");
  }
  if (state.simulationState.status !== "RUNNING" || realElapsedMilliseconds === 0) return state.simulationState.simulationTime;
  const next = simulationMilliseconds(state) + realElapsedMilliseconds * state.simulationState.speedMultiplier;
  state.simulationState.simulationTime = new Date(next).toISOString();
  return state.simulationState.simulationTime;
}

export function createSimulationClock(store) {
  return {
    async start() {
      return store.mutate("simulation-start", (state) => {
        if (state.simulationState.status !== "RUNNING") {
          state.simulationState.status = "RUNNING";
          appendEvent(state, "SIMULATION_STARTED");
        }
        return state.simulationState;
      });
    },
    async pause() {
      return store.mutate("simulation-pause", (state) => {
        if (state.simulationState.status === "RUNNING") {
          state.simulationState.status = "PAUSED";
          appendEvent(state, "SIMULATION_PAUSED");
        }
        return state.simulationState;
      });
    },
    async resume() {
      return store.mutate("simulation-resume", (state) => {
        if (state.simulationState.status !== "RUNNING") {
          state.simulationState.status = "RUNNING";
          appendEvent(state, "SIMULATION_RESUMED");
        }
        return state.simulationState;
      });
    },
    async setSpeed(speedMultiplier) {
      if (!SPEEDS.has(speedMultiplier)) throw new Error("Simulation speed must be 1, 5, 10, or 60");
      return store.mutate("simulation-speed", (state) => {
        state.simulationState.speedMultiplier = speedMultiplier;
        return state.simulationState;
      });
    },
    async tick(realElapsedMilliseconds) {
      return store.mutate("simulation-tick", (state) => ({
        simulationTime: advanceSimulationTime(state, realElapsedMilliseconds),
        status: state.simulationState.status,
      }));
    },
  };
}
