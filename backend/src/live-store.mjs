/**
 * Single-process atomic persistence for v4 Live Simulation.
 * This is intentionally a small JSON-domain store rather than an event-sourced
 * system: OperationalEvent is audit-only and never rebuilds canonical state.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, readdir, open } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { dirname } from "node:path";
import { compassDataPath } from "./data-root.mjs";
import { createLiveSeed } from "../seed/live-simulation.mjs";
import { createPublicLiveSnapshot, validateLiveState } from "./live-schema.mjs";
import { migrateLiveState } from "./live-migration.mjs";
import { compactHistory, retentionDays, resetRetention, analyticHistory } from "./history-retention.mjs";
import { writeHistoryArchive, archivedIssue, assertHistoryArchivePresent } from "./history-archive.mjs";
import { createIssueAuditRecord, redactIssueAuditRecord } from "./live-schema.mjs";

/**
 * The temp name must be unique per writer. A shared `${filePath}.tmp` is not
 * atomic across processes: a second writer overwrites the first one's temp file,
 * the first rename consumes it, and the second rename fails with ENOENT.
 */
async function writeAtomically(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "w");
  try { await handle.writeFile(`${JSON.stringify(state)}\n`); await handle.sync(); } finally { await handle.close(); }
  await rename(temporaryPath, filePath);
  const directory = await open(dirname(filePath), "r");
  try { await directory.sync(); } finally { await directory.close(); }
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

export function createLiveStore({ filePath = process.env.COMPASS_LIVE_STATE_PATH ?? compassDataPath("live-simulation.json"), seedFactory = createLiveSeed,
  historyRetentionDays = retentionDays(), archiveRoot = `${dirname(filePath)}/history-archive`, beforeCommit = async () => {},
} = {}) {
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
      // The migrator validates every returned state. Do not repeat its full
      // scan or serialize the entire history twice just to compare it.
      await assertHistoryArchivePresent(archiveRoot, migrated);
      const migrationChanged = !isDeepStrictEqual(migrated, loaded);
      const retentionBefore = structuredClone(migrated.historyRetention);
      const bundles = compactHistory(migrated, historyRetentionDays, { force: true });
      if (bundles.length) validateLiveState(migrated);
      await writeHistoryArchive(archiveRoot, migrated, bundles);
      if (migrationChanged || !isDeepStrictEqual(retentionBefore, migrated.historyRetention)) {
        if (migrationChanged) await createPreV2Backup(filePath, loaded);
        await beforeCommit({ label: "load-retention", state: migrated });
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
    project(projector) { return queue(async () => projector(await ensureLoaded())); },
    async snapshot() {
      return queue(async () => structuredClone(await ensureLoaded()));
    },
    async publicSnapshot() {
      return queue(async () => createPublicLiveSnapshot(await ensureLoaded(), { validated: true }));
    },
    async issueAudit(issueId) {
      return queue(async () => {
        const state = await ensureLoaded();
        if (state.issues.some((row) => row.id === issueId)) return createIssueAuditRecord(state, issueId);
        const bundle = await archivedIssue(archiveRoot, state, issueId);
        return bundle ? redactIssueAuditRecord({ ...bundle, equipment: state.equipment.find((row) => row.id === bundle.issue.equipmentId) ?? null }) : null;
      });
    },
    async stationHistory(equipmentId, { before = null, limit = 100 } = {}) {
      return queue(async () => {
        const state = analyticHistory(await ensureLoaded());
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Object.assign(new Error("History page limit must be between one and one hundred"), { statusCode: 400 });
        const issues = state.issues.filter((row) => !equipmentId || row.equipmentId === equipmentId).sort((a, b) => Date.parse(b.resolvedAt ?? b.raisedAt) - Date.parse(a.resolvedAt ?? a.raisedAt) || b.id.localeCompare(a.id));
        const cursor = before ? issues.findIndex((row) => row.id === before) : -1;
        if (before && cursor === -1) throw Object.assign(new Error("Unknown issue history cursor"), { statusCode: 400 });
        const start = cursor + 1;
        const page = issues.slice(start, start + limit);
        return { mode: "LIVE", simulationTime: state.simulationState.simulationTime, total: issues.length, issues: structuredClone(page), next: start + page.length < issues.length ? page.at(-1)?.id : null };
      });
    },
    mutate(label, mutation) {
      return queue(async () => {
        const before = await ensureLoaded();
        const draft = structuredClone(before);
        const result = await mutation(draft);
        validateLiveState(normalizeCurrentDraft(draft));
        draft.revision = before.revision + 1;
        const bundles = compactHistory(draft, historyRetentionDays);
        if (bundles.length) validateLiveState(draft);
        await writeHistoryArchive(archiveRoot, draft, bundles);
        await beforeCommit({ label, state: draft });
        await writeAtomically(filePath, draft);
        cachedState = draft;
        return { label, revision: draft.revision, result: structuredClone(result), state: structuredClone(draft) };
      });
    },
    reset() {
      return queue(async () => {
        const state = validateLiveState(seedFactory());
        const previous = await ensureLoaded();
        const archiveFiles = await readdir(archiveRoot).catch((error) => { if (error.code === "ENOENT") return []; throw error; });
        if (previous.historyRetention?.epoch || archiveFiles.length) resetRetention(state, (previous.historyRetention?.epoch ?? 0) + 1);
        await writeAtomically(filePath, state);
        cachedState = state;
        return structuredClone(state);
      });
    },
  };
}
