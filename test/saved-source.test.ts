// Saved real sources replay the recorded live runs: the same bytes (sha256-matched) through the same extraction,
// BM25 and quote gate reproduce every code-side decision and the final verdict + quote from the recorded model replies.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { parseHTML } from "linkedom";
import { extractHtml, pickInputs, pdfText } from "@/lib/extract";
import { gate, judgeOutcome } from "@/lib/gate/quote";
import { afterTriage, route } from "@/lib/route/router";
import { DEFAULT_CONFIG as cfg } from "@/lib/config";

type Step = { step: string; verdict?: string; quote?: string; gateHeld?: boolean; route?: string };
type Run = { s: number; url: string; sentence: string; state: string; quote?: string; trail: Step[]; source: { sha256: string } };
const runs = (f: string): Run[] => JSON.parse(readFileSync(`evidence/check/${f}`, "utf8")).runs;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const wikiBytes = gunzipSync(readFileSync("test/fixtures/sources/wikipedia-mediterranean-diet.html.gz"));
const pdfBytes = gunzipSync(readFileSync("test/fixtures/sources/cdc-nchs-db492.pdf.gz"));
const wikiText = extractHtml(wikiBytes.toString("utf8"), "https://en.wikipedia.org/wiki/Mediterranean_diet", (h) => parseHTML(h).document as unknown as Document).text;
const hero = runs("nano-hero-2026-11-22.json").filter((r) => r.url.endsWith("/Mediterranean_diet"));
const pdfRuns = runs("nano-pdf-auto-2026-11-22.json").filter((r) => r.url.endsWith(".pdf"));

describe("saved Wikipedia page (sha256-matched to the live Nano run)", () => {
  it("is byte-identical to what the live run fetched", () => {
    expect(hero.length).toBeGreaterThanOrEqual(5);
    for (const r of hero) expect(r.source.sha256).toBe(sha(wikiBytes));
  });

  it.each(hero.map((r) => [r.s, r] as const))("sentence %i: replays the gate, afterTriage and the final verdict", (_s, r) => {
    const inputs = pickInputs(r.sentence, wikiText, cfg);
    const triage = r.trail.find((t) => t.step === "triage")!;
    const held = !!triage.quote && gate(triage.quote, inputs.passages.join("\n"));
    expect(held).toBe(triage.gateHeld);
    const after = afterTriage({ verdict: triage.verdict as "SUPPORTS", quote: triage.quote, inferenceSource: "on_device" }, held, cfg, 0);
    expect(after.to).toBe(r.trail.find((t) => t.step === "after")!.route);
    const judge = [...r.trail].reverse().find((t) => t.step === "judge");
    if (!judge) return;
    const out = judgeOutcome({ verdict: judge.verdict as "PARTIAL", quote: judge.quote ?? "" }, `${inputs.passages.join("\n")}\n${inputs.window}`, { truncated: inputs.truncated, readChars: inputs.window.length });
    expect(out.final).toBe(r.state);
    expect(out.gateHeld).toBe(judge.gateHeld);
  });

  it("the Nano SUPPORTS → cloud PARTIAL overrule reproduces with its quote", () => {
    const r = hero.find((x) => x.state === "PARTIAL" && x.trail.some((t) => t.step === "triage" && t.verdict === "SUPPORTS"))!;
    expect(r).toBeDefined();
    const inputs = pickInputs(r.sentence, wikiText, cfg);
    expect(gate(r.quote!, `${inputs.passages.join("\n")}\n${inputs.window}`)).toBe(true);
  });

  it("refuses a fabricated quote (one number changed) over the same page", () => {
    const r = hero.find((x) => x.sentence.includes("1975"))!;
    const inputs = pickInputs(r.sentence, wikiText, cfg);
    const fake = r.quote!.replace("1975", "1957");
    expect(fake).not.toBe(r.quote);
    const out = judgeOutcome({ verdict: "SUPPORTS", quote: fake }, `${inputs.passages.join("\n")}\n${inputs.window}`, { truncated: inputs.truncated, readChars: inputs.window.length });
    expect(out.final).toBe("UNVERIFIED");
  });
});

describe("saved CDC PDF (public domain, sha256-matched)", () => {
  it("is byte-identical to what the live run fetched", () => {
    for (const r of pdfRuns) expect(r.source.sha256).toBe(sha(pdfBytes));
  });

  it("the router sends it to the cloud even with Nano available", () => {
    expect(route("pdf", { ok: true, status: 200, textChars: 21000 }, "available", cfg, "auto", 0).to).toBe("CLOUD_DECIDE");
  });

  it("replays every recorded cloud verdict + quote through the gate over the unpdf text", async () => {
    const text = await pdfText(new Uint8Array(pdfBytes));
    expect(text).toContain("Life expectancy for the U.S. population in 2022 was 77.5 years");
    for (const r of pdfRuns) {
      const j = r.trail.find((t) => t.step === "judge-pdf")!;
      const out = judgeOutcome({ verdict: j.verdict as "SUPPORTS", quote: j.quote ?? "" }, text, { truncated: false, readChars: text.length });
      expect(out.final, `s${r.s}`).toBe(r.state);
    }
  });
});
