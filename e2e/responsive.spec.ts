import { test, expect } from "@playwright/test";

for (const [name, width, height] of [["mobile", 375, 800], ["tablet", 768, 1024], ["desktop", 1440, 900]] as const) {
  test(`layout at ${name} (${width}px): no horizontal overflow, header and check button inside the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Check sources/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);
    const box = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);
    const btn = await page.getByRole("button", { name: /Check sources/ }).boundingBox();
    expect(btn && btn.height).toBeGreaterThanOrEqual(36);
  });
}
