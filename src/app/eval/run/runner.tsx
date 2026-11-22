"use client";
// Exposes window.__evalPair for scripts/eval.mjs: one (sentence, passages) pair through the on-device
// triage or the cloud judge, with the same prompts, schemas and gate the app uses.
import { useEffect, useState } from "react";
import { getGenerativeModel, InferenceMode, Schema } from "firebase/ai";
import { firebase } from "@/lib/firebase";
import { triagePrompt, judgePrompt, TRIAGE_PROMPT_VERSION, JUDGE_PROMPT_VERSION } from "@/lib/ai/prompts";
import { triageConstraint, parseTriage, parseJudge } from "@/lib/ai/schemas";
import { quoteHeld } from "@/lib/gate/quote";

export interface PairInput {
  mode: "triage" | "judge";
  sentence: string;
  passages: string[];
  window?: string;
  truncated?: boolean;
  timeoutMs?: number;
  quoteMax?: number;
  judgeModel?: string;
}

const judgeSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({ enum: ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"] }),
    quote: Schema.string(),
    reason: Schema.string(),
  },
});

function race<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms} ms`)), ms))]);
}

async function evalPair(input: PairInput) {
  const t0 = performance.now();
  const { ai } = firebase();
  if (input.mode === "triage") {
    const prompt = triagePrompt(input.sentence, input.passages);
    const model = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] },
        promptOptions: { responseConstraint: triageConstraint(input.quoteMax ?? 300) },
      },
    });
    try {
      const res = await race(model.generateContent(prompt), input.timeoutMs ?? 20000);
      const raw = res.response.text();
      const out = parseTriage(raw);
      return {
        promptVersion: TRIAGE_PROMPT_VERSION, inferenceSource: res.response.inferenceSource, raw,
        verdict: out.verdict, quote: out.quote, gateHeld: quoteHeld(out.quote, input.passages.join("\n")),
        ms: Math.round(performance.now() - t0), promptChars: prompt.length,
      };
    } catch (e) {
      return { promptVersion: TRIAGE_PROMPT_VERSION, error: String((e as Error).message ?? e).slice(0, 500), ms: Math.round(performance.now() - t0) };
    }
  }
  const prompt = judgePrompt(input.sentence, input.passages, input.window ?? "", !!input.truncated);
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: input.judgeModel ?? "gemini-3.5-flash-lite",
      generationConfig: { responseMimeType: "application/json", responseSchema: judgeSchema, temperature: 0 },
    },
  });
  try {
    const res = await model.generateContent(prompt);
    const raw = res.response.text();
    const out = parseJudge(raw);
    return {
      promptVersion: JUDGE_PROMPT_VERSION, model: input.judgeModel, inferenceSource: res.response.inferenceSource, raw,
      verdict: out.verdict, quote: out.quote, reason: out.reason,
      gateHeld: quoteHeld(out.quote, input.passages.join("\n") + "\n" + (input.window ?? "")),
      ms: Math.round(performance.now() - t0), promptChars: prompt.length, usage: res.response.usageMetadata ?? null,
    };
  } catch (e) {
    return { promptVersion: JUDGE_PROMPT_VERSION, model: input.judgeModel, error: String((e as Error).message ?? e).slice(0, 500), ms: Math.round(performance.now() - t0) };
  }
}

export default function Runner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (window as unknown as { __evalPair: typeof evalPair }).__evalPair = evalPair;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot readiness flag for the E2E driver
    setReady(true);
  }, []);
  return <main id="eval-runner" data-ready={ready}>eval runner {ready ? "ready" : "loading"}</main>;
}
