import { describe, expect, it } from "vitest";
import { parseAnswer, splitSources, cleanSentence, answerToText } from "@/lib/parse";

describe("parseAnswer()", () => {
  it("resolves [n] references against a trailing source list", () => {
    const p = parseAnswer("The Moon orbits Earth [1]. Tides follow it [2].\n\nSources:\n[1] https://en.wikipedia.org/wiki/Moon\n[2] https://example.org/tides");
    expect(p.sentences.map((s) => s.text)).toEqual(["The Moon orbits Earth.", "Tides follow it."]);
    expect(p.pairs.map((x) => [x.s, x.n, x.url])).toEqual([[0, 1, "https://en.wikipedia.org/wiki/Moon"], [1, 2, "https://example.org/tides"]]);
  });
  it("moves a marker that follows the full stop back to its sentence", () => {
    const p = parseAnswer("Vaccines train the immune system. [3] They contain antigens.\n\n[3] https://who.int/vaccines");
    expect(p.pairs).toHaveLength(1);
    expect(p.pairs[0].sentence).toBe("Vaccines train the immune system.");
    expect(p.sentences[1].cites).toHaveLength(0);
  });
  it("keeps a marker and its full stop with the sentence after an abbreviation (a.m. [1].)", () => {
    const p = parseAnswer("The ferry leaves at 6:40 a.m. [1]. On Sundays it returns at 9:30 p.m. [1].\n\n[1] https://x.example");
    expect(p.sentences.map((x) => x.text)).toEqual(["The ferry leaves at 6:40 a.m.", "On Sundays it returns at 9:30 p.m."]);
    expect(p.pairs.map((x) => x.s)).toEqual([0, 1]);
  });
  it("reads Markdown links and keeps the link text in the sentence", () => {
    const p = parseAnswer("Olive oil is the main fat ([AHA](https://www.heart.org/x)). Wine is optional.");
    expect(p.pairs[0].url).toBe("https://www.heart.org/x");
    expect(p.pairs[0].sentence).toBe("Olive oil is the main fat (AHA).");
  });
  it("keeps balanced parentheses in URLs (Wikipedia disambiguation pages)", () => {
    const md = parseAnswer("Mercury is the smallest planet ([wiki](https://en.wikipedia.org/wiki/Mercury_(planet))).");
    expect(md.pairs[0].url).toBe("https://en.wikipedia.org/wiki/Mercury_(planet)");
    const ref = parseAnswer("Mercury is small [1].\n\n[1] https://en.wikipedia.org/wiki/Mercury_(planet)");
    expect(ref.pairs[0].url).toBe("https://en.wikipedia.org/wiki/Mercury_(planet)");
    expect(ref.unresolved).toEqual([]);
    const bare = parseAnswer("See https://en.wikipedia.org/wiki/Mercury_(planet), it is small.");
    expect(bare.pairs[0].url).toBe("https://en.wikipedia.org/wiki/Mercury_(planet)");
  });
  it("does not swallow a closing parenthesis that wraps a bare URL", () => {
    expect(parseAnswer("Small planet (see https://example.org/a).").pairs[0].url).toBe("https://example.org/a");
  });
  it("reads bare URLs", () => {
    const p = parseAnswer("See the facts at https://science.nasa.gov/moon/facts/ for details.");
    expect(p.pairs[0].url).toBe("https://science.nasa.gov/moon/facts/");
    expect(p.pairs[0].sentence).toBe("See the facts at for details.");
  });
  it("expands [1, 2] and [2-3] groups", () => {
    const p = parseAnswer("A claim [1, 2]. Another [2-3].\n\n1. https://a.example\n2. https://b.example\n3. https://c.example");
    expect(p.pairs.map((x) => x.n)).toEqual([1, 2, 2, 3]);
  });
  it("records markers with no source entry as unresolved", () => {
    expect(parseAnswer("A claim [7].\n\n[1] https://a.example").unresolved).toEqual([7]);
  });
  it("does not split on abbreviations like U.S. before lowercase", () => {
    const p = parseAnswer("U.S. legislative changes loosened rules [1]. Then it collapsed.\n\n[1] https://x.example");
    expect(p.sentences[0].text).toBe("U.S. legislative changes loosened rules.");
  });
  it("keeps document order for the cap (order field)", () => {
    const p = parseAnswer("A [1]. B [2]. C [1].\n\n[1] https://a.example\n[2] https://b.example");
    expect(p.pairs.map((x) => x.order)).toEqual([0, 1, 2]);
  });
  it("dedupes the same URL cited twice in one sentence", () => {
    expect(parseAnswer("A [1][1].\n\n[1] https://a.example").pairs).toHaveLength(1);
  });
  it("keeps paragraph numbers for the copy-back", () => {
    const p = parseAnswer("One [1].\n\nTwo [1].\n\n[1] https://a.example");
    expect(p.sentences.map((s) => s.para)).toEqual([0, 1]);
  });
});

describe("splitSources() / cleanSentence() / answerToText()", () => {
  it("accepts '[1]: url' and a References header", () => {
    expect(splitSources("Body.\n\nReferences:\n[1]: https://a.example/x").sources).toEqual({ 1: "https://a.example/x" });
  });
  it("accepts 'Title — url' lines", () => {
    expect(splitSources("Body.\n\n1. Mayo Clinic — https://mayoclinic.org/a").sources[1]).toBe("https://mayoclinic.org/a");
  });
  it("strips markers and trailing space before punctuation", () => {
    expect(cleanSentence("A claim [1] [2] .")).toBe("A claim.");
  });
  it("round-trips the captured seed format", () => {
    const p = parseAnswer(answerToText("A [1]. B [2].", ["https://a.example", "https://b.example"]));
    expect(p.pairs.map((x) => x.url)).toEqual(["https://a.example", "https://b.example"]);
  });
});
