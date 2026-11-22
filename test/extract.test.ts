import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { extractHtml, extractText, pickInputs, stripMarkers } from "@/lib/extract";
import { DEFAULT_CONFIG as cfg } from "@/lib/config";

const parse = (h: string) => parseHTML(h).document as unknown as Document;
const para = (s: string) => `<p>${s}</p>`;
const LONG = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} talks about olive oil and the heart in some detail.`).join(" ");

describe("extractHtml()", () => {
  it("drops Wikipedia footnote markers so a model's quote can match verbatim", () => {
    const html = `<html><head><title>T</title></head><body><article>${para(LONG)}${para('A 2017 review found lower risk of early death;<sup class="reference"><a>[14]</a></sup> it may also help with weight loss.<sup class="reference">[15]</sup>')}</article></body></html>`;
    const { text, title } = extractHtml(html, "https://en.wikipedia.org/wiki/X", parse);
    expect(title).toBe("T");
    expect(text).toContain("lower risk of early death; it may also help with weight loss.");
    expect(text).not.toContain("[14]");
  });
  it("falls back to body text and drops scripts when no article is found", () => {
    const html = `<html><body><script>var x = 1;</script><div>${LONG}</div></body></html>`;
    const { text } = extractHtml(html, "https://x.example", parse);
    expect(text).toContain("Sentence number 3");
    expect(text).not.toContain("var x");
  });
  it("passes text/plain through", () => {
    expect(extractText("a  b\n\nc", "text/plain; charset=utf-8", "https://x.example").text).toBe("a b c");
  });
});

describe("stripMarkers()", () => {
  it("removes [n], [a] and [citation needed] but keeps [2-3] style ranges in prose", () => {
    expect(stripMarkers("Fact.[3] More[a] text[citation needed] here")).toBe("Fact. More text here");
  });
});

describe("pickInputs()", () => {
  it("gives Nano the top-3 BM25 passages and the Judge a window flagged when truncated", () => {
    const text = LONG + " The UNESCO listing came in 2010. " + "Filler words about nothing in particular. ".repeat(800);
    const i = pickInputs("UNESCO listed the diet in 2010", text, cfg);
    expect(i.passages).toHaveLength(3);
    expect(i.passages[0]).toContain("UNESCO listing came in 2010");
    expect(i.truncated).toBe(true);
    expect(i.window.length).toBe(cfg.judgeMaxChars);
  });
});
