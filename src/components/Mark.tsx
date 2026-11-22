// Workpaper tick marks (design: pencil tick = vouched, half tick = part, red ellipse = excepted).
import type { ChipState } from "@/lib/tally";

const P = { fill: "none", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function Mark({ state, held, neutral }: { state: ChipState; held?: boolean; neutral?: boolean }) {
  if (state === "LIKELY_UNSUPPORTED" && neutral)
    return <svg viewBox="0 0 24 20" aria-hidden><ellipse cx="12" cy="10" rx="10.5" ry="8" stroke="var(--before)" {...P} strokeDasharray="3 3" /><text x="12" y="14" textAnchor="middle" fontSize="9" fill="var(--before)" fontFamily="var(--font-data), monospace">d</text></svg>;
  switch (state) {
    case "SUPPORTS":
      return <svg viewBox="0 0 24 20" className="stroke" aria-hidden><path d="M3 11 L9 17 L21 3" stroke="var(--vouched)" {...P} /></svg>;
    case "PARTIAL":
      return <svg viewBox="0 0 24 20" className="stroke" aria-hidden><path d="M3 11 L9 17 L14 10" stroke="var(--partial)" {...P} /><path d="M15 9 L21 3" stroke="var(--partial)" {...P} strokeDasharray="2 3" /></svg>;
    case "NOT_SUPPORTED":
      return <svg viewBox="0 0 24 20" className="stroke" aria-hidden><ellipse cx="12" cy="10" rx="10.5" ry="8" stroke="var(--after)" {...P} /><path d="M8 6 L16 14 M16 6 L8 14" stroke="var(--after)" {...P} /></svg>;
    case "LIKELY_UNSUPPORTED":
      return <svg viewBox="0 0 24 20" aria-hidden><ellipse cx="12" cy="10" rx="10.5" ry="8" stroke="var(--after)" opacity="0.7" {...P} strokeDasharray="3 3" /><path d="M8.5 6.5 L15.5 13.5 M15.5 6.5 L8.5 13.5" stroke="var(--after)" opacity="0.7" {...P} /></svg>;
    case "UNVERIFIED":
    case "NOT_FOUND_TRUNCATED":
      return <svg viewBox="0 0 24 20" aria-hidden><text x="12" y="16" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--query)" fontFamily="var(--font-display), Georgia">?</text></svg>;
    case "NOT_CHECKED":
      return <svg viewBox="0 0 24 20" aria-hidden><path d="M5 10 L19 10" stroke="var(--before)" {...P} /></svg>;
    case "escalated":
      return (
        <svg viewBox="0 0 24 20" aria-hidden>
          <path d="M6 15 L6 5 Q12 4 12 8 Q12 11 6 11" stroke="var(--before)" {...P} />
          <text x="15" y="18" fontSize="9" fill={held ? "var(--device)" : "var(--before)"} fontFamily="var(--font-data), monospace">d</text>
        </svg>
      );
    default:
      return <svg viewBox="0 0 24 20" className="pulse" aria-hidden><circle cx="12" cy="10" r="4" fill="var(--before)" /></svg>;
  }
}

/** Route badges: the response's real inferenceSource per model call; repeated cloud attempts collapse to one badge.
 *  A device attempt that timed out / errored has no inferenceSource and is marked as such, never as ON DEVICE. */
export function Badges({ sources }: { sources: string[] }) {
  const seq = sources.filter((s, i) => i === 0 || s !== sources[i - 1]);
  if (!seq.length) return null;
  const label = (s: string) => (s === "on_device" ? "ON DEVICE" : s === "in_cloud" ? "IN CLOUD" : s === "device_timeout" ? "DEVICE TIMED OUT" : "DEVICE ERROR");
  return (
    <span className="badges">
      {seq.map((s, i) => (
        <span key={i} style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
          {i > 0 && <span className="arrow">→</span>}
          <span className={`badge ${s === "in_cloud" ? "c" : s === "on_device" ? "d" : "dx"}`} title={s.startsWith("device_") ? "on-device attempt, no answer" : `inferenceSource: ${s}`}>{label(s)}</span>
        </span>
      ))}
    </span>
  );
}
