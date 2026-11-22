// Pre-click device state only. LanguageModel.availability() is a Chrome capability query — it runs no inference.
// All inference goes through Firebase AI Logic (lib/ai/models.ts); the download itself is started by the SDK's
// initializeDeviceModel() on the Check click.
import type { Device } from "../route/router";

type LM = { availability: (o?: object) => Promise<string> };

export async function deviceAvailability(): Promise<Device> {
  const lm = (globalThis as unknown as { LanguageModel?: LM }).LanguageModel;
  if (!lm) return "unavailable";
  try {
    const a = await lm.availability({ expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] });
    if (a === "available" || a === "downloadable" || a === "downloading") return a;
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
