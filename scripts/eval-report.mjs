// npm run eval — reproduces every figure in evidence/summary.json from the committed raw rows (no model calls):
// accuracy, confusion matrix, latency p50/p95, on-device settles, cloud quote-gate holds. Exits 1 on any mismatch.
// Live re-run (real Chrome + Nano + AI Logic): npm run eval:live -- <set> <triage|judge> <userDataDir> [judgeModel]
import { readFileSync } from "node:fs";

const summary = JSON.parse(readFileSync("evidence/summary.json", "utf8"));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null; };
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
let bad = 0;
const same = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { bad++; console.log(`  MISMATCH ${name}: rows give ${JSON.stringify(got)}, summary says ${JSON.stringify(want)}`); }
};

for (const [set, s] of Object.entries(summary.sets)) {
  console.log(`\n${set} — ${s.heldOut ? "held-out" : "NOT held-out"} (${s.note})`);
  if (s.device) {
    const rows = JSON.parse(readFileSync(s.device.file, "utf8")).rows;
    const ok = rows.filter((r) => r.verdict);
    const c = { TP: 0, FN: 0, FP: 0, TN: 0 };
    for (const r of ok) c[r.gold === "SUPPORTS" ? (r.verdict === "SUPPORTS" ? "TP" : "FN") : (r.verdict === "SUPPORTS" ? "FP" : "TN")]++;
    const correct = ok.filter((r) => r.correct).length;
    const settled = ok.filter((r) => r.verdict === "NOT_SUPPORTED" && !(r.quote ?? "").trim());
    const ms = ok.map((r) => r.ms);
    console.log(`  Nano binary triage (on device): ${correct}/${rows.length} = ${pct(correct, rows.length)}%`);
    console.log(`                 predicted S   predicted NS`);
    console.log(`    label S        ${String(c.TP).padStart(3)}           ${String(c.FN).padStart(3)}`);
    console.log(`    label non-S    ${String(c.FP).padStart(3)}           ${String(c.TN).padStart(3)}`);
    console.log(`    settled on device: ${settled.length} (${settled.filter((r) => r.label !== "SUPPORTS").length} correct) · latency p50 ${q(ms, 0.5)} ms, p95 ${q(ms, 0.95)} ms`);
    same(`${set} device correct`, correct, s.device.correct);
    same(`${set} device confusion`, c, s.device.confusion);
    same(`${set} device latency`, { p50: q(ms, 0.5), p95: q(ms, 0.95) }, s.device.latencyMs);
    same(`${set} device settled`, settled.length, s.device.settledOnDevice);
  }
  if (s.cloud) {
    const rows = JSON.parse(readFileSync(s.cloud.file, "utf8")).rows;
    const ok = rows.filter((r) => r.verdict);
    const L = ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"];
    const m = Object.fromEntries(L.map((g) => [g, Object.fromEntries(L.map((p) => [p, 0]))]));
    for (const r of ok) m[r.gold][r.verdict]++;
    const correct = ok.filter((r) => r.correct).length;
    const ms = ok.map((r) => r.ms);
    console.log(`  Cloud judge ${s.cloud.model} (3-class): ${correct}/${rows.length} = ${pct(correct, rows.length)}%`);
    console.log(`    label \\ predicted   SUPPORTS  PARTIAL  NOT_SUPPORTED`);
    for (const g of L) console.log(`    ${g.padEnd(18)} ${L.map((p) => String(m[g][p]).padStart(8)).join(" ")}`);
    console.log(`    quote found (eval rule, passages joined): ${ok.filter((r) => r.gateHeld).length}/${ok.length} · latency p50 ${q(ms, 0.5)} ms, p95 ${q(ms, 0.95)} ms`);
    same(`${set} cloud correct`, correct, s.cloud.correct);
    same(`${set} cloud confusion`, m, s.cloud.confusion);
    same(`${set} cloud latency`, { p50: q(ms, 0.5), p95: q(ms, 0.95) }, s.cloud.latencyMs);
  }
}
console.log(bad ? `\n${bad} mismatch(es) between raw rows and summary.json` : "\nAll figures in evidence/summary.json reproduce from the raw rows.");
process.exit(bad ? 1 : 0);
