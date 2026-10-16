import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = new URL("node_modules/dockview-core/", root);
const target = new URL("frontend/vendor/dockview/", root);
const { version } = JSON.parse(await readFile(new URL("package.json", source), "utf8"));
if (version !== "8.3.1") throw new Error(`Review vendoring before upgrading Dockview ${version}`);
const bundle = await readFile(new URL("dist/dockview-core.js", source), "utf8");
const literal = bundle.match(/\bs\.textContent = ("(?:[^"\\]|\\.)*");/);
if (!literal) throw new Error("Dockview's injected stylesheet was not found");
const css = JSON.parse(literal[1]);
if (!css.includes(".dv-dockview") || !css.includes(".dv-sash")) throw new Error("Unexpected Dockview stylesheet");
await mkdir(target, { recursive: true });
await Promise.all([
  copyFile(new URL("dist/package/main.esm.min.mjs", source), new URL("dockview.js", target)),
  copyFile(new URL("LICENCE.md", source), new URL("LICENCE.md", target)),
  writeFile(new URL("dockview.css", target), `/* Dockview ${version}, MIT. Verbatim stylesheet extracted from dockview-core/dist/dockview-core.js by scripts/vendor-frontend.mjs. */\n${css}\n`),
]);
console.log(`Vendored dockview-core ${version} (browser ESM, extracted CSS, MIT licence)`);
