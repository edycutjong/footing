// Dev tool: show where a phrase sits in the extracted text Footing would give the models.
// Usage: npx tsx scripts/find-in-source.mts <url> "<phrase>"
import { fetchSource } from "../src/lib/net/fetchSource.ts";
import { extractText } from "../src/lib/extract.ts";
import { parseHTML } from "linkedom";
const [url, phrase] = process.argv.slice(2);
const r = await fetchSource(url);
const { text } = extractText(r.body ?? "", r.contentType, r.finalUrl, (h) => parseHTML(h).document as unknown as Document);
const i = text.indexOf(phrase);
console.log(text.length, "chars; at", i);
if (i >= 0) console.log(JSON.stringify(text.slice(i, i + 260)));
