// Drives the real check page in the installed Chrome and saves the full run (every route, verdict, quote,
// inferenceSource and latency) to evidence/check/<label>-<date>.json.
// Usage: node scripts/check-e2e.mjs <label> <userDataDir> [--force auto|device|cloud] [--answer file.md] [--confirm-first-likely]
// Needs the dev server (npm run dev, port 3101) or BASE_URL. App Check debug token (local only) from env
// FIREBASE_APPCHECK_DEBUG_TOKEN, injected into the page and never written to disk.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { openChrome } from "./chrome.mjs";

const [label, userDataDir, ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : d; };
const force = arg("--force", "auto");
const answerFile = arg("--answer", null);
const base = process.env.BASE_URL ?? "http://localhost:3101";
const token = process.env.FIREBASE_APPCHECK_DEBUG_TOKEN;
const now = new Date();
const day = now.toISOString().slice(0, 10);
// Never overwrite an earlier run of the same label on the same day: the second one gets -HHMM.
const date = existsSync(`evidence/check/${label}-${day}.json`) ? `${day}-${now.toISOString().slice(11, 16).replace(":", "")}` : day;

const { browser, close } = await openChrome({ userDataDir, port: Number(process.env.CDP_PORT ?? 9224) });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  if (token) await page.evaluateOnNewDocument((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
  await page.goto(base + "/", { waitUntil: "networkidle2", timeout: 180000 });
  await page.waitForFunction(() => window.__footing && window.__footing.device !== "checking", { timeout: 60000 });
  if (answerFile) {
    await page.click('button[aria-expanded]');
    await page.$eval("#paste", (el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, readFileSync(answerFile, "utf8"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Use this answer").click());
  }
  const label2 = { auto: "Auto", device: "On-device only", cloud: "Cloud only" }[force];
  await page.evaluate((l) => [...document.querySelectorAll(".seg button")].find((b) => b.textContent === l).click(), label2);
  const ua = await page.evaluate(() => navigator.userAgent);
  const deviceBefore = await page.evaluate(() => window.__footing.device);
  const t0 = Date.now();
  await page.evaluate(() => [...document.querySelectorAll("button.primary")].find((b) => /Check sources|Check again/.test(b.textContent)).click());
  await page.waitForFunction(() => window.__footing && (window.__footing.done || document.querySelector(".banner")), { timeout: 900000, polling: 1000 });
  const wallMs = Date.now() - t0;
  const banner = await page.evaluate(() => document.querySelector(".banner")?.textContent ?? null);
  let state = await page.evaluate(() => window.__footing);
  if (rest.includes("--confirm-first-likely")) {
    const i = state.runs.findIndex((r) => r.state === "LIKELY_UNSUPPORTED");
    if (i >= 0) {
      await page.evaluate((idx) => document.querySelectorAll(".chip")[idx].click(), i);
      await page.evaluate(() => [...document.querySelectorAll(".pane button.primary")][0]?.click());
      await page.waitForFunction((id) => !["deciding", "LIKELY_UNSUPPORTED"].includes(window.__footing.runs.find((r) => r.id === id).state), { timeout: 300000 }, state.runs[i].id);
      state = await page.evaluate(() => window.__footing);
    }
  }
  mkdirSync("evidence/check", { recursive: true });
  const shot = `evidence/check/${label}-${date}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  const rec = { label, force, answer: answerFile ?? "seed/answers/hero.json", recordedAt: new Date().toISOString(), baseUrl: base, userAgent: ua, machine: "MacBook Pro M1 Max, 32 GB", deviceBefore, appCheckDebugTokenInjected: !!token, wallMs, banner, ...state };
  writeFileSync(`evidence/check/${label}-${date}.json`, JSON.stringify(rec, null, 2) + "\n");
  const t = state.tally;
  console.log(`${label}: device=${deviceBefore} force=${force} wall=${wallMs}ms k=${t.k} n=${t.n} j=${t.j} u=${t.unverified} x=${t.notChecked} p=${t.pending} cloudUsed=${state.cloudUsed}${banner ? " BANNER " + banner : ""}`);
  for (const r of state.runs) console.log(` s${r.s} [${r.n}] ${r.state.padEnd(20)} ${r.sources.join("→").padEnd(18)} ${(r.reason ?? "").slice(0, 90)}`);
} finally {
  await close();
}
