// Text extraction + passage pick (deterministic code, no inference). Same pipeline as scripts/eval-prepare.mts:
// normalize → 3-sentence windows (step 2, ≤ passage_max_chars) → BM25 top-k; the Judge's window = first judge_max_chars.
import { Readability } from "@mozilla/readability";
import { normalize, toPassages } from "./text";
import { bm25TopK } from "./bm25";
import type { FootingConfig } from "./config";

export type ParseHtml = (html: string) => Document;

const browserParse: ParseHtml = (html) => new DOMParser().parseFromString(html, "text/html");

/** Readable text of an HTML page (Readability; falls back to <body> text when Readability finds no article). */
export function extractHtml(html: string, url: string, parse: ParseHtml = browserParse): { title: string; text: string } {
  const doc = parse(html);
  try {
    const base = doc.createElement("base");
    base.setAttribute("href", url);
    doc.head?.appendChild(base);
  } catch { /* documents without a head */ }
  const title = doc.title ?? "";
  // Footnote markers ("…death;[14] it may…") are not prose: models drop them when quoting, which would fail the
  // verbatim gate. Removed here, before any model sees the text, so the gate still checks the exact model input.
  doc.querySelectorAll("sup.reference, sup.noprint, .mw-editsection, .reference-accessdate").forEach((n) => n.remove());
  let text = "";
  try {
    const art = new Readability(doc.cloneNode(true) as Document, { charThreshold: 200 }).parse();
    text = art?.textContent ?? "";
  } catch { /* fall through */ }
  if (normalize(text).length < 200) {
    doc.querySelectorAll("script,style,noscript,template,svg,nav,footer,header").forEach((n) => n.remove());
    text = doc.body?.textContent ?? "";
  }
  return { title, text: stripMarkers(normalize(text)) };
}

/** Bracketed footnote markers left in plain text: [14], [a], [citation needed], [note 3]. */
export function stripMarkers(s: string): string {
  return s.replace(/\s?\[(?:\d{1,3}|[a-z]|citation needed|note \d{1,3}|nb \d{1,3}|clarification needed)\]/gi, "").replace(/ {2,}/g, " ");
}

/** Plain text bodies (text/plain) pass through normalised. */
export function extractText(body: string, contentType: string, url: string, parse?: ParseHtml): { title: string; text: string } {
  if (contentType.toLowerCase().startsWith("text/plain")) return { title: "", text: normalize(body) };
  return extractHtml(body, url, parse);
}

export interface ModelInputs {
  /** What Nano reads: the top-k passages. */
  passages: string[];
  /** What the Judge reads beyond the passages. */
  window: string;
  truncated: boolean;
  textChars: number;
}

export function pickInputs(sentence: string, text: string, cfg: Pick<FootingConfig, "passagesTopK" | "passageMaxChars" | "judgeMaxChars">): ModelInputs {
  const norm = normalize(text);
  const passages = bm25TopK(sentence, toPassages(norm, 3, 2, cfg.passageMaxChars), cfg.passagesTopK).map((r) => r.text);
  return { passages, window: norm.slice(0, cfg.judgeMaxChars), truncated: norm.length > cfg.judgeMaxChars, textChars: norm.length };
}

/** PDF text for the quote gate (unpdf, line-end hyphenation joined). Browser and Node. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await unpdfExtract(pdf, { mergePages: true });
  const joined = (Array.isArray(text) ? text.join("\n") : text).replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2");
  return normalize(joined);
}
