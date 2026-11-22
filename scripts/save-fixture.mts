// Dev tool: snapshot a source exactly as the proxy fetches it (gzip), for the saved-real-source tests.
// Usage: npx tsx scripts/save-fixture.mts <url> <out.gz>
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fetchSource } from "../src/lib/net/fetchSource.ts";
const [url, out] = process.argv.slice(2);
const r = await fetchSource(url);
if (!r.ok) { console.log(r.error); process.exit(1); }
const buf = r.kind === "pdf" ? Buffer.from(r.base64!, "base64") : Buffer.from(r.body!, "utf8");
writeFileSync(out, gzipSync(buf, { level: 9 }));
console.log(JSON.stringify({ url, kind: r.kind, sha256: r.sha256, fetchedAt: r.fetchedAt, bytes: r.bytes, gz: out }));
