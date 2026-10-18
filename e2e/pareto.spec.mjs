import { expect, test } from "@playwright/test";
import { buildParetoAnalytics } from "../backend/src/pareto-analytics.mjs";

// The E2E room has little history, so the panel is fed a fixed month built by the real
// aggregation from a small synthetic record set.
function payload(query) {
  const issues = [], resolutionHistory = [];
  const rows = [["B", "B-SLOW", "EQ-01", 4], ["B", "B-STOP", "EQ-01", 2], ["A", "A-DRIFT", "EQ-02", 3], ["C", "C-UNSTABLE", "EQ-02", 1]];
  let n = 0;
  for (const [issueClass, code, equipmentId, copies] of rows) for (let copy = 0; copy < copies; copy += 1) {
    const raisedAt = new Date(Date.parse("2026-09-05T10:00:00Z") + n * 3_600_000).toISOString(), id = `ISS-${++n}`;
    issues.push({ id, equipmentId, issueClass, status: "RESOLVED", raisedAt, downtimeStartedAt: raisedAt, resolvedAt: new Date(Date.parse(raisedAt) + 20 * 60_000).toISOString(), symptom: { code, text: `Symptom ${code}.` } });
    resolutionHistory.push({ id: `H-${n}`, issueId: id, issueClass, equipmentId, symptomCode: code, success: copy % 2 === 0, resolutionMinutes: 10, resolvedAt: new Date(Date.parse(raisedAt) + 10 * 60_000).toISOString(), fixApplied: { id: `FIX-${issueClass}-0${(copy % 2) + 1}`, title: `Procedure ${copy % 2 + 1}` }, legacyFix: false, fixAttemptNumber: 1 });
  }
  const state = { simulationState: { simulationTime: "2026-10-06T08:00:00.000Z" }, equipment: [{ id: "EQ-01", name: "Station 1", floor: 1 }, { id: "EQ-02", name: "Station 2", floor: 2 }], issues, resolutionHistory, operationalEvents: [{ eventType: "SIMULATION_STARTED", simulationTimestamp: "2026-08-31T08:00:00.000Z" }], recommendations: [] };
  return { mode: "LIVE", ...buildParetoAnalytics(state, { level: query.get("level") ?? "MONTH", period: query.get("period") }) };
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/control-rooms/plant-1/analytics/pareto?*", (route) => route.fulfill({ json: payload(new URL(route.request().url()).searchParams) }));
});

test("the Pareto display screen drills from issue class to symptom to applied fix", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/rooms/plant-1/display/pareto");
  await expect(page.locator("#pareto-heading")).toHaveText("Issue Pareto");
  await expect(page.locator("#analytics-content")).toBeHidden();
  await expect(page.locator("#pareto-period")).toHaveValue("1");
  await expect(page.locator(".pareto-bar")).toHaveCount(3);
  await expect(page.locator(".pareto-insight")).toContainText("2 of 3 issue classes account for 80% of issues");
  await expect(page.locator(".pareto-table tbody tr").first()).toContainText("Material transfer (Class B)");
  await page.locator(".pareto-bar.drillable rect").first().click();
  await expect(page.locator(".pareto-crumbs")).toContainText("Material transfer (Class B)");
  await expect(page.locator(".pareto-crumbs")).toContainText("by observed symptom");
  // Keyboard drill on a pie slice (a large slice's box centre falls in the donut hole).
  await page.locator('.pareto-slice[data-pareto-drill="B-SLOW"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".pareto-crumbs")).toContainText("by applied fix");
  await expect(page.locator(".pareto-table thead")).toContainText("Fix attempts");
  await page.locator('[data-pareto-measure="failedAttempts"]').click();
  await expect(page.locator(".pareto-table tbody tr")).toHaveCount(1);
  await page.locator('[data-pareto-crumb="0"]').click();
  await page.locator('[data-pareto-dimension="location"]').click();
  await expect(page.locator(".pareto-crumbs")).toContainText("by floor");
  await expect(page.locator(".pareto-bar")).toHaveCount(2);
});

test("the Analytics tab carries the Pareto panel and it fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/rooms/plant-1");
  await page.locator("#analytics-tab").click();
  await expect(page.locator(".pareto-svg")).toBeVisible();
  await page.locator('[data-pareto-level="WEEK"]').click();
  await expect(page.locator('[data-pareto-level="WEEK"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pareto-period option")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
