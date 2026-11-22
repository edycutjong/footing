import { describe, expect, it } from "vitest";
import { gate, judgeOutcome, uncovered, MIN_QUOTE_CHARS } from "@/lib/gate/quote";
import { tally, copyWithFlags, type ChipState } from "@/lib/tally";
import { parseAnswer } from "@/lib/parse";

const INPUT = "Olive oil is the main fat. The diet was proposed in 1975 by Ancel Keys and Margaret Keys.";

describe("gate()", () => {
  it("holds a verbatim quote", () => expect(gate("proposed in 1975 by Ancel Keys", INPUT)).toBe(true));
  it("refuses a fabricated quote", () => expect(gate("proposed in 1957 by Ancel Keys", INPUT)).toBe(false));
  it("refuses a quote shorter than the minimum", () => {
    expect(MIN_QUOTE_CHARS).toBe(12);
    expect(gate("Olive oil", INPUT)).toBe(false);
  });
  it("normalises curly quotes and whitespace only (no case folding)", () => {
    expect(gate("The  diet was\nproposed", INPUT)).toBe(true);
    expect(gate("the diet was proposed", INPUT)).toBe(false);
  });
});

describe("judgeOutcome() — agents.md §4", () => {
  const o = (verdict: "SUPPORTS" | "PARTIAL" | "NOT_SUPPORTED", quote: string, truncated = false) =>
    judgeOutcome({ verdict, quote }, INPUT, { truncated, readChars: 24000 });
  it("SUPPORTS with a held quote is shown and counted", () => expect(o("SUPPORTS", "Olive oil is the main fat")).toMatchObject({ final: "SUPPORTS", counted: true }));
  it("PARTIAL with a held quote is counted", () => expect(o("PARTIAL", "proposed in 1975 by Ancel Keys").final).toBe("PARTIAL"));
  it("any verdict with a quote not in its input → UNVERIFIED, not counted", () => {
    expect(o("SUPPORTS", "Olive oil cures heart disease")).toMatchObject({ final: "UNVERIFIED", counted: false });
  });
  it("NOT_SUPPORTED with an empty quote over the whole page stands", () => expect(o("NOT_SUPPORTED", "")).toMatchObject({ final: "NOT_SUPPORTED", counted: true }));
  it("NOT_SUPPORTED with an empty quote over a truncated read → not found in the first N chars", () => {
    expect(o("NOT_SUPPORTED", "", true)).toMatchObject({ final: "NOT_FOUND_TRUNCATED", counted: false, note: "not found in the first 24000 chars read" });
  });
  it("SUPPORTS with an empty quote → UNVERIFIED", () => expect(o("SUPPORTS", "").final).toBe("UNVERIFIED"));
  it("URL-context reads are capped at UNVERIFIED", () => {
    expect(judgeOutcome({ verdict: "SUPPORTS", quote: "Olive oil is the main fat" }, INPUT, { truncated: false, readChars: 0, viaUrlContext: true }).final).toBe("UNVERIFIED");
  });
});

describe("uncovered()", () => {
  it("lists sentence content words missing from the quote", () => {
    expect(uncovered("Keys proposed the diet in 1975 after studying Crete", "The diet was proposed in 1975 by Ancel Keys")).toEqual(["after", "studying", "crete"]);
  });
});

describe("tally()", () => {
  const states: ChipState[] = ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED", "LIKELY_UNSUPPORTED", "UNVERIFIED", "NOT_FOUND_TRUNCATED", "NOT_CHECKED", "CAP_REACHED", "deciding"];
  const t = tally(states);
  it("k counts only cloud-decided PARTIAL / NOT_SUPPORTED", () => expect(t.k).toBe(2));
  it("n counts only final cloud verdicts", () => expect(t.n).toBe(3));
  it("on-device likely flags are beside k, never in it", () => expect(t.j).toBe(1));
  it("typed line counts the rest", () => expect([t.unverified, t.notChecked, t.pending]).toEqual([2, 1, 2]));
});

describe("copyWithFlags()", () => {
  const p = parseAnswer("Olive oil is the main fat [1]. Keys proposed it in 1957 [2]. Wine is optional [1].\n\nSources:\n[1] https://a.example/one\n[2] https://b.example/two");
  const st: Record<string, ChipState> = { [p.pairs[0].id]: "SUPPORTS", [p.pairs[1].id]: "NOT_SUPPORTED", [p.pairs[2].id]: "LIKELY_UNSUPPORTED" };
  it("flags cloud-decided negatives with the source number", () => {
    const { text, flags } = copyWithFlags(p, (id) => st[id], false);
    expect(text).toContain("Keys proposed it in 1957 [2]. [⚑ [2] source doesn't say this]");
    expect(text).not.toContain("likely");
    expect(flags).toBe(1);
    expect(text).toContain("Sources:\n[1] https://a.example/one");
  });
  it("adds unconfirmed on-device flags only when opted in", () => {
    expect(copyWithFlags(p, (id) => st[id], true).text).toContain("[⚑ [1] likely doesn't say this, unconfirmed]");
  });
  it("never flags UNVERIFIED or pending citations", () => {
    expect(copyWithFlags(p, () => "UNVERIFIED", true).flags).toBe(0);
    expect(copyWithFlags(p, () => "deciding", true).flags).toBe(0);
  });
});

describe("a2a r03: the gate checks each segment the model read, never their concatenation", () => {
  // Source: "The archive contains 10 maps. They are not open to the public. The reading room opens on Monday."
  const passages = ["The archive contains 10 maps.", "The reading room opens on Monday."];
  const window = "The archive contains 10 maps. They are not open to the public. The reading room opens on Monday.";
  it("refuses a quote stitched across two passages (it exists in neither passage nor the source)", () => {
    expect(gate("10 maps. The reading room", passages)).toBe(false);
    expect(gate("10 maps. The reading room", [...passages, window])).toBe(false);
    expect(judgeOutcome({ verdict: "SUPPORTS", quote: "10 maps. The reading room" }, [...passages, window], { truncated: false, readChars: window.length }).final).toBe("UNVERIFIED");
  });
  it("still holds a quote that lies inside one passage or inside the window", () => {
    expect(gate("The reading room opens on Monday", passages)).toBe(true);
    expect(gate("They are not open to the public", [...passages, window])).toBe(true);
  });
});
