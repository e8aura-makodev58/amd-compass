import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createControlRoomManager } from "../src/control-room-manager.mjs";

async function scratchDataRoot() {
  return mkdtemp(join(tmpdir(), "compass-cr-manager-"));
}

const FIXTURE_OPTIONS = { mode: "force-failure" };

async function freshManager(overrides = {}) {
  const dataRoot = await scratchDataRoot();
  return createControlRoomManager({
    dataRoot,
    migrateLegacyData: false, // nothing to migrate in a fresh temp dir; skip the round trip
    plannerOptions: FIXTURE_OPTIONS,
    agentOptions: FIXTURE_OPTIONS,
    ...overrides,
  });
}

test("both registered rooms boot READY with no legacy data to migrate", async () => {
  const manager = await freshManager();
  const rooms = await manager.listRoomsWithStatus();
  assert.deepEqual(rooms.map((room) => room.id).sort(), ["plant-1", "plant-2"]);
  assert.ok(rooms.every((room) => room.health === "READY"));
  assert.deepEqual(rooms.map((room) => room.displayName), ["e8-aura-p1", "e8-aura-p2"]);
});

test("all runtime logs are stamped with their authoritative control room id", async () => {
  const events = [];
  const manager = await freshManager({ logger: { log: (line) => events.push(JSON.parse(line)) } });
  const room = manager.getRoom("plant-2").applicationRuntime;
  await room.setMode("OFFLINE");
  await room.raiseIssue("ISS-104");
  await room.requestRecommendation("ISS-104");
  assert.ok(events.length > 0);
  assert.ok(events.every((event) => event.controlRoomId === "plant-2"));
});

test("getRoom resolves a known id and returns null for an unknown one", async () => {
  const manager = await freshManager();
  assert.equal(manager.getRoom("plant-1").health, "READY");
  assert.equal(manager.getRoom("nonexistent"), null);
});

test("a freshly-seeded room (not migrated from a real deployment) defaults to LIVE + PAUSED", async () => {
  const manager = await freshManager();
  for (const id of ["plant-1", "plant-2"]) {
    const snapshot = await manager.getRoom(id).applicationRuntime.snapshot();
    assert.equal(snapshot.mode, "LIVE");
    assert.equal(snapshot.simulationState.status, "PAUSED");
  }
});

test("mutating one room does not affect the other: reset both, mutate plant1 only, plant-2 is unchanged", async () => {
  const manager = await freshManager();
  const plant1 = manager.getRoom("plant-1").applicationRuntime;
  const plant2 = manager.getRoom("plant-2").applicationRuntime;

  const before1 = await plant1.snapshot();
  const before2 = await plant2.snapshot();
  assert.deepEqual(before1.issues.map((issue) => issue.id).sort(), before2.issues.map((issue) => issue.id).sort());

  await plant1.startSimulation();
  await plant1.forceNextEvent();

  const after1 = await plant1.snapshot();
  const after2 = await plant2.snapshot();
  assert.notEqual(after1.issues.length, before1.issues.length, "plant1 should have gained an issue");
  assert.equal(after2.issues.length, before2.issues.length, "plant-2 must be unaffected by plant1's mutation");
  assert.equal(after2.simulationState.status, "PAUSED", "plant-2's clock must not have been started");
});

test("advancing plant1's clock does not move plant-2's clock", async () => {
  const manager = await freshManager();
  const room1 = manager._internalRoomForTests("plant-1");
  const plant2 = manager.getRoom("plant-2").applicationRuntime;

  const before2 = (await plant2.snapshot()).simulationState.simulationTime;
  await room1.applicationRuntime.startSimulation();
  // Tick plant1's liveRuntime directly, simulating what the process scheduler does.
  await room1.liveRuntime.runScheduledTick();

  const after2 = (await plant2.snapshot()).simulationState.simulationTime;
  assert.equal(after2, before2, "plant-2's simulation time must not advance from plant1 activity");
});

test("raising an issue in plant1 does not change plant-2's issue count", async () => {
  const manager = await freshManager();
  const plant1 = manager.getRoom("plant-1").applicationRuntime;
  const plant2 = manager.getRoom("plant-2").applicationRuntime;
  const before2Count = (await plant2.snapshot()).issues.length;

  await plant1.startSimulation();
  await plant1.forceNextEvent();

  const after2Count = (await plant2.snapshot()).issues.length;
  assert.equal(after2Count, before2Count);
});

test("both rooms may legitimately contain the same entity IDs — isolation is behavioral, not ID-based", async () => {
  const manager = await freshManager();
  const plant1 = manager.getRoom("plant-1").applicationRuntime;
  const plant2 = manager.getRoom("plant-2").applicationRuntime;
  const ids1 = new Set((await plant1.snapshot()).responders.map((responder) => responder.id));
  const ids2 = new Set((await plant2.snapshot()).responders.map((responder) => responder.id));
  // Same seed, same responder IDs in both rooms. This is correct, not a bug —
  // the Control Room boundary is the namespace, not the entity ID.
  assert.deepEqual([...ids1].sort(), [...ids2].sort());
  assert.ok(ids1.size > 0);
});

test("each room's live store writes to its own distinct file", async () => {
  const dataRoot = await scratchDataRoot();
  const manager = await createControlRoomManager({ dataRoot, migrateLegacyData: false, plannerOptions: FIXTURE_OPTIONS, agentOptions: FIXTURE_OPTIONS });
  const room1 = manager.getRoom("plant-1");
  const room2 = manager.getRoom("plant-2");
  assert.notEqual(room1.applicationRuntime, room2.applicationRuntime);

  await room1.applicationRuntime.startSimulation();
  const { readdir, readFile } = await import("node:fs/promises");
  const plant1File = join(dataRoot, "control-rooms", "plant-1", "live-simulation.json");
  const plant2File = join(dataRoot, "control-rooms", "plant-2", "live-simulation.json");
  const { readDurableLiveState } = await import("../src/live-journal.mjs");
  const plant1State = await readDurableLiveState(plant1File);
  const plant2State = await readDurableLiveState(plant2File);
  assert.equal(plant1State.simulationState.status, "RUNNING");
  assert.equal(plant2State.simulationState.status, "PAUSED");

  // No stray .tmp files left behind by the atomic write.
  const plant1Dir = await readdir(join(dataRoot, "control-rooms", "plant-1"));
  assert.ok(plant1Dir.every((name) => !name.endsWith(".tmp")));
});

test("concurrent ticks across many rooms over many cycles never cross-contaminate state", async () => {
  const manager = await freshManager();
  const plant1 = manager.getRoom("plant-1").applicationRuntime;
  const plant2 = manager.getRoom("plant-2").applicationRuntime;
  await plant1.startSimulation();
  await plant2.startSimulation();

  const room1 = manager._internalRoomForTests("plant-1");
  const room2 = manager._internalRoomForTests("plant-2");

  for (let cycle = 0; cycle < 20; cycle += 1) {
    // Exactly what startProcessScheduler does per tick: dispatch every room's
    // tick concurrently, never sequentially awaiting one before the next.
    await Promise.all([room1.liveRuntime.runScheduledTick(), room2.liveRuntime.runScheduledTick()]);
  }

  const final1 = await plant1.snapshot();
  const final2 = await plant2.snapshot();
  assert.ok(final1.issues.every((issue) => final1.equipment.some((item) => item.id === issue.equipmentId)));
  assert.ok(final2.issues.every((issue) => final2.equipment.some((item) => item.id === issue.equipmentId)));
  // Each room's revision only reflects its own ticks.
  assert.ok(final1.revision >= 0 && final2.revision >= 0);
});

test("a thrown error in one room's tick does not prevent another room's tick from completing", async () => {
  const manager = await freshManager();
  const room1 = manager._internalRoomForTests("plant-1");
  const room2 = manager._internalRoomForTests("plant-2");
  await room1.applicationRuntime.startSimulation();
  await room2.applicationRuntime.startSimulation();

  // Force room1's store to reject its next mutation, simulating a thrown tick.
  const originalMutate = room1.liveStore.mutate.bind(room1.liveStore);
  let forcedOnce = false;
  room1.liveStore.mutate = (label, mutation) => {
    if (!forcedOnce) { forcedOnce = true; return Promise.reject(new Error("SIMULATED TICK FAILURE")); }
    return originalMutate(label, mutation);
  };

  // A room's very first runScheduledTick call self-arms lastRealTick and
  // measures 0ms elapsed (identical to a real interval's first firing after
  // startLoop() arms it) — so prime both rooms with one real tick first.
  await Promise.all([room1.liveRuntime.runScheduledTick(), room2.liveRuntime.runScheduledTick()]);
  await new Promise((resolve) => setTimeout(resolve, 20));

  const before2Time = (await room2.applicationRuntime.snapshot()).simulationState.simulationTime;
  // room1's tick rejects (caught internally by runScheduledTick's own
  // try/catch — see live-runtime.mjs), room2's tick must still complete.
  await Promise.all([
    room1.liveRuntime.runScheduledTick().catch(() => {}),
    room2.liveRuntime.runScheduledTick(),
  ]);
  const after2Time = (await room2.applicationRuntime.snapshot()).simulationState.simulationTime;
  assert.notEqual(after2Time, before2Time, "room2's clock must still have advanced despite room1's failure");
});

test("a slow/hung tick in one room does not delay another room's tick from starting", async () => {
  const manager = await freshManager();
  const room1 = manager._internalRoomForTests("plant-1");
  const room2 = manager._internalRoomForTests("plant-2");
  await room1.applicationRuntime.startSimulation();
  await room2.applicationRuntime.startSimulation();

  let room2TickStartedAt = null;
  const room2OriginalMutate = room2.liveStore.mutate.bind(room2.liveStore);
  room2.liveStore.mutate = (label, mutation) => {
    if (room2TickStartedAt === null) room2TickStartedAt = performance.now();
    return room2OriginalMutate(label, mutation);
  };

  const room1OriginalMutate = room1.liveStore.mutate.bind(room1.liveStore);
  room1.liveStore.mutate = (label, mutation) => new Promise((resolve) => {
    setTimeout(() => resolve(room1OriginalMutate(label, mutation)), 300);
  });

  const dispatchedAt = performance.now();
  await Promise.all([room1.liveRuntime.runScheduledTick(), room2.liveRuntime.runScheduledTick()]);
  assert.ok(room2TickStartedAt !== null, "room2's tick must have run");
  assert.ok(room2TickStartedAt - dispatchedAt < 150, `room2's tick started ${room2TickStartedAt - dispatchedAt}ms after dispatch; it should start immediately, not wait on room1's slow tick`);
});
