import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ROOM_METADATA_VERSION = 1;
export const MAX_DISPLAY_NAME_LENGTH = 80;

export function defaultRoomMetadata(rooms) {
  return { version: ROOM_METADATA_VERSION, rooms: Object.fromEntries(rooms.map((room) => [room.id, { displayName: room.label, revision: 0 }])) };
}

function validateDocument(document, knownRooms) {
  if (!document || document.version !== ROOM_METADATA_VERSION || !document.rooms || typeof document.rooms !== "object") throw new Error("Control room metadata is invalid");
  for (const room of knownRooms) {
    const entry = document.rooms[room.id];
    if (!entry || typeof entry.displayName !== "string" || !Number.isInteger(entry.revision) || entry.revision < 0) throw new Error(`Control room metadata is invalid for ${room.id}`);
  }
  return document;
}

function normalizeDisplayName(value) {
  if (typeof value !== "string") throw Object.assign(new Error("Display name must be a string"), { statusCode: 400 });
  const displayName = value.trim();
  if (!displayName) throw Object.assign(new Error("Display name cannot be blank"), { statusCode: 400 });
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) throw Object.assign(new Error(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`), { statusCode: 400 });
  if(/[\u0000-\u001f\u007f]/.test(displayName)) throw Object.assign(new Error("Display name cannot contain control characters"), { statusCode: 400 });
  return displayName;
}

export function createControlRoomMetadataStore({ filePath, rooms }) {
  let queue = Promise.resolve();
  let unavailable = null;
  const known = new Map(rooms.map((room) => [room.id, room]));
  const run = (operation) => { const next = queue.catch(() => {}).then(operation); queue = next.catch(() => {}); return next; };
  async function read() {
    if (unavailable) throw unavailable;
    try {
      const document = JSON.parse(await readFile(filePath, "utf8"));
      // Older deployments used plant1; preserve its name and revision.
      if (document?.rooms && !document.rooms["plant-1"] && document.rooms.plant1) {
        document.rooms["plant-1"] = document.rooms.plant1;
        delete document.rooms.plant1;
      }
      return validateDocument(document, rooms);
    }
    catch (error) {
      if (error.code === "ENOENT") return defaultRoomMetadata(rooms);
      unavailable = new Error(`Control room metadata is unavailable: ${error.message}`);
      throw unavailable;
    }
  }
  async function write(document) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    await rename(temporary, filePath);
  }
  return {
    async snapshot() { return run(async () => structuredClone(await read())); },
    async rename(id, { displayName, expectedRevision }) { return run(async () => {
      if (!known.has(id)) throw Object.assign(new Error(`Unknown control room: ${id}`), { statusCode: 404 });
      const nextName = normalizeDisplayName(displayName);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw Object.assign(new Error("Expected revision must be a non-negative integer"), { statusCode: 400 });
      const document = await read(); const current = document.rooms[id];
      if (current.revision !== expectedRevision) return { status: "CONFLICT", displayName: current.displayName, revision: current.revision };
      document.rooms[id] = { displayName: nextName, revision: current.revision + 1 };
      await write(document);
      return { status: "UPDATED", ...document.rooms[id] };
    }); },
  };
}
