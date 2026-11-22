// Output contracts for both models, plus strict parsers (anything off-schema is an error, never a guess).

export const TRIAGE_VERDICTS = ["SUPPORTS", "NOT_SUPPORTED"] as const;
export const JUDGE_VERDICTS = ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"] as const;
export type TriageVerdict = (typeof TRIAGE_VERDICTS)[number];
export type JudgeVerdict = (typeof JUDGE_VERDICTS)[number];

/** Plain JSON Schema for the on-device responseConstraint. */
export function triageConstraint(quoteMax: number) {
  return {
    type: "object",
    properties: {
      verdict: { type: "string", enum: [...TRIAGE_VERDICTS] },
      quote: { type: "string", maxLength: quoteMax },
    },
    required: ["verdict", "quote"],
    additionalProperties: false,
  };
}

export interface TriageOut { verdict: TriageVerdict; quote: string }
export interface JudgeOut { verdict: JudgeVerdict; quote: string; reason: string }

function obj(text: string): Record<string, unknown> {
  const v: unknown = JSON.parse(text);
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
  return v as Record<string, unknown>;
}

export function parseTriage(text: string): TriageOut {
  const o = obj(text);
  if (!TRIAGE_VERDICTS.includes(o.verdict as TriageVerdict)) throw new Error(`bad triage verdict: ${String(o.verdict)}`);
  if (typeof o.quote !== "string") throw new Error("triage quote missing");
  return { verdict: o.verdict as TriageVerdict, quote: o.quote };
}

export function parseJudge(text: string): JudgeOut {
  const o = obj(text);
  if (!JUDGE_VERDICTS.includes(o.verdict as JudgeVerdict)) throw new Error(`bad judge verdict: ${String(o.verdict)}`);
  return { verdict: o.verdict as JudgeVerdict, quote: typeof o.quote === "string" ? o.quote : "", reason: typeof o.reason === "string" ? o.reason : "" };
}
