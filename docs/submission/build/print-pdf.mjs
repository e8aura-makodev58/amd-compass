// Prints the deck's HTML rendering (written by build-deck.py) to PDF with Chromium.
// Usage: node docs/submission/build/print-pdf.mjs <deck.html> <out.pdf>
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [htmlPath, pdfPath] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve(htmlPath)).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: pdfPath, width: "13.333in", height: "7.5in", printBackground: true, preferCSSPageSize: true });
await browser.close();
