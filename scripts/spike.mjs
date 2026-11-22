// Drives /spike in a real Chrome and saves each verbatim result to evidence/spike/<label>-<name>.json.
// Usage: node scripts/spike.mjs <label> <userDataDir> <baseUrl> <spike...>
// The App Check debug token (local only) comes from the FIREBASE_APPCHECK_DEBUG_TOKEN env var and is
// injected into the page; it is never written to disk by this script.
import { writeFileSync, mkdirSync } from "node:fs";
import { openChrome } from "./chrome.mjs";

const [label, userDataDir, baseUrl, ...names] = process.argv.slice(2);
const urlArg = process.env.SPIKE_URL ?? "";
const token = process.env.FIREBASE_APPCHECK_DEBUG_TOKEN;
mkdirSync("evidence/spike", { recursive: true });

const { browser, close } = await openChrome({ userDataDir, port: Number(process.env.CDP_PORT ?? 9223) });
try {
  const page = await browser.newPage();
  if (token) await page.evaluateOnNewDocument((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
  await page.goto(`${baseUrl}/spike${process.env.SPIKE_QUERY ?? ""}`, { waitUntil: "networkidle2", timeout: 120000 });
  const ua = await page.evaluate(() => navigator.userAgent);
  if (urlArg) await page.type("#url", urlArg);
  for (const name of names) {
    await page.click(`#run-${name}`);
    await page.waitForFunction((n) => window.__spike && window.__spike[n], { timeout: 600000 }, name);
    const r = await page.evaluate((n) => window.__spike[n], name);
    const rec = { label, recordedAt: new Date().toISOString(), baseUrl, userAgent: ua, appCheckDebugTokenInjected: !!token, machine: "MacBook Pro M1 Max, 32 GB", result: r };
    writeFileSync(`evidence/spike/${label}-${name}.json`, JSON.stringify(rec, null, 2) + "\n");
    console.log(name, r.ok ? "ok" : "FAIL", r.inferenceSource ?? "", r.ms + "ms", r.ok ? "" : JSON.stringify(r.error).slice(0, 300));
  }
} finally {
  await close();
}
