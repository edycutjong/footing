// Firebase client: one app, App Check first, then AI Logic.
// All AI inference in Footing goes through Firebase AI Logic (firebase/ai).
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken,
  type AppCheck,
} from "firebase/app-check";
import { getAI, GoogleAIBackend, type AI } from "firebase/ai";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

declare global {
  // Set only by the local E2E harness (never in a production build): the registered
  // App Check debug token, injected before the page loads.
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

let app: FirebaseApp | undefined;
let appCheck: AppCheck | undefined;
let ai: AI | undefined;

export function firebase(): { app: FirebaseApp; appCheck: AppCheck; ai: AI } {
  if (typeof window === "undefined") throw new Error("firebase() is browser-only");
  if (!app) {
    app = getApps()[0] ?? initializeApp(config);
    if (process.env.NODE_ENV === "production") {
      // The debug provider is never honoured in a production build.
      delete self.FIREBASE_APPCHECK_DEBUG_TOKEN;
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? ""),
      isTokenAutoRefreshEnabled: true,
    });
    ai = getAI(app, { backend: new GoogleAIBackend() });
  }
  return { app, appCheck: appCheck!, ai: ai! };
}

/** Returns whether an App Check token could be minted (never returns the token). */
export async function appCheckStatus(): Promise<{ ok: boolean; error?: string }> {
  try {
    const t = await getToken(firebase().appCheck, false);
    return { ok: typeof t.token === "string" && t.token.length > 0 };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
