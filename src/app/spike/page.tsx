"use client";
// SDK spike harness: each button proves one Firebase AI Logic call end-to-end in the browser.
// The E2E driver (scripts/spike.mjs) clicks these and saves the verbatim results to evidence/spike/.
import { useState } from "react";
import { getGenerativeModel, InferenceMode, Schema } from "firebase/ai";
import { firebase, appCheckStatus } from "@/lib/firebase";

const CLAIM = "The library opens at 9 a.m. on Saturdays.";
const PASSAGE =
  "Opening hours. Monday to Friday the reading rooms open at 8 a.m. and close at 8 p.m. " +
  "On Saturdays the library opens at 9 a.m. and closes at 1 p.m. The library is closed on Sundays.";
const PROMPT = `Does the passage support the claim? Answer SUPPORTS only if the passage states it. Quote the exact words you rely on.\nCLAIM: ${CLAIM}\nPASSAGE: ${PASSAGE}`;

// Plain JSON Schema for the on-device responseConstraint (binary triage).
const triageJson = (quoteMax: number) => ({
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["SUPPORTS", "NOT_SUPPORTED"] },
    quote: { type: "string", maxLength: quoteMax },
  },
  required: ["verdict", "quote"],
  additionalProperties: false,
});

const triageCloudSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({ enum: ["SUPPORTS", "NOT_SUPPORTED"] }),
    quote: Schema.string(),
  },
});

const judgeSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({ enum: ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"] }),
    quote: Schema.string(),
    reason: Schema.string(),
  },
});

type Result = Record<string, unknown>;

const judgeModel = () =>
  (typeof location !== "undefined" && new URLSearchParams(location.search).get("judge")) || "gemini-3.8-flash";

async function timed(name: string, fn: () => Promise<Result>): Promise<Result> {
  const t0 = performance.now();
  try {
    const r = await fn();
    return { name, ok: true, ms: Math.round(performance.now() - t0), ...r };
  } catch (e) {
    const err = e as { name?: string; message?: string; code?: string };
    return { name, ok: false, ms: Math.round(performance.now() - t0), error: { name: err.name, code: err.code, message: String(err.message ?? e).slice(0, 2000) } };
  }
}

function triageModel(quoteMax = 300) {
  return getGenerativeModel(firebase().ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] },
      promptOptions: { responseConstraint: triageJson(quoteMax) },
    },
    inCloudParams: {
      model: "gemini-3.5-flash-lite",
      generationConfig: { responseMimeType: "application/json", responseSchema: triageCloudSchema, temperature: 0 },
    },
  });
}

const SPIKES: Record<string, () => Promise<Result>> = {
  async appcheck() {
    return appCheckStatus();
  },
  async availability() {
    const LM = (globalThis as unknown as { LanguageModel?: { availability: (o?: object) => Promise<string> } }).LanguageModel;
    return { languageModelGlobal: !!LM, availability: LM ? await LM.availability({ expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] }) : "no LanguageModel global" };
  },
  async triage() {
    const model = triageModel();
    const progress: number[] = [];
    const t0 = performance.now();
    // PREFER_ON_DEVICE: start init on the click but do not await it; if the model is still
    // downloading, the SDK answers from the cloud meanwhile (docs, get-started Step 6).
    let initDone = false;
    const init = model.initializeDeviceModel((v) => progress.push(v)).then(() => (initDone = true)).catch(() => progress.push(-1));
    if (new URLSearchParams(location.search).get("awaitInit") === "1") await init;
    const initMs = Math.round(performance.now() - t0);
    const res = await model.generateContent(PROMPT);
    return { initMs, initDoneBeforeAnswer: initDone, progressSamples: progress.slice(-5), inferenceSource: res.response.inferenceSource, text: res.response.text(), prompt: PROMPT };
  },
  async maxlength() {
    // Is maxLength inside responseConstraint honoured on device? Ask for a long quote, cap at 20 chars.
    const model = triageModel(20);
    await model.initializeDeviceModel().catch(() => undefined);
    const res = await model.generateContent(PROMPT + "\nQuote the whole passage.");
    const text = res.response.text();
    let quoteLen: number | null = null;
    try { quoteLen = String(JSON.parse(text).quote).length; } catch { /* left null */ }
    return { inferenceSource: res.response.inferenceSource, text, quoteMaxRequested: 20, quoteLen, honoured: quoteLen !== null ? quoteLen <= 20 : null };
  },
  async abort() {
    // Does generateContent honour an AbortSignal (the timeout race backstop)?
    const model = triageModel();
    await model.initializeDeviceModel().catch(() => undefined);
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 50);
    try {
      const res = await model.generateContent(PROMPT, { signal: ctl.signal });
      return { aborted: false, inferenceSource: res.response.inferenceSource };
    } catch (e) {
      return { aborted: true, errorName: (e as Error).name, message: String((e as Error).message).slice(0, 300) };
    }
  },
  async cloudJudge() {
    const model = getGenerativeModel(firebase().ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: { model: judgeModel(), generationConfig: { responseMimeType: "application/json", responseSchema: judgeSchema, temperature: 0 } },
    });
    const res = await model.generateContent(PROMPT.replace("Answer SUPPORTS only if the passage states it.", "Answer SUPPORTS, PARTIAL (only part is stated) or NOT_SUPPORTED."));
    return { model: judgeModel(), inferenceSource: res.response.inferenceSource, text: res.response.text(), usage: res.response.usageMetadata };
  },
  async pdf() {
    const buf = new Uint8Array(await (await fetch("/spike/sample.pdf")).arrayBuffer());
    let bin = "";
    buf.forEach((b) => (bin += String.fromCharCode(b)));
    const model = getGenerativeModel(firebase().ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: { model: judgeModel(), generationConfig: { responseMimeType: "application/json", responseSchema: judgeSchema, temperature: 0 } },
    });
    const res = await model.generateContent([
      { type: "inlineData", inlineData: { mimeType: "application/pdf", data: btoa(bin) } },
      `Does this PDF support the claim? Answer SUPPORTS, PARTIAL or NOT_SUPPORTED and quote the exact words.\nCLAIM: ${CLAIM}`,
    ]);
    return { inferenceSource: res.response.inferenceSource, pdfBytes: buf.length, text: res.response.text(), usage: res.response.usageMetadata };
  },
  async urlContext() {
    const url = (document.getElementById("url") as HTMLInputElement | null)?.value || "https://example.com/";
    const model = getGenerativeModel(firebase().ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: { model: judgeModel(), tools: [{ urlContext: {} }], generationConfig: { temperature: 0 } },
    });
    const res = await model.generateContent(`Read ${url} and quote, verbatim, the first two sentences of its main text.`);
    const c = res.response.candidates?.[0];
    return { url, inferenceSource: res.response.inferenceSource, text: res.response.text(), urlContextMetadata: c?.urlContextMetadata ?? null };
  },
  async urlContextSchema() {
    const url = (document.getElementById("url") as HTMLInputElement | null)?.value || "https://example.com/";
    const model = getGenerativeModel(firebase().ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: { model: judgeModel(), tools: [{ urlContext: {} }], generationConfig: { responseMimeType: "application/json", responseSchema: judgeSchema, temperature: 0 } },
    });
    const res = await model.generateContent(`Read ${url}. Does it support the claim "This domain is for use in documentation examples"? Quote the exact words.`);
    return { url, inferenceSource: res.response.inferenceSource, text: res.response.text(), urlContextMetadata: res.response.candidates?.[0]?.urlContextMetadata ?? null };
  },
};

export default function Spike() {
  const [out, setOut] = useState<Record<string, Result>>({});
  async function run(name: string) {
    const r = await timed(name, SPIKES[name]);
    (window as unknown as { __spike: Record<string, Result> }).__spike = { ...(window as unknown as { __spike?: Record<string, Result> }).__spike, [name]: r };
    setOut((o) => ({ ...o, [name]: r }));
  }
  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: 16 }}>
      <h1>Footing SDK spike</h1>
      <input id="url" placeholder="URL for the URL-context spike" style={{ width: 480 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {Object.keys(SPIKES).map((k) => (
          <button key={k} id={`run-${k}`} onClick={() => run(k)}>{k}</button>
        ))}
      </div>
      <pre id="out" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(out, null, 2)}</pre>
    </main>
  );
}
