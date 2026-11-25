import type { Page } from "@playwright/test";

// Tests tagged @appcheck need a real App Check token. reCAPTCHA Enterprise refuses automated Chromium on GitHub-hosted
// runners (403 on the token exchange), and the production build never honours a debug token (src/lib/firebase.ts),
// so in CI these run in a separate, non-blocking job. Locally, against a development build, a registered debug token
// can be supplied through FIREBASE_APPCHECK_DEBUG_TOKEN; it is injected into the page and never written to disk.
export async function useDebugTokenIfSet(page: Page): Promise<void> {
  const token = process.env.FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (token) await page.addInitScript((t) => { (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
}
