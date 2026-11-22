// Okapi BM25 over passages: picks what the on-device model reads. Pure and deterministic.

const STOP = new Set(
  "a an and are as at be but by can for from had has have in into is it its may more most not of on or such than that the their these they this those to was were which with about also other".split(" "),
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export interface Ranked { index: number; score: number; text: string }

export function bm25TopK(query: string, passages: string[], k = 3, k1 = 1.2, b = 0.75): Ranked[] {
  const docs = passages.map(tokenize);
  const N = docs.length;
  if (N === 0) return [];
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const q = [...new Set(tokenize(query))];
  const scored = docs.map((d, index) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avgdl)));
    }
    return { index, score, text: passages[index] };
  });
  return scored.sort((x, y) => y.score - x.score || x.index - y.index).slice(0, k);
}
