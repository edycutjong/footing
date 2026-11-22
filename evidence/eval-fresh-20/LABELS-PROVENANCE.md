# Fresh 20 labels (held-out)

Written and labelled on 2026-11-22, committed with this hash **before any model saw them**
(sha256 `58709646fe5b0fcee32efe17649f0badfcc1079c2b3dc397ba2b84ce3ab60f9f`; check: `shasum -a 256 labels.json`). The prompts and models measured on this set were fixed before it was written.

Sources: six real pages fetched on 2026-11-22 (five Wikipedia articles and one NHS page), text extracted with Readability.
Claims were written by the build agent as AI-answer-style sentences about each page, then labelled against the full extracted text:
8 SUPPORTS (faithful paraphrase), 6 PARTIAL (a true statement plus an appended detail the page does not contain; each appended detail
was checked absent by text search), 6 NOT_SUPPORTED (5 contradicted by the page, 1 mis-cited: a legend the page reports, presented as fact).

Limits: one labeller (the agent); a blind second pass by a human is optional (`labels-blind.csv`, no labels or model outputs).
These claims are written, not captured from a live AI answer, so they test the checker, not how often real answers mis-cite.
