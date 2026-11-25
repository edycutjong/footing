import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import http from "node:http";
import dns from "node:dns";
import zlib from "node:zlib";
import { safeLookup, fetchSource, readBody } from "@/lib/net/fetchSource";

const lookup = (host: string) =>
  new Promise<{ err: NodeJS.ErrnoException | null; addr: unknown }>((resolve) =>
    safeLookup(host, {}, (err, addr) => resolve({ err, addr })));

describe("fetchSource SSRF guard (no network needed)", () => {
  it("the DNS hook refuses a name that resolves to loopback", async () => {
    const r = await lookup("localhost");
    expect(r.err?.code).toBe("EBLOCKED");
  });
  it("refuses a loopback URL before connecting", async () => {
    const r = await fetchSource("http://127.0.0.1/");
    expect(r).toMatchObject({ ok: false, kind: "failed", error: "private address refused" });
    expect(r.hops).toHaveLength(0);
  });
  it("refuses the cloud metadata address", async () => {
    expect((await fetchSource("http://169.254.169.254/latest/meta-data/")).error).toBe("private address refused");
  });
  it("refuses a non-http scheme", async () => {
    expect((await fetchSource("file:///etc/passwd")).error).toMatch(/scheme file: not allowed/);
  });
});

describe("readBody (decompression never outlives an aborted source)", () => {
  const res = (enc: string) => Object.assign(new PassThrough(), { headers: { "content-encoding": enc } });
  it("rejects when a gzip source is aborted mid-stream instead of hanging", async () => {
    const r = res("gzip");
    const partial = zlib.gzipSync(Buffer.from("<html>" + "a".repeat(5000))).subarray(0, 40);
    const p = readBody(r, 1024 * 1024);
    r.write(partial);
    setTimeout(() => r.destroy(Object.assign(new Error("aborted"), { code: "ECONNRESET" })), 20);
    await expect(p).rejects.toThrow();
  });
  it("decodes a complete gzip body and enforces the decompressed-size cap", async () => {
    const ok = res("gzip");
    const p = readBody(ok, 1024);
    ok.end(zlib.gzipSync(Buffer.from("<html>hello</html>")));
    expect((await p).toString()).toBe("<html>hello</html>");
    const big = res("gzip");
    const q = readBody(big, 1024);
    big.end(zlib.gzipSync(Buffer.alloc(64 * 1024, 97)));
    await expect(q).rejects.toThrow(/larger than/);
  });
});

describe("readCapFor (a2a r03: declared HTML never reads to the PDF cap)", () => {
  it("caps by declared type", async () => {
    const { readCapFor } = await import("@/lib/net/fetchSource");
    const { LIMITS } = await import("@/lib/net/ssrf");
    expect(readCapFor("text/html; charset=utf-8")).toBe(LIMITS.html);
    expect(readCapFor("application/xhtml+xml")).toBe(LIMITS.html);
    expect(readCapFor("application/pdf")).toBe(LIMITS.pdf);
    expect(readCapFor("application/octet-stream")).toBe(LIMITS.pdf); // undeclared: may still sniff as PDF
    expect(LIMITS.html).toBeLessThan(LIMITS.pdf);
  });
});

// DNS answers and HTTP hops are faked here so the guard can be exercised end to end with no network.
type Addr = { address: string; family: number };
function fakeDns(table: Record<string, Addr[]>) {
  return vi.spyOn(dns, "lookup").mockImplementation(((host: string, _o: unknown, cb: (e: NodeJS.ErrnoException | null, a: Addr[]) => void) => {
    const a = table[host];
    if (!a) return cb(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }), []);
    cb(null, a);
  }) as unknown as typeof dns.lookup);
}
const lookupAll = (host: string) =>
  new Promise<{ err: NodeJS.ErrnoException | null; addr: unknown }>((resolve) =>
    safeLookup(host, { all: true }, ((err: NodeJS.ErrnoException | null, addr: unknown) => resolve({ err, addr })) as never));

describe("safeLookup (DNS answer checked before connect)", () => {
  afterEach(() => vi.restoreAllMocks());
  it("refuses a name when ANY of its addresses is private (a mixed answer cannot sneak one through)", async () => {
    fakeDns({ "mixed.example": [{ address: "93.184.215.14", family: 4 }, { address: "10.0.0.7", family: 4 }] });
    expect((await lookupAll("mixed.example")).err?.code).toBe("EBLOCKED");
  });
  it("refuses an AAAA answer that maps to the metadata address", async () => {
    fakeDns({ "v6.example": [{ address: "::ffff:169.254.169.254", family: 6 }] });
    expect((await lookupAll("v6.example")).err?.code).toBe("EBLOCKED");
  });
  it("refuses an empty answer", async () => {
    fakeDns({ "empty.example": [] });
    expect((await lookupAll("empty.example")).err?.code).toBe("EBLOCKED");
  });
  it("hands every checked public address to a happy-eyeballs (all: true) connect", async () => {
    const pub = [{ address: "93.184.215.14", family: 4 }, { address: "2606:2800:21f:cb07:6820:80da:af6b:8b2c", family: 6 }];
    fakeDns({ "pub.example": pub });
    expect(await lookupAll("pub.example")).toEqual({ err: null, addr: pub });
  });
  it("fetchSource refuses a name that resolves to a private address, through the real socket path", async () => {
    fakeDns({ "intranet.example": [{ address: "192.168.1.10", family: 4 }] });
    const r = await fetchSource("http://intranet.example/admin");
    expect(r).toMatchObject({ ok: false, error: "private address refused" });
  });
});

describe("fetchSource redirects (every hop re-validated)", () => {
  afterEach(() => vi.restoreAllMocks());
  /** Fake http.request: each call answers with the next scripted hop; records the options it was given. */
  function fakeHops(hops: { status: number; location?: string }[]) {
    const seen: { url: string; lookup: unknown }[] = [];
    vi.spyOn(http, "request").mockImplementation(((url: URL, opts: { lookup: unknown }) => {
      seen.push({ url: url.href, lookup: opts.lookup });
      const hop = hops[seen.length - 1];
      const req = Object.assign(new EventEmitter(), {
        end: () => queueMicrotask(() => req.emit("response", Object.assign(new PassThrough(), {
          statusCode: hop.status, headers: hop.location ? { location: hop.location } : {}, socket: { remoteAddress: "93.184.215.14" },
        }))),
      });
      return req;
    }) as unknown as typeof http.request);
    return seen;
  }
  it("refuses a redirect to the metadata address without connecting to it", async () => {
    const seen = fakeHops([{ status: 302, location: "http://169.254.169.254/latest/meta-data/" }]);
    const r = await fetchSource("http://public.example/a");
    expect(r).toMatchObject({ ok: false, error: "private address refused" });
    expect(seen.map((s) => s.url)).toEqual(["http://public.example/a"]); // the second hop never left the box
    expect(r.hops).toHaveLength(1);
  });
  it("refuses a redirect to a non-http scheme and to a localhost name", async () => {
    fakeHops([{ status: 301, location: "file:///etc/passwd" }]);
    expect((await fetchSource("http://public.example/a")).error).toMatch(/scheme file: not allowed/);
    vi.restoreAllMocks();
    fakeHops([{ status: 307, location: "http://localhost./" }]);
    expect((await fetchSource("http://public.example/a")).error).toBe("private host refused");
  });
  it("passes the DNS guard to every hop and stops after the redirect cap", async () => {
    const seen = fakeHops([0, 1, 2, 3, 4].map((i) => ({ status: 302, location: `http://public.example/${i + 1}` })));
    const r = await fetchSource("http://public.example/0");
    expect(r.error).toMatch(/more than 3 redirects/);
    expect(seen).toHaveLength(4);
    expect(seen.every((s) => s.lookup === safeLookup)).toBe(true);
  });
});
