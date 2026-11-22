import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/lib/config";
import { mergeRemote } from "@/lib/remoteConfig";

describe("mergeRemote", () => {
  it("applies valid overrides and reports which keys changed", () => {
    const { cfg, applied } = mergeRemote(DEFAULT_CONFIG, { citation_cloud_cap: "5", judge_model: "gemini-3.8-flash", device_negative_style: "likely" });
    expect(cfg.citationCloudCap).toBe(5);
    expect(cfg.judgeModel).toBe("gemini-3.8-flash");
    expect(cfg.deviceNegativeStyle).toBe("likely");
    expect(applied.sort()).toEqual(["citation_cloud_cap", "device_negative_style", "judge_model"]);
  });
  it("ignores garbage: non-numeric, zero/negative, bad enum, bad model name, unknown keys", () => {
    const { cfg, applied } = mergeRemote(DEFAULT_CONFIG, { citation_cloud_cap: "abc", nano_timeout_ms: "-1", quote_max_chars: "0", device_negative_style: "maybe", judge_model: "x y; drop", unknown: "1" });
    expect(cfg).toEqual(DEFAULT_CONFIG);
    expect(applied).toEqual([]);
  });
  it("does not report a key whose remote value equals the default", () => {
    expect(mergeRemote(DEFAULT_CONFIG, { citation_cloud_cap: "8" }).applied).toEqual([]);
  });
  it("never mutates the defaults", () => {
    mergeRemote(DEFAULT_CONFIG, { citation_cloud_cap: "3" });
    expect(DEFAULT_CONFIG.citationCloudCap).toBe(8);
  });
});
