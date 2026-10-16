import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveStore } from "../src/live-store.mjs";
import { createSimulationClock } from "../src/simulation-clock.mjs";

async function createClockFixture() {
  const directory = await mkdtemp(join(tmpdir(), "compass-clock-"));
  const filePath = join(directory, "live.json");
  const store = createLiveStore({ filePath });
  return { filePath, store, clock: createSimulationClock(store) };
}

test("paused simulation never advances and start/pause/resume persist operational events", async () => {
  const { store, clock } = await createClockFixture();
  const initial = await store.snapshot();
  await clock.tick(60_000);
  assert.equal((await store.snapshot()).simulationState.simulationTime, initial.simulationState.simulationTime);
  await clock.start();
  await clock.tick(60_000);
  assert.equal((await store.snapshot()).simulationState.simulationTime, "2026-09-01T08:01:00.000Z");
  await clock.pause();
  await clock.tick(60_000);
  const paused = await store.snapshot();
  assert.equal(paused.simulationState.simulationTime, "2026-09-01T08:01:00.000Z");
  assert.deepEqual(paused.operationalEvents.slice(-2).map((event) => event.eventType), ["SIMULATION_STARTED", "SIMULATION_PAUSED"]);
  await clock.resume();
  assert.equal((await store.snapshot()).operationalEvents.at(-1).eventType, "SIMULATION_RESUMED");
});

test("all allowed speed changes preserve explicit clock ordering", async () => {
  const { store, clock } = await createClockFixture();
  await clock.start();
  for (const speed of [1, 5, 10, 60]) {
    await clock.setSpeed(speed);
    await clock.tick(1_000);
  }
  assert.equal((await store.snapshot()).simulationState.simulationTime, "2026-09-01T08:01:16.000Z");
  await assert.rejects(() => clock.setSpeed(2), /speed/);
});

test("a restarted store resumes persisted simulation time without wall-clock catch-up", async () => {
  const { filePath, clock } = await createClockFixture();
  await clock.start();
  await clock.tick(42_000);
  const reopenedStore = createLiveStore({ filePath });
  const reopened = await reopenedStore.snapshot();
  assert.equal(reopened.simulationState.simulationTime, "2026-09-01T08:00:42.000Z");
  // No tick was supplied to the reopened store: elapsed real wall time is ignored.
  assert.equal((await reopenedStore.snapshot()).simulationState.simulationTime, "2026-09-01T08:00:42.000Z");
});
