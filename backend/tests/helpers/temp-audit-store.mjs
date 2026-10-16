import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuditStore } from "../../src/audit-store.mjs";

/**
 * An audit store in a throwaway directory.
 *
 * `createDemoRuntime` defaults to the real `backend/data/recommendation-events.json`,
 * so tests that omit a store all read-modify-write one shared file. The store
 * serializes operations per path, but only within a process, and `node --test`
 * runs each test file in its own process — so under full-suite concurrency those
 * writes interleave and a test can observe another file's events. Tests must not
 * touch application data anyway; use this everywhere a runtime is constructed.
 */
export function createTempAuditStore() {
  return createAuditStore(join(mkdtempSync(join(tmpdir(), "compass-audit-")), "events.json"));
}
