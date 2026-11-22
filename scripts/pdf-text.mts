// Dev tool: print the gate text Footing extracts from a PDF URL (same fetch + unpdf path as the app).
// Usage: npx tsx scripts/pdf-text.mts <url> [chars]
import { fetchSource } from "../src/lib/net/fetchSource.ts";
import { pdfText } from "../src/lib/extract.ts";
const [url, n = "1500"] = process.argv.slice(2);
const r = await fetchSource(url);
if (!r.ok || r.kind !== "pdf") { console.log(r.error ?? r.kind); process.exit(1); }
const t = await pdfText(new Uint8Array(Buffer.from(r.base64!, "base64")));
console.log(t.length, "chars\n" + t.slice(0, Number(n)));
