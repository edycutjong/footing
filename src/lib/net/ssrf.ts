// SSRF guard (pure): which URLs and resolved addresses the fetch proxy may connect to, and what it fetched.
import ipaddr from "ipaddr.js";

/** Only the IANA "unicast" (global) range is public; everything else — private, loopback, link-local (incl. the
 *  169.254.169.254 metadata address), CGNAT, ULA, multicast, reserved, documentation, 6to4/Teredo wrappers — is refused. */
export function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) addr = (addr as ipaddr.IPv6).toIPv4Address();
  return addr.range() === "unicast";
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Scheme, credentials, port and literal-IP checks; hostnames are checked again after DNS resolution, per hop. */
export function checkUrl(raw: string, base?: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: `scheme ${url.protocol} not allowed` };
  if (url.username || url.password) return { ok: false, reason: "credentials in URL not allowed" };
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) return { ok: false, reason: `port ${url.port} not allowed` };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, reason: "no host" };
  if (ipaddr.isValid(host) && !isPublicAddress(host)) return { ok: false, reason: "private address refused" };
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) return { ok: false, reason: "private host refused" };
  url.hash = "";
  return { ok: true, url };
}

export type SourceKind = "html" | "pdf" | "unsupported";

/** Content sniff: magic bytes first, then the declared type. */
export function sniffKind(contentType: string, head: Uint8Array): SourceKind {
  const start = new TextDecoder("latin1").decode(head.slice(0, 1024)).trimStart();
  if (start.startsWith("%PDF-")) return "pdf";
  const ct = contentType.toLowerCase();
  if (ct.includes("application/pdf")) return "pdf";
  if (ct.includes("html") || ct.includes("xml") || ct.startsWith("text/plain")) return "html";
  if (/^<(!doctype html|html|head|body)/i.test(start)) return "html";
  return "unsupported";
}

export const LIMITS = { html: 2 * 1024 * 1024, pdf: 8 * 1024 * 1024, redirects: 3, timeoutMs: 8000 } as const;

/** Simple per-key token bucket (in-memory, per server instance). */
export class TokenBucket {
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private capacity: number, private refillPerSec: number) {}
  take(key: string, now = Date.now()): boolean {
    const b = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.refillPerSec);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    this.buckets.set(key, b);
    if (this.buckets.size > 5000) this.buckets.clear();
    return ok;
  }
}
