import { describe, expect, it } from "vitest";
import { safeLookup, fetchSource } from "@/lib/net/fetchSource";

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
