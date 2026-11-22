import { describe, expect, it } from "vitest";
import template from "../remoteconfig.template.json";

const params = template.parameters as Record<string, { defaultValue: { value: string }; valueType: string }>;

describe("Remote Config template", () => {
  it("caps cloud calls per check at 8", () => {
    expect(params.citation_cloud_cap.defaultValue.value).toBe("8");
  });
  it("keeps the quote cap aligned with the Firestore rule (300)", () => {
    expect(params.quote_max_chars.defaultValue.value).toBe("300");
  });
  it("types every numeric default as NUMBER", () => {
    for (const [, p] of Object.entries(params)) {
      if (/^\d+$/.test(p.defaultValue.value)) expect(p.valueType).toBe("NUMBER");
    }
  });
  it("names a judge model and a triage cloud model", () => {
    expect(params.judge_model.defaultValue.value).toMatch(/^gemini-/);
    expect(params.triage_cloud_model.defaultValue.value).toMatch(/^gemini-/);
  });
});
