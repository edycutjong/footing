# Footing: demo and reproduce steps

Live: https://footing.edycu.dev (no login). Measured results: https://footing.edycu.dev/eval.

## 1. See a check (about 1 minute)
1. Open https://footing.edycu.dev. The sample answer is pre-filled (if you changed it, open the paste box, press **Fill the sample**, then **Use this answer**).
2. Press **Check sources**. Each citation becomes a chip. Each chip shows its route badge, `ON DEVICE` or `IN CLOUD`, taken from the response's
   `inferenceSource`. A chip that holds opens an evidence pane with the exact quote the source contains.
3. The footed total counts what the sources vouch for. Use the force control (Auto, On-device only, Cloud only) to see both routes.

On a laptop without Gemini Nano every pair runs in the cloud (first 8 per answer) and a meter reads how many citations a Nano laptop would
read on-device first. Recorded runs of this flow on the deployed URL are in `evidence/check/` (JSON plus a screenshot per run; `nano-…` files are Nano runs; `fresh-hero`, `live-fresh-hero` and `live-r0N-fresh-hero` are fresh-profile runs without Nano). Example, `evidence/check/nano-hero-2026-11-22.json`: Nano present, 8 citations decided in the cloud, 2 not checked
(their sources returned 403), total 10.

## 2. Turn Gemini Nano on (desktop Chrome)
1. `chrome://flags` → enable **Gemma 4 for Built-in AI** and the Prompt API flag, relaunch.
2. Keep at least 22 GB free on the profile's disk (the figure in Chrome's built-in AI documentation).
3. The first on-device call starts a model download (several GB); the page shows progress and checks in the cloud meanwhile.

## 3. Reproduce the numbers
```bash
npm ci
npm run eval      # recomputes every figure in evidence/summary.json from the committed raw rows; exits 1 on a mismatch
npm test          # 191 tests
```
Live re-run (real Chrome with Nano plus Firebase AI Logic; needs a Firebase web config in `.env.local`):
`npm run eval:live -- <set> <triage|judge> <userDataDir> [judgeModel]`, or open `/eval/run` on a local dev server (`npm run dev`; the route is disabled in production).

| Set | Nano binary triage | Cloud judge (3-class) |
|---|---|---|
| Fresh 20 (held-out, labels committed before any run) | 13/20 = 65% | 14/20 = 70% |
| Frozen 30 (not held-out) | 24/30 = 80% (binary cut) | 23/30 = 76.7% |

Raw rows: `evidence/eval-30/`, `evidence/eval-fresh-20/`. Machine for on-device runs: MacBook Pro M1 Max, 32 GB, Chrome 157.
Friction log for Firebase AI Logic hybrid inference: [`docs/DX-REPORT.md`](docs/DX-REPORT.md).
