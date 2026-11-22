// Dev tool: fetch sources through the same SSRF-guarded fetch the proxy uses, and report what extraction yields.
// Usage: npx tsx scripts/probe-source.mts <url...>
import { fetchSource } from "../src/lib/net/fetchSource.ts";
import { extractText } from "../src/lib/extract.ts";
import { parseHTML } from "linkedom";
const parse = (h: string) => parseHTML(h).document as unknown as Document;
for (const u of process.argv.slice(2)) {
  const t0 = Date.now();
  const r = await fetchSource(u);
  let chars = 0;
  if (r.ok && r.kind === "html") chars = extractText(r.body!, r.contentType, r.finalUrl, parse).text.length;
  console.log(JSON.stringify({ u, ok: r.ok, status: r.status, kind: r.kind, bytes: r.bytes, hops: r.hops.length, final: r.finalUrl, chars, err: r.error, ms: Date.now() - t0 }));
}
