// Captures the slide screenshots from a running ResponseCompass (paused month seed,
// providers forced off). Usage: node docs/submission/build/screenshots.mjs <baseUrl> [issueId stationId]
// With issueId/stationId, also captures that issue's record (compass-record.png).
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const [base = "http://127.0.0.1:3013", recordIssueId, recordStationId] = process.argv.slice(2);
const out = (name) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });

await page.request.post(`${base}/api/control-rooms/plant-1/simulation/speed`, { data: { speed: 5 } });
await page.goto(`${base}/rooms/plant-1`);
await page.locator(".building").waitFor();
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
await page.screenshot({ path: out("live-floor.png") });

if (recordIssueId) {
  const clickInPage = async (selector) => {
    await page.waitForSelector(selector, { state: "attached" });
    await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: "center" }); el.click(); }, selector);
  };
  await page.setViewportSize({ width: 1150, height: 1000 });
  await page.getByRole("button", { name: "Maximise Dispatch / context" }).click();
  await page.locator("#stations-tab").click();
  await clickInPage(`[data-station-id="${recordStationId}"]`);
  await clickInPage(`[data-station-history-issue-id="${recordIssueId}"]`);
  await page.getByText("Compass analysis").first().waitFor();
  await page.getByText("Compass analysis").first().evaluate((node) => node.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(600);
  // Crop to the analysis, evidence table and resolution so it reads on a slide.
  const top = await page.getByText("Compass analysis").first().boundingBox();
  const bottom = await page.getByText("Action taken:").last().boundingBox();
  const panel = await page.locator("#issue-summary").evaluate((node) => { const r = node.getBoundingClientRect(); return { x: r.x, width: r.width }; });
  await page.screenshot({ path: out("compass-record.png"), clip: { x: panel.x - 12, y: top.y - 14, width: panel.width + 24, height: bottom.y + bottom.height - top.y + 34 } });
  await page.getByRole("button", { name: "Restore Dispatch / context" }).click();
  await page.setViewportSize({ width: 1600, height: 900 });
}

await page.locator("#analytics-tab").click();
await page.locator("[data-analytics-level=MONTH]").click();
await page.locator('[data-analytics-level=MONTH][aria-selected=true]').waitFor();
await page.waitForTimeout(800);
await page.locator(".dashboard-trends").screenshot({ path: out("analytics-month.png") });
await page.screenshot({ path: out("analytics.png") });

await page.setViewportSize({ width: 1600, height: 1600 });
await page.locator("#settings-tab").click();
await page.locator('[data-model-role="event-planner"]').waitFor();
const roles = page.locator('[data-model-role]');
const first = await roles.first().boundingBox(); const last = await roles.last().boundingBox();
await page.screenshot({ path: out("settings-models.png"), clip: { x: Math.min(first.x, last.x) - 8, y: first.y - 8, width: Math.max(first.x + first.width, last.x + last.width) - Math.min(first.x, last.x) + 16, height: last.y + last.height - first.y + 16 } });
await browser.close();
console.log("screenshots written");
