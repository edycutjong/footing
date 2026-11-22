// Local E2E on the Nano-enabled profile: drives the real page, then asserts the on-device route really ran.
// Usage: FIREBASE_APPCHECK_DEBUG_TOKEN=… npm run e2e:nano -- [userDataDir]   (needs `npm run dev` on port 3101)
// Exit 1 unless: the check finished with no banner, >= 1 citation was triaged ON DEVICE (inferenceSource on_device),
// every decided verdict carries a quote, and the cloud still decided at least one call (the hybrid split).
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";

const dir = process.argv[2] ?? `${homedir()}/.cache/footing-nano-chrome`;
const label = "e2e-nano";
const r = spawnSync("node", ["scripts/check-e2e.mjs", label, dir], { stdio: "inherit", env: process.env });
if (r.status !== 0) { console.error("check-e2e failed"); process.exit(1); }
const f = readdirSync("evidence/check").filter((n) => n.startsWith(label + "-") && n.endsWith(".json")).map((n) => `evidence/check/${n}`).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const rec = JSON.parse(readFileSync(f, "utf8"));
const fail = [];
if (rec.banner) fail.push(`banner: ${rec.banner}`);
if (!rec.done) fail.push("check did not finish");
if (rec.deviceBefore !== "available") fail.push(`Nano not available before the run (device=${rec.deviceBefore}); this profile cannot assert ON_DEVICE`);
const onDevice = rec.runs.filter((x) => x.sources.includes("on_device"));
const cloud = rec.runs.filter((x) => x.sources.includes("in_cloud"));
if (onDevice.length < 1) fail.push("no citation was triaged on device");
if (cloud.length < 1) fail.push("the cloud decided nothing (expected the hybrid escalation)");
for (const x of rec.runs.filter((x) => ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"].includes(x.state))) if (!(x.quote ?? "").trim()) fail.push(`decided verdict without a quote: ${x.id}`);
console.log(`e2e-nano: on_device=${onDevice.length} in_cloud=${cloud.length} file=${f}`);
if (fail.length) { console.error("FAIL\n- " + fail.join("\n- ")); process.exit(1); }
console.log("PASS");
