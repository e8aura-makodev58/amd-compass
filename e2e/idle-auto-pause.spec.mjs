import { expect, test } from "@playwright/test";

const isHeartbeat = (request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/control-rooms/plant-1/activity";

test("real input sends the activity heartbeat; polling alone does not", async ({ page }) => {
  const heartbeats = [];
  page.on("request", (request) => { if (isHeartbeat(request)) heartbeats.push(request); });
  await page.goto("/rooms/plant-1");
  await expect(page.locator("#active-room-name")).toHaveText("plant-1");

  // Several 1.5 s state polls go by with nobody touching the page.
  await page.waitForResponse((response) => response.url().endsWith("/api/control-rooms/plant-1/state"));
  await page.waitForTimeout(3_200);
  expect(heartbeats).toHaveLength(0);

  const accepted = page.waitForResponse((response) => isHeartbeat(response.request()) && response.status() === 202);
  await page.keyboard.press("Shift");
  await accepted;

  // Throttled: more input inside the minute sends nothing further.
  await page.mouse.move(200, 200);
  await page.keyboard.press("Shift");
  await page.waitForTimeout(300);
  expect(heartbeats).toHaveLength(1);
});
