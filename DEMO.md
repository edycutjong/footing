# Footing: demo and reproduce steps

Live: https://footing.edycu.dev (no login). Measured results: https://footing.edycu.dev/eval.

## 1. See a check (about 1 minute)
1. Open https://footing.edycu.dev. The sample answer is pre-filled (if you changed it, open the paste box, press **Fill the sample**, then **Use this answer**).
2. Press **Check sources**. Each citation becomes a chip. Each chip shows its route badge, `ON DEVICE` or `IN CLOUD`, taken from the response's
   `inferenceSource`. A chip that holds opens an evidence pane with the exact quote the source contains.
3. The total reads "k of n": of the n citations a model decided, k are not (fully) said by their source. **Open the first flagged citation** opens
   the first of those beside the source's own words. No Nano? A recorded Nano run of the sample plays at https://footing.edycu.dev/about#fx-hero.
   On a Nano laptop, the force control (Auto, On-device only, Cloud only) shows both routes; in a browser with no on-device model at all, On-device only reports "no on-device model in this browser" for each readable page.

On a laptop without Gemini Nano every pair runs in the cloud (first 10 per answer automatically, the rest on a click) and a meter reads how many citations a Nano laptop would
read on-device first. Recorded runs of this flow on the deployed URL are in `evidence/check/` (JSON plus a screenshot per run; `nano-…` and `live-r03-nano-hero-…` files are runs on the Nano profile (check each run's `sources`: in two `live-r03-nano-hero` runs the model was not ready and every citation went to the cloud); `video-…` files are the demo video's runs (23 Nov, see `evidence/video/README.md`); `fresh-hero`, `live-fresh-hero` and `live-r0N-fresh-hero` are fresh-profile runs without Nano). Example, `evidence/check/nano-hero-if-2026-11-22.json` (the run replayed on `/about`): Nano present, 9 citations, all 9 triaged
`ON DEVICE`; 1 settled on the laptop (no supporting passage, unconfirmed) and 8 escalated `IN CLOUD`: 6 says it, 1 says part, 1 quote not found.

## 2. Turn Gemini Nano on (desktop Chrome)
1. `chrome://flags` → enable `#gemma4-for-built-in-ai` (**Gemma 4 for Built-in AI**) and `#prompt-api`, relaunch.
2. Keep at least 22 GB free on the profile's disk (the figure in Chrome's built-in AI documentation).
3. The first on-device call starts a model download (several GB); the page shows progress and checks in the cloud meanwhile.

## 3. Reproduce the numbers
```bash
npm ci
npm run eval      # recomputes every figure in evidence/summary.json from the committed raw rows; exits 1 on a mismatch
npm test          # 193 tests
```
Live re-run (real Chrome with Nano plus Firebase AI Logic; needs a Firebase web config in `.env.local`):
`npm run eval:live -- <set> <triage|judge> <userDataDir> [judgeModel]`, or open `/eval/run` on a local dev server (`npm run dev`; the route is disabled in production).

Latency bench: `BENCH_REPS=2 FIREBASE_APPCHECK_DEBUG_TOKEN=… npm run bench -- <nanoUserDataDir>` (dev server running, Nano-enabled profile) times 20 held-out claims per route and rewrites `evidence/bench.json`. Local E2E on that profile: `npm run e2e:nano`.

| Set | Nano binary triage | Cloud judge (3-class) |
|---|---|---|
| Fresh 20 (held-out, labels committed before any run) | 13/20 = 65% | 14/20 = 70% |
| Frozen 30 (not held-out) | 24/30 = 80% (binary-only run, 22 Nov) | 23/30 = 76.7% |

Raw rows: `evidence/eval-30/`, `evidence/eval-fresh-20/`. Machine for on-device runs: MacBook Pro M1 Max, 32 GB, Chrome 157.
Friction log for Firebase AI Logic hybrid inference: [`docs/DX-REPORT.md`](docs/DX-REPORT.md).
