// Server-only source fetch for /api/fetch. No inference. Every hop: URL check → DNS resolve → refuse non-public
// addresses → connect to the address that was checked (the lookup hook hands it to the socket, so no rebinding).
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import type { LookupFunction } from "node:net";
import { checkUrl, isPublicAddress, sniffKind, LIMITS, type SourceKind } from "./ssrf";

export interface FetchResult {
  ok: boolean;
  finalUrl: string;
  status: number;
  kind: SourceKind | "failed";
  contentType: string;
  bytes: number;
  sha256: string;
  fetchedAt: string;
  hops: { url: string; status: number; address?: string }[];
  body?: string;
  base64?: string;
  error?: string;
}

// A browser-compatible UA (many publishers refuse unknown clients) that still names Footing and links its about page.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 FootingCitationCheck/0.1 (+https://footing.edycu.dev/about)";

export const safeLookup: LookupFunction = (hostname, options, cb) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err, "", 4);
    const bad = addrs.find((a) => !isPublicAddress(a.address));
    if (!addrs.length || bad) {
      const e = Object.assign(new Error(`refused: ${hostname} resolves to a non-public address`), { code: "EBLOCKED" });
      return cb(e as NodeJS.ErrnoException, "", 4);
    }
    if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
};

interface Hop { status: number; headers: http.IncomingHttpHeaders; res: http.IncomingMessage; address?: string }

function request(url: URL, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "GET",
      lookup: safeLookup,
      signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.1",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en-US,en;q=0.9",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
        "sec-fetch-site": "none",
        "upgrade-insecure-requests": "1",
      },
    });
    req.on("response", (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, res, address: res.socket?.remoteAddress }));
    req.on("error", reject);
    req.end();
  });
}

function decoded(res: http.IncomingMessage): NodeJS.ReadableStream {
  const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return res.pipe(zlib.createGunzip());
  if (enc === "deflate") return res.pipe(zlib.createInflate());
  if (enc === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

async function readCapped(stream: NodeJS.ReadableStream, cap: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of stream as AsyncIterable<Buffer>) {
    n += c.length;
    if (n > cap) throw Object.assign(new Error(`source larger than ${Math.round(cap / 1024 / 1024)} MB`), { code: "ETOOBIG" });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

function charsetOf(ct: string, head: Buffer): string {
  const m = ct.match(/charset=["']?([\w-]+)/i) ?? head.toString("latin1", 0, 2048).match(/<meta[^>]+charset=["']?([\w-]+)/i);
  const cs = (m?.[1] ?? "utf-8").toLowerCase();
  try { new TextDecoder(cs); return cs; } catch { return "utf-8"; }
}

export async function fetchSource(raw: string): Promise<FetchResult> {
  const fetchedAt = new Date().toISOString();
  const hops: FetchResult["hops"] = [];
  const fail = (error: string, status = 0, finalUrl = raw): FetchResult =>
    ({ ok: false, finalUrl, status, kind: "failed", contentType: "", bytes: 0, sha256: "", fetchedAt, hops, error });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LIMITS.timeoutMs);
  try {
    let check = checkUrl(raw);
    for (let hop = 0; ; hop++) {
      if (!check.ok) return fail(check.reason);
      const url = check.url;
      const r = await request(url, ctl.signal);
      hops.push({ url: url.href, status: r.status, address: r.address });
      if (r.status >= 300 && r.status < 400 && r.headers.location) {
        r.res.resume();
        if (hop >= LIMITS.redirects) return fail(`more than ${LIMITS.redirects} redirects`, r.status, url.href);
        check = checkUrl(String(r.headers.location), url.href);
        continue;
      }
      if (r.status >= 400) {
        r.res.resume();
        const why = r.status === 401 || r.status === 403 ? `site refused our fetch (${r.status}) — open it yourself` : `source returned ${r.status}`;
        return fail(why, r.status, url.href);
      }
      const ct = String(r.headers["content-type"] ?? "");
      const declaredPdf = ct.toLowerCase().includes("pdf");
      const buf = await readCapped(decoded(r.res), declaredPdf ? LIMITS.pdf : Math.max(LIMITS.html, LIMITS.pdf));
      const kind = sniffKind(ct, buf.subarray(0, 1024));
      if (kind === "unsupported") return fail(`unsupported content type ${ct.split(";")[0] || "unknown"}`, r.status, url.href);
      if (kind === "html" && buf.length > LIMITS.html) return fail("source larger than 2 MB", r.status, url.href);
      const sha256 = createHash("sha256").update(buf).digest("hex");
      const base = { ok: true, finalUrl: url.href, status: r.status, kind, contentType: ct, bytes: buf.length, sha256, fetchedAt, hops };
      if (kind === "pdf") return { ...base, base64: buf.toString("base64") };
      return { ...base, body: new TextDecoder(charsetOf(ct, buf)).decode(buf) };
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (ctl.signal.aborted || err.name === "AbortError") return fail("source too slow (8 s)");
    if (err.code === "EBLOCKED") return fail("private address refused");
    if (err.code === "ETOOBIG") return fail(err.message);
    if (err.code === "ENOTFOUND") return fail("host not found");
    return fail(`fetch failed: ${err.code ?? err.message}`);
  } finally {
    clearTimeout(timer);
    ctl.abort(); // closes any socket left open by an early return (too large, refused type, redirect cap)
  }
}
