import { describe, expect, it } from "vitest";
import { route, afterTriage, effectiveKind, type FetchInfo } from "@/lib/route/router";
import { DEFAULT_CONFIG as cfg } from "@/lib/config";

const okHtml: FetchInfo = { ok: true, status: 200, textChars: 5000 };
const thin: FetchInfo = { ok: true, status: 200, textChars: 120 };
const pdf: FetchInfo = { ok: true, status: 200, textChars: 9000 };
const CAP = cfg.citationCloudCap;

describe("route(): capability split", () => {
  it("readable HTML with Nano available goes to the device first (PREFER_ON_DEVICE)", () => {
    const r = route("html", okHtml, "available", cfg, "auto", 0);
    expect(r.to).toBe("DEVICE_TRIAGE");
    expect(r.deviceMode).toBe("PREFER_ON_DEVICE");
    expect(r.reason).toMatch(/checked on this laptop first/);
  });
  it("sends a PDF to the cloud even when Nano is available", () => {
    const r = route("pdf", pdf, "available", cfg, "auto", 0);
    expect(r).toEqual({ to: "CLOUD_DECIDE", reason: "PDF input is cloud-only" });
  });
  it("sends a PDF to the cloud when Nano is unavailable", () => {
    expect(route("pdf", pdf, "unavailable", cfg, "auto", 0).to).toBe("CLOUD_DECIDE");
  });
  it("sends a thin HTML page (needs JavaScript) to URL context", () => {
    const r = route("html", thin, "available", cfg, "auto", 0);
    expect(r.to).toBe("CLOUD_URL_CONTEXT");
    expect(r.reason).toMatch(/needs JavaScript/);
  });
  it("treats text exactly at the threshold as readable", () => {
    expect(route("html", { ok: true, status: 200, textChars: cfg.jsMinTextChars }, "available", cfg, "auto", 0).to).toBe("DEVICE_TRIAGE");
  });
  it("marks a failed fetch NOT_CHECKED with the fetch error", () => {
    const r = route("failed", { ok: false, status: 404, error: "source returned 404" }, "available", cfg, "auto", 0);
    expect(r).toEqual({ to: "NOT_CHECKED", reason: "source returned 404" });
  });
  it("marks an HTTP >= 400 as NOT_CHECKED even if flagged ok", () => {
    expect(route("html", { ok: true, status: 500 }, "available", cfg, "auto", 0).reason).toBe("source returned 500");
  });
  it("falls back to a generic reason when the failure has no detail", () => {
    expect(route("failed", { ok: false }, "available", cfg, "auto", 0).reason).toBe("source could not be fetched");
  });
  it("no Nano in this browser → cloud, with the reason", () => {
    expect(route("html", okHtml, "unavailable", cfg, "auto", 0)).toEqual({ to: "CLOUD_DECIDE", reason: "no on-device model in this browser" });
  });
  it("model downloading → cloud, with progress in the reason", () => {
    expect(route("html", okHtml, "downloading", cfg, "auto", 0, 0.43).reason).toBe("on-device model downloading (43%)");
  });
  it("model downloadable (not yet downloaded) → cloud", () => {
    expect(route("html", okHtml, "downloadable", cfg, "auto", 0).to).toBe("CLOUD_DECIDE");
  });
});

describe("route(): force control", () => {
  it("Cloud only sends readable HTML to the cloud", () => {
    expect(route("html", okHtml, "available", cfg, "cloud", 0)).toEqual({ to: "CLOUD_DECIDE", reason: "you chose Cloud only" });
  });
  it("Cloud only still reads a JS-only page through URL context", () => {
    expect(route("html", thin, "available", cfg, "cloud", 0).to).toBe("CLOUD_URL_CONTEXT");
  });
  it("On-device only + PDF sends the PDF to Nano so the SDK's refusal is shown", () => {
    const r = route("pdf", pdf, "available", cfg, "device", 0);
    expect(r.to).toBe("DEVICE_TRIAGE");
    expect(r.deviceMode).toBe("ONLY_ON_DEVICE");
  });
  it("On-device only + JS-only page → NOT_CHECKED", () => {
    expect(route("html", thin, "available", cfg, "device", 0).reason).toMatch(/needs JavaScript, which only the cloud can read/);
  });
  it("On-device only without Nano → NOT_CHECKED", () => {
    expect(route("html", okHtml, "unavailable", cfg, "device", 0)).toEqual({ to: "NOT_CHECKED", reason: "On-device only: no on-device model in this browser" });
  });
  it("On-device only while downloading waits with ONLY_ON_DEVICE", () => {
    const r = route("html", okHtml, "downloading", cfg, "device", 0, 0.5);
    expect(r).toMatchObject({ to: "DEVICE_TRIAGE", deviceMode: "ONLY_ON_DEVICE" });
    expect(r.reason).toMatch(/50%/);
  });
  it("On-device only ignores the cloud cap (no cloud call is made)", () => {
    expect(route("html", okHtml, "available", cfg, "device", CAP + 3).to).toBe("DEVICE_TRIAGE");
  });
  it("a failed fetch beats the force control", () => {
    expect(route("failed", { ok: false, error: "host not found" }, "available", cfg, "device", 0).to).toBe("NOT_CHECKED");
  });
});

describe("route(): cloud cap", () => {
  it("cap spent → a cloud route becomes NOT_CHECKED with a check-this-one button", () => {
    const r = route("pdf", pdf, "available", cfg, "auto", CAP);
    expect(r).toEqual({ to: "NOT_CHECKED", capped: true, reason: "cloud cap for this answer reached — tap to check this one" });
  });
  it("one slot left → the cloud route still runs", () => {
    expect(route("html", okHtml, "unavailable", cfg, "auto", CAP - 1).to).toBe("CLOUD_DECIDE");
  });
  it("cap spent → device triage switches to ONLY_ON_DEVICE (no uncounted SDK fallback)", () => {
    expect(route("html", okHtml, "available", cfg, "auto", CAP).deviceMode).toBe("ONLY_ON_DEVICE");
  });
  it("cap spent applies to URL context too", () => {
    expect(route("html", thin, "available", cfg, "auto", CAP).capped).toBe(true);
  });
});

describe("effectiveKind()", () => {
  it("keeps a PDF a PDF regardless of text length", () => {
    expect(effectiveKind("pdf", { ok: true, status: 200, textChars: 0 }, cfg)).toBe("pdf");
  });
  it("turns a not-ok fetch into failed", () => {
    expect(effectiveKind("html", { ok: false }, cfg)).toBe("failed");
  });
});

describe("afterTriage(): Nano can only settle a negative with no quote", () => {
  it("NOT_SUPPORTED with an empty quote is settled on device", () => {
    const a = afterTriage({ verdict: "NOT_SUPPORTED", quote: "", inferenceSource: "on_device" }, false, cfg, 0);
    expect(a.to).toBe("SETTLED_ON_DEVICE");
    expect(a.reason).toMatch(/in the 3 it read/);
  });
  it("whitespace-only quote counts as empty", () => {
    expect(afterTriage({ verdict: "NOT_SUPPORTED", quote: "   ", inferenceSource: "on_device" }, false, cfg, 0).to).toBe("SETTLED_ON_DEVICE");
  });
  it("SUPPORTS with a held quote escalates — never final", () => {
    expect(afterTriage({ verdict: "SUPPORTS", quote: "the page says so", inferenceSource: "on_device" }, true, cfg, 0))
      .toEqual({ to: "ESCALATE", reason: "Nano found a quote — the cloud decides full or partial" });
  });
  it("SUPPORTS with an empty quote escalates", () => {
    expect(afterTriage({ verdict: "SUPPORTS", quote: "", inferenceSource: "on_device" }, false, cfg, 0).reason).toBe("Nano's result needs the cloud");
  });
  it("NOT_SUPPORTED with a held quote escalates (related text found)", () => {
    expect(afterTriage({ verdict: "NOT_SUPPORTED", quote: "something related", inferenceSource: "on_device" }, true, cfg, 0).reason).toMatch(/related text/);
  });
  it("a quote not in Nano's passages escalates, whatever the verdict", () => {
    expect(afterTriage({ verdict: "SUPPORTS", quote: "invented words", inferenceSource: "on_device" }, false, cfg, 0).reason).toBe("quote not in what Nano read");
    expect(afterTriage({ verdict: "NOT_SUPPORTED", quote: "invented words", inferenceSource: "on_device" }, false, cfg, 0).reason).toBe("quote not in what Nano read");
  });
  it("timeout escalates", () => {
    expect(afterTriage({ error: "timeout" }, false, cfg, 0)).toEqual({ to: "ESCALATE", reason: "on-device timed out" });
  });
  it("malformed JSON escalates", () => {
    expect(afterTriage({ error: "malformed" }, false, cfg, 0).reason).toMatch(/unreadable/);
  });
  it("SDK error escalates", () => {
    expect(afterTriage({ error: "sdk" }, false, cfg, 0).to).toBe("ESCALATE");
  });
  it("a triage answered IN_CLOUD (SDK fallback) escalates even when it says NOT_SUPPORTED with no quote", () => {
    expect(afterTriage({ verdict: "NOT_SUPPORTED", quote: "", inferenceSource: "in_cloud" }, false, cfg, 0).reason).toBe("SDK fell back to cloud");
  });
  it("a missing verdict escalates", () => {
    expect(afterTriage({ quote: "x" }, false, cfg, 0).to).toBe("ESCALATE");
  });
});

describe("afterTriage(): cap", () => {
  it("would escalate with a held quote at the cap → CAP_REACHED (quote found)", () => {
    expect(afterTriage({ verdict: "SUPPORTS", quote: "the page says so", inferenceSource: "on_device" }, true, cfg, CAP))
      .toEqual({ to: "CAP_REACHED", reason: "Nano found a quote; cloud check skipped (cap) — tap to confirm" });
  });
  it("would escalate without a held quote at the cap → CAP_REACHED (needs the cloud)", () => {
    expect(afterTriage({ error: "timeout" }, false, cfg, CAP).reason).toBe("Nano's result needs the cloud; check skipped (cap) — tap to confirm");
  });
  it("SDK-fallback triage at the cap → CAP_REACHED (cloud triage only)", () => {
    expect(afterTriage({ verdict: "SUPPORTS", quote: "q", inferenceSource: "in_cloud" }, true, cfg, CAP).reason).toMatch(/^cloud triage only/);
  });
  it("a settled negative is unaffected by the cap (it costs no cloud call)", () => {
    expect(afterTriage({ verdict: "NOT_SUPPORTED", quote: "", inferenceSource: "on_device" }, false, cfg, CAP).to).toBe("SETTLED_ON_DEVICE");
  });
});
