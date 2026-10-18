import { expect, test } from "@playwright/test";

const SCREENS = { map: "#floor", issues: "#issue-list", events: "#event-feed", dispatch: ".context-panel", analytics: "#analytics-content", staffing: "#staffing-tile" };
const HIDDEN = { map: ["#issue-list", "#event-feed", ".context-panel"], issues: ["#floor", "#event-feed", ".context-panel"], events: ["#floor", "#issue-list", ".context-panel"], dispatch: ["#floor", "#issue-list", "#event-feed"], analytics: ["#floor", ".context-panel"], staffing: ["#floor", ".context-panel", "#event-feed"] };

for (const [screen, visible] of Object.entries(SCREENS)) {
  test(`wall display "${screen}" shows only its panel, the clock and no console controls`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/rooms/plant-1/display/${screen}`);
    await expect(page.locator("body")).toHaveClass(/display-mode/);
    await expect(page.locator(visible)).toBeVisible();
    for (const selector of HIDDEN[screen]) await expect(page.locator(selector)).toBeHidden();
    if (screen !== "analytics") await expect(page.locator("#simulation-time")).not.toHaveText("—");
    for (const selector of ["#control-room-tab", "#settings-tab", "#live-mode-button", "#reset-button", "#pause-resume-button", "#speed-select", "#open-control-search"]) await expect(page.locator(selector)).toBeHidden();
    await expect(page.locator("#floor-tiles")).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the console's Screens menu links each panel to its own display page", async ({ page }) => {
  await page.goto("/rooms/plant-1");
  await page.locator(".screen-launcher > summary").click();
  const links = page.locator("[data-display-screen]");
  await expect(links).toHaveCount(6);
  expect(await links.evaluateAll((rows) => rows.map((row) => row.getAttribute("href")))).toEqual(Object.keys(SCREENS).map((screen) => `/rooms/plant-1/display/${screen}`));
});

test("an unknown display screen falls back to the operator console", async ({ page }) => {
  await page.goto("/rooms/plant-1/display/nonsense");
  await expect(page.locator("body")).not.toHaveClass(/display-mode/);
  await expect(page.locator("#floor-tiles")).toBeVisible();
});
