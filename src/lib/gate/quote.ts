// The quote gate: code, not a model, decides whether a quoted span exists in the exact text the model was given.
import { normalize } from "../text";

/** True when `quote` is non-empty and appears verbatim in `given` after whitespace/Unicode normalisation only. */
export function quoteHeld(quote: string, given: string): boolean {
  const q = normalize(quote);
  if (!q) return false;
  return normalize(given).includes(q);
}
