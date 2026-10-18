// Captures each wall-display screen (one panel per monitor) for the control-room wall
// slide. Read-only: it opens display pages and never posts to the API.
// Usage: node docs/submission/build/wall-screens.mjs <baseUrl>
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const [base = "http://127.0.0.1:3013"] = process.argv.slice(2);
const out = (name) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
const ready = { map: ".building", issues: "#issue-list .issue-card", events: "#event-feed > *", dispatch: "#issue-summary *", analytics: "#analytics-content .analytics-panel", pareto: ".pareto-svg" };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
for (const [screen, selector] of Object.entries(ready)) {
  await page.goto(`${base}/rooms/plant-1/display/${screen}`);
  await page.locator(selector).first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out(`screen-${screen}.png`) });
  console.log(`screen-${screen}.png`);
}
await browser.close();
