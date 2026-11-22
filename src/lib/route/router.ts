// The router: a pure function of capability, not policy. Where does one (sentence, source) pair go, and what
// happens after Nano's binary triage. No I/O; every row of the routing table has a unit test.
import type { FootingConfig } from "../config";

export type Kind = "html" | "pdf" | "js-only" | "failed";
export type Device = "available" | "downloadable" | "downloading" | "unavailable";
export type Force = "auto" | "device" | "cloud";
export type RouteTo = "DEVICE_TRIAGE" | "CLOUD_DECIDE" | "CLOUD_URL_CONTEXT" | "NOT_CHECKED";
export type AfterTo = "SETTLED_ON_DEVICE" | "ESCALATE" | "CAP_REACHED";

export interface FetchInfo { ok: boolean; status?: number; error?: string; textChars?: number }
export interface Route {
  to: RouteTo;
  reason: string;
  /** DEVICE_TRIAGE only: PREFER_ON_DEVICE normally; ONLY_ON_DEVICE when forced or when the cloud cap is spent
   *  (so an SDK fallback cannot make an uncounted cloud call). */
  deviceMode?: "PREFER_ON_DEVICE" | "ONLY_ON_DEVICE";
  /** NOT_CHECKED because of the cap: the chip offers "check this one". */
  capped?: boolean;
}

export interface TriageResult {
  verdict?: "SUPPORTS" | "NOT_SUPPORTED";
  quote?: string;
  inferenceSource?: string;
  error?: "timeout" | "malformed" | "sdk";
}
export interface After { to: AfterTo; reason: string }

type Cfg = Pick<FootingConfig, "citationCloudCap" | "jsMinTextChars">;

const pct = (p?: number) => (p === undefined ? "" : ` (${Math.round(p * 100)}%)`);

/** Effective kind: a readable-HTML fetch with too little text is a page that needs JavaScript. */
export function effectiveKind(kind: Kind, fetch: FetchInfo, cfg: Cfg): Kind {
  if (!fetch.ok || (fetch.status ?? 200) >= 400) return "failed";
  if (kind === "html" && (fetch.textChars ?? 0) < cfg.jsMinTextChars) return "js-only";
  return kind;
}

export function route(kind: Kind, fetch: FetchInfo, device: Device, cfg: Cfg, force: Force, cloudUsed: number, progress?: number): Route {
  const k = effectiveKind(kind, fetch, cfg);
  if (k === "failed") return { to: "NOT_CHECKED", reason: fetch.error ?? (fetch.status ? `source returned ${fetch.status}` : "source could not be fetched") };
  const capSpent = cloudUsed >= cfg.citationCloudCap;

  if (force === "device") {
    if (k === "js-only") return { to: "NOT_CHECKED", reason: "On-device only: this page needs JavaScript, which only the cloud can read" };
    if (device === "unavailable") return { to: "NOT_CHECKED", reason: "On-device only: no on-device model in this browser" };
    if (k === "pdf") return { to: "DEVICE_TRIAGE", deviceMode: "ONLY_ON_DEVICE", reason: "On-device only: PDF sent to the on-device model (PDF input is cloud-only)" };
    if (device !== "available") return { to: "DEVICE_TRIAGE", deviceMode: "ONLY_ON_DEVICE", reason: `On-device only: waiting for the model download${pct(progress)}` };
    return { to: "DEVICE_TRIAGE", deviceMode: "ONLY_ON_DEVICE", reason: "On-device only: checked on this laptop" };
  }

  let cloud: Route;
  if (k === "js-only") cloud = { to: "CLOUD_URL_CONTEXT", reason: "page needs JavaScript — read in the cloud" };
  else if (k === "pdf") cloud = { to: "CLOUD_DECIDE", reason: "PDF input is cloud-only" };
  else if (force === "cloud") cloud = { to: "CLOUD_DECIDE", reason: "you chose Cloud only" };
  else if (device === "available")
    return { to: "DEVICE_TRIAGE", deviceMode: capSpent ? "ONLY_ON_DEVICE" : "PREFER_ON_DEVICE", reason: "readable page — checked on this laptop first" };
  else if (device === "unavailable") cloud = { to: "CLOUD_DECIDE", reason: "no on-device model in this browser" };
  else if (device === "downloading") cloud = { to: "CLOUD_DECIDE", reason: `on-device model downloading${pct(progress)}` };
  else cloud = { to: "CLOUD_DECIDE", reason: "on-device model not downloaded yet" };

  if (capSpent) return { to: "NOT_CHECKED", capped: true, reason: "cloud cap for this answer reached — tap to check this one" };
  return cloud;
}

/** What happens after Nano's binary triage. Nano can only settle a negative with no quote; a SUPPORTS is never final. */
export function afterTriage(nano: TriageResult, gateHeld: boolean, cfg: Cfg, cloudUsed: number): After {
  const capSpent = cloudUsed >= cfg.citationCloudCap;
  const quote = (nano.quote ?? "").trim();
  const ranInCloud = nano.inferenceSource === "in_cloud";
  const escalate = (reason: string): After => {
    if (!capSpent) return { to: "ESCALATE", reason };
    if (ranInCloud) return { to: "CAP_REACHED", reason: "cloud triage only; deciding check skipped (cap) — tap to confirm" };
    if (nano.verdict && quote && gateHeld) return { to: "CAP_REACHED", reason: "Nano found a quote; cloud check skipped (cap) — tap to confirm" };
    return { to: "CAP_REACHED", reason: "Nano's result needs the cloud; check skipped (cap) — tap to confirm" };
  };
  if (nano.error === "timeout") return escalate("on-device timed out");
  if (nano.error === "malformed") return escalate("on-device answer unreadable → sent to cloud");
  if (nano.error) return escalate("on-device error → sent to cloud");
  if (ranInCloud) return escalate("SDK fell back to cloud");
  if (!nano.verdict) return escalate("Nano's result needs the cloud");
  if (nano.verdict === "NOT_SUPPORTED" && !quote)
    return { to: "SETTLED_ON_DEVICE", reason: "Nano found no supporting passage in the 3 it read — confirm in cloud" };
  if (quote && !gateHeld) return escalate("quote not in what Nano read");
  if (nano.verdict === "SUPPORTS" && !quote) return escalate("Nano's result needs the cloud");
  if (nano.verdict === "SUPPORTS") return escalate("Nano found a quote — the cloud decides full or partial");
  return escalate("Nano found related text — the cloud decides");
}
