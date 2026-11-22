// The quote gate: code, not a model, decides whether a quoted span exists in the exact text the model was given.
// Canonical verdict/evidence contract: a model's verdict is shown only if its quote passes this gate.
import { normalize } from "../text";
import { tokenize } from "../bm25";

export const MIN_QUOTE_CHARS = 12;

/** True when `quote` is non-empty and appears verbatim in `given` after whitespace/Unicode normalisation only.
 *  (Used by the committed eval rows; the app uses gate(), which adds the minimum length.) */
export function quoteHeld(quote: string, given: string): boolean {
  const q = normalize(quote);
  if (!q) return false;
  return normalize(given).includes(q);
}

/** The app's gate: quote ≥ 12 chars after normalisation and a verbatim substring of the model's input. */
export function gate(quote: string, modelInput: string): boolean {
  return normalize(quote).length >= MIN_QUOTE_CHARS && quoteHeld(quote, modelInput);
}

export type Final = "SUPPORTS" | "PARTIAL" | "NOT_SUPPORTED" | "UNVERIFIED" | "NOT_FOUND_TRUNCATED";
export interface JudgeOutcome {
  final: Final;
  gateHeld: boolean;
  /** Counted in the footed total's n (and in k when PARTIAL / NOT_SUPPORTED). */
  counted: boolean;
  note?: string;
}

/** agents.md §4: the cloud Judge's verdict → what is shown. Code-appended notes, never model-written. */
export function judgeOutcome(
  j: { verdict: "SUPPORTS" | "PARTIAL" | "NOT_SUPPORTED"; quote: string },
  modelInput: string,
  opts: { truncated: boolean; readChars: number; viaUrlContext?: boolean },
): JudgeOutcome {
  if (opts.viaUrlContext) return { final: "UNVERIFIED", gateHeld: false, counted: false, note: "read via URL context — no source text to check the quote against" };
  const quote = j.quote.trim();
  if (!quote) {
    if (j.verdict !== "NOT_SUPPORTED") return { final: "UNVERIFIED", gateHeld: false, counted: false, note: "no quote given" };
    if (opts.truncated) return { final: "NOT_FOUND_TRUNCATED", gateHeld: false, counted: false, note: `not found in the first ${opts.readChars} chars read` };
    return { final: "NOT_SUPPORTED", gateHeld: false, counted: true, note: "no passage says this" };
  }
  const held = gate(quote, modelInput);
  if (!held) return { final: "UNVERIFIED", gateHeld: false, counted: false, note: "quote not found in what the model read" };
  return { final: j.verdict, gateHeld: true, counted: true };
}

/** Content words of the sentence that the quote does not contain (inspection aid only; never a verdict input). */
export function uncovered(sentence: string, quote: string): string[] {
  const have = new Set(tokenize(normalize(quote)));
  const out: string[] = [];
  for (const t of tokenize(normalize(sentence))) if (!have.has(t) && !out.includes(t)) out.push(t);
  return out;
}
