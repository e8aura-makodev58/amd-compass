// Renders each page of a PDF to PNG with pdf.js in Chromium, for visual checks.
// Usage: node docs/submission/build/render-pdf.mjs <file.pdf> <outDir>
// Needs pdf.js in .cache/pdfjs (npm install --prefix .cache/pdfjs pdfjs-dist@4.10.38).
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const [pdfPath, outDir] = process.argv.slice(2);
const lib = resolve(".cache/pdfjs/node_modules/pdfjs-dist/build");
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.route("http://pdf.local/**", async (route) => {
  const name = new URL(route.request().url()).pathname.slice(1);
  const body = name === "doc.pdf" ? await readFile(pdfPath) : await readFile(join(lib, name));
  await route.fulfill({ body, contentType: name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".mjs") ? "text/javascript" : "text/html" });
});
await page.route("http://pdf.local/", (route) => route.fulfill({ contentType: "text/html", body: "<body style='margin:0'><canvas id=c></canvas></body>" }));
await page.goto("http://pdf.local/");
const count = await page.evaluate(async () => {
  const pdfjs = await import("http://pdf.local/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "http://pdf.local/pdf.worker.min.mjs";
  window.doc = await pdfjs.getDocument("http://pdf.local/doc.pdf").promise;
  return window.doc.numPages;
});
for (let n = 1; n <= count; n += 1) {
  await page.evaluate(async (n) => {
    const p = await window.doc.getPage(n);
    const viewport = p.getViewport({ scale: 1600 / p.getViewport({ scale: 1 }).width });
    const canvas = document.getElementById("c");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await p.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  }, n);
  await page.locator("#c").screenshot({ path: join(outDir, `page-${String(n).padStart(2, "0")}.png`) });
}
await browser.close();
console.log(`${count} pages rendered`);
