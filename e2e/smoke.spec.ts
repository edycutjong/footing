import { test, expect } from "@playwright/test";

test.describe("smoke: the page loads the real product", () => {
  test("home renders the answer sheet and the check button, with no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      // The built-in-AI probe logs nothing at error level on a healthy page; App Check or SDK failures would.
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Footing" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Check sources/ })).toBeEnabled();
    await expect(page.locator("section.sheet")).toBeVisible();
    expect(errors, `console/page errors: ${errors.join(" | ")}`).toEqual([]);
  });

  test("social-card and favicon metadata are present", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Footing/);
    for (const sel of ['meta[property="og:image"]', 'meta[name="twitter:card"][content="summary_large_image"]', 'link[rel~="icon"]']) {
      await expect(page.locator(sel).first(), sel).toHaveCount(1);
    }
  });

  test("/api/health reports App Check verification on and a build sha", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.appCheckVerify).toBe(true);
    expect(body.sha).toMatch(/^[0-9a-f]{7,40}$/);
  });

  test("the fetch proxy refuses a call without an App Check token", async ({ request }) => {
    const res = await request.get("/api/fetch?url=" + encodeURIComponent("https://example.com/"));
    expect(res.status()).toBe(401);
  });

  test("the fetch proxy refuses a forged App Check token, even for a private address", async ({ request }) => {
    const res = await request.get("/api/fetch?url=" + encodeURIComponent("http://169.254.169.254/latest/meta-data/"), { headers: { "X-Firebase-AppCheck": "not-a-real-token" } });
    expect(res.status()).toBe(401);
  });

  test("/eval shows the measured accuracy rows", async ({ page }) => {
    await page.goto("/eval");
    await expect(page.getByText(/24 of 30/).first()).toBeVisible();
    await expect(page.getByText(/of 20/).first()).toBeVisible();
  });
});
