# Developer experience report: Firebase AI Logic hybrid inference on the web

A friction log kept while building Footing (started 2026-11-22). Each entry: what happened, the evidence file, what we did.
Machine for on-device runs: MacBook Pro M1 Max, 32 GB, Chrome 157 with Gemini Nano.

## 1. Puppeteer's default flags stop the on-device model from arriving
`puppeteer.launch()` adds `--disable-component-update` and disables `OptimizationHints`, which is how Chrome delivers the on-device
model, so `LanguageModel.availability()` never leaves `downloadable`. We spawn the installed Chrome ourselves with
`--remote-debugging-port` and attach with `puppeteer.connect()` (`scripts/chrome.mjs`).

## 2. `initializeDeviceModel()`: await it only in `ONLY_ON_DEVICE`
In a profile without the model, awaiting `initializeDeviceModel()` before a `PREFER_ON_DEVICE` call blocks for the whole multi-minute
download. Start it on the click and do not await it; the SDK answers from the cloud meanwhile
(`evidence/spike/fresh-triage.json`: `inferenceSource: "in_cloud"`, `initDoneBeforeAnswer: false`).

## 3. `maxLength` inside `responseConstraint` is honoured, by cutting mid-word
Asking for a whole passage with `quote.maxLength = 20` returned a quote of exactly 20 characters, cut mid-word
(`evidence/spike/nano-maxlength.json`). A cut quote no longer matches the source verbatim, so our quote gate rejects it. Keep the
limit well above any real quote (we use 300).

## 4. `AbortSignal` is not honoured on device
`generateContent(prompt, { signal })` with an abort after 50 ms still returned a full on-device answer
(`evidence/spike/nano-abort.json`: `aborted: false`). Our timeout is a `Promise.race` around the call instead.

## 5. `onDeviceParams` options in firebase 13.4
`createOptions` takes `expectedInputs`, `expectedOutputs`, `initialPrompts`, `monitor`, `signal` (no temperature or topK);
`promptOptions` takes `responseConstraint` only (type definitions in `@firebase/ai`).

## 6. Setting up AI Logic without the console
The console's "Get started" flow does more than enable APIs. With only the APIs enabled, every cloud call returned
`403 USER_PROJECT_DENIED` for `generativelanguage.googleapis.com`. What fixed it, all from the command line:
1. `gcloud services enable firebasevertexai.googleapis.com generativelanguage.googleapis.com`
2. `gcloud beta services identity create --service=firebasevertexai.googleapis.com`
3. `PATCH https://firebasevertexai.googleapis.com/v1beta/projects/<id>/locations/global/config?updateMask=generativeLanguageConfig`
   with body `{"generativeLanguageConfig":{}}` (a `GET` before this returned `404 genai config not found`).

## 7. App Check for AI Logic is enforced on `firebaseml.googleapis.com`
Enforcing `firebasevertexai.googleapis.com` in the App Check services API returns `Service not supported`; the enforceable service is
`firebaseml.googleapis.com`. Enforcement took between 3 and 15 minutes to take effect. After that a call with only the web API key
returns `401 Firebase App Check token is invalid` (`evidence/spike/appcheck-enforced-tokenless.json`).
reCAPTCHA Enterprise key: `gcloud recaptcha keys create --web --integration-type=SCORE --domains=<prod host>`, registered with
`PATCH .../apps/<appId>/recaptchaEnterpriseConfig?updateMask=siteKey,tokenTtl`. A fresh Chrome profile with no debug token then completed
AI Logic calls on the deployed site (`evidence/spike/prod-fresh-nodebug-*.json`).

## 8. Free-tier availability and quota (2026-11-22, Gemini Developer API, no billing)
- `gemini-3.8-flash`: 4 attempts over about 90 minutes all failed with `500 high demand` or `503 deadline expired` after 66–179 s
  (`evidence/spike/nano-cloudJudge.json`, `nano-38flash-cloudJudge.json`). `gemini-4-hydrogen`: one success after 154 s, then 500/503.
  `gemini-3.5-flash-lite`: answered every time in 2–9 s. We run the judge on flash-lite; the model name is a Remote Config key.
- About 70 flash-lite calls that day. In the 20-pair run one pair got two consecutive 429 `You exceeded your current quota` responses and
  succeeded on the third attempt after 15 s + 30 s backoff; another got one 500 and succeeded on retry
  (`evidence/eval-fresh-20/cloud-3class-*.json`, fields `attempts` and `transientErrors`).
- Grounding with Google Search through AI Logic returned 429 within 0.6 s while URL-context calls just before it succeeded
  (`evidence/spike/prod-jsonly-searchGrounding.json`): on this free tier, Search grounding was not usable for us.

## 9. URL context: works with `responseSchema`, renders JavaScript, can fail per URL
- `tools: [{ urlContext: {} }]` together with `responseMimeType: application/json` + `responseSchema` was accepted and returned schema
  JSON (`evidence/spike/nano-lite-urlContextSchema.json`).
- On a page whose text exists only after JavaScript runs, the model returned that text verbatim; metadata showed one
  `URL_RETRIEVAL_STATUS_ERROR` then `SUCCESS` for the same URL (`evidence/spike/prod-jsonly-urlContext.json`).
- When retrieval fails, the free-text answer may still sound like a quote ("the standard text for this page typically reads…",
  `evidence/spike/nano-lite-urlContext.json`). Always read `urlContextMetadata` and never treat URL-context output as a checked quote.

## 10. Next.js 16 writes `AGENTS.md` into the project
`next dev` creates `AGENTS.md` when it detects a coding agent. For a public repo, set `agentRules: false` in `next.config.ts`.
