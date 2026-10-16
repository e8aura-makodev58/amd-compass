/** Persistent, bounded operational log storage for Compass. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { compassDataPath } from "./data-root.mjs";

const MAX_EVENTS = 1_000;

async function readEvents(filePath) {
  try {
    const events = JSON.parse(await readFile(filePath, "utf8"));
    return Array.isArray(events) ? events : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeEvents(filePath, events) {
  await mkdir(dirname(filePath), { recursive: true });
  // Unique per writer: a shared temp name is not atomic across processes.
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(events, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export function createApplicationLogStore(filePath = compassDataPath("application-events.json")) {
  let operationQueue = Promise.resolve();
  // The stored chain never stays rejected, so one failed append cannot make
  // every later append or read fail. Callers still receive their own error.
  const queue = (operation) => {
    const next = operationQueue.catch(() => {}).then(operation);
    operationQueue = next.catch(() => {});
    return next;
  };
  return {
    append(event) {
      return queue(async () => {
        const events = await readEvents(filePath);
        events.push(event);
        await writeEvents(filePath, events.slice(-MAX_EVENTS));
      });
    },
    async recent(limit = 100) {
      return queue(async () => {
        const events = await readEvents(filePath);
        return structuredClone(events.slice(-Math.min(Math.max(Number(limit) || 100, 1), MAX_EVENTS)));
      });
    },
  };
}

/** Shared JSON-line log-event shape, used by every runtime/route that logs. */
export function logEvent(logger, event, fields = {}) {
  logger?.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}

/**
 * Gives a room-owned runtime a deployment logger that always identifies its
 * room. The id is deliberately assigned last: no runtime event can spoof or
 * accidentally override the room that produced it.
 */
export function createControlRoomLogger(logger, controlRoomId) {
  if (!logger) return null;
  return {
    log(line) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        event = { timestamp: new Date().toISOString(), event: "log_encoding_error" };
      }
      // Destructure rather than spread the original key so the authoritative
      // room id is physically last in the persisted JSON object as well.
      const { controlRoomId: _untrustedControlRoomId, ...fields } = event;
      logger.log(JSON.stringify({ ...fields, controlRoomId }));
    },
  };
}

export function createApplicationLogger(store, mirror = null) {
  return {
    log(line) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        event = { timestamp: new Date().toISOString(), event: "log_encoding_error" };
      }
      void store.append(event).catch((error) => mirror?.error(`Compass log persistence failed: ${error.message}`));
      mirror?.log(line);
    },
    recent(limit) {
      return store.recent(limit);
    },
  };
}
