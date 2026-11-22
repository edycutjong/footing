import { test, expect } from "@playwright/test";

// "Unplug must fail": with the network cut after the page has loaded, the cloud route must report failure.
// It may never invent a verdict, so no chip may read SUPPORTS / PARTIAL / NOT_SUPPORTED and the footed total
// may not count any citation as decided.
type Run = { state: string; quote?: string };
type Footing = { done: boolean; tally: { k: number; n: number }; runs: Run[] }; // n = citations with a final verdict, k = flagged ones

test("offline after load: the check reports failure and never produces a fake verdict", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __footing?: { device: string } }).__footing?.device !== "checking", undefined, { timeout: 60_000 });
  await context.setOffline(true);
  await page.getByRole("button", { name: /Check sources/ }).click();
  await page.waitForFunction(() => {
    const f = (window as unknown as { __footing?: Footing }).__footing;
    return !!f && (f.done || !!document.querySelector(".banner"));
  }, undefined, { timeout: 120_000, polling: 1000 });

  const f = await page.evaluate(() => (window as unknown as { __footing: Footing }).__footing);
  const fake = f.runs.filter((r) => ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"].includes(r.state));
  expect(fake, `verdicts produced with no network: ${JSON.stringify(fake)}`).toEqual([]);
  expect(f.tally.n, "citations counted as decided with no network").toBe(0);
  expect(f.tally.k, "citations flagged with no network").toBe(0);
  // The page says so: a banner, or every chip carries a "could not be checked" style state.
  const banner = await page.locator(".banner").count();
  const failedChips = f.runs.filter((r) => ["NOT_CHECKED", "UNVERIFIED", "NOT_FOUND_TRUNCATED", "CAP_REACHED"].includes(r.state)).length;
  expect(banner + failedChips, "the failure is visible to the user").toBeGreaterThan(0);
});
