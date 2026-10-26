# Project Brain goal — slice plan

Goal: `briefs/AgentOS-Project-Brain-Goal-2026-10-26.md` (Ralph, approved 2026-10-26). Branch `feat/project-brain` from `origin/main` = `7bcca0e` (1.1.0). One branch, small commits, one PR to main at the end; no merge, publish or version bump. Baseline evidence: `docs/evidence/project-brain-baseline.md`. Matrix: `docs/project-brain-acceptance.md`.

**Status (2026-10-26, card 9):** Goal complete, pending owner review. Slices 1–6 are built, trial defects D1–D7 are fixed, and all 20 matrix rows pass with their limits stated (A14 on CI run 40310090906 on `6ce3d25`; A15/A17 n=1 owner GUI round trip; A16 with OpenCode in place of Codex, owner-accepted). Remaining owner decisions (release version, D6 policy, merge) are under "Owner actions remaining" in the matrix.

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

## Slice 3 design (as built)

- `agentos init` ends with the shared `initBrain` (src/brain.ts): per starting record, existing id → kept; AgentOS-owned file (`.agentos/decisions.md`, `.agentos/architecture.md`) → registered in place; same-kind record → kept; covering doc (six fixed paths) → named with its `brain register` command, never edited; else a `(unknown — fill in)` template. A set-up Brain is a no-op; a Brain error is printed and never undoes init. Discovery is a printed instruction to the engine (no model call).
- Context: mandatory `overview` candidate = `.agentos/memory.md` body, cut at `OVERVIEW_CHARS` = 1500 (src/context-builder.ts).
- One Brain per workspace: `loadBrain` stops at any subfolder with its own `.agentos/`.
- Machine-local binding: `.agentos/local.yaml` `obsidian.vault` (read in `obsidianConfigFromProject(project, root)`), precedence over `project.yaml` `knowledge.obsidian.vault`; `obsidian link|link-workspace` and `obsidian init --dir <outside>` write it; `.agentos/.gitignore` lists it (written by init and by every local.yaml write). No vault bound → integration off with `UNBOUND` reason.
- Navigation note: `newIndexNote(…, root)` adds `tags: [agentos-navigation]` frontmatter and a `**Navigation only.**` paragraph when canonical is workspace and the note is outside the workspace. `obsidianAppLine` = PATH lookup, advice only.
- Bootloaders: `startupLoop(engine)` line in AGENTS.md (`codex|opencode`), CLAUDE.md (`claude-code`), .hermes.md (`hermes`); guide gains `## Setup and project knowledge` (budget raised 4608 → 5376 B). No `agentos guide` command (the existing ablation-backed test forbids it).
- Package: `docs/{quickstart,brain,obsidian,engines}.md` added to `files`. Hermes start workflow: proposal only, `docs/evidence/hermes-start-workflow-proposal.md`.

## Slice 4 design (goal slice 5, as built)

- `brain propose … --task <id>` (src/brain.ts) loads the task's `current.json` record (`loadCurrent`), refuses (exit 1, zero writes) when there is none, it is incomplete, or `checkpointEvidence` finds no changed path and no `observed-pass` receipt; otherwise adds `task`, `checkpoint`, `evidence` to the ordinary proposal. Everything after that is the existing lifecycle.
- Dedupe: file name `<task>-<sha256(target, checkpoint, mode, norm(text), supersedes)[:12]>-<record>.md`; an existing file in `proposals/` or `applied/` → `already staged`, exit 0.
- Trigger: `knowledgeLine(task)` at the end of every non-recovered checkpoint output, one clause in `startupLoop`, one guide line. Instruction-following only; no hook, no model call.
- `resume` with no checkpoint and no evidence: `status: none`, exit 0, `Status: clean start …`.

## Known risks

- `bun` is not installed on the dev host; gates run the same scripts with `npm run` (no global installs allowed).
- Real Obsidian UI, native Windows and engine quotas may be unavailable → BLOCKED rows, not PASS.
- `core.ts` is 5k lines and shared by every slice: keep Obsidian changes inside the existing `obsidian*` helpers.
- Index refresh (slice 2) must not overwrite an older hand-edited index note without preview.
- Hermes start-workflow (slice 3) may live outside this repo: prepare the change, report the dependency.
