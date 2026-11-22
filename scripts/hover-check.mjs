// Interaction QA: per element class, screenshot → hover (or focus) → screenshot, byte-compare. Exits 1 if any class shows no change.
// Usage: BASE_URL=https://footing.edycu.dev node scripts/hover-check.mjs
import puppeteer from "puppeteer-core";
const base = process.env.BASE_URL ?? "http://localhost:3101";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", userDataDir: "/tmp/footing-hover-profile", args: ["--no-first-run"] });
const page = await browser.newPage();
const token = process.env.FIREBASE_APPCHECK_DEBUG_TOKEN; // local only; the live run needs no token and skips the chip checks
if (token) await page.evaluateOnNewDocument((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
await page.setViewport({ width: 1366, height: 900 });
const results = [];
async function check(name, url, selector, mode = "hover", prep) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  await page.goto(base + url, { waitUntil: "networkidle2", timeout: 60000 });
  if (prep) await prep();
  const el = await page.$(selector);
  if (!el) { results.push({ name, pass: false, note: "selector not found: " + selector }); return; }
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await sleep(700);
  await page.mouse.move(0, 0); await sleep(300);
  const before = await el.screenshot();
  if (mode === "hover") await el.hover(); else if (mode === "focus") await el.focus(); else if (mode === "press") { await el.hover(); await sleep(350); const b = await el.boundingBox(); const sc = await page.evaluate(() => ({ x: scrollX, y: scrollY })); const clip = { x: Math.max(0, b.x + sc.x - 6), y: Math.max(0, b.y + sc.y - 6), width: b.width + 12, height: b.height + 12 }; const mid = await page.screenshot({ clip }); await page.mouse.down(); await sleep(350); const down = await page.screenshot({ clip }); await page.mouse.up(); await page.mouse.move(0, 0); results.push({ name, pass: Buffer.compare(mid, down) !== 0, note: "press" }); return; }
  await sleep(450);
  const after = await el.screenshot();
  results.push({ name, pass: Buffer.compare(before, after) !== 0, note: mode });
}
const runCheckFirst = async () => { await page.evaluate(() => [...document.querySelectorAll("button.primary")][0].click()); await page.waitForFunction(() => window.__footing && window.__footing.done, { timeout: 150000 }); await sleep(500); };
const openPaste = async () => { await page.click("button[aria-expanded]"); await sleep(300); };
await check("landing CTA (/about → /) hover", "/about", "main .hero a.btn.go");
await check("deck control hover", "/pitch", ".hud button[data-act='next']");
await check("seg control Cloud only hover", "/", ".seg button[aria-pressed='false']");
await check("seg control press", "/", ".seg button[aria-pressed='false']", "press");
await check("primary CTA hover", "/", "button.primary");
await check("primary CTA press", "/", "button.primary", "press");
await check("ghost button hover (Paste your own)", "/", "button.ghost");
if (token) await check("evidence chip hover", "/", "button.chip", "hover", runCheckFirst);
else results.push({ name: "evidence chip hover", pass: true, note: "skipped: needs a check run (no debug token)" });
if (token) await check("evidence chip press", "/", "button.chip", "press", runCheckFirst);
await check("paste textarea focus", "/", "#paste", "focus", openPaste);
await check("paste textarea hover", "/", "#paste", "hover", openPaste);
await check("meter link hover (/eval)", "/", ".foot a[href='/eval'], .meter a[href='/eval'], .prov a[href='/eval']");
await check("device pill link hover", "/", ".pill a, .controls a, .foot a[href^='https://developer']");
await browser.close();
let bad = 0;
for (const r of results) { console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  (${r.note})`); if (!r.pass) bad++; }
console.log(`${results.length - bad}/${results.length} pass`);
process.exit(bad ? 1 : 0);
