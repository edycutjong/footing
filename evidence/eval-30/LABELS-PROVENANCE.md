# Frozen 30 labels

Labelled on 2026-11-21, before any model run, then frozen. The original label file's sha256 is
`74557a8f9a60b774221b2e6837fe5c11a16cfbc2a5d83af5ff5366ed71e0cf9e` (it also carried annotator notes and a first/blind pass per row;
this public copy keeps id, claim, url, label, provenance and source id only).

12 SUPPORTS · 9 PARTIAL · 9 NOT_SUPPORTED. Provenance: 18 natural (sentences from AI answers written over real fetched pages),
5 mis-cited, 4 contradicted, 3 appended-clause (edited to create a known failure).

Not held-out: an earlier on-device prompt was scored on this same set. Held-out numbers come from `../eval-fresh-20/`.
