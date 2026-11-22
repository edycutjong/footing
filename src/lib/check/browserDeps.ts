// Real I/O for the check engine in the browser: /api/fetch (App Check token attached), Readability / unpdf
// extraction, and the Firebase AI Logic model calls (lib/ai/models.ts).
import { getToken } from "firebase/app-check";
import { firebase } from "../firebase";
import { extractText, pdfText } from "../extract";
import { triagePrompt, judgePrompt, judgePdfPrompt, judgeUrlPrompt } from "../ai/prompts";
import { parseTriage, parseJudge } from "../ai/schemas";
import { triageModel, judgeModel, judgeUrlModel } from "../ai/models";
import type { FootingConfig } from "../config";
import type { Deps, ModelReply, SourceDoc, J3 } from "./engine";

const now = () => performance.now();

function errorKind(msg: string): string {
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg)) return "quota";
  if (/\b(500|502|503|504)\b|UNAVAILABLE|overloaded|high demand/i.test(msg)) return "server";
  return "sdk";
}

function race<T>(p: Promise<T>, ms: number): Promise<T> {
  // AbortSignal is ignored on device (P1a spike), so the timeout is a race.
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(Object.assign(new Error(`timeout ${ms} ms`), { timeout: true })), ms))]);
}

export async function appCheckToken(): Promise<string> {
  return (await getToken(firebase().appCheck, false)).token;
}

export async function fetchSourceDoc(url: string): Promise<SourceDoc> {
  const t0 = now();
  try {
    const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`, { headers: { "X-Firebase-AppCheck": await appCheckToken() } });
    const j = await res.json();
    const fetchMs = Math.round(now() - t0);
    if (!j.ok) return { ok: false, kind: "failed", status: j.status ?? res.status, finalUrl: j.finalUrl ?? url, text: "", error: j.error ?? `proxy ${res.status}`, fetchMs };
    const base = { ok: true, status: j.status, finalUrl: j.finalUrl, sha256: j.sha256, fetchedAt: j.fetchedAt, bytes: j.bytes, fetchMs };
    if (j.kind === "pdf") {
      const bin = atob(j.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      let text = "";
      try { text = await pdfText(bytes); } catch { /* text stays empty → the gate refuses every quote (UNVERIFIED) */ }
      return { ...base, kind: "pdf", text, pdfBase64: j.base64 };
    }
    const { text } = extractText(j.body, j.contentType ?? "", j.finalUrl);
    return { ...base, kind: "html", text };
  } catch (e) {
    return { ok: false, kind: "failed", status: 0, finalUrl: url, text: "", error: `could not reach the fetch proxy (${String((e as Error).message ?? e).slice(0, 80)})`, fetchMs: Math.round(now() - t0) };
  }
}

async function judgeCall(run: () => Promise<{ response: { text(): string; inferenceSource?: string } }>): Promise<ModelReply<J3>> {
  const t0 = now();
  try {
    const res = await run();
    const raw = res.response.text();
    try {
      const o = parseJudge(raw);
      return { verdict: o.verdict, quote: o.quote, reason: o.reason, inferenceSource: res.response.inferenceSource, raw, ms: Math.round(now() - t0) };
    } catch (e) {
      return { inferenceSource: res.response.inferenceSource, raw, error: String((e as Error).message), errorKind: "malformed", ms: Math.round(now() - t0) };
    }
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 400);
    return { error: msg, errorKind: errorKind(msg), ms: Math.round(now() - t0) };
  }
}

export function browserDeps(cfg: FootingConfig): Deps {
  return {
    getSource: fetchSourceDoc,
    async triage(sentence, passages, mode, src) {
      const t0 = now();
      const model = triageModel(cfg, mode);
      try {
        const res = await race(
          src.kind === "pdf"
            // On-device only + PDF: pass the PDF so the SDK's own refusal is what the user sees.
            ? model.generateContent([{ type: "inlineData" as const, inlineData: { mimeType: "application/pdf", data: src.pdfBase64 ?? "" } }, triagePrompt(sentence, [])])
            : model.generateContent(triagePrompt(sentence, passages)),
          cfg.nanoTimeoutMs,
        );
        const raw = res.response.text();
        try {
          const o = parseTriage(raw);
          return { verdict: o.verdict, quote: o.quote, inferenceSource: res.response.inferenceSource, raw, ms: Math.round(now() - t0) };
        } catch (e) {
          return { inferenceSource: res.response.inferenceSource, raw, error: String((e as Error).message), errorKind: "malformed", ms: Math.round(now() - t0) };
        }
      } catch (e) {
        const err = e as Error & { timeout?: boolean };
        return { error: String(err.message ?? e).slice(0, 300), errorKind: err.timeout ? "timeout" : "sdk", ms: Math.round(now() - t0) };
      }
    },
    judge: (sentence, passages, window, truncated) => judgeCall(() => judgeModel(cfg).generateContent(judgePrompt(sentence, passages, window, truncated))),
    judgePdf: (sentence, data) =>
      judgeCall(() => judgeModel(cfg).generateContent([{ type: "inlineData" as const, inlineData: { mimeType: "application/pdf", data } }, judgePdfPrompt(sentence)])),
    judgeUrl: (sentence, url) => judgeCall(() => judgeUrlModel(cfg).generateContent(judgeUrlPrompt(sentence, url))),
  };
}

/** Start the on-device model on the Check click (docs: must follow a user gesture). Not awaited by the check:
 *  while it downloads, PREFER_ON_DEVICE answers come from the cloud and are badged so. */
export function initDevice(cfg: FootingConfig, onProgress: (p: number) => void): Promise<void> {
  return triageModel(cfg, "PREFER_ON_DEVICE").initializeDeviceModel(onProgress);
}
