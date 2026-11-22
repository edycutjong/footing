// Latency bench: per-claim p50/p95 on device (Gemini Nano, binary triage) and in the cloud (3-class judge),
// through the same Firebase AI Logic calls the app makes. Writes evidence/bench.json with every raw row.
// Usage: BENCH_SET=eval-fresh-20 BENCH_REPS=2 npm run bench -- <nanoUserDataDir> [judgeModel]
// Needs: `npm run dev` (port 3101; /eval/run is dev-only), /tmp/footing-eval/<set>-windows.json (npm run eval:prepare),
//        the Nano-enabled Chrome profile, FIREBASE_APPCHECK_DEBUG_TOKEN (local only, never written to disk).
// Timings include the SDK call, the network (cloud) and the model; they exclude source fetching.
import { readFileSync, writeFileSync } from "node:fs";
import { openChrome } from "./chrome.mjs";

const [userDataDir, judgeModel = "gemini-3.5-flash-lite"] = process.argv.slice(2);
if (!userDataDir) { console.error("usage: npm run bench -- <nanoUserDataDir> [judgeModel]"); process.exit(2); }
const set = process.env.BENCH_SET ?? "eval-fresh-20";
const reps = Number(process.env.BENCH_REPS ?? 2);
const base = process.env.BASE_URL ?? "http://localhost:3101";
const token = process.env.FIREBASE_APPCHECK_DEBUG_TOKEN;
const pairs = JSON.parse(readFileSync(`evidence/${set}/passages.json`, "utf8"));
const windows = JSON.parse(readFileSync(`/tmp/footing-eval/${set}-windows.json`, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };

const { browser, close } = await openChrome({ userDataDir, port: Number(process.env.CDP_PORT ?? 9223) });
const rows = [];
let userAgent = null;
try {
  const page = await browser.newPage();
  if (token) await page.evaluateOnNewDocument((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
  await page.goto(`${base}/eval/run`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForSelector('#eval-runner[data-ready="true"]', { timeout: 60000 });
  userAgent = await page.evaluate(() => navigator.userAgent);
  // One untimed warm-up per route (model load / first token fetch), recorded as such and excluded from the stats.
  for (const mode of ["triage", "judge"]) {
    const p = pairs[0];
    const r = await page.evaluate((i) => window.__evalPair(i), { mode, sentence: p.claim, passages: p.passages, timeoutMs: 60000, quoteMax: 300, judgeModel, ...(mode === "judge" ? windows[p.id] : {}) });
    console.log(`warm-up ${mode}: ${r.inferenceSource ?? "?"} ${r.ms}ms${r.error ? " ERR " + r.error.slice(0, 100) : ""}`);
    if (mode === "judge") await sleep(2000);
  }
  for (let rep = 1; rep <= reps; rep++) {
    for (const mode of ["triage", "judge"]) {
      for (const p of pairs) {
        let r, attempts = 0;
        for (;;) {
          attempts++;
          r = await page.evaluate((i) => window.__evalPair(i), { mode, sentence: p.claim, passages: p.passages, timeoutMs: 60000, quoteMax: 300, judgeModel, ...(mode === "judge" ? windows[p.id] : {}) });
          if (!r.error || mode !== "judge" || !/\[(429|500|502|503)/.test(r.error) || attempts >= 4) break;
          await sleep(15000 * attempts); // a 429 backoff is not latency: only the final successful attempt is timed
        }
        rows.push({ rep, route: mode === "triage" ? "on_device" : "in_cloud", id: p.id, ms: r.ms, inferenceSource: r.inferenceSource ?? null, ok: !r.error, attempts });
        if (mode === "judge") await sleep(Number(process.env.JUDGE_GAP_MS ?? 2000));
      }
    }
    console.log(`rep ${rep}/${reps} done`);
  }
} finally {
  await close();
}
const stats = (route) => {
  const rs = rows.filter((r) => r.route === route);
  const ok = rs.filter((r) => r.ok && r.inferenceSource === (route === "on_device" ? "on_device" : "in_cloud"));
  const ms = ok.map((r) => r.ms);
  return { calls: rs.length, ok: ok.length, wrongSourceOrError: rs.length - ok.length, p50_ms: q(ms, 0.5), p95_ms: q(ms, 0.95), min_ms: Math.min(...ms), max_ms: Math.max(...ms) };
};
const out = {
  recordedAt: new Date().toISOString(), set, reps, claimsPerRep: pairs.length, judgeModel, machine: "MacBook Pro M1 Max, 32 GB", userAgent,
  method: "page.evaluate(window.__evalPair) on the dev-only /eval/run harness: the same Firebase AI Logic calls as the app (PREFER_ON_DEVICE binary triage; ONLY_IN_CLOUD 3-class judge). One untimed warm-up per route. Quantile = nearest-rank. Excludes source fetching.",
  on_device: stats("on_device"), in_cloud: stats("in_cloud"), rows,
};
writeFileSync("evidence/bench.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ on_device: out.on_device, in_cloud: out.in_cloud }, null, 2));
if (out.on_device.ok === 0 || out.in_cloud.ok === 0) { console.error("a route produced no successful, correctly-sourced call"); process.exit(1); }
