import { describe, expect, it } from "vitest";
import { normalize, splitSentences, toPassages } from "@/lib/text";
import { bm25TopK, tokenize } from "@/lib/bm25";
import { quoteHeld } from "@/lib/gate/quote";
import { parseJudge, parseTriage, triageConstraint } from "@/lib/ai/schemas";

describe("normalize", () => {
  it("folds curly quotes, dashes, NBSP and soft hyphens", () => {
    expect(normalize("“It’s a—test­”")).toBe('"It\'s a-test"');
  });
});

describe("splitSentences / toPassages", () => {
  const text = "The Moon orbits Earth. It takes 27 days. Tides follow it! Is that all? No.";
  it("splits at sentence ends before a capital or digit", () => {
    expect(splitSentences(text)).toEqual(["The Moon orbits Earth.", "It takes 27 days.", "Tides follow it!", "Is that all?", "No."]);
  });
  it("does not split on decimals or lowercase continuations", () => {
    expect(splitSentences("It rose 2.5 percent. e.g. this stays.")).toEqual(["It rose 2.5 percent. e.g. this stays."]);
  });
  it("makes 3-sentence windows advancing 2, capped at maxChars", () => {
    const p = toPassages(text);
    expect(p[0]).toBe("The Moon orbits Earth. It takes 27 days. Tides follow it!");
    expect(p[1]).toBe("Tides follow it! Is that all? No.");
    expect(p).toHaveLength(2);
    expect(toPassages(text, 3, 2, 10)[0]).toHaveLength(10);
  });
});

describe("bm25TopK", () => {
  const passages = ["Cats sleep a lot during the day.", "The Moon rotates once every 27 days.", "Tides are caused by the Moon and the Sun."];
  it("ranks the passage sharing rare query terms first", () => {
    expect(bm25TopK("How often does the Moon rotate? 27 days", passages, 2)[0].index).toBe(1);
  });
  it("drops stopwords and single characters", () => {
    expect(tokenize("The a of Moon X")).toEqual(["moon"]);
  });
  it("returns [] for no passages", () => {
    expect(bm25TopK("anything", [])).toEqual([]);
  });
});

describe("quoteHeld (the gate)", () => {
  const given = "PASSAGE 1: The Moon makes a complete orbit around Earth in 27 Earth days.";
  it("holds a verbatim quote, including NBSP / curly-quote variants", () => {
    expect(given).toContain("\u00A0"); // the source line really has the NBSP ("27\u00A0Earth")
    expect(quoteHeld("orbit around Earth in 27 Earth days", given)).toBe(true);
    // curly quotes, a curly apostrophe and a soft hyphen in the source; and the reverse (fancy quote, plain source)
    const fancy = "PASSAGE 1: The Moon\u2019s orbit takes 27\u00A0Earth days, the \u201Csidereal month\u201D, by obser\u00ADvation.";
    expect(quoteHeld('27 Earth days, the "sidereal month"', fancy)).toBe(true);
    expect(quoteHeld("The Moon's orbit", fancy)).toBe(true);
    expect(quoteHeld("by observation", fancy)).toBe(true);
    expect(quoteHeld("27\u00A0Earth days, the \u201Csidereal month\u201D", 'the orbit takes 27 Earth days, the "sidereal month".')).toBe(true);
  });
  it("refuses a paraphrase", () => {
    expect(quoteHeld("The Moon circles Earth every 27 days", given)).toBe(false);
    // folding quote styles never folds words: one changed word inside the same curly quotes is refused
    expect(quoteHeld("27 Earth days, the \u201Csynodic month\u201D", "the orbit takes 27\u00A0Earth days, the \u201Csidereal month\u201D.")).toBe(false);
  });
  it("refuses an empty quote", () => {
    expect(quoteHeld("   ", given)).toBe(false);
  });
});

describe("schemas", () => {
  it("parses a triage verdict and rejects PARTIAL from the device", () => {
    expect(parseTriage('{"verdict":"SUPPORTS","quote":"x"}').verdict).toBe("SUPPORTS");
    expect(() => parseTriage('{"verdict":"PARTIAL","quote":""}')).toThrow();
  });
  it("parses a judge verdict and rejects off-schema output", () => {
    expect(parseJudge('{"verdict":"PARTIAL","quote":"q","reason":"r"}').verdict).toBe("PARTIAL");
    expect(() => parseJudge("not json")).toThrow();
    // a2a r03: a present field of the wrong type is malformed, never coerced into a counted "no passage says this"
    expect(() => parseJudge('{"verdict":"NOT_SUPPORTED","quote":42,"reason":"x"}')).toThrow(/quote/);
    expect(() => parseJudge('{"verdict":"PARTIAL","quote":"q","reason":{"a":1}}')).toThrow(/reason/);
    expect(() => parseJudge('{"verdict":"NOT_SUPPORTED","reason":"none"}')).toThrow(/quote/);
    expect(() => parseJudge('{"verdict":"NOT_SUPPORTED","quote":null,"reason":"none"}')).toThrow(/quote/);
    expect(parseJudge('{"verdict":"NOT_SUPPORTED","quote":""}')).toMatchObject({ quote: "", reason: "" });
  });
  it("caps the device quote with maxLength", () => {
    expect(triageConstraint(300).properties.quote.maxLength).toBe(300);
  });
});
