// Runs one eval set through the real Chrome profile and writes raw rows to evidence/<set>/<mode>-<date>.json.
// Usage: node scripts/eval.mjs <set> <triage|judge> <userDataDir> [judgeModel]
// Needs: npm run dev (port 3101), evidence/<set>/labels.json + passages.json, /tmp/footing-eval/<set>-windows.json (judge).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { openChrome } from "./chrome.mjs";

const [set, mode, userDataDir, judgeModel = "gemini-3.5-flash-lite"] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3101";
const labels = Object.fromEntries(JSON.parse(readFileSync(`evidence/${set}/labels.json`, "utf8")).map((l) => [l.id, l]));
const pairs = JSON.parse(readFileSync(`evidence/${set}/passages.json`, "utf8"));
const wpath = `/tmp/footing-eval/${set}-windows.json`;
const windows = mode === "judge" ? JSON.parse(readFileSync(wpath, "utf8")) : {};
const token = process.env.FIREBASE_APPCHECK_DEBUG_TOKEN;
const date = new Date().toISOString().slice(0, 10);
const tag = mode === "judge" ? `cloud-3class-${judgeModel}` : "device-binary";
const outPath = `evidence/${set}/${tag}-${date}.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { browser, close } = await openChrome({ userDataDir, port: Number(process.env.CDP_PORT ?? 9223) });
const rows = [];
try {
  const page = await browser.newPage();
  if (token) await page.evaluateOnNewDocument((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
  await page.goto(`${base}/eval/run`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector('#eval-runner[data-ready="true"]', { timeout: 60000 });
  const ua = await page.evaluate(() => navigator.userAgent);
  for (const p of pairs) {
    const input = { mode, sentence: p.claim, passages: p.passages, timeoutMs: 20000, quoteMax: 300, judgeModel, ...(windows[p.id] ?? {}) };
    let r, attempts = 0;
    const errors = [];
    // Retry only transient cloud errors (429 / 5xx), with backoff; every attempt is recorded.
    for (;;) {
      attempts++;
      r = await page.evaluate((i) => window.__evalPair(i), input);
      if (!r.error || mode !== "judge" || !/\[(429|500|502|503)/.test(r.error) || attempts >= 4) break;
      errors.push(r.error.slice(0, 600));
      await sleep(15000 * attempts);
    }
    const label = labels[p.id].label;
    const gold = mode === "triage" ? (label === "SUPPORTS" ? "SUPPORTS" : "NOT_SUPPORTED") : label;
    rows.push({ id: p.id, label, gold, ...r, attempts, transientErrors: errors, correct: r.verdict ? r.verdict === gold : false });
    console.log(p.id, gold, r.verdict ?? "ERR", r.gateHeld ?? "", r.inferenceSource ?? "", `${r.ms}ms`, attempts > 1 ? `attempts=${attempts}` : "", r.error ? r.error.slice(0, 120) : "");
    if (mode === "judge") await sleep(Number(process.env.JUDGE_GAP_MS ?? 2000));
  }
  const rec = { set, mode, judgeModel: mode === "judge" ? judgeModel : null, recordedAt: new Date().toISOString(), machine: "MacBook Pro M1 Max, 32 GB", userAgent: ua, rows };
  if (existsSync(outPath)) console.log(`overwriting ${outPath}`);
  writeFileSync(outPath, JSON.stringify(rec, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
} finally {
  await close();
}
