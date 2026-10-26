# Project Brain goal — slice plan

Goal: `briefs/AgentOS-Project-Brain-Goal-2026-10-26.md` (Ralph, approved 2026-10-26). Branch `feat/project-brain` from `origin/main` = `7bcca0e` (1.1.0). One branch, small commits, one PR to main at the end; no merge, publish or version bump. Baseline evidence: `docs/evidence/project-brain-baseline.md`. Matrix: `docs/project-brain-acceptance.md`.

| Order | Slice | Findings | Acceptance rows | Done when |
|---|---|---|---|---|
| 1 | Brain independent of Obsidian | F1–F4 | A01–A04 | Local brain/context/checkpoint/resume work with the integration absent, disabled, invalid or gone; required missing records stay Missing; corrupt core YAML fails; `knowledge.obsidian.enabled: false` documented |
| 2 | Reliability: index refresh, nested status, unreadable vault/dir, missing-index recovery | F7–F10 (recovery), F9 | A05–A08 | Refresh is stable and keeps human prose; root and nested status agree; EACCES ≠ empty ≠ absent; deleted index recreated without touching records/history |
| 3 | Setup and discovery | F5, F6, F10 (bindings) | A09–A12 | `init` creates/adopts the Brain; bounded overview in context; machine-local binding with documented precedence; packaged instructions; both vault setup paths keep unrelated notes; Hermes start-workflow change prepared |
| 4 | Checkpoint-driven proposals (goal slice 5) | — | A18–A20 | Completed work stages one focused proposal; no-op/repeat creates none; stale base rejected; apply keeps history when Obsidian fails |
| 5 | Real environments + engine continuity (goal slice 4) | — | A13–A17 | Linux, WSL+Windows Obsidian, Claude Code → Codex → Hermes trials recorded; unavailable GUI/native Windows rows BLOCKED with the exact remaining trial |
| 6 | Docs, migration guide, state files, `release:check`, PR | — | all | Matrix complete; PR open |

Slice 5 (proposals) runs before the real-environment trials so the connected demo can exercise it (campaign order set by Phynceon).

## Slice 1 design (as built)

- `obsidianIntegration()` in `src/core.ts` is the only reader of `knowledge.obsidian` for core commands and never throws: absent → no binding; `enabled: false` or an invalid setting → no binding plus an `off` reason.
- `vaultUnavailable()` / `brainMissing()` in `src/brain.ts`: a missing folder is Missing knowledge only when it is canonical (`canonical: vault`) or holds records last known in `index.json`; with `canonical: workspace` it is a context warning. Integration off + last-known vault records → those records are Missing (never hidden); `writeIndex` keeps their entries.
- Corrupt `.agentos/project.yaml` → `brain`/`context`/`checkpoint`/`resume` exit 1.
- Brain writes commit the record, then regenerate `index.json` separately; an index failure keeps the write and reports `index.json is stale`. Slice 2 hangs the Obsidian index-note refresh on the same step.

## Slice 2 design (as built)

- Index note = human prose + one generated block between `<!-- agentos:brain-index:start … -->` and `<!-- agentos:brain-index:end -->` (`planNote`/`syncNote` in `src/brain.ts`). `commit()` regenerates `index.json` then syncs the note; each failure keeps the record write (`index_stale` / `note_stale`). Both are written only when bytes change.
- `agentos brain index [--adopt] [--dry-run]`: the one recovery/adoption command (writer lock unless dry run). Unmarked (≤ 1.1) notes: preview diff, written only with `--adopt`; damaged markers: never written.
- `loadBrain` returns `.unreadable` (non-ENOENT readdir/read failures); `unreadableKnowledge()` joins them, and the vault folder state (`dirState`: ok/empty/absent/error code), with the records `index.json` last knew there. `writeIndex` keeps those entries.
- `obsidian status` resolves a relative vault with `resolve(root, …)` (F8); all other paths already went through `obsidianBinding(root, …)`.

## Known risks

- `bun` is not installed on the dev host; gates run the same scripts with `npm run` (no global installs allowed).
- Real Obsidian UI, native Windows and engine quotas may be unavailable → BLOCKED rows, not PASS.
- `core.ts` is 5k lines and shared by every slice: keep Obsidian changes inside the existing `obsidian*` helpers.
- Index refresh (slice 2) must not overwrite an older hand-edited index note without preview.
- Hermes start-workflow (slice 3) may live outside this repo: prepare the change, report the dependency.
