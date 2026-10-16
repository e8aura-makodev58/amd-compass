/** Lightweight persistent audit storage for the resettable Compass demo. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { compassDataPath } from "./data-root.mjs";

const operationQueues = new Map();

function serialize(filePath, operation) {
  const previous = operationQueues.get(filePath) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  operationQueues.set(filePath, next);
  return next.finally(() => {
    if (operationQueues.get(filePath) === next) operationQueues.delete(filePath);
  });
}

async function readEvents(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    const events = JSON.parse(content);
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

export function createAuditStore(filePath = compassDataPath("recommendation-events.json")) {
  return {
    async create(event) {
      return serialize(filePath, async () => {
        const events = await readEvents(filePath);
        const index = events.findIndex((existing) => existing.requestId === event.requestId);
        if (index >= 0) events[index] = event;
        else events.push(event);
        await writeEvents(filePath, events);
        return structuredClone(event);
      });
    },
    async updateDecision(requestId, decision) {
      return serialize(filePath, async () => {
        const events = await readEvents(filePath);
        const index = events.findIndex((event) => event.requestId === requestId);
        if (index < 0) throw new Error(`Audit event ${requestId} was not found`);
        events[index] = { ...events[index], ...decision };
        await writeEvents(filePath, events);
        return structuredClone(events[index]);
      });
    },
    async get(requestId) {
      return serialize(filePath, async () => {
        const events = await readEvents(filePath);
        const event = events.find((entry) => entry.requestId === requestId);
        return event ? structuredClone(event) : null;
      });
    },
  };
}
