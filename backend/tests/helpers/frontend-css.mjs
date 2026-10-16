import { readFile } from "node:fs/promises";

const frontendRoot = new URL("../../../frontend/", import.meta.url);

/**
 * The frontend's stylesheets, concatenated in the order index.html links them,
 * so a test can check CSS rules without knowing how the styles are split.
 */
export async function readFrontendCss() {
  const html = await readFile(new URL("index.html", frontendRoot), "utf8");
  const files = [...html.matchAll(/<link rel="stylesheet" href="\/([^"]+\.css)"/g)].map((match) => match[1]);
  if (files.length === 0) throw new Error("index.html links no stylesheets");
  const sheets = await Promise.all(files.map((file) => readFile(new URL(file, frontendRoot), "utf8")));
  return sheets.join("\n");
}
