// Captures the deck's record screenshots from the paused recording copy: the Compass
// responder analysis and the recommended/applied fix of one live AMD record, and the
// pending staffing recommendation. Read-only (opens pages, never approves).
// Usage: node docs/submission/build/record-shots.mjs <baseUrl> <issueId> <stationId>
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const [base = "http://127.0.0.1:3013", issueId, stationId] = process.argv.slice(2);
if (!issueId || !stationId) throw new Error("Usage: record-shots.mjs <baseUrl> <issueId> <stationId>");
const out = (name) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1250, height: 1300 }, deviceScaleFactor: 2 });
const clickInPage = async (selector) => {
  await page.waitForSelector(selector, { state: "attached" });
  await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: "center" }); el.click(); }, selector);
};
// Crop from one element's top to another's bottom inside the maximised context tile.
async function crop(name, fromLocator, toLocator) {
  await fromLocator.evaluate((node) => node.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(500);
  const top = await fromLocator.boundingBox();
  const bottom = await toLocator.boundingBox();
  const panel = await page.locator(".context-panel").boundingBox();
  await page.screenshot({ path: out(name), clip: { x: panel.x + 4, y: top.y - 12, width: panel.width - 8, height: Math.min(bottom.y + bottom.height - top.y + 24, panel.y + panel.height - top.y + 12) } });
  console.log(name);
}

await page.goto(`${base}/rooms/plant-1`);
await page.locator(".building").waitFor();
await page.evaluate(() => document.fonts.ready);
await page.getByRole("button", { name: "Maximise Dispatch / context" }).click();
await page.locator("#stations-tab").click();
await clickInPage(`[data-station-id="${stationId}"]`);
await clickInPage(`[data-station-history-issue-id="${issueId}"]`);
await page.locator(".fix-panel").first().waitFor();
const analysis = page.getByText("Initial assignment Compass analysis").first();
await crop("compass-record.png", analysis, page.getByText("Assistance Compass analysis").first().locator("xpath=preceding::table[1]"));
await crop("fix-record.png", page.locator(".fix-panel").first(), page.getByText("Action taken:").last());
await page.getByRole("button", { name: "Restore Dispatch / context" }).click();

await page.setViewportSize({ width: 1250, height: 1000 });
await page.goto(`${base}/rooms/plant-1/display/staffing`);
await page.getByRole("button", { name: "Approve top option" }).waitFor();
await page.waitForTimeout(800);
const tile = await page.locator("#staffing-tile").boundingBox();
const reject = await page.getByRole("button", { name: "Reject" }).boundingBox();
await page.screenshot({ path: out("staffing.png"), clip: { x: tile.x, y: tile.y, width: tile.width, height: reject.y + reject.height - tile.y + 20 } });
console.log("staffing.png");
await browser.close();
