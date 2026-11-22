// Firebase Remote Config client: router thresholds, model names and caps are tuned without a redeploy.
// The in-code defaults (config.ts, mirrored in remoteconfig.template.json) apply until a fetch succeeds and on any failure.
import { getRemoteConfig, fetchAndActivate, getAll, type RemoteConfig } from "firebase/remote-config";
import { DEFAULT_CONFIG, RC_KEYS, type FootingConfig } from "./config";
import { firebase } from "./firebase";

/** Pure merge: apply raw Remote Config strings over the defaults; ignore unknown keys and unparsable/out-of-range values. */
export function mergeRemote(base: FootingConfig, raw: Record<string, string>): { cfg: FootingConfig; applied: string[] } {
  const next: FootingConfig = { ...base };
  const applied: string[] = [];
  for (const [key, field] of Object.entries(RC_KEYS)) {
    const v = raw[key];
    if (v === undefined || v === "") continue;
    const cur = base[field];
    if (typeof cur === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      (next as unknown as Record<string, unknown>)[field] = n;
    } else if (field === "deviceNegativeStyle") {
      if (v !== "likely" && v !== "neutral") continue;
      next.deviceNegativeStyle = v;
    } else {
      if (!/^[a-z0-9][a-z0-9._-]{2,60}$/i.test(v)) continue;
      (next as unknown as Record<string, unknown>)[field] = v;
    }
    if (next[field] !== cur) applied.push(key);
  }
  return { cfg: next, applied };
}

let rc: RemoteConfig | undefined;

/** Fetch + activate the published template (4 s budget); on any failure returns the code defaults. */
export async function loadRemoteConfig(): Promise<{ cfg: FootingConfig; source: "remote" | "defaults"; applied: string[]; error?: string }> {
  try {
    if (!rc) {
      rc = getRemoteConfig(firebase().app);
      rc.settings.minimumFetchIntervalMillis = 5 * 60 * 1000;
      rc.settings.fetchTimeoutMillis = 4000;
      rc.defaultConfig = Object.fromEntries(Object.entries(RC_KEYS).map(([k, f]) => [k, String(DEFAULT_CONFIG[f])]));
    }
    await fetchAndActivate(rc);
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(getAll(rc))) if (v.getSource() === "remote") raw[k] = v.asString();
    const { cfg, applied } = mergeRemote(DEFAULT_CONFIG, raw);
    return { cfg, source: Object.keys(raw).length ? "remote" : "defaults", applied };
  } catch (e) {
    return { cfg: DEFAULT_CONFIG, source: "defaults", applied: [], error: String(e).slice(0, 200) };
  }
}
