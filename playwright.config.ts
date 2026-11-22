import { defineConfig, devices } from "@playwright/test";

// E2E runs against a deployed URL by default (the real product, real Firebase AI Logic, real App Check).
// BASE_URL=http://localhost:3101 points it at a local `npm run dev`/`npm start` instead.
// PW_CHANNEL=chrome uses the installed Google Chrome (local runs); CI uses Playwright's bundled Chromium.
const channel = process.env.PW_CHANNEL || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // the live flow spends real (free-tier) AI Logic quota; keep it to one check at a time
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "https://footing.edycu.dev",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel } }],
});
