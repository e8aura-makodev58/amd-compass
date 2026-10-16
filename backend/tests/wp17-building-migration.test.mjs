import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { migrateLiveState } from "../src/live-migration.mjs";
import { LIVE_SCHEMA_VERSION, validateLiveState } from "../src/live-schema.mjs";
import { createLiveStore } from "../src/live-store.mjs";

/**
 * A state persisted before the three-floor building has six ground-floor
 * machines and no floor coordinate. Without migration the current schema
 * rejects it and the server cannot start on an existing state file at all.
 */
function preBuildingState() {
  const state = createLiveSeed();
  state.equipment = state.equipment
    .filter((item) => ["EQ-01", "EQ-02", "EQ-03", "EQ-04", "EQ-05", "EQ-06"].includes(item.id))
    .map(({ floor, ...item }) => item);
  state.responders = state.responders.map(({ floor, ...responder }) => responder);
  return state;
}

test("a pre-building state fails validation, proving the migration is load-bearing", () => {
  assert.throws(() => validateLiveState(preBuildingState()), /equipment/i);
});

test("migration lifts a single-floor state into the building without moving existing machines", () => {
  const migrated = migrateLiveState(preBuildingState());
  assert.equal(migrated.schemaVersion, LIVE_SCHEMA_VERSION);
  assert.equal(migrated.equipment.length, 72);
  for (const floor of [1, 2, 3]) assert.equal(migrated.equipment.filter((item) => item.floor === floor).length, 24);
  assert.deepEqual(
    migrated.equipment.slice(0, 6).map((item) => [item.id, item.x, item.y, item.floor]),
    [["EQ-01", 10, 10, 1], ["EQ-02", 30, 15, 1], ["EQ-03", 70, 20, 1], ["EQ-04", 50, 50, 1], ["EQ-05", 20, 80, 1], ["EQ-06", 85, 75, 1]],
  );
  assert.ok(migrated.responders.every((responder) => [1, 2, 3].includes(responder.floor)));
  validateLiveState(migrated);
});

test("migration preserves live status and the issues that reference existing machines", () => {
  const before = preBuildingState();
  before.equipment.find((item) => item.id === "EQ-03").status = "ISSUE_ACTIVE";
  const migrated = migrateLiveState(before);
  assert.equal(migrated.equipment.find((item) => item.id === "EQ-03").status, "ISSUE_ACTIVE");
  assert.deepEqual(migrated.issues.map((issue) => issue.id), before.issues.map((issue) => issue.id));
  for (const issue of migrated.issues) {
    assert.ok(migrated.equipment.some((item) => item.id === issue.equipmentId), `${issue.equipmentId} is missing after migration`);
  }
});

test("the store loads and upgrades a persisted pre-building state instead of refusing to start", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compass-building-migration-"));
  const filePath = join(directory, "live.json");
  await writeFile(filePath, JSON.stringify(preBuildingState()), "utf8");
  const state = await createLiveStore({ filePath }).snapshot();
  assert.equal(state.equipment.length, 72);
  assert.ok(state.responders.every((responder) => responder.floor));
});

test("migrating an already-migrated state is a no-op", () => {
  const once = migrateLiveState(preBuildingState());
  assert.deepEqual(migrateLiveState(once), once);
});

test("saved suggestion fields migrate back to generic response actions without changing the input", () => {
  const state = createLiveSeed();
  const issue = state.issues.find((row) => row.id === "ISS-104");
  issue.suggestedResponseAction = issue.responseAction;
  delete issue.responseAction;
  const migrated = migrateLiveState(state);
  assert.equal(migrated.issues.find((row) => row.id === issue.id).responseAction, issue.suggestedResponseAction);
  assert.equal("suggestedResponseAction" in migrated.issues.find((row) => row.id === issue.id), false);
  assert.equal("responseAction" in issue, false);
  assert.deepEqual(migrateLiveState(migrated), migrated);
});
