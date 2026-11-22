import { describe, expect, it } from "vitest";
import { isPublicAddress, checkUrl, sniffKind, TokenBucket } from "@/lib/net/ssrf";

const enc = (s: string) => new TextEncoder().encode(s);

describe("isPublicAddress()", () => {
  it.each(["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "224.0.0.1", "255.255.255.255", "not-an-ip"])(
    "refuses %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
  it.each(["93.184.215.14", "208.80.154.224", "2620:0:862:ed1a::1", "::ffff:8.8.8.8"])("allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
});

describe("checkUrl()", () => {
  it("allows http and https", () => {
    expect(checkUrl("https://en.wikipedia.org/wiki/Moon").ok).toBe(true);
    expect(checkUrl("http://example.org/").ok).toBe(true);
  });
  it.each(["file:///etc/passwd", "ftp://example.org/x", "gopher://x", "javascript:alert(1)", "data:text/html,hi"])("refuses scheme %s", (u) => expect(checkUrl(u).ok).toBe(false));
  it("refuses private IP literals", () => {
    expect(checkUrl("http://127.0.0.1/").ok).toBe(false);
    expect(checkUrl("http://[::1]/").ok).toBe(false);
    expect(checkUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
  });
  it("refuses decimal / hex encoded loopback (URL parser normalises them)", () => {
    expect(checkUrl("http://2130706433/").ok).toBe(false);
    expect(checkUrl("http://0x7f.0.0.1/").ok).toBe(false);
  });
  it("refuses localhost names and metadata hosts", () => {
    expect(checkUrl("http://localhost:8080/").ok).toBe(false);
    expect(checkUrl("http://metadata.google.internal/").ok).toBe(false);
  });
  it("refuses credentials and odd ports", () => {
    expect(checkUrl("https://user:pw@example.org/").ok).toBe(false);
    expect(checkUrl("https://example.org:22/").ok).toBe(false);
  });
  it("resolves a relative redirect against the previous hop and re-checks it", () => {
    const r = checkUrl("/next", "https://example.org/a");
    expect(r.ok && r.url.href).toBe("https://example.org/next");
    expect(checkUrl("http://10.0.0.1/", "https://example.org/a").ok).toBe(false);
  });
  it("drops the fragment", () => {
    const r = checkUrl("https://example.org/a#frag");
    expect(r.ok && r.url.href).toBe("https://example.org/a");
  });
});

describe("sniffKind()", () => {
  it("trusts PDF magic bytes over a wrong content type", () => expect(sniffKind("text/html", enc("%PDF-1.7\n..."))).toBe("pdf"));
  it("reads HTML by content type", () => expect(sniffKind("text/html; charset=utf-8", enc("<p>x"))).toBe("html"));
  it("reads HTML by markup when the type is missing", () => expect(sniffKind("", enc("<!DOCTYPE html><html>"))).toBe("html"));
  it("accepts text/plain as readable", () => expect(sniffKind("text/plain", enc("hello"))).toBe("html"));
  it("refuses images", () => expect(sniffKind("image/png", enc("\x89PNG"))).toBe("unsupported"));
});

describe("TokenBucket", () => {
  it("allows a burst then refills", () => {
    const b = new TokenBucket(2, 1);
    expect([b.take("a", 0), b.take("a", 0), b.take("a", 0)]).toEqual([true, true, false]);
    expect(b.take("a", 1000)).toBe(true);
    expect(b.take("b", 0)).toBe(true);
  });
});
