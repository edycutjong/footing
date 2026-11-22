// Router thresholds, model names and caps. Defaults mirror remoteconfig.template.json (a test keeps them aligned);
// the Remote Config client overrides them at runtime.

export interface FootingConfig {
  judgeModel: string;
  triageCloudModel: string;
  citationCloudCap: number;
  nanoTimeoutMs: number;
  quoteMaxChars: number;
  passagesTopK: number;
  passageMaxChars: number;
  jsMinTextChars: number;
  cloudConcurrency: number;
  judgeMaxChars: number;
  deviceNegativeStyle: "likely" | "neutral";
}

export const DEFAULT_CONFIG: FootingConfig = {
  judgeModel: "gemini-3.5-flash-lite",
  triageCloudModel: "gemini-3.5-flash-lite",
  citationCloudCap: 8,
  nanoTimeoutMs: 20000,
  quoteMaxChars: 300,
  passagesTopK: 3,
  passageMaxChars: 700,
  jsMinTextChars: 400,
  cloudConcurrency: 2,
  judgeMaxChars: 24000,
  deviceNegativeStyle: "neutral",
};

/** Accepted range per numeric key; a Remote Config value outside it (or non-integer) is ignored and the code default stays. */
export const RC_BOUNDS: Partial<Record<keyof FootingConfig, { min: number; max: number }>> = {
  citationCloudCap: { min: 1, max: 20 },
  nanoTimeoutMs: { min: 1000, max: 60000 },
  quoteMaxChars: { min: 50, max: 300 },
  passagesTopK: { min: 1, max: 6 },
  passageMaxChars: { min: 200, max: 2000 },
  jsMinTextChars: { min: 50, max: 5000 },
  cloudConcurrency: { min: 1, max: 4 },
  judgeMaxChars: { min: 2000, max: 60000 },
};

/** Remote Config key → config field. */
export const RC_KEYS: Record<string, keyof FootingConfig> = {
  judge_model: "judgeModel",
  triage_cloud_model: "triageCloudModel",
  citation_cloud_cap: "citationCloudCap",
  nano_timeout_ms: "nanoTimeoutMs",
  quote_max_chars: "quoteMaxChars",
  passages_top_k: "passagesTopK",
  passage_max_chars: "passageMaxChars",
  js_min_text_chars: "jsMinTextChars",
  cloud_concurrency: "cloudConcurrency",
  judge_max_chars: "judgeMaxChars",
  device_negative_style: "deviceNegativeStyle",
};
