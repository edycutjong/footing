import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
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
