import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createControlRoomManager } from "../src/control-room-manager.mjs";

const FIXTURE_OPTIONS = { mode: "force-failure" };

test("the Control Rooms data-root override refuses to boot outside NODE_ENV=test", async () => {
  const dataRoot = await scratchDataRoot();
  const serverPath = new URL("../src/server.mjs", import.meta.url);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath.pathname], {
      env: { ...process.env, NODE_ENV: "production", COMPASS_CONTROL_ROOMS_DATA_ROOT: dataRoot, COMPASS_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
  assert.equal(result.code, 1);
  assert.match(result.output, /test-only and requires NODE_ENV=test/);
});

async function scratchDataRoot() {
  return mkdtemp(join(tmpdir(), "compass-cr-health-"));
}

test("plant1 gets the same LIVE+PAUSED fresh-room default as plant-2 when there is no legacy data to migrate at all", async () => {
  // A genuinely fresh install (e.g. a new dev environment) has no legacy file
  // anywhere — plant1 is not "the migrated room" here, it is just as
  // freshly-seeded as plant-2. The manager decides whether to apply the
  // fresh-room default by asking "does this room have real prior-deployment
  // data behind it", not "is this room literally named plant1" — an earlier
  // version checked the id instead, which happened to produce the same
  // observable result ONLY because createLiveSeed() already defaults to
  // PAUSED. That made the id-based bug currently unobservable through this
  // assertion alone; it exists to guard the correct condition going forward,
  // not because it caught a live behavioral difference today.
  const dataRoot = await scratchDataRoot();
  const manager = await createControlRoomManager({ dataRoot, migrateLegacyData: true, plannerOptions: FIXTURE_OPTIONS, agentOptions: FIXTURE_OPTIONS });
  for (const id of ["plant-1", "plant-2"]) {
    const snapshot = await manager.getRoom(id).applicationRuntime.snapshot();
    assert.equal(snapshot.mode, "LIVE", `${id} should be LIVE`);
    assert.equal(snapshot.simulationState.status, "PAUSED", `${id} should default to PAUSED with no real prior deployment data`);
  }
});

test("plant1 preserves a real migrated RUNNING state instead of being forced to PAUSED", async () => {
  const { readFile, writeFile: writeJson } = await import("node:fs/promises");
  const dataRoot = await scratchDataRoot();
  // Build one valid seed via a throwaway manager, then hand-edit its status
  // to RUNNING and place it at the legacy top-level path, simulating a real
  // accumulated deployment whose clock was left running.
  const seedRoot = await scratchDataRoot();
  await createControlRoomManager({ dataRoot: seedRoot, migrateLegacyData: false, plannerOptions: FIXTURE_OPTIONS, agentOptions: FIXTURE_OPTIONS });
  const seeded = JSON.parse(await readFile(join(seedRoot, "control-rooms", "plant-1", "live-simulation.json"), "utf8"));
  seeded.simulationState.status = "RUNNING";
  await writeJson(join(dataRoot, "live-simulation.json"), JSON.stringify(seeded));

  const manager = await createControlRoomManager({ dataRoot, migrateLegacyData: true, plannerOptions: FIXTURE_OPTIONS, agentOptions: FIXTURE_OPTIONS });
  const plant1Snapshot = await manager.getRoom("plant-1").applicationRuntime.snapshot();
  assert.equal(plant1Snapshot.simulationState.status, "RUNNING", "real migrated state must not be silently paused");
});

test("a migration conflict leaves plant1 FAILED without preventing plant-2 from booting READY", async () => {
  const dataRoot = await scratchDataRoot();
  // Set up the exact MIGRATION_CONFLICT condition: both a legacy file and an
  // already-existing plant1 destination file.
  await writeFile(join(dataRoot, "live-simulation.json"), '{"marker":"legacy"}');
  await mkdir(join(dataRoot, "control-rooms", "plant-1"), { recursive: true });
  await writeFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), '{"marker":"destination"}');

  const manager = await createControlRoomManager({ dataRoot, plannerOptions: FIXTURE_OPTIONS, agentOptions: FIXTURE_OPTIONS });

  const plant1 = manager.getRoom("plant-1");
  assert.equal(plant1.health, "FAILED");
  assert.match(plant1.reason, /Migration conflict/);
  assert.equal(plant1.applicationRuntime, undefined, "a FAILED room must not expose a runtime to route handlers");

  const plant2 = manager.getRoom("plant-2");
  assert.equal(plant2.health, "READY");
  assert.ok(await plant2.applicationRuntime.snapshot());

  // Neither conflicting file was touched.
  const { readFile } = await import("node:fs/promises");
  const legacy = JSON.parse(await readFile(join(dataRoot, "live-simulation.json"), "utf8"));
  const destination = JSON.parse(await readFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), "utf8"));
  assert.equal(legacy.marker, "legacy");
  assert.equal(destination.marker, "destination");
});

test("listRoomsWithStatus reports a FAILED room's health without a mode/simulationStatus (it has no runtime)", async () => {
  const dataRoot = await scratchDataRoot();
  await writeFile(join(dataRoot, "live-simulation.json"), '{"marker":"legacy"}');
  await mkdir(join(dataRoot, "control-rooms", "plant-1"), { recursive: true });
  await writeFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), '{"marker":"destination"}');

  const manager = await createControlRoomManager({ dataRoot, plannerOptions: FIXTURE_OPTIONS, agentOptions: FIXTURE_OPTIONS });
  const rooms = await manager.listRoomsWithStatus();
  const plant1Entry = rooms.find((room) => room.id === "plant-1");
  const plant2Entry = rooms.find((room) => room.id === "plant-2");

  assert.equal(plant1Entry.health, "FAILED");
  assert.equal(plant1Entry.mode, undefined);
  assert.equal(plant1Entry.simulationStatus, undefined);
  assert.equal(plant2Entry.health, "READY");
  assert.equal(plant2Entry.mode, "LIVE");
  assert.equal(plant2Entry.simulationStatus, "PAUSED");
});

test("a corrupted (unparsable) state file for one room leaves that room FAILED and the other room unaffected", async () => {
  const dataRoot = await scratchDataRoot();
  await mkdir(join(dataRoot, "control-rooms", "plant-1"), { recursive: true });
  await writeFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), "{ this is not valid JSON");

  const manager = await createControlRoomManager({ dataRoot, migrateLegacyData: false, plannerOptions: FIXTURE_OPTIONS, agentOptions: FIXTURE_OPTIONS });
  const plant1 = manager.getRoom("plant-1");
  const plant2 = manager.getRoom("plant-2");

  assert.equal(plant1.health, "FAILED");
  assert.ok(plant1.reason && plant1.reason.length > 0);
  assert.equal(plant2.health, "READY");
  assert.ok(await plant2.applicationRuntime.snapshot());
});

test("a request against an unknown room id and a request against a FAILED room id are distinguishable outcomes", async () => {
  const dataRoot = await scratchDataRoot();
  await mkdir(join(dataRoot, "control-rooms", "plant-1"), { recursive: true });
  await writeFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), "{ not valid json");
  const manager = await createControlRoomManager({ dataRoot, migrateLegacyData: false, plannerOptions: FIXTURE_OPTIONS, agentOptions: FIXTURE_OPTIONS });

  assert.equal(manager.getRoom("nonexistent-room"), null);
  const failedRoom = manager.getRoom("plant-1");
  assert.notEqual(failedRoom, null);
  assert.equal(failedRoom.health, "FAILED");
});
