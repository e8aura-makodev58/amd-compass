// dockview-core: the tiling layout library for the desktop Live Floor
// (frontend/tiling.js is its only importer). The ESM build does not inject
// styles and the package ships no .css file, so the stylesheet is the string
// dist/dockview-core.js injects at load, extracted verbatim.
const PINNED = "8.3.1";

export default async function vendorDockview({ packageVersion, readText, copy, writeText }) {
  const version = await packageVersion("dockview-core");
  if (version !== PINNED) throw new Error(`Review vendoring before upgrading Dockview ${version}`);
  const bundle = await readText("dockview-core", "dist/dockview-core.js");
  const literal = bundle.match(/\bs\.textContent = ("(?:[^"\\]|\\.)*");/);
  if (!literal) throw new Error("Dockview's injected stylesheet was not found");
  const css = JSON.parse(literal[1]);
  if (!css.includes(".dv-dockview") || !css.includes(".dv-sash")) throw new Error("Unexpected Dockview stylesheet");
  await copy("dockview-core", "dist/package/main.esm.min.mjs", "dockview/dockview.js");
  await copy("dockview-core", "LICENCE.md", "dockview/LICENCE.md");
  await writeText("dockview/dockview.css", `/* Dockview ${version}, MIT. Verbatim stylesheet extracted from dockview-core/dist/dockview-core.js by scripts/vendor-frontend.mjs. */\n${css}\n`);
}
