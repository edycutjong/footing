import { test, expect } from "@playwright/test";

// The judged flow, unmocked: open the URL, the sample answer is pre-filled, press "Check sources", and every
// citation is decided by a real Firebase AI Logic call behind the real App Check gate. CI's Chromium has no
// Gemini Nano, so the route is IN CLOUD for every chip; on a Nano laptop the same test accepts ON DEVICE too.
type Run = { id: string; state: string; sources: string[]; quote?: string; reason?: string; url: string };
type Footing = { done: boolean; device: string; tally: { k: number; n: number; total: number; notChecked: number; unverified: number }; runs: Run[]; cloudUsed: number };

test("check sources: chips land with a routing badge and every verdict carries a quote that passed the gate", async ({ page }) => {
  const token = process.env.FIREBASE_APPCHECK_DEBUG_TOKEN; // optional, CI-runner fallback only; unset on a normal run
  if (token) await page.addInitScript((t) => { (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __footing?: Footing }).__footing?.device !== "checking", undefined, { timeout: 60_000 });
  await page.getByRole("button", { name: /Check sources/ }).click();
  await page.waitForFunction(() => {
    const f = (window as unknown as { __footing?: Footing }).__footing;
    return !!f && (f.done || !!document.querySelector(".banner"));
  }, undefined, { timeout: 150_000, polling: 1000 });
  await expect(page.locator(".banner"), "App Check or AI Logic refused the check").toHaveCount(0);

  const f = await page.evaluate(() => (window as unknown as { __footing: Footing }).__footing);
  expect(f.done).toBe(true);
  expect(f.runs.length).toBeGreaterThanOrEqual(5);
  const decided = f.runs.filter((r) => ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"].includes(r.state));
  expect(decided.length, "citations decided by a model").toBeGreaterThanOrEqual(5);

  // The routing badge is the response's real inferenceSource, and on a no-Nano browser it is the cloud.
  await expect(page.locator(".chip .badge.c", { hasText: "IN CLOUD" }).first()).toBeVisible();
  if (f.device !== "available") expect(await page.locator(".chip .badge.d").count()).toBe(0);
  for (const r of decided) expect(r.sources.length, `route recorded for ${r.id}`).toBeGreaterThan(0);

  // Quote gate: nothing is shown as a verdict without a non-empty quote. (The gate itself, that the quote is
  // verbatim in the fetched source, is covered by test/text-bm25-gate.test.ts; a failed gate shows UNVERIFIED.)
  for (const r of decided) expect((r.quote ?? "").trim().length, `quote for ${r.id}`).toBeGreaterThan(10);
  expect(f.tally.k).toBeLessThanOrEqual(f.tally.n);

  // The evidence pane opens on a decided chip and shows the sentence beside the source quote.
  const firstDecided = f.runs.findIndex((r) => ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"].includes(r.state));
  expect(firstDecided).toBeGreaterThanOrEqual(0);
  await page.locator(".chip").nth(firstDecided).click();
  const pane = page.getByRole("dialog");
  await expect(pane).toBeVisible();
  await expect(pane.getByRole("heading", { name: /^The sentence/ })).toBeVisible();
  await expect(pane.getByRole("heading", { name: "Route trail" })).toBeVisible();
  await expect(pane.getByRole("link", { name: /open source/ })).toBeVisible();
  await pane.getByRole("button", { name: /Close evidence/ }).click();
  await expect(pane).toHaveCount(0);
});
