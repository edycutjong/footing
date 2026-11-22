// Launch the installed Chrome natively and attach Puppeteer over CDP.
// Why not puppeteer.launch(): its default flags (--disable-component-update,
// --disable-features=OptimizationHints) block delivery of the on-device model.
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function openChrome({ userDataDir, port = 9223, headless = false }) {
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...(headless ? ["--headless=new"] : []),
    "about:blank",
  ];
  const proc = spawn(CHROME, args, { stdio: "ignore", detached: false });
  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null });
    } catch { /* not up yet */ }
  }
  if (!browser) throw new Error("Chrome did not expose CDP");
  return {
    browser,
    async close() {
      await browser.close().catch(() => undefined);
      proc.kill();
    },
  };
}
