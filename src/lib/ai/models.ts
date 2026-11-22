// The two Firebase AI Logic model instances Footing uses (greppable for judges):
//   triage — Gemini Nano 4 on device via InferenceMode.PREFER_ON_DEVICE (binary verdict + quote, responseConstraint),
//            with a cloud fallback the SDK manages (inCloudParams); ONLY_ON_DEVICE when forced or the cloud cap is spent.
//   judge  — cloud only (InferenceMode.ONLY_IN_CLOUD), 3-class responseSchema; also reads PDFs (inline) and
//            JS-only pages (URL context tool). Every result carries response.inferenceSource → the chip badge.
import { getGenerativeModel, InferenceMode, Schema, type GenerativeModel } from "firebase/ai";
import { firebase } from "../firebase";
import { triageConstraint } from "./schemas";
import type { FootingConfig } from "../config";

const TEXT_EN = { expectedInputs: [{ type: "text" as const, languages: ["en"] }], expectedOutputs: [{ type: "text" as const, languages: ["en"] }] };

export const TRIAGE_SCHEMA_CLOUD = Schema.object({
  properties: { verdict: Schema.enumString({ enum: ["SUPPORTS", "NOT_SUPPORTED"] }), quote: Schema.string() },
});
export const VERDICT3_SCHEMA = Schema.object({
  properties: {
    verdict: Schema.enumString({ enum: ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"] }),
    quote: Schema.string(),
    reason: Schema.string(),
  },
});

export function triageModel(cfg: FootingConfig, mode: "PREFER_ON_DEVICE" | "ONLY_ON_DEVICE"): GenerativeModel {
  return getGenerativeModel(firebase().ai, {
    mode: mode === "ONLY_ON_DEVICE" ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: TEXT_EN, promptOptions: { responseConstraint: triageConstraint(cfg.quoteMaxChars) } },
    inCloudParams: {
      model: cfg.triageCloudModel,
      generationConfig: { responseMimeType: "application/json", responseSchema: TRIAGE_SCHEMA_CLOUD, temperature: 0 },
    },
  });
}

export function judgeModel(cfg: FootingConfig): GenerativeModel {
  return getGenerativeModel(firebase().ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: cfg.judgeModel, generationConfig: { responseMimeType: "application/json", responseSchema: VERDICT3_SCHEMA, temperature: 0 } },
  });
}

export function judgeUrlModel(cfg: FootingConfig): GenerativeModel {
  return getGenerativeModel(firebase().ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cfg.judgeModel,
      tools: [{ urlContext: {} }],
      generationConfig: { responseMimeType: "application/json", responseSchema: VERDICT3_SCHEMA, temperature: 0 },
    },
  });
}
