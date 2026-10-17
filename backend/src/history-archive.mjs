/** Per-room immutable issue bundles, grouped by resolution day and reset epoch. */
import { mkdir, readFile, rename, open, readdir, copyFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { constants } from "node:fs";

export async function readArchiveFile(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return { version: 1, issues: {} }; throw error; }
}

export function archiveFile(root, epoch, day) {
  if (!Number.isInteger(epoch) || epoch < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Invalid history archive address");
  return join(root, String(epoch), `${day}.json`);
}

export async function writeHistoryArchive(root, state, bundles) {
  const grouped = new Map();
  for (const bundle of bundles) {
    const file = archiveFile(root, state.historyRetention.epoch, state.historyRetention.archives[bundle.issue.id]);
    if (!grouped.has(file)) grouped.set(file, []);
    grouped.get(file).push(bundle);
  }
  for (const [file, additions] of grouped) {
    const archive = await readArchiveFile(file);
    let changed = false;
    for (const bundle of additions) {
      const old = archive.issues[bundle.issue.id];
      if (old && JSON.stringify(old) !== JSON.stringify(bundle)) throw new Error(`Conflicting archived issue ${bundle.issue.id}`);
      if (!old) { archive.issues[bundle.issue.id] = bundle; changed = true; }
    }
    if (!changed) continue;
    archive.issues = Object.fromEntries(Object.entries(archive.issues).sort(([a], [b]) => a.localeCompare(b)));
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    const handle = await open(temporary, "w", 0o600);
    try { await handle.writeFile(JSON.stringify(archive)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
    for (const path of [dirname(file), root, dirname(root)]) {
      const directory = await open(path, "r");
      try { await directory.sync(); } finally { await directory.close(); }
    }
  }
}

export async function archivedIssue(root, state, issueId) {
  const index = state.historyRetention?.archives ?? {};
  const day = Object.hasOwn(index, issueId) ? index[issueId] : null;
  if (!day) return null;
  const archive = await readArchiveFile(archiveFile(root, state.historyRetention.epoch, day));
  const bundle = archive.issues[issueId];
  if (!bundle || bundle.issue?.id !== issueId) throw new Error(`Missing archived issue ${issueId}`);
  return bundle;
}

export async function assertHistoryArchivePresent(root, state) {
  for (const day of new Set(Object.values(state.historyRetention?.archives ?? {}))) {
    await access(archiveFile(root, state.historyRetention.epoch, day));
  }
}

export async function copyHistoryArchive(from, to) {
  let entries;
  try { entries = await readdir(from, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  await mkdir(to, { recursive: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const source = join(from, entry.name), destination = join(to, entry.name);
    if (entry.isDirectory()) await copyHistoryArchive(source, destination);
    else if (entry.isFile() && entry.name.endsWith(".json")) {
      try { await copyFile(source, destination, constants.COPYFILE_EXCL); }
      catch (error) {
        if (error.code !== "EEXIST" || !(await readFile(source)).equals(await readFile(destination))) throw error;
      }
    }
  }
}
