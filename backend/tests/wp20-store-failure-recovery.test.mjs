import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveStore } from "../src/live-store.mjs";
import { createApplicationLogStore } from "../src/application-log-store.mjs";

/**
 * A failed write used to poison the store's shared promise chain, and both
 * reads awaited that chain. Because the scheduler tick reads before it writes,
 * a poisoned chain stopped the tick from ever queueing another mutation, so the
 * process could never recover and every /api/state returned 500 until restart.
 * One transient write failure must stay transient.
 */

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "compass-store-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a rejected live mutation does not brick later reads or writes", async () => {
  await withTempDirectory(async (directory) => {
    const store = createLiveStore({ filePath: join(directory, "live.json") });
    const before = await store.snapshot();

    await assert.rejects(
      store.mutate("boom", () => { throw new Error("SYNTHETIC WRITE FAILURE"); }),
      /SYNTHETIC WRITE FAILURE/,
    );

    // The read path must not inherit the write's rejection.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const snapshot = await store.snapshot();
      assert.equal(snapshot.revision, before.revision);
      assert.ok(await store.publicSnapshot());
    }

    // And the store must still accept new work, which is what lets the
    // scheduler tick recover on its own instead of stalling forever.
    const after = await store.mutate("ok", (draft) => { draft.simulationState.status = "PAUSED"; });
    assert.equal(after.revision, before.revision + 1);
    assert.equal((await store.snapshot()).simulationState.status, "PAUSED");
  });
});

test("a rejected log append does not brick later appends or reads", async () => {
  await withTempDirectory(async (directory) => {
    const store = createApplicationLogStore(join(directory, "events.json"));
    await store.append({ event: "first" });

    const circular = {};
    circular.self = circular;
    await assert.rejects(store.append(circular));

    await store.append({ event: "second" });
    const recent = await store.recent(10);
    assert.deepEqual(recent.map((entry) => entry.event), ["first", "second"]);
  });
});

test("concurrent live stores on one file do not collide over a shared temp name", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = join(directory, "live.json");
    const [first, second] = [createLiveStore({ filePath }), createLiveStore({ filePath })];
    await first.snapshot();

    // Interleaved writers previously clobbered a fixed `${filePath}.tmp`, so the
    // losing rename failed with ENOENT. Every write must now succeed.
    const writes = Array.from({ length: 12 }, (unused, index) =>
      (index % 2 ? second : first).mutate(`write-${index}`, (draft) => { draft.simulationState.speed = 1; }));
    const settled = await Promise.allSettled(writes);
    const failures = settled.filter((entry) => entry.status === "rejected").map((entry) => entry.reason.message);
    assert.deepEqual(failures, []);

    // No temp file may be left behind once every rename has completed.
    assert.deepEqual((await readdir(directory)).filter((name) => name.endsWith(".tmp")), []);
  });
});
