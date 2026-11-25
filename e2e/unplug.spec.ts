import { test, expect, type Page } from "@playwright/test";

// "Unplug must fail": when a route is cut, the check must report failure and may never invent a verdict, so no chip
// may read SUPPORTS / PARTIAL / NOT_SUPPORTED and nothing may be counted as decided or flagged.
// Two cuts, because they fail at different places:
//   1. the whole network, after the page loaded: the source fetch fails first, so no model is ever reached;
//   2. only the Firebase AI Logic / Gemini hosts: sources are fetched and read fine, so it is the CLOUD ROUTE itself
//      that fails, and the app must say so instead of producing a verdict.
type Run = { state: string; quote?: string };
type Footing = { done: boolean; tally: { k: number; n: number }; runs: Run[] }; // n = citations with a final verdict, k = flagged ones

async function openAndWait(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => (window as unknown as { __footing?: { device: string } }).__footing?.device !== "checking", undefined, { timeout: 60_000 });
}

async function checkAndRead(page: Page): Promise<Footing & { banners: number }> {
  await page.getByRole("button", { name: /Check sources/ }).click();
  await page.waitForFunction(() => {
    const f = (window as unknown as { __footing?: Footing }).__footing;
    return !!f && (f.done || !!document.querySelector(".banner"));
  }, undefined, { timeout: 150_000, polling: 1000 });
  const f = await page.evaluate(() => (window as unknown as { __footing: Footing }).__footing);
  return { ...f, banners: await page.locator(".banner").count() };
}

function assertNoFakeVerdict(f: Footing & { banners: number }) {
  const fake = f.runs.filter((r) => ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"].includes(r.state));
  expect(fake, `verdicts produced while a route was cut: ${JSON.stringify(fake)}`).toEqual([]);
  expect(f.tally.n, "citations counted as decided").toBe(0);
  expect(f.tally.k, "citations flagged").toBe(0);
  const failedChips = f.runs.filter((r) => ["NOT_CHECKED", "UNVERIFIED", "NOT_FOUND_TRUNCATED", "CAP_REACHED"].includes(r.state)).length;
  expect(f.banners + failedChips, "the failure is visible to the user").toBeGreaterThan(0);
}

test("whole network cut after load: the check reports failure and never produces a verdict", async ({ page, context }) => {
  await openAndWait(page);
  await context.setOffline(true);
  assertNoFakeVerdict(await checkAndRead(page));
});

// Matched on the parsed hostname, anchored (incl. regional "<region>-aiplatform" hosts), so a source URL that merely
// mentions one of these names in its path or query is never cut by mistake.
const AI_HOST = /^(?:[a-z0-9-]+-)?(?:firebasevertexai|firebaseml|generativelanguage|aiplatform)\.googleapis\.com$/i;

test("AI Logic / Gemini hosts blocked, sources still readable: the cloud route fails loudly, no verdict", async ({ page }) => {
  const blocked: string[] = [];
  await page.route((url) => AI_HOST.test(url.hostname), (route) => { blocked.push(route.request().url()); return route.abort("internetdisconnected"); });
  await openAndWait(page);
  const f = await checkAndRead(page);
  expect(blocked.length, "the cloud model calls were really attempted and cut").toBeGreaterThan(0);
  assertNoFakeVerdict(f);
});
