import type { Metadata } from "next";
import Link from "next/link";
import summary from "../../../evidence/summary.json";

export const metadata: Metadata = { title: "Footing · measured results" };

type Dev = { n: number; correct: number; accuracyPct: number; confusion: Record<string, number>; settledOnDevice: number; settledCorrect: number; settledNegativePrecisionPct: number | null; escalated: number; latencyMs: { p50: number; p95: number }; recordedAt: string; file: string };
type Cloud = { n: number; correct: number; accuracyPct: number; model: string; confusion: Record<string, Record<string, number>>; quoteGateHeld: number; latencyMs: { p50: number; p95: number }; recordedAt: string; file: string };
type SetSummary = { heldOut: boolean; note: string; device?: Dev; cloud?: Cloud };

const REPO = "https://github.com/edycutjong/footing/blob/main/";
const LABELS = ["SUPPORTS", "PARTIAL", "NOT_SUPPORTED"] as const;

function SetBlock({ name, s }: { name: string; s: SetSummary }) {
  return (
    <section style={{ margin: "2rem 0" }}>
      <h2>{name} {s.heldOut ? "(held-out)" : "(not held-out)"}</h2>
      <p>{s.note}</p>
      {s.device ? (
        <>
          <h3>On device: Gemini Nano, binary triage (SUPPORTS / NOT_SUPPORTED)</h3>
          <p>
            {s.device.correct} of {s.device.n} correct ({s.device.accuracyPct}%) · TP {s.device.confusion.TP} · FN {s.device.confusion.FN} · FP{" "}
            {s.device.confusion.FP} · TN {s.device.confusion.TN} · latency p50 {s.device.latencyMs.p50} ms, p95 {s.device.latencyMs.p95} ms
          </p>
          <p>
            Settled on the laptop (NOT_SUPPORTED, no quote): {s.device.settledOnDevice} of {s.device.n}; {s.device.settledCorrect} of those were
            labelled PARTIAL or NOT_SUPPORTED{s.device.settledNegativePrecisionPct !== null && s.device.settledOnDevice >= 4 ? ` (${s.device.settledNegativePrecisionPct}%)` : " (too few to judge)"}. The other{" "}
            {s.device.escalated} go to the cloud model.
          </p>
          <p><a href={REPO + s.device.file}>raw rows</a> · <a href={`${REPO}evidence/${name}/LABELS-PROVENANCE.md`}>how the labels were made, and their limits</a> · recorded {s.device.recordedAt}</p>
        </>
      ) : <p>On-device run: not yet recorded.</p>}
      {s.cloud ? (
        <>
          <h3>Cloud: {s.cloud.model}, 3-class judge (SUPPORTS / PARTIAL / NOT_SUPPORTED)</h3>
          <p>
            {s.cloud.correct} of {s.cloud.n} correct ({s.cloud.accuracyPct}%) · quote found verbatim in its input: {s.cloud.quoteGateHeld} of {s.cloud.n} ·
            latency p50 {s.cloud.latencyMs.p50} ms, p95 {s.cloud.latencyMs.p95} ms
          </p>
          <table style={{ borderCollapse: "collapse" }}>
            <thead><tr><th style={{ textAlign: "left", paddingRight: 12 }}>label ↓ / verdict →</th>{LABELS.map((l) => <th key={l} style={{ paddingRight: 12 }}>{l}</th>)}</tr></thead>
            <tbody>
              {LABELS.map((g) => (
                <tr key={g}><td style={{ paddingRight: 12 }}>{g}</td>{LABELS.map((p) => <td key={p} style={{ textAlign: "center" }}>{s.cloud!.confusion[g][p]}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {s.cloud.correct / s.cloud.n < 0.8 ? (
            <p>
              That is below the 24-of-30 (80%) bar we set for the on-device test. So Footing is designed never to show a verdict on the model&apos;s word
              alone: the quoted words must be found verbatim in the source text the model read, or the citation is marked UNVERIFIED.
            </p>
          ) : null}
          <p><a href={REPO + s.cloud.file}>raw rows</a> · recorded {s.cloud.recordedAt}</p>
        </>
      ) : <p>Cloud run: not yet recorded.</p>}
    </section>
  );
}

export default function EvalPage() {
  const sets = summary.sets as Record<string, SetSummary>;
  return (
    <main style={{ maxWidth: 760, margin: "3rem auto", fontFamily: "system-ui", padding: "0 1rem", lineHeight: 1.5 }}>
      <h1>Footing · measured results</h1>
      <p>
        Footing checks whether each link cited in an AI answer says what the sentence claims. These are the raw measurements behind every number
        we show. On-device runs: {summary.machine}. Generated {summary.generatedAt}.
      </p>
      {Object.entries(sets).map(([name, s]) => <SetBlock key={name} name={name} s={s} />)}
      <p><Link href="/">Check an answer</Link></p>
    </main>
  );
}
