/**
 * One-time, idempotent migration of the pre-Control-Rooms single-instance
 * data (backend/data/*.json) into room "plant-1"'s own directory.
 *
 * Never guesses. Each file's migration state is one of exactly four —
 * see Control_Rooms_SOW_v1_DRAFT.md §4.3 — and "legacy source exists AND the
 * plant-1 destination already exists" is an explicit CONFLICT that leaves
 * both files untouched, rather than silently trusting one of them. Matches
 * this codebase's existing principle that ambiguous provenance must not be
 * silently repaired (the same reasoning behind rejecting a malformed model
 * result instead of trying to fix it up).
 */
import { access, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveCompassDataRoot } from "./data-root.mjs";


// The exact set of files a pre-Control-Rooms single-instance deployment
// could have accumulated. Nothing else under backend/data/ is legacy
// per-room state — application-events.json and provider-settings.json stay
// where they are, shared, per §4.2.
const LEGACY_FILES = ["live-simulation.json", "live-simulation.json.pre-v2.bak", "recommendation-events.json"];

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function migrateOneFile(legacyPath, destinationPath) {
  const [legacyExists, destinationExists] = await Promise.all([pathExists(legacyPath), pathExists(destinationPath)]);
  if (!legacyExists && !destinationExists) return { file: legacyPath, status: "ABSENT" };
  if (!legacyExists && destinationExists) return { file: legacyPath, status: "ALREADY_MIGRATED" };
  if (legacyExists && destinationExists) return { file: legacyPath, status: "CONFLICT" };
  await mkdir(dirname(destinationPath), { recursive: true });
  await rename(legacyPath, destinationPath);
  return { file: legacyPath, status: "MIGRATED" };
}

/**
 * Migrates legacy top-level data into `<dataRoot>/control-rooms/<roomId>/`.
 * Idempotent: safe to call on every boot, and safe to retry after a crash
 * mid-migration, since each file's own exists-check decides its own outcome
 * independent of the other files.
 *
 * Returns CONFLICT status if any file conflicted; the caller (the Control
 * Room manager) must treat that as the room failing to migrate cleanly —
 * never proceed to construct a store from a destination file that was left
 * in place only because this function refused to overwrite it blindly.
 */
export async function migrateLegacyControlRoomData({ dataRoot = resolveCompassDataRoot(), roomId = "plant-1" } = {}) {
  const roomDir = join(dataRoot, "control-rooms", roomId);
  const results = await Promise.all(LEGACY_FILES.map((name) => migrateOneFile(join(dataRoot, name), join(roomDir, name))));
  const conflicts = results.filter((entry) => entry.status === "CONFLICT");
  return { roomId, status: conflicts.length > 0 ? "CONFLICT" : "OK", results, conflicts };
}

/** Restore the canonical room path without overwriting either copy on conflict. */
export async function migrateRenamedControlRoomData({ dataRoot }) {
  const source = join(dataRoot, "control-rooms", "plant1");
  const destination = join(dataRoot, "control-rooms", "plant-1");
  const results = await Promise.all(LEGACY_FILES.map((name) => migrateOneFile(join(source, name), join(destination, name))));
  const conflicts = results.filter((entry) => entry.status === "CONFLICT");
  return { status: conflicts.length ? "CONFLICT" : "OK", results, conflicts };
}
