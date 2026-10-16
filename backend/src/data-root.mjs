/**
 * The single deployment persistence root.  Keep this resolver small and
 * dependency-free so every JSON store can use it without creating import
 * cycles.  The value is resolved when a store is constructed rather than at
 * module evaluation, which keeps hermetic tests able to supply a temporary
 * environment without changing production defaults.
 */
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDefaultDataRoot = fileURLToPath(new URL("../data/", import.meta.url));

export function resolveCompassDataRoot(environment = process.env) {
  const configured = typeof environment.COMPASS_DATA_DIR === "string" ? environment.COMPASS_DATA_DIR.trim() : "";
  return configured ? resolve(configured) : repositoryDefaultDataRoot;
}

export function compassDataPath(...segments) {
  return join(resolveCompassDataRoot(), ...segments);
}
