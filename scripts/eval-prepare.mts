// Builds the model inputs for an eval set from a labels file and a folder of extracted source texts.
// Usage: npx tsx scripts/eval-prepare.mts <set> <labels.json> <sourcesDir>
// Writes evidence/<set>/passages.json (committed: top-3 excerpts ≤ 700 chars + URL + content sha256)
// and .cache/footing-eval/<set>-windows.json (the judge's source-text window; third-party text, gitignored, never committed).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { normalize, toPassages } from "../src/lib/text.ts";
import { bm25TopK } from "../src/lib/bm25.ts";
import { ensureWindowsDir, windowsPath } from "./eval-windows.mjs";

const [set, labelsPath, sourcesDir] = process.argv.slice(2);
const JUDGE_MAX = 24000;
type Label = { id: string; claim: string; url: string; src: string; label: string };
const labels: Label[] = JSON.parse(readFileSync(labelsPath, "utf8"));
const rows = [];
const windows: Record<string, { window: string; truncated: boolean }> = {};
for (const l of labels) {
  const text = normalize(readFileSync(`${sourcesDir}/${l.src}.txt`, "utf8"));
  const top = bm25TopK(l.claim, toPassages(text), 3);
  rows.push({
    id: l.id,
    claim: l.claim,
    url: l.url,
    contentSha256: createHash("sha256").update(text).digest("hex"),
    contentChars: text.length,
    passages: top.map((t) => t.text),
  });
  windows[l.id] = { window: text.slice(0, JUDGE_MAX), truncated: text.length > JUDGE_MAX };
}
mkdirSync(`evidence/${set}`, { recursive: true });
ensureWindowsDir();
writeFileSync(`evidence/${set}/passages.json`, JSON.stringify(rows, null, 2) + "\n");
writeFileSync(windowsPath(set), JSON.stringify(windows), { mode: 0o600 });
console.log(`${set}: ${rows.length} pairs prepared`);
