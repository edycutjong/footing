// Scores the raw eval rows into evidence/summary.json (the only source of figures shown on pages).
// Usage: node scripts/score.mjs   (reads the newest device-binary-* and cloud-3class-* file per set)
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const SETS = { "eval-30": { heldOut: false, note: "frozen 30, labelled 2026-11-21; an earlier prompt was scored on it, so not held-out" },
               "eval-fresh-20": { heldOut: true, note: "fresh 20, labelled and hashed before any model run" } };

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
function quantile(xs, q) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
}
function newest(set, prefix) {
  const dir = `evidence/${set}`;
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith(".json")).sort().pop();
  return f ? { file: `${dir}/${f}`, data: JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) } : null;
}

const out = { generatedAt: new Date().toISOString(), machine: "MacBook Pro M1 Max, 32 GB (on-device runs)", sets: {} };
for (const [set, meta] of Object.entries(SETS)) {
  const s = { ...meta };
  const dev = newest(set, "device-binary-");
  if (dev) {
    const rows = dev.data.rows;
    const ok = rows.filter((r) => r.verdict);
    const c = { TP: 0, FN: 0, FP: 0, TN: 0 };
    for (const r of ok) {
      if (r.gold === "SUPPORTS") c[r.verdict === "SUPPORTS" ? "TP" : "FN"]++;
      else c[r.verdict === "SUPPORTS" ? "FP" : "TN"]++;
    }
    // Router: the device settles only NOT_SUPPORTED with an empty quote; precision = share of those whose label is not SUPPORTS.
    const settled = ok.filter((r) => r.verdict === "NOT_SUPPORTED" && !(r.quote ?? "").trim());
    const settledRight = settled.filter((r) => r.label !== "SUPPORTS").length;
    const ms = ok.map((r) => r.ms);
    s.device = {
      file: dev.file, recordedAt: dev.data.recordedAt, n: rows.length, errors: rows.length - ok.length,
      correct: ok.filter((r) => r.correct).length, accuracyPct: pct(ok.filter((r) => r.correct).length, rows.length), confusion: c,
      onDevice: ok.filter((r) => r.inferenceSource === "on_device").length,
      settledOnDevice: settled.length, settledNegativePrecisionPct: pct(settledRight, settled.length), settledCorrect: settledRight,
      escalated: rows.length - settled.length,
      latencyMs: { p50: quantile(ms, 0.5), p95: quantile(ms, 0.95) },
    };
  }
  const cl = newest(set, "cloud-3class-");
  if (cl) {
    const rows = cl.data.rows;
    const ok = rows.filter((r) => r.verdict);
    const labels = ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"];
    const m = Object.fromEntries(labels.map((g) => [g, Object.fromEntries(labels.map((p) => [p, 0]))]));
    for (const r of ok) m[r.gold][r.verdict]++;
    const ms = ok.map((r) => r.ms);
    s.cloud = {
      file: cl.file, model: cl.data.judgeModel, recordedAt: cl.data.recordedAt, n: rows.length, errors: rows.length - ok.length,
      correct: ok.filter((r) => r.correct).length, accuracyPct: pct(ok.filter((r) => r.correct).length, rows.length), confusion: m,
      quoteGateHeld: ok.filter((r) => r.gateHeld).length, retriedCalls: rows.filter((r) => r.attempts > 1).length,
      latencyMs: { p50: quantile(ms, 0.5), p95: quantile(ms, 0.95) },
    };
  }
  out.sets[set] = s;
}
writeFileSync("evidence/summary.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out.sets, (k, v) => (k === "confusion" || k === "file" ? undefined : v), 1).slice(0, 1500));
