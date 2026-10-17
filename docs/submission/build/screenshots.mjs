// Captures the slide screenshots from a running ResponseCompass (paused month seed,
// providers forced off). Usage: node docs/submission/build/screenshots.mjs http://127.0.0.1:3013
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://127.0.0.1:3013";
const out = (name) => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });

await page.request.post(`${base}/api/control-rooms/plant-1/simulation/speed`, { data: { speed: 5 } });
await page.goto(`${base}/rooms/plant-1`);
await page.locator(".building").waitFor();
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
await page.screenshot({ path: out("live-floor.png") });

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
