// Copies third-party browser files from node_modules into frontend/vendor/ so
// the app serves them itself: no CDN, works offline, and the E2E suite can
// assert zero outbound requests. The vendored files are committed; rerun
// `npm run vendor` after changing a version in package.json.
//
// Each library has its own module in scripts/vendor/<name>.mjs whose default
// export receives the helpers below, so agents adding libraries never edit the
// same file. A module copies files and writes a README.md with the version,
// source paths and licence.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorRoot = join(root, "frontend", "vendor");
const require = createRequire(join(root, "package.json"));

function packageDir(name) {
  return dirname(require.resolve(`${name}/package.json`));
}

const helpers = {
  root,
  vendorRoot,
  packageDir,
  async packageVersion(name) {
    return JSON.parse(await readFile(join(packageDir(name), "package.json"), "utf8")).version;
  },
  async readText(name, relativePath) {
    return readFile(join(packageDir(name), relativePath), "utf8");
  },
  /** Copies node_modules/<name>/<from> to frontend/vendor/<to>. */
  async copy(name, from, to) {
    const target = join(vendorRoot, to);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(packageDir(name), from), target);
  },
  /** Writes text to frontend/vendor/<to>. */
  async writeText(to, text) {
    const target = join(vendorRoot, to);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text);
  },
  /** Empties frontend/vendor/<dir> before a fresh copy, so removed files do not linger. */
  async clean(dir) {
    await rm(join(vendorRoot, dir), { recursive: true, force: true });
  },
};

const modulesDir = join(root, "scripts", "vendor");
const modules = (await readdir(modulesDir)).filter((file) => file.endsWith(".mjs")).sort();
if (!modules.length) console.log("No vendor modules in scripts/vendor/.");
for (const file of modules) {
  const { default: run } = await import(join(modulesDir, file));
  await run(helpers);
  console.log(`vendored: ${file.replace(/\.mjs$/, "")}`);
}
