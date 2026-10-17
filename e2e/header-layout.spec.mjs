import { expect, test } from "@playwright/test";

for (const width of [920, 1024, 1280, 1440]) {
  for (const mode of ["Live", "Offline"]) {
    test(`${mode} header keeps every view tab and activity indicator unclipped at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/rooms/plant-1");
      await expect(page.locator(".topbar")).toBeVisible();
      if (mode === "Offline") {
        await page.getByRole("button", { name: "Offline Demo", exact: true }).click();
        await expect(page.getByRole("button", { name: "Reset Offline", exact: true })).toBeVisible();
      }
      await page.evaluate(() => document.fonts.ready);
      const measurements = await page.locator(".topbar").evaluate((header) => {
        const nav = header.querySelector(".tab-bar");
        const rect = (element) => {
          const { left, right, top, bottom, width, height } = element.getBoundingClientRect();
          return { left, right, top, bottom, width, height };
        };
        return {
          header: rect(header), nav: rect(nav), viewportWidth: document.documentElement.clientWidth,
          scrollWidth: header.scrollWidth, clientWidth: header.clientWidth,
          navScrollLeft: nav.scrollLeft,
          tabs: [...nav.querySelectorAll(".tab-button")].map((tab) => ({ label: tab.textContent, ...rect(tab) })),
          indicator: rect(nav.querySelector("#agent-activity-indicator")),
          dot: rect(nav.querySelector(".activity-dot")),
        };
      });
      const contained = (inner, outer, name) => {
        expect(inner.width, `${name} has width`).toBeGreaterThan(0);
        expect(inner.height, `${name} has height`).toBeGreaterThan(0);
        expect(inner.left, `${name} left`).toBeGreaterThanOrEqual(outer.left - 1);
        expect(inner.right, `${name} right`).toBeLessThanOrEqual(outer.right + 1);
        expect(inner.top, `${name} top`).toBeGreaterThanOrEqual(outer.top - 1);
        expect(inner.bottom, `${name} bottom`).toBeLessThanOrEqual(outer.bottom + 1);
      };
      expect(measurements.scrollWidth).toBeLessThanOrEqual(measurements.clientWidth + 1);
      expect(measurements.header.left).toBeGreaterThanOrEqual(0);
      expect(measurements.header.right).toBeLessThanOrEqual(measurements.viewportWidth + 1);
      expect(measurements.navScrollLeft).toBe(0);
      expect(measurements.tabs.map((tab) => tab.label)).toEqual(["Live Floor", "Control Rooms", "Analytics", "Settings"]);
      contained(measurements.nav, measurements.header, "tab bar");
      for (const tab of measurements.tabs) contained(tab, measurements.nav, tab.label);
      contained(measurements.indicator, measurements.nav, "activity indicator");
      contained(measurements.dot, measurements.indicator, "activity dot");
    });
  }
}
