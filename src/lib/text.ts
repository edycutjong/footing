// Deterministic text utilities shared by extraction, retrieval and the quote gate.

/** Whitespace + Unicode normalisation only (NFKC, curly quotes/dashes folded, runs of space collapsed). */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[­​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split text into sentences at . ! ? followed by whitespace and an uppercase letter, digit, quote or bracket. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?]["')\]]?\s+(?=["'(\[“]?[A-Z0-9])/g;
  let start = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = m.index + m[0].trimEnd().length;
    const s = text.slice(start, end).trim();
    if (s) out.push(s);
    start = m.index + m[0].length;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Overlapping windows: `size` sentences per passage, advancing `step` sentences, each capped at `maxChars`. */
export function toPassages(text: string, size = 3, step = 2, maxChars = 700): string[] {
  const sents = splitSentences(normalize(text));
  const out: string[] = [];
  for (let i = 0; i < sents.length; i += step) {
    out.push(sents.slice(i, i + size).join(" ").slice(0, maxChars));
    if (i + size >= sents.length) break;
  }
  return out;
}
