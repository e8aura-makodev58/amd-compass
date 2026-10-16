import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLegacyControlRoomData, migrateRenamedControlRoomData } from "../src/control-room-migration.mjs";

async function scratchRoot() {
  return mkdtemp(join(tmpdir(), "compass-cr-migration-"));
}

test("a fresh install with no legacy files takes no action", async () => {
  const dataRoot = await scratchRoot();
  const result = await migrateLegacyControlRoomData({ dataRoot, roomId: "plant-1" });
  assert.equal(result.status, "OK");
  assert.ok(result.results.every((entry) => entry.status === "ABSENT"));
});

test("a legacy file present with no destination migrates via rename", async () => {
  const dataRoot = await scratchRoot();
  await writeFile(join(dataRoot, "live-simulation.json"), '{"revision":1}');
  const result = await migrateLegacyControlRoomData({ dataRoot, roomId: "plant-1" });
  assert.equal(result.status, "OK");
  const moved = JSON.parse(await readFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), "utf8"));
  assert.equal(moved.revision, 1);
  await assert.rejects(readFile(join(dataRoot, "live-simulation.json")));
});

test("running migration twice is a no-op the second time", async () => {
  const dataRoot = await scratchRoot();
  await writeFile(join(dataRoot, "recommendation-events.json"), "[]");
  const first = await migrateLegacyControlRoomData({ dataRoot, roomId: "plant-1" });
  assert.equal(first.status, "OK");
  const second = await migrateLegacyControlRoomData({ dataRoot, roomId: "plant-1" });
  assert.equal(second.status, "OK");
  const alreadyMigrated = second.results.find((entry) => entry.file.endsWith("recommendation-events.json"));
  assert.equal(alreadyMigrated.status, "ALREADY_MIGRATED");
});

test("a legacy file and the plant1 file both existing is a conflict that touches neither", async () => {
  const dataRoot = await scratchRoot();
  await writeFile(join(dataRoot, "live-simulation.json"), '{"marker":"legacy"}');
  await mkdir(join(dataRoot, "control-rooms", "plant-1"), { recursive: true });
  await writeFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), '{"marker":"destination"}');

  const result = await migrateLegacyControlRoomData({ dataRoot, roomId: "plant-1" });
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.conflicts.length, 1);
  assert.match(result.conflicts[0].file, /live-simulation\.json$/);

  // Neither file was touched, and neither was silently preferred.
  const legacy = JSON.parse(await readFile(join(dataRoot, "live-simulation.json"), "utf8"));
  const destination = JSON.parse(await readFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), "utf8"));
  assert.equal(legacy.marker, "legacy");
  assert.equal(destination.marker, "destination");
});

test("a conflict on one file does not block the other files from migrating normally", async () => {
  const dataRoot = await scratchRoot();
  // live-simulation.json is a genuine conflict...
  await writeFile(join(dataRoot, "live-simulation.json"), '{"marker":"legacy"}');
  await mkdir(join(dataRoot, "control-rooms", "plant-1"), { recursive: true });
  await writeFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), '{"marker":"destination"}');
  // ...but recommendation-events.json has a clean, ordinary migration to do.
  await writeFile(join(dataRoot, "recommendation-events.json"), "[]");

  const result = await migrateLegacyControlRoomData({ dataRoot, roomId: "plant-1" });
  assert.equal(result.status, "CONFLICT");
  const conflict = result.results.find((entry) => entry.file.endsWith("live-simulation.json"));
  const migrated = result.results.find((entry) => entry.file.endsWith("recommendation-events.json"));
  assert.equal(conflict.status, "CONFLICT");
  assert.equal(migrated.status, "MIGRATED");
  await readFile(join(dataRoot, "control-rooms", "plant-1", "recommendation-events.json"), "utf8");
});

test("a partial migration (one file moved, one not) resumes correctly on retry rather than re-attempting the moved file", async () => {
  const dataRoot = await scratchRoot();
  await writeFile(join(dataRoot, "live-simulation.json"), '{"marker":"state"}');
  await writeFile(join(dataRoot, "recommendation-events.json"), '{"marker":"audit"}');

  // Simulate a crash that completed the first file's migration but not the second's.
  await mkdir(join(dataRoot, "control-rooms", "plant-1"), { recursive: true });
  const { rename } = await import("node:fs/promises");
  await rename(join(dataRoot, "live-simulation.json"), join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"));

  const retried = await migrateLegacyControlRoomData({ dataRoot, roomId: "plant-1" });
  assert.equal(retried.status, "OK");
  const stateEntry = retried.results.find((entry) => entry.file.endsWith("live-simulation.json"));
  const auditEntry = retried.results.find((entry) => entry.file.endsWith("recommendation-events.json"));
  assert.equal(stateEntry.status, "ALREADY_MIGRATED");
  assert.equal(auditEntry.status, "MIGRATED");
  const finalState = JSON.parse(await readFile(join(dataRoot, "control-rooms", "plant-1", "live-simulation.json"), "utf8"));
  assert.equal(finalState.marker, "state");
});

test("restoring plant-1 moves the former room state once and refuses conflicting copies", async () => {
  const dataRoot = await scratchRoot();
  const oldPath = join(dataRoot, "control-rooms", "plant1", "live-simulation.json");
  const target = join(dataRoot, "control-rooms", "plant-1", "live-simulation.json");
  await mkdir(join(dataRoot, "control-rooms", "plant1"), { recursive: true });
  await writeFile(oldPath, '{"revision":17}');
  assert.equal((await migrateRenamedControlRoomData({ dataRoot })).status, "OK");
  assert.equal(JSON.parse(await readFile(target, "utf8")).revision, 17);
  await assert.rejects(readFile(oldPath), { code: "ENOENT" });
  assert.equal((await migrateRenamedControlRoomData({ dataRoot })).status, "OK");
  await writeFile(oldPath, '{"revision":99}');
  assert.equal((await migrateRenamedControlRoomData({ dataRoot })).status, "CONFLICT");
  assert.equal(JSON.parse(await readFile(target, "utf8")).revision, 17);
  assert.equal(JSON.parse(await readFile(oldPath, "utf8")).revision, 99);
});
