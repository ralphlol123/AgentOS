# Project Brain goal — acceptance matrix

Goal: `briefs/AgentOS-Project-Brain-Goal-2026-10-26.md`. Branch `feat/project-brain` (from `7bcca0e`). Status: **PASS** = shown by the linked evidence on the tested SHA; **FAIL** = shown not to work; **BLOCKED** = cannot be shown here (names the remaining trial); **NOT STARTED** = later slice. Test evidence = `test/<file>` › title, synthetic temp fixtures (paths with spaces), Linux/WSL2, Node 26.7.0. Gates run with `npm run` (bun absent on the host; identical scripts).

Summary: 20 rows — 4 PASS, 0 FAIL, 0 BLOCKED, 16 NOT STARTED.

| ID | Required outcome | Status | Evidence | Tested SHA |
|---|---|---|---|---|
| A01 | Core Brain and continuity work without Obsidian installed or configured | PASS | `project-brain-slice1.test.js` › "F1/A01: no Obsidian configuration …"; no Obsidian install on the host; [baseline F1](evidence/project-brain-baseline.md) | 9e9ffa4 |
| A02 | Invalid/disabled optional integration cannot block healthy local operations | PASS | `project-brain-slice1.test.js` › "F2/A02: valid project YAML with an invalid integration setting …" (`canonical: bogus`, `destination: ../escape`, `enabled: nope`), › "A02: knowledge.obsidian.enabled: false …"; RED on 7bcca0e ([baseline F2](evidence/project-brain-baseline.md)) | 9e9ffa4 |
| A03 | Missing optional viewer does not fail strict completeness for an entirely local Brain | PASS | `project-brain-slice1.test.js` › "F3/A03: canonical: workspace with the optional folder gone …"; RED on 7bcca0e ([baseline F3](evidence/project-brain-baseline.md)) | 9e9ffa4 |
| A04 | Missing/corrupt required knowledge remains explicitly incomplete | PASS | `project-brain-slice1.test.js` › "F4/A04: a vault-canonical record whose vault is offline …", › "A04: disabling or breaking the integration does not hide a vault-only record, even after a Brain write", › "A04: corrupted core project.yaml still fails honestly"; `v1-slice6-obsidian.test.js` › "external vault edit -> changed; vault removed -> unavailable …"; invalid record metadata: `v1-slice4-brain.test.js` (unchanged). Limit: an unreadable workspace directory is still read as empty (F9) — Slice 2 / A07 | 9e9ffa4 |
| A05 | Index refresh preserves human prose and is stable when repeated | NOT STARTED | Slice 2 | — |
| A06 | Root and nested-directory status resolve the same binding | NOT STARTED | Slice 2 | — |
| A07 | Permission/I/O failure is distinguishable from empty or absent storage | NOT STARTED | Slice 2 | — |
| A08 | Missing-index recovery preserves canonical records and history | NOT STARTED | Slice 2 | — |
| A09 | Initialization/adoption creates a usable Brain without duplicating existing knowledge | NOT STARTED | Slice 3 | — |
| A10 | Bounded overview, selective retrieval, and project isolation work | NOT STARTED | Slice 3 | — |
| A11 | Machine-local bindings and packaged setup instructions work after installation | NOT STARTED | Slice 3 | — |
| A12 | New-folder and existing-vault setup preserve unrelated notes/settings | NOT STARTED | Slice 3 | — |
| A13 | Native Linux behavior is validated | NOT STARTED | Slice 4 trials | — |
| A14 | Native Windows behavior is validated | NOT STARTED | Slice 4 trials | — |
| A15 | WSL plus Windows Obsidian behavior is validated | NOT STARTED | Slice 4 trials | — |
| A16 | Fresh Claude Code → Codex continuity and Hermes context consumption are observed | NOT STARTED | Slice 4 trials | — |
| A17 | Real Obsidian agent-edit/human-edit round trip uses the same canonical note | NOT STARTED | Slice 4 trials | — |
| A18 | A normal completed task stages an appropriate knowledge proposal | NOT STARTED | Slice 5 | — |
| A19 | No-op/repeated events avoid duplicate proposals; stale proposals preserve human edits | NOT STARTED | Slice 5 | — |
| A20 | Reviewed application preserves history and survives optional integration failure | NOT STARTED | Slice 5 (Slice 1 already keeps a Brain write when `index.json` regeneration fails: `project-brain-slice1.test.js` › "a Brain write is kept when the derived index cannot be refreshed …") | — |
