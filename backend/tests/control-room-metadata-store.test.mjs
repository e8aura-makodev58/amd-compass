import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createControlRoomMetadataStore } from "../src/control-room-metadata-store.mjs";

const rooms = [{ id: "plant-1", label: "Plant #1" }, { id: "plant-2", label: "Plant #2" }];

test("control-room metadata defaults without writing and atomically revisions a valid rename", async () => {
  const root = await mkdtemp(join(tmpdir(), "compass-room-metadata-"));
  const store = createControlRoomMetadataStore({ filePath: join(root, "control-rooms", "room-metadata.json"), rooms });
  assert.deepEqual(await store.snapshot(), { version: 1, rooms: { "plant-1": { displayName: "Plant #1", revision: 0 }, "plant-2": { displayName: "Plant #2", revision: 0 } } });
  assert.deepEqual(await store.rename("plant-1", { displayName: " North Plant ", expectedRevision: 0 }), { status: "UPDATED", displayName: "North Plant", revision: 1 });
  assert.deepEqual(await store.rename("plant-1", { displayName: "Other", expectedRevision: 0 }), { status: "CONFLICT", displayName: "North Plant", revision: 1 });
});

test("control-room metadata rejects invalid names and never overwrites corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "compass-room-metadata-")); const filePath = join(root, "room-metadata.json");
  const store = createControlRoomMetadataStore({ filePath, rooms });
  await assert.rejects(() => store.rename("plant-1", { displayName: "\n", expectedRevision: 0 }), /blank/);
  await writeFile(filePath, "not json", "utf8");
  await assert.rejects(() => store.rename("plant-1", { displayName: "Safe", expectedRevision: 0 }), /unavailable/);
  assert.equal(await (await import("node:fs/promises")).readFile(filePath, "utf8"), "not json");
});

test("former plant1 metadata keeps its display name and revision under plant-1", async () => {
  const root = await mkdtemp(join(tmpdir(), "compass-room-metadata-"));
  const filePath = join(root, "room-metadata.json");
  await writeFile(filePath, JSON.stringify({ version: 1, rooms: {
    plant1: { displayName: "e8-aura-p1", revision: 7 },
    "plant-2": { displayName: "e8-aura-p2", revision: 3 },
  } }));
  const store = createControlRoomMetadataStore({ filePath, rooms });
  assert.deepEqual((await store.snapshot()).rooms["plant-1"], { displayName: "e8-aura-p1", revision: 7 });
  assert.equal((await store.rename("plant-1", { displayName: "North Plant", expectedRevision: 7 })).revision, 8);
});
