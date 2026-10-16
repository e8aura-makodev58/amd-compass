import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplicationLogStore } from "../src/application-log-store.mjs";
import { createAuditStore } from "../src/audit-store.mjs";
import { createControlRoomManager } from "../src/control-room-manager.mjs";
import { compassDataPath, resolveCompassDataRoot } from "../src/data-root.mjs";
import { createLiveStore } from "../src/live-store.mjs";
import { createProviderSettingsService } from "../src/provider-settings.mjs";

const FIXTURE_OPTIONS = { mode: "force-failure" };

test("COMPASS_DATA_DIR redirects every default persistent store without changing test-only room-root semantics", async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), "compass-data-root-"));
  const original = process.env.COMPASS_DATA_DIR;
  process.env.COMPASS_DATA_DIR = dataRoot;
  try {
    assert.equal(resolveCompassDataRoot(), dataRoot);
    assert.equal(compassDataPath("provider-settings.json"), join(dataRoot, "provider-settings.json"));

    await createLiveStore().snapshot();
    await createAuditStore().create({ requestId: "root-test", event: "ROOT_TEST" });
    await createApplicationLogStore().append({ event: "root_test" });

    const settings = createProviderSettingsService({ apiKeys: { amd: "" }, environment: {} });
    await settings.update({ provider: "amd", modelId: "Example-Model", reasoningEffort: "default" });

    const manager = await createControlRoomManager({ migrateLegacyData: false, plannerOptions: FIXTURE_OPTIONS, agentOptions: FIXTURE_OPTIONS });
    assert.equal(manager.getRoom("plant-1").health, "READY");
    assert.equal((await manager.renameRoomDisplayName("plant-1", { displayName: "Persistent Plant", expectedRevision: 0 })).status, "UPDATED");

    for (const path of [
      "live-simulation.json",
      "recommendation-events.json",
      "application-events.json",
      "provider-settings.json",
      join("control-rooms", "plant-1", "live-simulation.json"),
      join("control-rooms", "room-metadata.json"),
    ]) await access(join(dataRoot, path));
    assert.match(await readFile(join(dataRoot, "provider-settings.json"), "utf8"), /Example-Model/);
  } finally {
    if (original === undefined) delete process.env.COMPASS_DATA_DIR;
    else process.env.COMPASS_DATA_DIR = original;
  }
});
