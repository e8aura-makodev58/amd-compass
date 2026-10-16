/**
 * Single-process atomic persistence for v4 Live Simulation.
 * This is intentionally a small JSON-domain store rather than an event-sourced
 * system: OperationalEvent is audit-only and never rebuilds canonical state.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { compassDataPath } from "./data-root.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { createPublicLiveSnapshot, validateLiveState } from "./live-schema.mjs";
import { migrateLiveState } from "./live-migration.mjs";

/**
 * The temp name must be unique per writer. A shared `${filePath}.tmp` is not
 * atomic across processes: a second writer overwrites the first one's temp file,
 * the first rename consumes it, and the second rename fails with ENOENT.
 */
async function writeAtomically(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function readState(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function createPreV2Backup(filePath, state) {
  try {
    await writeFile(`${filePath}.pre-v2.bak`, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}

function normalizeCurrentDraft(state) {
  for (const issue of state.issues ?? []) issue.complexity ??= issue.issueClass === "C" ? "COMPLEX" : "STANDARD";
  return state;
}

export function createLiveStore({ filePath = process.env.COMPASS_LIVE_STATE_PATH ?? compassDataPath("live-simulation.json"), seedFactory = createLiveSeed } = {}) {
  let cachedState = null;
  let operationQueue = Promise.resolve();

  async function ensureLoaded() {
    if (cachedState) return cachedState;
    const loaded = await readState(filePath);
    if (loaded) {
      // Always pass persisted data through the idempotent migrator before
      // validation. This also repairs states written by an earlier 2.0 build
      // whose assignment rows predate role-history tracking.
      const migrated = migrateLiveState(loaded);
      validateLiveState(migrated);
      if (JSON.stringify(migrated) !== JSON.stringify(loaded)) {
        await createPreV2Backup(filePath, loaded);
        await writeAtomically(filePath, migrated);
      }
      cachedState = migrated;
    } else {
      cachedState = validateLiveState(seedFactory());
      await writeAtomically(filePath, cachedState);
    }
    return cachedState;
  }

  /**
   * Serialize every read and write onto one chain, but never let the *stored*
   * chain stay rejected. A failed write must not become a permanent failure for
   * everything after it: the caller still sees its own error, while the next
   * operation starts from a settled chain.
   *
   * This matters more than it looks. Reads run through here too, and the
   * scheduler tick reads before it writes — so a chain that stayed rejected
   * would stop the tick from ever queueing another mutation, and the process
   * could never recover on its own. That is a bricked server, not a blip.
   */
  function queue(operation) {
    const next = operationQueue.catch(() => {}).then(operation);
    operationQueue = next.catch(() => {});
    return next;
  }

  return {
    async snapshot() {
      return queue(async () => structuredClone(await ensureLoaded()));
    },
    async publicSnapshot() {
      return queue(async () => createPublicLiveSnapshot(await ensureLoaded()));
    },
    mutate(label, mutation) {
      return queue(async () => {
        const before = await ensureLoaded();
        const draft = structuredClone(before);
        const result = await mutation(draft);
        validateLiveState(normalizeCurrentDraft(draft));
        draft.revision = before.revision + 1;
        await writeAtomically(filePath, draft);
        cachedState = draft;
        return { label, revision: draft.revision, result: structuredClone(result), state: structuredClone(draft) };
      });
    },
    reset() {
      return queue(async () => {
        const state = validateLiveState(seedFactory());
        await writeAtomically(filePath, state);
        cachedState = state;
        return structuredClone(state);
      });
    },
  };
}
