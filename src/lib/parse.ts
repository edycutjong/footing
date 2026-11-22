// Citation parser (deterministic): Markdown links, [n] references with a source list, bare URLs.
// Sentences come from Intl.Segmenter; a marker that lands after the full stop ("…illness. [3] They") is moved back
// to the sentence it closes.

export interface Citation { n: number | null; url: string }
export interface Sentence { index: number; para: number; raw: string; text: string; cites: Citation[] }
export interface Pair { id: string; order: number; s: number; sentence: string; n: number | null; url: string }
export interface Parsed {
  sentences: Sentence[];
  pairs: Pair[];
  sources: Record<number, string>;
  /** [n] markers whose number has no entry in the source list. */
  unresolved: number[];
}

// URL bodies may contain balanced parentheses (Wikipedia: /wiki/Mercury_(planet)); trailing punctuation is not part of the URL.
const URL_BODY = String.raw`(?:[^\s<>()\[\]"']|\([^\s<>()"']*\))+`;
const URL_RE = new RegExp(String.raw`https?:\/\/${URL_BODY}(?<![.,;:!?])`, "g");
const SOURCE_LINE = new RegExp(String.raw`^\s*(?:[-*]\s*)?\[?(\d{1,3})\]?[.:)]?\s+(?:.*?)(https?:\/\/${URL_BODY}?(?<![.,;:!?]))\)?\s*$`);
const SOURCE_HEADER = /^\s*(?:#+\s*)?(?:\*\*)?(sources|references|citations|links)(?:\*\*)?\s*:?\s*$/i;
const MD_LINK = /\[([^\]\n]+)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/g;
const REF = /\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\]/g;

/** Expand "1, 3" and "2-4" inside one bracket. */
function refNumbers(inner: string): number[] {
  const out: number[] = [];
  for (const part of inner.split(",")) {
    const m = part.trim().match(/^(\d+)\s*[–-]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (b >= a && b - a < 20) for (let i = a; i <= b; i++) out.push(i);
    } else if (/^\d+$/.test(part.trim())) out.push(Number(part.trim()));
  }
  return out;
}

/** Split off a trailing source list ("[1] https://…", "1. Title — https://…", "[1]: https://…"). */
export function splitSources(raw: string): { body: string; sources: Record<number, string> } {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const sources: Record<number, string> = {};
  let cut = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) { cut = i; continue; }
    const m = line.match(SOURCE_LINE);
    if (m) { sources[Number(m[1])] ??= m[2]; cut = i; continue; }
    if (SOURCE_HEADER.test(line)) { cut = i; continue; }
    break;
  }
  return { body: lines.slice(0, cut).join("\n").trim(), sources };
}

function segmentSentences(text: string): string[] {
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  const raw = [...seg.segment(text)].map((s) => s.segment);
  const out: string[] = [];
  for (const piece of raw) {
    // Leading citation markers belong to the previous sentence.
    const lead = piece.match(/^\s*((?:\[\d{1,3}(?:\s*[,–-]\s*\d{1,3})*\]\s*)+)/);
    let rest = piece;
    if (lead && out.length) {
      out[out.length - 1] = out[out.length - 1].trimEnd() + " " + lead[1].trim();
      rest = piece.slice(lead[0].length);
    }
    // "…6:40 a.m. [1]. On Sundays…": the marker's trailing punctuation also belongs to the previous sentence.
    const punct = rest.match(/^\s*([.!?;:,]+)(?=\s|$)/);
    if (lead && punct && out.length) {
      out[out.length - 1] += punct[1];
      rest = rest.slice(punct[0].length);
    }
    if (rest.trim()) out.push(rest.trim());
  }
  return out;
}

/** The sentence as the models see it: link text kept, markers and bare URLs removed, whitespace collapsed. */
export function cleanSentence(s: string): string {
  return s
    .replace(MD_LINK, "$1")
    .replace(REF, "")
    .replace(URL_RE, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/(\b\p{L}\.)\.(?!\.)/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Longest answer parsed (characters). Bounds the parser's worst case on pathological pastes: 28 KB of repeated
 *  "http://" took 440 ms before this cap (a2a r03); real AI answers are far shorter. */
export const MAX_ANSWER_CHARS = 20_000;

export function parseAnswer(raw: string): Parsed {
  const { body, sources } = splitSources(raw.slice(0, MAX_ANSWER_CHARS));
  const unresolved = new Set<number>();
  const sentences: Sentence[] = [];
  const pairs: Pair[] = [];
  const paragraphs = body.split(/\n\s*\n/);
  let paraNo = -1;
  for (const para of paragraphs) {
    paraNo++;
    const flat = para.replace(/\s*\n\s*/g, " ").trim();
    if (!flat) continue;
    for (const piece of segmentSentences(flat)) {
      const cites: Citation[] = [];
      const seen = new Set<string>();
      const add = (n: number | null, url: string) => {
        if (seen.has(url)) return;
        seen.add(url);
        cites.push({ n, url });
      };
      const withoutLinks = piece.replace(MD_LINK, (_m, _t, url: string) => { add(null, url); return " "; });
      for (const m of withoutLinks.matchAll(REF)) {
        for (const n of refNumbers(m[1])) {
          if (sources[n]) add(n, sources[n]);
          else unresolved.add(n);
        }
      }
      for (const m of withoutLinks.replace(REF, " ").matchAll(URL_RE)) add(null, m[0]);
      const text = cleanSentence(piece);
      if (!text) continue;
      const s = sentences.length;
      sentences.push({ index: s, para: paraNo, raw: piece.trim(), text, cites });
      for (const c of cites) pairs.push({ id: `s${s}-${pairs.length}`, order: pairs.length, s, sentence: text, n: c.n, url: c.url });
    }
  }
  return { sentences, pairs, sources, unresolved: [...unresolved].sort((a, b) => a - b) };
}

/** Rebuild an answer from {answer, sources[]} (the captured seed format) into the paste-box format. */
export function answerToText(answer: string, sources: string[]): string {
  return `${answer}\n\nSources:\n${sources.map((u, i) => `[${i + 1}] ${u}`).join("\n")}`;
}
