import assert from "node:assert/strict";
import test from "node:test";
import { appendFile, mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveStore } from "../src/live-store.mjs";
import { createLiveDraft, freezeLiveState } from "../src/live-draft.mjs";
import { readDurableLiveState, readLiveCheckpoint, applyLivePatches } from "../src/live-journal.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { initializeFaults } from "../src/fault-truth.mjs";

async function room() {
  const directory = await mkdtemp(join(tmpdir(), "compass-journal-"));
  return join(directory, "live.json");
}
const speed = (value) => (state) => { state.simulationState.speedMultiplier = value; };

test("an acknowledged mutation survives a restart without a checkpoint", async () => {
  const filePath = await room();
  const store = createLiveStore({ filePath, checkpointEvery: 1_000 });
  await store.mutate("speed", speed(5));
  await store.mutate("status", (state) => { state.simulationState.status = "RUNNING"; });
  const reopened = await createLiveStore({ filePath }).snapshot();
  assert.equal(reopened.simulationState.speedMultiplier, 5);
  assert.equal(reopened.simulationState.status, "RUNNING");
  assert.equal(reopened.revision, 2);
  // The checkpoint file alone is still the older state: the journal carried the change.
  assert.equal((await readLiveCheckpoint(filePath)).state.revision, 0);
});

test("a torn final journal frame is discarded and earlier mutations are kept", async () => {
  const filePath = await room();
  const store = createLiveStore({ filePath, checkpointEvery: 1_000 });
  await store.mutate("speed", speed(5));
  await appendFile(`${filePath}.journal`, '{"payload":"{\\"version\\":1,\\"base');
  const reopened = await createLiveStore({ filePath }).snapshot();
  assert.equal(reopened.revision, 1);
  assert.equal(reopened.simulationState.speedMultiplier, 5);
  // Recovery trims the torn tail so the next append starts on a clean line.
  assert.ok((await readFile(`${filePath}.journal`, "utf8")).endsWith("\n"));
});

test("a complete but corrupted journal frame fails closed instead of loading bad state", async () => {
  const filePath = await room();
  const store = createLiveStore({ filePath, checkpointEvery: 1_000 });
  await store.mutate("speed", speed(5));
  const journal = await readFile(`${filePath}.journal`, "utf8");
  await writeFile(`${filePath}.journal`, journal.replace('\\"speedMultiplier\\"', '\\"speedMultiplieX\\"'));
  await assert.rejects(createLiveStore({ filePath }).snapshot(), /checksum mismatch/);
});

test("a crash after the checkpoint rename but before the journal is cleared replays nothing twice", async () => {
  const filePath = await room();
  const store = createLiveStore({ filePath, checkpointEvery: 1_000 });
  await store.mutate("speed", speed(5));
  await store.mutate("speed-again", speed(10));
  const journal = await readFile(`${filePath}.journal`, "utf8");
  await store.checkpoint();
  // Simulate the crash window: the checkpoint is published, the old journal survives.
  await writeFile(`${filePath}.journal`, journal);
  const reopened = await createLiveStore({ filePath }).snapshot();
  assert.equal(reopened.revision, 2);
  assert.equal(reopened.simulationState.speedMultiplier, 10);
});

test("checkpoints compact the journal after the configured number of mutations", async () => {
  const filePath = await room();
  const store = createLiveStore({ filePath, checkpointEvery: 3 });
  for (const value of [1, 5, 10]) await store.mutate(`speed-${value}`, speed(value));
  assert.equal((await stat(`${filePath}.journal`)).size, 0);
  assert.equal((await readLiveCheckpoint(filePath)).state.revision, 3);
  assert.equal((await readDurableLiveState(filePath)).simulationState.speedMultiplier, 10);
});

test("an existing pre-journal room file loads unchanged", async () => {
  const filePath = await room();
  const legacy = initializeFaults(createLiveSeed());
  legacy.revision = 41;
  legacy.simulationState.speedMultiplier = 5;
  await writeFile(filePath, `${JSON.stringify(legacy)}\n`);
  const loaded = await createLiveStore({ filePath }).snapshot();
  assert.equal(loaded.revision, 41);
  assert.equal(loaded.simulationState.speedMultiplier, 5);
});

test("replaying journal patches reproduces the published state exactly", () => {
  const base = freezeLiveState(structuredClone(initializeFaults(createLiveSeed())));
  const transaction = createLiveDraft(base);
  transaction.draft.simulationState.speedMultiplier = 10;
  transaction.draft.issues.push({ ...structuredClone(base.issues[0]), id: "ISS-999" });
  transaction.draft.issues[0].status = "PENDING";
  delete transaction.draft.simulationState.speedMultiplier;
  const { state, patches } = transaction.finish();
  assert.deepEqual(applyLivePatches(structuredClone(base), patches), state);
  // Unchanged history is shared, not copied.
  assert.equal(state.resolutionHistory, base.resolutionHistory);
});

test("published snapshots are frozen, so a caller cannot corrupt shared state", async () => {
  const store = createLiveStore({ filePath: await room() });
  const snapshot = await store.snapshot();
  assert.throws(() => { snapshot.simulationState.speedMultiplier = 60; }, TypeError);
  assert.notEqual((await store.snapshot()).simulationState.speedMultiplier, 60);
});
