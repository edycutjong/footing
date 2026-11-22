// Loads the page in a fresh headless Chrome profile and prints what Remote Config delivered (window.__footing.config).
// Usage: BASE_URL=https://footing.edycu.dev node scripts/rc-probe.mjs
import puppeteer from "puppeteer-core";
const base = process.env.BASE_URL ?? "http://localhost:3101";
const browser = await puppeteer.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", userDataDir: `/tmp/footing-rc-probe-${Date.now()}` });
const page = await browser.newPage();
await page.goto(base + "/", { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForFunction(() => window.__footing?.config && window.__footing.config.source !== "loading", { timeout: 20000 });
console.log(JSON.stringify(await page.evaluate(() => window.__footing.config)));
await browser.close();
