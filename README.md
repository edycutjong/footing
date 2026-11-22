# Footing

Checks that each link cited in an AI answer actually says what the sentence claims.

The design: Gemini Nano runs on your laptop through Firebase AI Logic (hybrid inference) and triages each citation; the hard calls go to a
cloud model; code checks that every quoted span exists, word for word, in the fetched source. The full check flow is being built now.

Measured so far (raw rows in `evidence/`, summary on the live [/eval](https://footing.edycu.dev/eval) page): the on-device triage and the
cloud judge on a frozen 30-claim set and a held-out 20-claim set. Build notes: [`docs/DX-REPORT.md`](docs/DX-REPORT.md).

License: Apache-2.0.
