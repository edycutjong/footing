// Prompt builders. Versioned: any change to wording bumps the version and is re-measured on a fresh set.

export const TRIAGE_PROMPT_VERSION = "triage-binary-v1";
export const JUDGE_PROMPT_VERSION = "judge-3class-v1";

export function triagePrompt(sentence: string, passages: string[]): string {
  return [
    "You check whether a source states a sentence. Read the numbered passages from the source.",
    "Answer SUPPORTS only if one passage states everything the sentence claims: every fact, number, date, cause and qualifier.",
    "If anything in the sentence is missing from the passages, or the passages say something different, answer NOT_SUPPORTED.",
    "quote: copy, character for character, the one passage sentence your answer relies on. Use an empty string if no passage is about the sentence.",
    "",
    `SENTENCE: ${sentence}`,
    "",
    ...passages.map((p, i) => `PASSAGE ${i + 1}: ${p}`),
  ].join("\n");
}

export function judgePrompt(sentence: string, passages: string[], pageWindow: string, truncated: boolean): string {
  return [
    "You check whether a cited source supports a sentence from an AI answer.",
    "SUPPORTS: the source states everything the sentence claims.",
    "PARTIAL: the source states part of it, but some claim (a number, date, cause, scope or qualifier) is missing, weaker or broader than the sentence says.",
    "NOT_SUPPORTED: the source does not state it, or says something different.",
    "quote: copy, character for character, the source sentence your verdict relies on (for NOT_SUPPORTED, what the source says instead), or an empty string if nothing in the source is about it.",
    "reason: one short line in plain English.",
    "",
    `SENTENCE: ${sentence}`,
    "",
    "MOST RELEVANT PASSAGES:",
    ...passages.map((p, i) => `${i + 1}. ${p}`),
    "",
    truncated ? `SOURCE TEXT (first ${pageWindow.length} characters only):` : "SOURCE TEXT (complete):",
    pageWindow,
  ].join("\n");
}
