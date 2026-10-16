/**
 * One-time bootstrap for portable, pre-seeded Compass demos.
 *
 * A committed seed is copied only when a runtime data root has never created
 * its control-rooms directory. Existing state is never merged, replaced, or
 * otherwise touched, so pulling new code cannot overwrite a running demo.
 */
import { access, copyFile, mkdir, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const defaultSeedRoot = fileURLToPath(new URL("../seed/demo-control-rooms/", import.meta.url));

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

export async function bootstrapDemoSeed({ dataRoot, seedRoot = defaultSeedRoot, enabled = process.env.COMPASS_BOOTSTRAP_DEMO_SEED === "true" } = {}) {
  if (!enabled) return { status: "DISABLED" };
  const roomsRoot = join(dataRoot, "control-rooms");
  if (await exists(roomsRoot)) return { status: "EXISTING_RUNTIME_DATA" };
  if (!await exists(seedRoot)) return { status: "NO_SEED" };
  const seedFiles = await readdir(seedRoot);
  if (!seedFiles.includes("plant-1.json") || !seedFiles.includes("plant-2.json") || !seedFiles.includes("room-metadata.json")) {
    throw new Error("Demo seed is incomplete");
  }
  const targets = [
    ["plant-1.json", join(roomsRoot, "plant-1", "live-simulation.json")],
    ["plant-2.json", join(roomsRoot, "plant-2", "live-simulation.json")],
    ["room-metadata.json", join(roomsRoot, "room-metadata.json")],
  ];
  for (const [source, target] of targets) {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(seedRoot, source), target, constants.COPYFILE_EXCL);
  }
  return { status: "SEEDED", seedRoot };
}
