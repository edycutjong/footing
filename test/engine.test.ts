import { describe, expect, it, vi } from "vitest";
import { Check, type Deps, type SourceDoc } from "@/lib/check/engine";
import { parseAnswer } from "@/lib/parse";
import { DEFAULT_CONFIG as cfg } from "@/lib/config";

const PAGE = "The Mediterranean diet was first proposed in 1975 by Ancel Keys and Margaret Keys. ".repeat(3) +
  "Olive oil is the main source of fat in the diet. Red wine may be consumed in low amounts with meals. " +
  "It is associated with a lower risk of heart disease in several cohort studies. UNESCO listed it in 2010.";
const html = (url: string): SourceDoc => ({ ok: true, kind: "html", status: 200, finalUrl: url, text: PAGE, fetchMs: 5, sha256: "abc" });
const pdf = (url: string): SourceDoc => ({ ok: true, kind: "pdf", status: 200, finalUrl: url, text: PAGE, pdfBase64: "JVBERi0=", fetchMs: 5 });

function deps(over: Partial<Deps> = {}, sources: Record<string, SourceDoc> = {}): Deps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getSource: async (u) => sources[u] ?? html(u),
    triage: async () => { calls.push("triage"); return { verdict: "NOT_SUPPORTED", quote: "", inferenceSource: "on_device", ms: 900 }; },
    judge: async () => { calls.push("judge"); return { verdict: "SUPPORTS", quote: "Olive oil is the main source of fat in the diet.", reason: "stated", inferenceSource: "in_cloud", ms: 3000 }; },
    judgePdf: async () => { calls.push("judgePdf"); return { verdict: "SUPPORTS", quote: "UNESCO listed it in 2010.", reason: "stated", inferenceSource: "in_cloud", ms: 4000 }; },
    judgeUrl: async () => { calls.push("judgeUrl"); return { verdict: "SUPPORTS", quote: "anything at all here", reason: "r", inferenceSource: "in_cloud", ms: 4000 }; },
    sleep: async () => undefined,
    ...over,
  };
}
const answer = (n: number, url = (i: number) => `https://s${i}.example/p`) =>
  parseAnswer(Array.from({ length: n }, (_, i) => `Claim number ${i} about olive oil [${i + 1}].`).join(" ") + "\n\n" + Array.from({ length: n }, (_, i) => `[${i + 1}] ${url(i)}`).join("\n"));

describe("Check engine", () => {
  it("routes a PDF to the cloud judge (inline PDF) even when Nano is available", async () => {
    const d = deps({}, { "https://s0.example/p": pdf("https://s0.example/p") });
    const c = new Check(answer(1).pairs, d, { cfg, force: "auto", device: "available" });
    const { runs } = await c.run();
    expect(d.calls).toEqual(["judgePdf"]);
    expect(runs[0].state).toBe("SUPPORTS");
    expect(runs[0].route?.reason).toBe("PDF input is cloud-only");
    expect(runs[0].sources).toEqual(["in_cloud"]);
  });

  it("settles a Nano NOT_SUPPORTED with no quote on device: no cloud call, cap untouched", async () => {
    const d = deps();
    const c = new Check(answer(1).pairs, d, { cfg, force: "auto", device: "available" });
    const { runs, cloudUsed } = await c.run();
    expect(runs[0].state).toBe("LIKELY_UNSUPPORTED");
    expect(cloudUsed).toBe(0);
    expect(d.calls).toEqual(["triage"]);
  });

  it("escalates a Nano SUPPORTS to the cloud, which overrules it to PARTIAL (badges d → c)", async () => {
    const d = deps({
      triage: async () => ({ verdict: "SUPPORTS", quote: "Olive oil is the main source of fat in the diet.", inferenceSource: "on_device", ms: 1000 }),
      judge: async () => ({ verdict: "PARTIAL", quote: "Olive oil is the main source of fat in the diet.", reason: "says olive oil, not the arteries", inferenceSource: "in_cloud", ms: 2500 }),
    });
    const c = new Check(answer(1).pairs, d, { cfg, force: "auto", device: "available" });
    const { runs, cloudUsed } = await c.run();
    expect(runs[0].state).toBe("PARTIAL");
    expect(runs[0].sources).toEqual(["on_device", "in_cloud"]);
    expect(runs[0].after?.to).toBe("ESCALATE");
    expect(runs[0].uncovered).toContain("claim");
    expect(cloudUsed).toBe(1);
  });

  it("refuses a fabricated cloud quote → UNVERIFIED, never SUPPORTS", async () => {
    const d = deps({ judge: async () => ({ verdict: "SUPPORTS", quote: "Olive oil cures heart disease outright.", reason: "x", inferenceSource: "in_cloud", ms: 10 }) });
    const { runs } = await new Check(answer(1).pairs, d, { cfg, force: "auto", device: "unavailable" }).run();
    expect(runs[0].state).toBe("UNVERIFIED");
    expect(runs[0].note).toBe("quote not found in what the model read");
  });

  it("no Nano: the first 8 citations in document order get the cloud, the rest offer a tap", async () => {
    const d = deps();
    const { runs, cloudUsed } = await new Check(answer(10).pairs, d, { cfg, force: "auto", device: "unavailable" }).run();
    expect(cloudUsed).toBe(8);
    expect(runs.map((r) => r.state)).toEqual([...Array(8).fill("SUPPORTS"), "NOT_CHECKED", "NOT_CHECKED"]);
    expect(runs[9].reason).toBe("cloud cap for this answer reached — check this one");
  });

  it("a user tap confirms past the cap and still counts", async () => {
    const d = deps();
    const c = new Check(answer(10).pairs, d, { cfg, force: "auto", device: "unavailable" });
    await c.run();
    await c.confirm(c.runs[9].pair.id);
    expect(c.runs[9].state).toBe("SUPPORTS");
    expect(c.cloudUsed).toBe(9);
  });

  it("retries a 429 with backoff, each attempt counted", async () => {
    let n = 0;
    const sleep = vi.fn(async () => undefined);
    const d = deps({
      sleep,
      judge: async () => (++n === 1
        ? { error: "[429] quota", errorKind: "quota", ms: 50 }
        : { verdict: "NOT_SUPPORTED", quote: "UNESCO listed it in 2010.", reason: "different", inferenceSource: "in_cloud", ms: 10 }),
    });
    const { runs, cloudUsed } = await new Check(answer(1).pairs, d, { cfg, force: "auto", device: "unavailable" }).run();
    expect(runs[0].state).toBe("NOT_SUPPORTED");
    expect(sleep).toHaveBeenCalledWith(15000);
    expect(cloudUsed).toBe(2);
  });

  it("gives up after 2 retries with NOT CHECKED — cloud quota, retry (no canned verdict)", async () => {
    const d = deps({ judge: async () => ({ error: "[429]", errorKind: "quota", ms: 1 }) });
    const { runs, cloudUsed } = await new Check(answer(1).pairs, d, { cfg, force: "auto", device: "unavailable" }).run();
    expect(runs[0]).toMatchObject({ state: "NOT_CHECKED", reason: "cloud quota, retry" });
    expect(cloudUsed).toBe(3);
  });

  it("On-device only + PDF shows the SDK's real refusal", async () => {
    const d = deps({ triage: async () => ({ error: "on-device model does not accept PDF input", errorKind: "sdk", ms: 3 }) }, { "https://s0.example/p": pdf("https://s0.example/p") });
    const { runs } = await new Check(answer(1).pairs, d, { cfg, force: "device", device: "available" }).run();
    expect(runs[0].state).toBe("NOT_CHECKED");
    expect(runs[0].reason).toBe('On-device only: PDF input is cloud-only — the on-device model refused it ("on-device model does not accept PDF input")');
    expect(d.calls).not.toContain("judgePdf");
  });

  it("counts an SDK-fallback triage (IN_CLOUD) toward the cap and escalates it", async () => {
    const d = deps({ triage: async () => ({ verdict: "NOT_SUPPORTED", quote: "", inferenceSource: "in_cloud", ms: 700 }) });
    const { runs, cloudUsed } = await new Check(answer(1).pairs, d, { cfg, force: "auto", device: "available" }).run();
    expect(runs[0].after?.reason).toBe("SDK fell back to cloud");
    expect(cloudUsed).toBe(2);
  });

  it("a failed fetch is NOT CHECKED with the proxy's reason", async () => {
    const d = deps({}, { "https://s0.example/p": { ok: false, kind: "failed", status: 404, finalUrl: "https://s0.example/p", text: "", error: "source returned 404", fetchMs: 3 } });
    const { runs } = await new Check(answer(1).pairs, d, { cfg, force: "auto", device: "available" }).run();
    expect(runs[0]).toMatchObject({ state: "NOT_CHECKED", reason: "source returned 404" });
  });

  it("a JS-only page is read via URL context and capped at UNVERIFIED", async () => {
    const d = deps({}, { "https://s0.example/p": { ...html("https://s0.example/p"), text: "Loading…" } });
    const { runs } = await new Check(answer(1).pairs, d, { cfg, force: "auto", device: "available" }).run();
    expect(d.calls).toEqual(["judgeUrl"]);
    expect(runs[0].state).toBe("UNVERIFIED");
  });

  it("fetches a source cited twice only once", async () => {
    const getSource = vi.fn(async (u: string) => html(u));
    await new Check(answer(3, () => "https://same.example/p").pairs, deps({ getSource }), { cfg, force: "auto", device: "available" }).run();
    expect(getSource).toHaveBeenCalledTimes(1);
  });

  it("never runs more than cloud_concurrency cloud calls at once", async () => {
    let active = 0, peak = 0;
    const d = deps({ judge: async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return { verdict: "SUPPORTS", quote: "Olive oil is the main source of fat in the diet.", inferenceSource: "in_cloud", ms: 5 }; } });
    await new Check(answer(6).pairs, d, { cfg, force: "auto", device: "unavailable" }).run();
    expect(peak).toBe(cfg.cloudConcurrency);
  });
});
