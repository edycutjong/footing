// Footed total, typed line and "Copy answer with flags" — pure functions of the per-citation states.
import type { Parsed, Pair } from "./parse";

export type ChipState =
  | "queued" | "fetching" | "triage" | "escalated" | "deciding"
  | "SUPPORTS" | "PARTIAL" | "NOT_SUPPORTED" | "UNVERIFIED" | "NOT_FOUND_TRUNCATED"
  | "LIKELY_UNSUPPORTED" | "NOT_CHECKED" | "CAP_REACHED";

export const IN_FLIGHT: ChipState[] = ["queued", "fetching", "triage", "escalated", "deciding"];
export const COUNTED: ChipState[] = ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"];

export interface Tally {
  /** citations the cloud decided PARTIAL or NOT_SUPPORTED (gate passed) */
  k: number;
  /** citations with a final cloud verdict */
  n: number;
  /** unconfirmed on-device "likely doesn't say this" */
  j: number;
  settledOnDevice: number;
  decidedInCloud: number;
  unverified: number;
  pending: number;
  notChecked: number;
  total: number;
}

export function tally(states: ChipState[]): Tally {
  const c = (xs: ChipState[]) => states.filter((s) => xs.includes(s)).length;
  const n = c(COUNTED);
  return {
    k: c(["PARTIAL", "NOT_SUPPORTED"]),
    n,
    j: c(["LIKELY_UNSUPPORTED"]),
    settledOnDevice: c(["LIKELY_UNSUPPORTED"]),
    decidedInCloud: n,
    unverified: c(["UNVERIFIED", "NOT_FOUND_TRUNCATED"]),
    pending: c([...IN_FLIGHT, "CAP_REACHED"]),
    notChecked: c(["NOT_CHECKED"]),
    total: states.length,
  };
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function flagFor(state: ChipState, pair: Pick<Pair, "n" | "url">, includeUnconfirmed: boolean): string | null {
  const tag = pair.n !== null ? `[${pair.n}]` : `(${hostOf(pair.url)})`;
  if (state === "NOT_SUPPORTED") return `[⚑ ${tag} source doesn't say this]`;
  if (state === "PARTIAL") return `[⚑ ${tag} source says only part of this]`;
  if (state === "LIKELY_UNSUPPORTED" && includeUnconfirmed) return `[⚑ ${tag} likely doesn't say this, unconfirmed]`;
  return null;
}

/** The answer as Markdown with a flag after every cloud-decided PARTIAL / NOT_SUPPORTED sentence (and, opt-in,
 *  unconfirmed on-device negatives). UNVERIFIED, NOT CHECKED, CAP_REACHED and pending citations are never flagged. */
export function copyWithFlags(parsed: Parsed, stateOf: (pairId: string) => ChipState | undefined, includeUnconfirmed: boolean): { text: string; flags: number } {
  const paras: string[][] = [];
  let flags = 0;
  for (const s of parsed.sentences) {
    const marks = parsed.pairs
      .filter((p) => p.s === s.index)
      .map((p) => { const st = stateOf(p.id); return st ? flagFor(st, p, includeUnconfirmed) : null; })
      .filter((f): f is string => !!f);
    flags += marks.length;
    (paras[s.para] ??= []).push(marks.length ? `${s.raw} ${marks.join(" ")}` : s.raw);
  }
  const body = paras.filter(Boolean).map((p) => p.join(" ")).join("\n\n");
  const nums = Object.keys(parsed.sources).map(Number).sort((a, b) => a - b);
  const sources = nums.length ? `\n\nSources:\n${nums.map((n) => `[${n}] ${parsed.sources[n]}`).join("\n")}` : "";
  return { text: body + sources, flags };
}
