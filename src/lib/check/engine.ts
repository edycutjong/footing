// The check loop for one answer. Pure orchestration over injected I/O (fetch, models, PDF text), so the same code
// runs in the browser and in unit tests with fakes. Code decides every route and the final verdict; models only
// propose verdicts and quotes.
//
// Determinism: cloud slots are granted in document order. Each pair takes a "turn" in order, decides (after its device
// triage, if any) whether it needs the cloud, reserves the slot (cloudUsed++ BEFORE dispatch) and passes the turn on;
// cloud calls then run at cloud_concurrency.
import type { FootingConfig } from "../config";
import type { Pair } from "../parse";
import { route, afterTriage, effectiveKind, type Device, type Force, type Kind, type Route, type After, type TriageResult } from "../route/router";
import { gate, judgeOutcome, uncovered } from "../gate/quote";
import { pickInputs } from "../extract";
import type { ChipState } from "../tally";

export interface SourceDoc {
  ok: boolean;
  kind: Kind;
  status: number;
  finalUrl: string;
  sha256?: string;
  fetchedAt?: string;
  bytes?: number;
  error?: string;
  /** extracted text (HTML) or unpdf text (PDF) */
  text: string;
  /** PDF bytes as base64 (inline input for the cloud) */
  pdfBase64?: string;
  fetchMs: number;
}

export interface ModelReply<V> {
  verdict?: V;
  quote?: string;
  reason?: string;
  inferenceSource?: string;
  raw?: string;
  ms: number;
  error?: string;
  /** "timeout" | "malformed" | "sdk" | "quota" | "server" */
  errorKind?: string;
}
export type J3 = "SUPPORTS" | "PARTIAL" | "NOT_SUPPORTED";

export interface Deps {
  getSource(url: string): Promise<SourceDoc>;
  triage(sentence: string, passages: string[], mode: "PREFER_ON_DEVICE" | "ONLY_ON_DEVICE", src: SourceDoc): Promise<ModelReply<"SUPPORTS" | "NOT_SUPPORTED">>;
  judge(sentence: string, passages: string[], window: string, truncated: boolean): Promise<ModelReply<J3>>;
  judgePdf(sentence: string, pdfBase64: string): Promise<ModelReply<J3>>;
  judgeUrl(sentence: string, url: string): Promise<ModelReply<J3>>;
  sleep?(ms: number): Promise<void>;
}

export interface TrailStep {
  step: "fetch" | "route" | "triage" | "after" | "judge" | "judge-pdf" | "judge-url";
  route?: string;
  inferenceSource?: string;
  verdict?: string;
  quote?: string;
  reason?: string;
  gateHeld?: boolean;
  ms?: number;
  error?: string;
  attempt?: number;
}

export interface PairRun {
  pair: Pair;
  state: ChipState;
  /** what ran (route + afterTriage) */
  route?: Route;
  after?: After;
  /** the route a Nano laptop would take (meter + "planned:" line) */
  planned?: Route;
  trail: TrailStep[];
  verdict?: ChipState;
  quote?: string;
  reason?: string;
  note?: string;
  uncovered?: string[];
  /** the exact text the deciding model read (gate input) */
  modelInput?: string;
  passages?: string[];
  source?: Pick<SourceDoc, "finalUrl" | "sha256" | "fetchedAt" | "kind" | "bytes" | "status">;
  /** the response's inferenceSource for every model call, in order (the badge) */
  sources: string[];
  /** the Nano quote held, for the pending-mark wording */
  nanoQuoteHeld?: boolean;
  cloudCalls: number;
}

export interface CheckOptions {
  cfg: FootingConfig;
  force: Force;
  device: Device;
  progress?: number;
  onUpdate?: (run: PairRun, all: PairRun[]) => void;
}

export interface CheckState {
  runs: PairRun[];
  cloudUsed: number;
}

const isTransient = (r: ModelReply<unknown>) => r.errorKind === "quota" || r.errorKind === "server";

export class Check {
  readonly runs: PairRun[];
  cloudUsed = 0;
  private sourceCache = new Map<string, Promise<SourceDoc>>();
  private cloudActive = 0;
  private cloudWaiters: (() => void)[] = [];
  private sleep: (ms: number) => Promise<void>;

  constructor(pairs: Pair[], private deps: Deps, private opts: CheckOptions) {
    this.runs = pairs.map((pair) => ({ pair, state: "queued", trail: [], sources: [], cloudCalls: 0 }));
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private emit(run: PairRun) {
    this.opts.onUpdate?.(run, this.runs);
  }

  private source(url: string): Promise<SourceDoc> {
    let p = this.sourceCache.get(url);
    if (!p) {
      p = this.deps.getSource(url);
      this.sourceCache.set(url, p);
    }
    return p;
  }

  /** Reserve a cloud slot before dispatch. Automatic calls respect the cap; user taps are exempt but still count.
   *  A call the cloud refused (429 / 5xx) gives its slot back before its retry (see cloudDecide). */
  private reserve(userInitiated: boolean): boolean {
    if (!userInitiated && this.cloudUsed >= this.opts.cfg.citationCloudCap) return false;
    this.cloudUsed++;
    return true;
  }

  private async withCloud<T>(fn: () => Promise<T>): Promise<T> {
    while (this.cloudActive >= this.opts.cfg.cloudConcurrency) await new Promise<void>((r) => this.cloudWaiters.push(r));
    this.cloudActive++;
    try {
      return await fn();
    } finally {
      this.cloudActive--;
      this.cloudWaiters.shift()?.();
    }
  }

  async run(): Promise<CheckState> {
    // Prefetch every distinct source in parallel (the proxy is not inference; 4 at a time).
    const urls = [...new Set(this.runs.map((r) => r.pair.url))];
    const pool = urls.slice();
    await Promise.all(
      Array.from({ length: Math.min(4, pool.length) }, async () => {
        for (let u = pool.shift(); u; u = pool.shift()) await this.source(u);
      }),
    ).catch(() => undefined);

    const cloudJobs: Promise<void>[] = [];
    for (const run of this.runs) {
      const job = await this.decide(run, false);
      if (job) cloudJobs.push(job());
    }
    await Promise.all(cloudJobs);
    return { runs: this.runs, cloudUsed: this.cloudUsed };
  }

  /** Holding the turn: fetch result → route → (device triage → afterTriage) → reserve a cloud slot if needed.
   *  Returns the cloud job to run after the turn passes on, or null. */
  private async decide(run: PairRun, userInitiated: boolean): Promise<(() => Promise<void>) | null> {
    const { cfg, force, device, progress } = this.opts;
    run.state = "fetching";
    this.emit(run);
    const src = await this.source(run.pair.url);
    run.source = { finalUrl: src.finalUrl, sha256: src.sha256, fetchedAt: src.fetchedAt, kind: src.kind, bytes: src.bytes, status: src.status };
    run.trail.push({ step: "fetch", ms: src.fetchMs, error: src.error, reason: src.ok ? `${src.kind} · ${src.status}` : src.error });
    const fetchInfo = { ok: src.ok, status: src.status, error: src.error, textChars: src.text.length };
    run.planned = route(src.kind, fetchInfo, "available", cfg, "auto", 0);
    const r = route(src.kind, fetchInfo, device, cfg, force, userInitiated ? 0 : this.cloudUsed, progress);
    run.route = r;
    run.trail.push({ step: "route", route: r.to, reason: r.reason });

    if (r.to === "NOT_CHECKED") return this.finish(run, "NOT_CHECKED", { reason: r.reason });

    const kind = effectiveKind(src.kind, fetchInfo, cfg);
    const inputs = kind === "html" ? pickInputs(run.pair.sentence, src.text, cfg) : null;
    if (inputs) run.passages = inputs.passages;

    if (r.to === "DEVICE_TRIAGE") {
      run.state = "triage";
      this.emit(run);
      const passages = inputs?.passages ?? [];
      // PREFER_ON_DEVICE may fall back to the cloud inside the SDK, so a slot is reserved BEFORE dispatch (no slot →
      // ONLY_ON_DEVICE, which cannot make a cloud call) and released only if the answer really came from the device.
      let mode = r.deviceMode ?? "PREFER_ON_DEVICE";
      let reserved = false;
      if (mode === "PREFER_ON_DEVICE" && force !== "device") {
        reserved = this.reserve(userInitiated);
        if (!reserved) mode = "ONLY_ON_DEVICE";
      }
      const t = await this.deps.triage(run.pair.sentence, passages, mode, src);
      if (t.inferenceSource) run.sources.push(t.inferenceSource);
      else if (t.error) run.sources.push(t.errorKind === "timeout" ? "device_timeout" : "device_error");
      if (reserved && t.inferenceSource === "on_device") this.cloudUsed--;
      else if (reserved) run.cloudCalls++; // SDK fallback (or an error after a possible fallback): counted
      const held = !!t.quote && gate(t.quote, passages);
      run.nanoQuoteHeld = held;
      run.trail.push({ step: "triage", inferenceSource: t.inferenceSource, verdict: t.verdict, quote: t.quote, gateHeld: held, ms: t.ms, error: t.error });
      if (t.error && r.deviceMode === "ONLY_ON_DEVICE" && force === "device") {
        // On-device only: show the SDK's real refusal (e.g. PDF input), never a guess.
        const why = src.kind === "pdf" ? `PDF input is cloud-only — the on-device model refused it ("${t.error}")` : t.error;
        return this.finish(run, "NOT_CHECKED", { reason: `On-device only: ${why}` });
      }
      const tr: TriageResult = { verdict: t.verdict, quote: t.quote, inferenceSource: t.inferenceSource, error: t.errorKind as TriageResult["error"] };
      if (force === "device") {
        // No cloud in this mode: Nano's result is shown as a pending candidate or an unconfirmed negative.
        const a = afterTriage(tr, held, cfg, 0);
        run.after = a;
        if (a.to === "SETTLED_ON_DEVICE") return this.finish(run, "LIKELY_UNSUPPORTED", { reason: a.reason });
        const why = t.verdict === "SUPPORTS" && held ? "Nano found a candidate quote (never final on device)" : "Nano's result needs the cloud";
        return this.finish(run, "CAP_REACHED", { reason: `On-device only: ${why} — tap to decide in the cloud`, quote: t.quote });
      }
      const a = afterTriage(tr, held, cfg, userInitiated ? 0 : this.cloudUsed);
      run.after = a;
      run.trail.push({ step: "after", route: a.to, reason: a.reason });
      if (a.to === "SETTLED_ON_DEVICE") return this.finish(run, "LIKELY_UNSUPPORTED", { reason: a.reason });
      if (a.to === "CAP_REACHED") return this.finish(run, "CAP_REACHED", { reason: a.reason, quote: t.quote });
      if (!this.reserve(userInitiated)) return this.finish(run, "CAP_REACHED", { reason: "Nano's result needs the cloud; check skipped (cap) — tap to confirm" });
      run.state = "escalated";
      this.emit(run);
      return () => this.cloudDecide(run, src, "text", userInitiated);
    }

    if (!this.reserve(userInitiated)) return this.finish(run, "NOT_CHECKED", { reason: "cloud cap for this answer reached — tap to check this one" });
    run.state = "deciding";
    this.emit(run);
    const how = r.to === "CLOUD_URL_CONTEXT" ? "url" : kind === "pdf" ? "pdf" : "text";
    return () => this.cloudDecide(run, src, how, userInitiated);
  }

  private finish(run: PairRun, state: ChipState, o: { reason?: string; quote?: string; note?: string }): null {
    run.state = state;
    run.verdict = state;
    run.reason = o.reason;
    run.quote = o.quote;
    run.note = o.note;
    this.emit(run);
    return null;
  }

  private async cloudDecide(run: PairRun, src: SourceDoc, how: "text" | "pdf" | "url", userInitiated: boolean, attempt = 1): Promise<void> {
    const { cfg } = this.opts;
    const s = run.pair.sentence;
    const inputs = how === "text" ? pickInputs(s, src.text, cfg) : null;
    // An escalated pair keeps its pending mark (`p`, "Nano found a candidate quote · checking in the cloud") until the cloud lands.
    if (run.state !== "escalated") run.state = "deciding";
    this.emit(run);
    const reply = await this.withCloud(() =>
      how === "pdf" ? this.deps.judgePdf(s, src.pdfBase64 ?? "")
        : how === "url" ? this.deps.judgeUrl(s, src.finalUrl)
          : this.deps.judge(s, inputs!.passages, inputs!.window, inputs!.truncated),
    );
    run.cloudCalls++;
    if (reply.inferenceSource) run.sources.push(reply.inferenceSource);
    const step = how === "pdf" ? "judge-pdf" : how === "url" ? "judge-url" : "judge";
    run.trail.push({ step, inferenceSource: reply.inferenceSource, verdict: reply.verdict, quote: reply.quote, reason: reply.reason, ms: reply.ms, error: reply.error, attempt });

    if (!reply.verdict) {
      const retriesLeft = reply.errorKind === "malformed" ? attempt < 2 : isTransient(reply) && attempt < 3;
      // A refused call (429 / 5xx) consumed no answer: hand its slot back before re-reserving, so a retry still runs when
      // every slot was reserved up front (no-Nano run at a full cap). A malformed reply did consume one, so it keeps it.
      if (retriesLeft && isTransient(reply)) this.cloudUsed--;
      if (retriesLeft && this.reserve(userInitiated)) {
        if (isTransient(reply)) {
          run.note = `${reply.errorKind === "quota" ? "cloud busy (rate limit)" : "cloud server error"} · retrying in ${15 * attempt} s`;
          this.emit(run);
          await this.sleep(15000 * attempt);
          run.note = undefined;
        }
        return this.cloudDecide(run, src, how, userInitiated, attempt + 1);
      }
      const why = isTransient(reply) ? "cloud quota, retry" : reply.errorKind === "malformed" ? "cloud answer unreadable" : `cloud error: ${reply.error ?? "unknown"}`;
      this.finish(run, "NOT_CHECKED", { reason: why, note: "retry" });
      return;
    }

    // Gate segments: each passage and the window separately (never their concatenation), or the PDF's own text.
    const segments = how === "text" ? [...inputs!.passages, inputs!.window] : how === "pdf" ? [src.text] : [];
    run.modelInput = segments.join("\n");
    const out = judgeOutcome({ verdict: reply.verdict, quote: reply.quote ?? "" }, segments, {
      truncated: how === "text" ? inputs!.truncated : false,
      readChars: how === "text" ? inputs!.window.length : src.text.length,
      viaUrlContext: how === "url",
    });
    run.trail[run.trail.length - 1].gateHeld = out.gateHeld;
    run.uncovered = out.gateHeld ? uncovered(s, reply.quote ?? "") : undefined;
    // PDF text extraction failed here: say so instead of "quote not found" (the model still read the PDF itself).
    const note = how === "pdf" && !src.text && out.final !== "NOT_SUPPORTED"
      ? "the PDF's text could not be extracted in this browser, so the quote cannot be checked" : out.note;
    this.finish(run, out.final, { reason: reply.reason, quote: reply.quote, note });
  }

  /** User tap: confirm / retry one citation in the cloud (exempt from the cap, still counted). */
  async confirm(pairId: string): Promise<void> {
    const run = this.runs.find((r) => r.pair.id === pairId);
    if (!run || ["queued", "fetching", "triage", "escalated", "deciding"].includes(run.state)) return; // no double taps
    const src = await this.source(run.pair.url);
    const fetchInfo = { ok: src.ok, status: src.status, error: src.error, textChars: src.text.length };
    const kind = effectiveKind(src.kind, fetchInfo, this.opts.cfg);
    if (kind === "failed" || run.state === "deciding") return;
    run.state = "deciding";
    this.emit(run);
    this.reserve(true);
    run.trail.push({ step: "route", route: "USER_CONFIRM", reason: "you asked the cloud to confirm" });
    await this.cloudDecide(run, src, kind === "js-only" ? "url" : kind === "pdf" ? "pdf" : "text", true);
  }
}
