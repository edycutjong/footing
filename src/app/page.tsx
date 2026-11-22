import CheckApp, { type Hero, type MeterStats } from "@/components/CheckApp";
import hero from "../../seed/answers/hero.json";
import summary from "../../evidence/summary.json";

// Meter figures come only from evidence/summary.json (held-out pool), and only when the pre-registered
// threshold holds: ≥ 4 settled on device with ≥ 80% of them matching the label. Otherwise the line is hidden.
function meterStats(): MeterStats {
  const pool = (summary as { pool?: { settled: number; settledRight: number; n: number } }).pool;
  if (!pool || pool.settled < 4 || pool.settledRight / pool.settled < 0.8) return { show: false };
  return { show: true, settled: pool.settled, right: pool.settledRight, n: pool.n, settledPct: Math.round((100 * pool.settled) / pool.n) };
}

export default function Home() {
  return <CheckApp hero={hero as Hero} meter={meterStats()} />;
}
