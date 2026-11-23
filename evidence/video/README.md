# Demo video: where every figure on screen comes from

Recorded 2026-11-23 (WIB) on the production deploy https://footing.edycu.dev, desktop Chrome 157 on a MacBook Pro M1 Max (32 GB).
Nano runs used a Chrome profile with the on-device model downloaded; the no-Nano run used a fresh profile without it.
Each product run's full state (`window.__footing`: every verdict, quote, route, `inferenceSource`) is in `../check/video-*-2026-11-23.json`;
segment event times (seconds from that segment's recording start) are in `events/`.

| On screen (video or voice-over) | Value | Source |
|---|---|---|
| "only 74.5% of citations supported their sentence" (2023 human audit, 4 generative search engines) | 74.5% | `../problem/liu-2023-verifiability.md` (arXiv:2304.09848) |
| "triages the claim in about two seconds once warm" | Nano triage p50 1699 ms, p95 2067 ms (warm); the first call of a run is a cold start (8.0 s and 8.2 s in the two Nano Auto runs) | `../bench.json`, `README.md` (Engineering Rigor), `../check/video-nano-auto*-2026-11-23.json` (`trail` → `triage` `ms`) |
| "it reads the page's best-matching passages" | Nano reads the top BM25 passages of the fetched page, not the whole page | `README.md` (The Problem & Solution), `../../src/lib/route/router.ts` |
| Live Nano run, chips ON DEVICE → IN CLOUD, total "2 of 8" | 9 of 9 triaged `on_device`; 8 decided `in_cloud`; 1 quote not found; 9 cloud calls counted against the cap (10 HTTP calls: one judge call on sentence 7 got a 500 and was retried after 15 s, which is in the 41.7 s) | `../check/video-nano-auto-2026-11-23.json` |
| Pill "sped up ×1.2–×8 · real 42 s" | click 39.81 s → last verdict 81.49 s = 41.7 s. (The run file's `wallMs` 77,822 also counts about 36 s before the click, when the capture window was paused; the events file has the click.) | `events/seg03_split.json` (`check`, `done`) |
| Sentence 5: "Nano … said SUPPORTS → the cloud ruled NOT_SUPPORTED (overruled)" + the page's line "No significant differences in blood pressure, heart rate, fasting glucose, and fasting insulin." | state `NOT_SUPPORTED`, sources `on_device, in_cloud` | `../check/video-nano-auto-2026-11-23.json` (`runs[4]`) |
| Sentence 7 (pill: "earlier run · 23 Nov 2026"): the cloud said SUPPORTS, its quote joins two separate parts of the page → "quote not found" | state `UNVERIFIED`, `recordedAt` 2026-11-23T13:21:40Z | `../check/video-nano-auto-r1-2026-11-23.json` (`runs[6]`), `stitched-quote-2026-11-23.md`, `events/seg05_gate_r1.json` |
| Unit test card: the three `quoteHeld` tests and "Tests 3 passed \| 10 skipped (13)" | real filtered run, 2026-11-23 | `gate-test-2026-11-23.txt`, `../../test/text-bm25-gate.test.ts` |
| On-device only, "network: OFFLINE" indicator, "Offline, on the pages it already fetched … all nine citations", "zero cloud calls", "9 pending · 0 cloud calls (cap 10)" | 9 of 9 `on_device`, `cloudUsed` 0, `navigator.onLine` false after the cut, 0 requests while offline (cut after the 2 source fetches) | `../check/video-nano-device-offline-v2-2026-11-23.json` (`offline`), `events/seg06_offline_v2.json` |
| Pill "sped up ×1.5–×2.5 · real 21 s" | check 6.06 s → done 27.01 s = 20.95 s | `events/seg06_offline_v2.json` |
| Pasted PDF answer, Auto: PDF chips IN CLOUD ("PDF input is cloud-only") | 3 PDF citations `in_cloud`, 1 web page `on_device → in_cloud`, 4 cloud calls | `../check/video-pdf-auto-2026-11-23.json` |
| Pill "sped up ×4 · real 12 s" | check 5.02 s → done 17.20 s = 12.2 s | `events/seg07_pdf.json` |
| On-device only on the PDF: "the on-device model refused it ("The source image could not be decoded.")" (pill: "expected: Nano can't take PDFs") | 3 PDF citations `NOT_CHECKED`, `device_error` | `../check/video-pdf-device-2026-11-23.json` |
| Pill "sped up ×1.5 · real 4.5 s" | segment 30.9 s → 35.4 s (check 32.83 s, done 35.29 s) | `events/seg07_pdf.json` |
| No-Nano run: status pill "Still checking for an on-device model — checks run in the cloud for now", every chip IN CLOUD, meter "On a Nano laptop, 9 of 9 citations would be read on-device first" | 0 `on_device`, 9 cloud calls, `deviceBefore` "slow" (fresh profile, no model) | `../check/video-nonano-auto-2026-11-23.json` |
| Pill "sped up ×2–×4 · real 18 s" | check 5.18 s → done 23.24 s = 18.1 s | `events/seg08_nonano.json` |
| /eval and the cards "13/20" (Nano binary triage, on device) and "14/20" (cloud 3-way judge), held-out fresh 20 | 13/20, 14/20 | `../summary.json`, `README.md` (Engineering Rigor) |
| "Copied the answer with 2 flags (cloud-decided only)" and the two flags in the pasted text | sentence 5 (doesn't say this), sentence 9 (says only part) | `../check/video-nonano-auto-2026-11-23.json` (states `NOT_SUPPORTED`, `PARTIAL`), `copy-with-flags-2026-11-23.txt` |
| "Open source · Apache-2.0" | licence | `../../LICENSE` |

Not part of Footing, and labelled as such on screen: the plain text editor the copied answer is pasted into (it shows the copied
text unchanged; checked 2026-11-23: identical to `copy-with-flags-2026-11-23.txt` apart from line breaks), the "network:" indicator
in the offline shot (a capture overlay that reads the browser's own `navigator.onLine`), and the DevTools network emulation used to
take the tab offline. The opening and closing title cards show the sample answer's real sentence 5 and its cited page's real line
(both above), and an excerpt of `src/lib/ai/models.ts` (tokens verbatim, lines reflowed).
Superseded capture kept for the record: `../check/video-nano-device-offline-2026-11-23.json` (first offline take, no indicator).

The capture overlay in the offline shot (injected by the capture script, not part of Footing) is this, verbatim apart from styling:
```js
const paint = () => { const on = navigator.onLine; n.innerHTML = `network: ${on ? "online" : "OFFLINE"}`; };
paint(); addEventListener("online", paint); addEventListener("offline", paint);
```
The network was cut with the DevTools protocol's network emulation for that tab only (`page.setOfflineMode(true)`), after both cited
pages had been fetched; `navigatorOnLineAfterCut: false` and `requestsWhileOffline: []` in the run file record the result.
