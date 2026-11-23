# Demo video: where every figure on screen comes from

Recorded 2026-11-23 (WIB) on the production deploy https://footing.edycu.dev, desktop Chrome 157 on a MacBook Pro M1 Max (32 GB).
Nano runs used a Chrome profile with the on-device model downloaded; the no-Nano run used a fresh profile without it.
Each product run's full state (`window.__footing`: every verdict, quote, route, `inferenceSource`) is in `../check/video-*-2026-11-23.json`;
segment event times (seconds from that segment's recording start) are in `events/`.

| On screen (video or voice-over) | Value | Source |
|---|---|---|
| "only 74.5% of citations supported their sentence" (2023 human audit, 4 generative search engines) | 74.5% | `../problem/liu-2023-verifiability.md` (arXiv:2304.09848) |
| "triages the claim in about two seconds" | Nano triage p50 1699 ms, p95 2067 ms | `../bench.json`, `README.md` (Engineering Rigor) |
| Live Nano run, chips ON DEVICE → IN CLOUD, total "2 of 8" | 9 of 9 triaged `on_device`; 8 decided `in_cloud`; 1 quote not found; 9 cloud calls (cap 10) | `../check/video-nano-auto-2026-11-23.json` |
| Pill "sped up ×2–×8 · real 42 s" | click 39.81 s → last verdict 81.49 s = 41.7 s | `events/seg03_split.json` (`check`, `done`) |
| Sentence 5: "Nano … said SUPPORTS → the cloud ruled NOT_SUPPORTED (overruled)" + the page's line "No significant differences in blood pressure, heart rate, fasting glucose, and fasting insulin." | run state `NOT_SUPPORTED`, sources `on_device, in_cloud` | `../check/video-nano-auto-2026-11-23.json` (`runs[4]`) |
| Sentence 7: "quote not found" after the cloud said SUPPORTS (pill: "an earlier live run of the same answer (2026-11-23, 20:21 WIB)") | run state `UNVERIFIED`; recordedAt 13:21:40Z = 20:21 WIB | `../check/video-nano-auto-r1-2026-11-23.json` (`runs[6]`), `events/seg05_gate_r1.json` |
| Unit test replay: `quoteHeld` holds a verbatim quote, refuses a paraphrase and an empty quote; "Tests 3 passed" | 3 passed | `../../test/text-bm25-gate.test.ts` (describe "quoteHeld (the gate)") |
| On-device only with the tab offline: "all nine citations", "zero cloud calls", "9 pending · 0 cloud calls (cap 10)" | 9 of 9 `on_device`, `cloudUsed` 0, 0 requests while offline (cut after the 2 source fetches) | `../check/video-nano-device-offline-2026-11-23.json` (`offline`), `events/seg06_offline.json` |
| Pill "sped up ×2.5 · real 20 s" | the sped part runs 7.7 s → 27.5 s of the segment = 19.8 s (offline at 7.51 s, done at 27.37 s) | `events/seg06_offline.json` |
| Pasted PDF answer, Auto: PDF chips IN CLOUD ("PDF input is cloud-only") | 3 PDF citations `in_cloud`, 1 web page `on_device → in_cloud`, 4 cloud calls | `../check/video-pdf-auto-2026-11-23.json` |
| Pill "sped up ×4 · real 12 s" | check 5.02 s → done 17.20 s = 12.2 s | `events/seg07_pdf.json` |
| On-device only on the PDF: "the on-device model refused it ("The source image could not be decoded.")" | 3 PDF citations `NOT_CHECKED`, `device_error` | `../check/video-pdf-device-2026-11-23.json` |
| Pill "sped up ×1.5 · real 4.5 s" | segment 30.9 s → 35.4 s (check 32.83 s, done 35.29 s) | `events/seg07_pdf.json` |
| No-Nano run: every chip IN CLOUD; meter "On a Nano laptop, 9 of 9 citations would be read on-device first" | 0 `on_device`, 9 cloud calls, `deviceBefore` "slow" (fresh profile, no model) | `../check/video-nonano-auto-2026-11-23.json` |
| Pill "sped up ×4 · real 18 s" | check 5.18 s → done 23.24 s = 18.1 s | `events/seg08_nonano.json` |
| /eval: "13 of 20 correct (65%)" (Nano binary triage), "14 of 20 correct (70%)" (cloud 3-class), held-out fresh 20 | 13/20, 14/20 | `../summary.json`, `README.md` (Engineering Rigor) |
| "Copied the answer with 2 flags (cloud-decided only)" and the two flags in the pasted text | 2 flags: sentence 5 (doesn't say this), sentence 9 (says only part) | `../check/video-nonano-auto-2026-11-23.json` (states `NOT_SUPPORTED`, `PARTIAL`) |
| "Open source · Apache-2.0" | licence | `../../LICENSE` |

Not part of Footing, and labelled as such on screen: the plain text editor the copied answer is pasted into, and the
DevTools network emulation used to take the tab offline. The opening and closing title cards show the sample answer's
real sentence 5 and its cited page's real line (both above), and an excerpt of `src/lib/ai/models.ts` (tokens verbatim, lines reflowed).
