// Counts the cloud model calls recorded in evidence/ (spike files + eval rows) by model and outcome.
// Usage: node scripts/quota-count.mjs <YYYY-MM-DD>  → evidence/quota/observed-<date>.json
// Only calls that left an evidence file are counted; overwritten spike files and ad-hoc curl probes are not.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const date = process.argv[2];
const tally = {};
const add = (model, outcome, n = 1) => {
  tally[model] ??= {};
  tally[model][outcome] = (tally[model][outcome] ?? 0) + n;
};
const status = (msg) => (msg?.match(/\[(\d{3}) /)?.[1] ?? "other-error");
const SPIKE_CLOUD = new Set(["cloudJudge", "pdf", "urlContext", "urlContextSchema", "searchGrounding"]);

for (const f of readdirSync("evidence/spike")) {
  if (!f.endsWith(".json")) continue;
  const d = JSON.parse(readFileSync(`evidence/spike/${f}`, "utf8"));
  if (!d.recordedAt?.startsWith(date) || !d.result) continue;
  const r = d.result;
  const fromMsg = r.error?.message?.match(/models\/([\w.-]+):generateContent/)?.[1];
  // Model: from the result, the error URL, the recorded ?judge= query, or the run label used on 2026-11-22
  // (labels with "lite", "prod-" or "enforced" ran ?judge=gemini-3.5-flash-lite; "hydrogen" ran gemini-4-hydrogen;
  // plain "nano" and "nano-38flash" ran the default gemini-3.8-flash).
  const fromQuery = d.query?.match(/judge=([\w.-]+)/)?.[1];
  const fromLabel = /lite|^prod-|^enforced/.test(d.label) ? "gemini-3.5-flash-lite" : /hydrogen/.test(d.label) ? "gemini-4-hydrogen" : "gemini-3.8-flash";
  if (SPIKE_CLOUD.has(r.name)) add(r.model ?? fromMsg ?? fromQuery ?? fromLabel, r.ok ? "ok" : status(r.error?.message));
  // Assumption: the spike triage instance's cloud fallback is gemini-3.5-flash-lite (hard-coded in src/app/spike/page.tsx on 2026-11-22).
  else if (r.name === "triage" && r.inferenceSource === "in_cloud") add("gemini-3.5-flash-lite", "ok (triage cloud fallback)");
}
for (const set of ["eval-30", "eval-fresh-20"]) {
  for (const f of readdirSync(`evidence/${set}`)) {
    if (!f.startsWith("cloud-3class-")) continue;
    const d = JSON.parse(readFileSync(`evidence/${set}/${f}`, "utf8"));
    if (!d.recordedAt.startsWith(date)) continue;
    for (const r of d.rows) {
      for (const e of r.transientErrors ?? []) add(d.judgeModel, status(e));
      add(d.judgeModel, r.verdict ? "ok" : status(r.error));
    }
  }
}
const out = {
  date,
  note: "Cloud calls that left an evidence file on this date, by model and outcome (HTTP status for failures). Free tier, Gemini Developer API, no billing. Overwritten spike files and curl probes are not counted, so this is a lower bound. No RPM/RPD limit was published to us; 429 is the observed signal.",
  tally,
};
writeFileSync(`evidence/quota/observed-${date}.json`, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(tally));
