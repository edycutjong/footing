# Footing

Checks that each link cited in an AI answer actually says what the sentence claims.

Gemini Nano runs on your laptop through Firebase AI Logic (hybrid inference) and triages every citation; only the hard calls go to the cloud model. Code verifies that every quoted span exists, word for word, in the fetched source.

Work in progress. License: Apache-2.0.
