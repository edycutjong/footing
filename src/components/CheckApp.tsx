"use client";
// The check page: answer sheet → Check sources → chips flip per citation (route badge = the response's real
// inferenceSource) → footed total → evidence pane → Copy answer with flags.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { parseAnswer, answerToText, MAX_ANSWER_CHARS, type Parsed } from "@/lib/parse";
import { DEFAULT_CONFIG, type FootingConfig } from "@/lib/config";
import { tally, copyWithFlags, type ChipState } from "@/lib/tally";
import type { Device, Force } from "@/lib/route/router";
import { Check, type PairRun } from "@/lib/check/engine";
import { normalize } from "@/lib/text";
import { Mark, Badges } from "./Mark";

export interface Hero { id: string; question: string; answer: string; sources: string[]; capturedAt: string; provenance: string; how: string }
export interface MeterStats { show: boolean; settledPct?: number; right?: number; settled?: number; n?: number }

function chipText(r: PairRun | undefined, style: "likely" | "neutral"): { title: string; sub?: string } {
  if (!r) return { title: "not checked yet" };
  switch (r.state) {
    case "SUPPORTS": return { title: "says it" };
    case "PARTIAL": return { title: "says part of it", sub: r.reason };
    case "NOT_SUPPORTED": return { title: "doesn't say this", sub: r.reason };
    case "LIKELY_UNSUPPORTED": return { title: style === "likely" ? "likely doesn't say this · confirm" : "not found on device · confirm", sub: "Nano, unconfirmed" };
    case "UNVERIFIED": return { title: "quote not found in what the model read", sub: r.note };
    case "NOT_FOUND_TRUNCATED": return { title: r.note ?? "not found in the part read" };
    case "NOT_CHECKED": return { title: r.reason ?? "not checked" };
    case "CAP_REACHED": return { title: r.reason ?? "check skipped (cap) — tap to confirm" };
    case "escalated": return { title: r.nanoQuoteHeld ? "Nano found a candidate quote · checking in the cloud" : "Nano's result needs the cloud · checking", sub: r.note };
    case "triage": return { title: "reading on this laptop…" };
    case "deciding": return { title: "deciding in the cloud…", sub: r.note };
    default: return { title: "checking…" };
  }
}

const VERDICT_WORDS: Partial<Record<ChipState, string>> = {
  SUPPORTS: "source says it", PARTIAL: "source says only part of it", NOT_SUPPORTED: "source doesn't say this",
  UNVERIFIED: "quote not found", NOT_FOUND_TRUNCATED: "not found in the part read",
  NOT_CHECKED: "not checked", CAP_REACHED: "check skipped, tap to confirm",
};

function verdictWords(st: ChipState, style: "likely" | "neutral"): string | undefined {
  if (st === "LIKELY_UNSUPPORTED") return style === "likely" ? "likely doesn't say this (on device, unconfirmed)" : "not found on device (unconfirmed)";
  return VERDICT_WORDS[st];
}

function where(r: PairRun): string {
  const dev = r.sources.includes("on_device");
  const cloud = r.sources.includes("in_cloud");
  const timedOut = r.sources.some((s) => s.startsWith("device_"));
  if (dev && cloud) return "triaged on this laptop, decided in the cloud";
  if (dev) return "checked on this laptop";
  if (cloud) return timedOut ? "on-device attempt failed, decided in the cloud" : "checked in the cloud";
  return timedOut ? "on-device attempt failed" : "not run";
}

function fragment(url: string, quote?: string): string {
  if (!quote) return url;
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C");
  const w = normalize(quote).split(" ");
  const frag = w.length <= 8 ? enc(w.join(" ")) : `${enc(w.slice(0, 4).join(" "))},${enc(w.slice(-4).join(" "))}`;
  return `${url}#:~:text=${frag}`;
}

function Excerpt({ input, quote, empty }: { input?: string; quote?: string; empty?: boolean }) {
  if (!input) return <p className="data">No source text (read in the cloud from the URL).</p>;
  if (empty) return <p>No passage in what the model read says this.</p>;
  const text = normalize(input);
  const q = quote ? normalize(quote) : "";
  // modelInput = passages + page window; the last occurrence sits in the page window, i.e. in page order.
  const at = q ? text.lastIndexOf(q) : -1;
  if (at < 0) return <p>{text.slice(0, 500)}{text.length > 500 ? "…" : ""}</p>;
  const a = Math.max(0, at - 220), b = Math.min(text.length, at + q.length + 220);
  return <p>{a > 0 ? "…" : ""}{text.slice(a, at)}<span className="found">{text.slice(at, at + q.length)}</span>{text.slice(at + q.length, b)}{b < text.length ? "…" : ""}</p>;
}

function Circled({ sentence, words }: { sentence: string; words?: string[] }) {
  if (!words?.length) return <p>{sentence}</p>;
  const set = new Set(words);
  return <p>{sentence.split(/(\s+)/).map((tok, i) => {
    const core = tok.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
    return set.has(core) ? <span key={i} className="miss" title="not in the quote">{tok}</span> : <span key={i}>{tok}</span>;
  })}</p>;
}

function Pane({ r, cfg, onClose, onConfirm }: { r: PairRun; cfg: FootingConfig; onClose: () => void; onConfirm: (id: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // Modal focus: move focus in, keep Tab inside, give it back to the chip that opened the pane.
    const opener = document.activeElement as HTMLElement | null; // captured once, on open
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !ref.current) return;
      const f = [...ref.current.querySelectorAll<HTMLElement>("button, a[href], input")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const inside = ref.current.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === first)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); opener?.focus?.(); };
  }, []);
  useEffect(() => { ref.current?.querySelector<HTMLElement>("button.close")?.focus(); }, [r.pair.id]);
  const t = r.trail;
  const triage = t.find((s) => s.step === "triage");
  const judge = [...t].reverse().find((s) => s.step.startsWith("judge"));
  const showQuote = r.quote && (r.state === "SUPPORTS" || r.state === "PARTIAL" || r.state === "NOT_SUPPORTED");
  const canConfirm = ["LIKELY_UNSUPPORTED", "CAP_REACHED", "NOT_CHECKED", "UNVERIFIED"].includes(r.state) && r.source?.kind !== "failed";
  return (
    <aside className="pane" role="dialog" aria-modal="true" ref={ref} aria-label={`Evidence for sentence ${r.pair.s + 1}`}>
      <button className="ghost close" onClick={onClose} aria-label="Close evidence">Close ✕</button>
      <h2>Sentence {r.pair.s + 1}{r.pair.n !== null ? ` · source [${r.pair.n}]` : ""}</h2>
      <div className={`verdict s-${r.state}${cfg.deviceNegativeStyle === "neutral" && r.state === "LIKELY_UNSUPPORTED" ? " neutral" : ""}`}>
        <Mark state={r.state} held={r.nanoQuoteHeld} neutral={cfg.deviceNegativeStyle === "neutral"} /> <b>{verdictWords(r.state, cfg.deviceNegativeStyle) ?? chipText(r, cfg.deviceNegativeStyle).title}</b> <Badges sources={r.sources} />
      </div>
      {triage?.verdict && judge?.verdict && (
        <p className="data" style={{ margin: "6px 0 0" }}>
          Nano on this laptop said {triage.verdict}{triage.gateHeld ? " (its quote is in the page)" : ""} → the cloud ruled {judge.verdict}{judge.verdict !== triage.verdict ? " (overruled)" : " (confirmed)"}
        </p>
      )}
      {r.reason && <p style={{ margin: "6px 0 0" }}>{r.reason}</p>}
      <div className="cols">
        <div>
          <h4>The sentence{r.uncovered?.length ? " — circled: not in the quote" : ""}</h4>
          <Circled sentence={r.pair.sentence} words={r.uncovered} />
        </div>
        <div>
          <h4>{r.state === "NOT_SUPPORTED" && r.quote ? "What the page says instead" : "The source"}</h4>
          <Excerpt input={r.modelInput ?? r.passages?.join(" ")} quote={showQuote ? r.quote : (triage?.gateHeld ? triage.quote : undefined)} empty={(r.state === "NOT_SUPPORTED" || r.state === "LIKELY_UNSUPPORTED") && !r.quote?.trim()} />
          {r.source?.finalUrl && <p className="data" style={{ marginTop: 8 }}><a href={fragment(r.source.finalUrl, showQuote ? r.quote : undefined)} target="_blank" rel="noreferrer">open source ↗</a> {r.source.finalUrl}</p>}
        </div>
      </div>
      {canConfirm && <p><button className="primary" onClick={() => onConfirm(r.pair.id)}>{r.state === "NOT_CHECKED" ? "Check this one in the cloud" : "Confirm in the cloud"}</button></p>}
      <h4 style={{ margin: "16px 0 4px", fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>Route trail</h4>
      {r.planned && r.sources.length > 0 && !r.sources.includes("on_device") && (
        <p className="data">planned on a Nano laptop: {r.planned.to === "DEVICE_TRIAGE" ? "on-device first" : `cloud — ${r.planned.reason}`} → ran: {r.sources.map((s) => (s === "on_device" ? "d" : s.startsWith("device_") ? "d✗" : "c")).join(" → ")}</p>
      )}
      <ul className="trail data">
        {t.map((s, i) => (
          <li key={i}>
            <b>{s.step}</b>{s.inferenceSource ? ` · ${s.inferenceSource.toUpperCase()}` : ""}{s.route ? ` · ${s.route}` : ""}{s.verdict ? ` · ${s.verdict}` : ""}
            {s.gateHeld !== undefined ? ` · gate ${s.gateHeld ? "✓" : "✗"}` : ""}{s.ms !== undefined ? ` · ${s.ms} ms` : ""}{s.attempt && s.attempt > 1 ? ` · attempt ${s.attempt}` : ""}
            {s.quote ? <div>quote: “{s.quote}”</div> : null}
            {s.reason ? <div>{s.reason}</div> : null}
            {s.error ? <div style={{ color: "var(--after)" }}>{s.error}</div> : null}
          </li>
        ))}
      </ul>
      <p className="meta data">
        {judge && triage ? `${triage.verdict ?? "—"} on device → ${judge.verdict ?? "—"} in the cloud · ` : ""}
        fetched {r.source?.fetchedAt ?? "—"} · {r.source?.kind ?? ""} · sha256 {r.source?.sha256?.slice(0, 12) ?? "—"}… · {r.cloudCalls} cloud call{r.cloudCalls === 1 ? "" : "s"}
      </p>
    </aside>
  );
}

/** Longest wait for initializeDeviceModel() when the model is already available (no download involved). */
const INIT_DEADLINE_MS = 20_000;
/** Extra wait for a still-pending availability() answer when Check is clicked early. */
const CLICK_GRACE_MS = 5_000;

export default function CheckApp({ hero, meter }: { hero: Hero; meter: MeterStats }) {
  const [text, setText] = useState(() => answerToText(hero.answer, hero.sources));
  const [mine, setMine] = useState(false);
  const [draft, setDraft] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const parsed: Parsed = useMemo(() => parseAnswer(text), [text]);
  const draftCount = useMemo(() => (draft ? parseAnswer(draft).pairs.length : 0), [draft]);
  const [force, setForce] = useState<Force>("auto");
  const [device, setDevice] = useState<Device | "checking" | "slow">("checking");
  const [progress, setProgress] = useState<number | undefined>();
  const [runs, setRuns] = useState<PairRun[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [withUnconfirmed, setWithUnconfirmed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const check = useRef<Check | null>(null);
  const availability = useRef<Promise<Device> | null>(null);
  // Bumped whenever the answer changes or a new check starts: a check whose start-up was overtaken never installs itself.
  const generation = useRef(0);
  const [cloudUsed, setCloudUsed] = useState(0);
  // Remote Config: thresholds/models/caps come from the published template; code defaults until (and unless) it loads.
  const [cfg, setCfg] = useState<FootingConfig>(DEFAULT_CONFIG);
  const [rcInfo, setRcInfo] = useState<{ source: "remote" | "defaults" | "loading"; applied: string[]; error?: string }>({ source: "loading", applied: [] });
  const rcLoad = useRef<Promise<FootingConfig> | null>(null);
  useEffect(() => {
    // Never blocks a check for long: defaults win after 5 s or on any failure (chunk load, installations, network).
    const load = import("@/lib/remoteConfig").then((m) => m.loadRemoteConfig()).then((r) => {
      setCfg(r.cfg); setRcInfo({ source: r.source, applied: r.applied, error: r.error });
      return r.cfg;
    }).catch((e) => { setRcInfo({ source: "defaults", applied: [], error: String(e).slice(0, 200) }); return DEFAULT_CONFIG; });
    rcLoad.current = Promise.race([load, new Promise<FootingConfig>((res) => setTimeout(() => res(DEFAULT_CONFIG), 5000))]);
  }, []);

  useEffect(() => {
    // availability() can take minutes on a fresh profile (P1a: 152 s). After 4 s the page treats the device as
    // unavailable (checks run in the cloud); a late answer still updates the pill.
    let settled = false;
    const timer = setTimeout(() => { if (!settled) setDevice((d) => (d === "checking" ? "slow" : d)); }, 4000);
    const p = import("@/lib/ai/deviceModel").then((m) => m.deviceAvailability()).catch((): Device => "unavailable");
    availability.current = p;
    p.then((d) => { settled = true; setDevice(d); });
    return () => clearTimeout(timer);
  }, []);

  const byId = useMemo(() => new Map(runs.map((r) => [r.pair.id, r])), [runs]);
  const states = parsed.pairs.map((p) => byId.get(p.id)?.state).filter((s): s is ChipState => !!s);
  const t = tally(states);
  const nanoLaptop = parsed.pairs.length;

  useEffect(() => {
    (window as unknown as { __footing: unknown }).__footing = {
      done, running, device, force, tally: t, cloudUsed, config: { source: rcInfo.source, applied: rcInfo.applied, judgeModel: cfg.judgeModel, cap: cfg.citationCloudCap },
      runs: runs.map((r) => ({ id: r.pair.id, s: r.pair.s, n: r.pair.n, url: r.pair.url, sentence: r.pair.sentence, state: r.state, route: r.route, after: r.after, planned: r.planned, sources: r.sources, quote: r.quote, reason: r.reason, note: r.note, trail: r.trail, source: r.source, cloudCalls: r.cloudCalls })),
    };
  });

  // Only the current check may paint: an older check (or a confirm tap on it) finishing after the answer changed or a
  // new check started is ignored, so its rows can never land on a different sentence (a2a r03).
  const update = useCallback((_r: PairRun, all: PairRun[]) => {
    if (!check.current || all !== check.current.runs) return;
    setRuns(all.map((x) => ({ ...x, trail: [...x.trail], sources: [...x.sources] })));
    setCloudUsed(check.current.cloudUsed);
  }, []);

  /** Clicked while availability() is still pending: wait a short grace for the real answer instead of assuming no
   *  Nano (a live Nano laptop answered just after the 4 s "slow" mark and was sent to the cloud, a2a r03). */
  async function lateAvailability(): Promise<Device> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<Device>((res) => { timer = setTimeout(() => res("unavailable"), CLICK_GRACE_MS); });
    const d = await Promise.race([availability.current ?? Promise.resolve<Device>("unavailable"), grace]);
    clearTimeout(timer);
    if (d !== "unavailable") setDevice(d);
    return d;
  }

  async function runCheck() {
    setRunning(true); setDone(false); setOpen(null); setBanner(null);
    // Drop the previous check's rows and cloud count now, not when the new engine exists: start-up (App Check, Remote
    // Config, device init) can take a second, and stale rows read as "Checking 9 of 9" with the old count (a2a r07).
    setRuns([]); setCloudUsed(0);
    check.current = null;
    const gen = ++generation.current;
    try {
      await runCheckInner(gen);
    } catch (e) {
      setBanner(`The check stopped: ${String((e as Error).message ?? e).slice(0, 160)}. Reload to try again.`);
    } finally {
      setRunning(false); // always released, even if an import, App Check or the engine throws
    }
  }

  async function runCheckInner(gen: number) {
    const [{ appCheckStatus }, { browserDeps, initDevice }] = await Promise.all([import("@/lib/firebase"), import("@/lib/check/browserDeps")]);
    const ac = await appCheckStatus();
    const live = (await rcLoad.current) ?? DEFAULT_CONFIG;
    if (!ac.ok) {
      setBanner("This browser could not be verified (App Check). Reload, or open /eval for the measured results.");
      return;
    }
    let dev: Device = device === "checking" || device === "slow" ? await lateAvailability() : device;
    if (dev !== "unavailable" && force !== "cloud") {
      let gaveUp = false; // after the init deadline, late progress callbacks no longer move the pill
      let init: Promise<void>;
      try {
        init = initDevice(live, (p) => { if (gaveUp) return; setProgress(p); if (p < 1) setDevice("downloading"); });
      } catch (e) {
        init = Promise.reject(e); // a synchronous SDK throw falls back to the cloud like any init failure
      }
      if (dev === "available") {
        // Bounded: a stuck initialisation sends this check to the cloud instead of hanging the button (a2a r03).
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("init timeout")), INIT_DEADLINE_MS); });
        try { await Promise.race([init, deadline]); } catch { dev = "unavailable"; gaveUp = true; setDevice("unavailable"); } finally { clearTimeout(timer); }
        init.catch(() => undefined); // a rejection landing after the deadline is expected, not unhandled (a2a r04)
      } else {
        setDevice("downloading");
        init.then(() => setDevice("available")).catch(() => setDevice("unavailable"));
      }
    }
    if (gen !== generation.current) return; // the answer changed (or another check started) during start-up (a2a r04)
    const c = new Check(parsed.pairs, browserDeps(live), { cfg: live, force, device: dev, progress, onUpdate: update });
    check.current = c;
    setRuns(c.runs.map((x) => ({ ...x })));
    setCloudUsed(c.cloudUsed); // the rows were just reset; the count must not keep the previous check's calls
    await c.run();
    if (check.current !== c) return;
    setRuns(c.runs.map((x) => ({ ...x })));
    setCloudUsed(c.cloudUsed);
    setDone(true);
  }

  async function confirm(id: string) {
    const c = check.current; // the check this tap belongs to, captured across the await
    if (!c) return;
    await c.confirm(id);
    if (check.current !== c) return;
    setRuns(c.runs.map((x) => ({ ...x })));
    setCloudUsed(c.cloudUsed);
  }
  async function confirmAll() {
    const ids = runs.filter((r) => r.state === "LIKELY_UNSUPPORTED").map((r) => r.pair.id);
    for (let i = 0; i < ids.length; i += cfg.cloudConcurrency) await Promise.all(ids.slice(i, i + cfg.cloudConcurrency).map(confirm));
  }

  async function copy() {
    const { text: out, flags } = copyWithFlags(parsed, (id) => byId.get(id)?.state, withUnconfirmed);
    await navigator.clipboard.writeText(out).catch(() => undefined);
    (window as unknown as { __footingCopy: string }).__footingCopy = out;
    setToast(`Copied the answer with ${flags} flag${flags === 1 ? "" : "s"}${withUnconfirmed ? " (unconfirmed on-device flags included)" : " (cloud-decided only)"}`);
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const openRun = open ? byId.get(open) : undefined;
  const checked = runs.filter((r) => !["queued", "fetching", "triage", "escalated", "deciding"].includes(r.state)).length;
  // After a check, one click to the first citation whose source does not (fully) say the sentence (otherwise the judge has to hunt for it).
  const firstFlag = runs.find((r) => r.state === "NOT_SUPPORTED" || r.state === "PARTIAL")
    ?? runs.find((r) => r.state === "LIKELY_UNSUPPORTED");
  const style = cfg.deviceNegativeStyle;
  const nanoFirst = useMemo(
    () => runs.filter((r) => r.planned?.to === "DEVICE_TRIAGE").length,
    [runs],
  );
  // A run gets its Nano-laptop plan only after its page is fetched: until every run has one, the count would read low ("0 of 9").
  const allPlanned = runs.length > 0 && runs.every((r) => r.planned);
  // The meter stands in for Nano when Nano is not running here; while an on-device check is under way it would only flash.
  const nanoWillRun = device === "available" && force !== "cloud";

  return (
    <main className="pad">
      <header className="strip">
        <div>
          <h1>Footing</h1>
          <p className="tag">Does each source say what the sentence claims? Nano triages on your laptop, the cloud decides the hard calls, code checks every quote.</p>
        </div>
        <div className="controls">
          <div className="seg" role="group" aria-label="Route">
            {(["auto", "device", "cloud"] as Force[]).map((f) => (
              <button key={f} aria-pressed={force === f} onClick={() => setForce(f)} disabled={running}>{f === "auto" ? "Auto" : f === "device" ? "On-device only" : "Cloud only"}</button>
            ))}
          </div>
          <DevicePill device={device} progress={progress} onDownload={async () => {
            const { initDevice } = await import("@/lib/check/browserDeps");
            setDevice("downloading");
            initDevice(cfg, (p) => setProgress(p)).then(() => setDevice("available")).catch(() => setDevice("unavailable"));
          }} />
        </div>
        <div className="prov">
          <span><b>{mine ? "Your pasted answer" : hero.provenance}</b></span>
          <span>{parsed.pairs.length} citations · {parsed.sentences.length} sentences{parsed.unresolved.length ? ` · ${parsed.unresolved.length} unresolved marker(s)` : ""}</span>
          {!mine && <span title={hero.how}>how captured: unedited, see <a href="/eval#sample">/eval</a></span>}
          <span><a href="/about">what it checks</a> · <a href="/about#fx-hero">recorded Nano run</a> · <a href="/eval">measured results</a></span>
          <button className="ghost" style={{ padding: "2px 8px" }} onClick={() => setShowPaste((v) => !v)} aria-expanded={showPaste}>{showPaste ? "Hide paste box" : "Paste your own answer"}</button>
        </div>
      </header>

      {banner && <div className="banner" role="alert">{banner}</div>}

      <div className="work">
        <section className="sheet" aria-label="Answer sheet">
          {showPaste && (
            <div className="paste">
              <label htmlFor="paste" className="data">Paste an AI answer with Markdown links, [n] references + a source list, or bare URLs</label>
              <textarea id="paste" maxLength={MAX_ANSWER_CHARS} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={"The Moon takes 27.3 days to orbit Earth [1].\n\nSources:\n[1] https://en.wikipedia.org/wiki/Moon"} />
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                <span className="data">{draftCount} citation{draftCount === 1 ? "" : "s"} found</span>
                <button className="ghost" disabled={!draftCount || running} onClick={() => { check.current = null; generation.current++; setText(draft); setMine(true); setRuns([]); setDone(false); setShowPaste(false); }}>Use this answer</button>
                <button className="ghost" onClick={() => setDraft(answerToText(hero.answer, hero.sources))}>Fill the sample</button>
                {mine && <button className="ghost" disabled={running} onClick={() => { check.current = null; generation.current++; setText(answerToText(hero.answer, hero.sources)); setMine(false); setRuns([]); setDone(false); }}>Back to the sample answer</button>}
              </div>
            </div>
          )}
          {!mine && <p className="q">Question asked: <b>{hero.question}</b> · captured {hero.capturedAt}</p>}
          <ol className="rows">
            {parsed.sentences.map((s) => {
              const pairs = parsed.pairs.filter((p) => p.s === s.index);
              return (
                <li key={s.index} className={`row${openRun?.pair.s === s.index ? " active" : ""}`}>
                  <div className="no data">{s.index + 1}</div>
                  <div className="txt">
                    {s.text}
                    {pairs.map((p) => {
                      const r = byId.get(p.id);
                      return (
                        <button key={p.id} className="cite" onClick={() => r && setOpen(p.id)} aria-label={`Source ${p.n ?? ""} for sentence ${s.index + 1}`} tabIndex={-1}>
                          <span className="n">[{p.n ?? "↗"}]</span>{r && <Mark state={r.state} held={r.nanoQuoteHeld} neutral={style === "neutral"} />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="side">
                    {pairs.map((p) => {
                      const r = byId.get(p.id);
                      if (!r) return <span key={p.id} className="data" style={{ color: "var(--muted)" }}>[{p.n ?? "↗"}] {hostOf(p.url)}</span>;
                      const ct = chipText(r, style);
                      // Only an in-flight note is shown on the chip ("cloud busy (rate limit) · retrying in 15 s"); settled reasons live in the pane.
                      const wait = r.state === "deciding" || r.state === "escalated" ? ct.sub : undefined;
                      return (
                        <button key={p.id} className={`chip s-${r.state}${style === "neutral" && r.state === "LIKELY_UNSUPPORTED" ? " neutral" : ""}`} aria-pressed={open === p.id} onClick={() => setOpen(p.id)}
                          aria-label={`Sentence ${s.index + 1}: ${verdictWords(r.state, style) ?? ct.title}${(r.state === "NOT_CHECKED" || r.state === "CAP_REACHED") && r.reason ? ` — ${r.reason}` : ""}${wait ? ` — ${wait}` : ""}, ${where(r)}`}>
                          <Mark state={r.state} held={r.nanoQuoteHeld} neutral={style === "neutral"} />
                          <span className="what">{ct.title}<small>{wait ? `${wait} · ` : ""}[{p.n ?? "↗"}] {hostOf(r.source?.finalUrl ?? p.url)}</small></span>
                          <Badges sources={r.sources} />
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="actions">
            <button className="primary" onClick={runCheck} disabled={running || !parsed.pairs.length}>
              {running ? `Checking ${checked} of ${parsed.pairs.length}…` : done ? "Check again" : "Check sources"}
            </button>
            {done && (
              <>
                <button className="ghost" onClick={copy}>Copy answer with flags</button>
                <label className="data" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={withUnconfirmed} onChange={(e) => setWithUnconfirmed(e.target.checked)} /> Include unconfirmed on-device flags
                </label>
              </>
            )}
          </div>
          <div className="foot">
            <div className="total" aria-live="polite">
              <span className="big">{runs.length ? `${t.k} of ${t.n}` : "— of —"}</span>
              <span style={{ fontSize: 18 }}>checked citations: the source doesn&apos;t say it (or says only part)</span>
              {done && firstFlag && (
                <button className="ghost" style={{ padding: "2px 8px" }} onClick={() => setOpen(firstFlag.pair.id)}>
                  Open the first flagged citation (sentence {firstFlag.pair.s + 1}) →
                </button>
              )}
              {runs.length > 0 && t.notChecked + t.unverified > 0 && (
                <span className="unread">· {t.notChecked + t.unverified} of {t.total} could not be checked (see the typed line)</span>
              )}
              {t.j > 0 && (
                <span className={`likely${style === "neutral" ? " neutral" : ""}`}>+ {t.j} {style === "likely" ? "likely" : "not found on device"} (unconfirmed){" "}
                  <button className="ghost" style={{ padding: "2px 8px" }} onClick={confirmAll} disabled={running}>Confirm all in cloud</button>
                </span>
              )}
            </div>
            <div className="typed data">
              {t.settledOnDevice} settled on this laptop · {t.decidedInCloud} decided in the cloud · {t.unverified} quote not found · {t.pending} pending · {t.notChecked} not checked
              {runs.length ? ` · ${cloudUsed} cloud call${cloudUsed === 1 ? "" : "s"} (cap ${cfg.citationCloudCap})` : ""}
            </div>
            {runs.length > 0 && !runs.some((r) => r.sources.includes("on_device")) && (!nanoWillRun || done) && (
              <div className="meter">
                On a Nano laptop, <b>{allPlanned ? nanoFirst : "…"} of {nanoLaptop}</b> citations would be read on-device first (readable pages; PDFs and pages that need JavaScript go to the cloud).
                {meter.show && meter.settledPct !== undefined ? ` On our held-out set Nano settled ${meter.settledPct}% of those without the cloud, and ${meter.right} of ${meter.settled} of those on-device flags matched the label (M1 Max).` : ""}{" "}
                <a href="/about#fx-hero">Watch a recorded Nano run of the sample answer →</a>{" "}
                <a href="/eval">Measured results →</a>
              </div>
            )}
          </div>
          <Legend style={style} />
        </section>
      </div>
      {openRun && <Pane r={openRun} cfg={cfg} onClose={() => setOpen(null)} onConfirm={confirm} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function hostOf(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

function DevicePill({ device, progress, onDownload }: { device: Device | "checking" | "slow"; progress?: number; onDownload: () => void }) {
  if (device === "checking") return <span className="pill">Checking for an on-device model…</span>;
  if (device === "slow") return <span className="pill">Still checking for an on-device model — checks run in the cloud for now</span>;
  if (device === "available") return <span className="pill"><span className="badge d">ON DEVICE</span> On-device model ready</span>;
  if (device === "downloading")
    return <span className="pill">Downloading {progress !== undefined ? `${Math.round(progress * 100)}%` : "…"} <span className="bar"><i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></span> checks run in the cloud meanwhile</span>;
  if (device === "downloadable") return <span className="pill">On-device model not downloaded <button onClick={onDownload}>Download on-device model</button></span>;
  return (
    <span className="pill">No on-device model in this browser — checks run in the cloud{" "}
      <a href="https://developer.chrome.com/docs/ai/get-started" target="_blank" rel="noreferrer">why?</a>
    </span>
  );
}

function Legend({ style }: { style: "likely" | "neutral" }) {
  return (
    <div className="legend" aria-label="Tick-mark legend">
      <h2>Tick-mark legend</h2>
      <span><Mark state="SUPPORTS" /> says it</span>
      <span><Mark state="PARTIAL" /> says part</span>
      <span><Mark state="NOT_SUPPORTED" /> doesn&apos;t say this</span>
      <span><Mark state="LIKELY_UNSUPPORTED" neutral={style === "neutral"} /> {style === "likely" ? "likely (on device, unconfirmed)" : "not found on device (unconfirmed)"}</span>
      <span><Mark state="UNVERIFIED" /> quote not found / not found in a truncated read</span>
      <span><Mark state="escalated" held /> pending (Nano candidate, cloud deciding)</span>
      <span><Mark state="NOT_CHECKED" /> not checked</span>
      <span><span className="badge d">ON DEVICE</span> / <span className="badge c">IN CLOUD</span> = where the model actually ran (inferenceSource)</span>
    </div>
  );
}

