import { expect, test } from "@playwright/test";

/**
 * Read-only coverage for the Settings tab's provider section.
 *
 * Deliberately does not click "Refresh available models" (a real network call
 * to AMD Token Factory, forbidden in this hermetic suite) or "Save settings"
 * (persists to backend/data/provider-settings.json, which this repo's
 * provider-settings service resolves to the same on-disk file the operator's
 * real deployment uses — this file has no per-test isolation, unlike the
 * simulation state, so a save here would silently rewrite production config).
 */

test("Settings offers AMD Token Factory as the only provider, with a write-only key field and no outbound call", async ({ page }) => {
  const requestsToProviders = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http://127.0.0.1")) requestsToProviders.push(url);
  });

  await page.goto("/rooms/plant-1");
  await page.getByRole("button", { name: "Settings" }).click();

  const providerSelect = page.locator("#settings-provider");
  const apiKeyInput = page.locator("#settings-api-key");
  await expect(providerSelect).toBeVisible();
  await expect(apiKeyInput).toHaveAttribute("type", "password");
  await expect(apiKeyInput).toHaveValue("");

  const optionTexts = await providerSelect.locator("option").allTextContents();
  expect(optionTexts).toHaveLength(1);
  expect(optionTexts[0]).toContain("AMD Token Factory");
  await expect(providerSelect).toHaveValue("amd");
  await expect(page.locator(".settings-card")).toContainText("AMD Token Factory");
  for (const removed of ["OpenAI", "OpenRouter", "GPT-OSS"]) {
    await expect(page.locator(".settings-card")).not.toContainText(removed);
  }

  expect(requestsToProviders).toEqual([]);
});
