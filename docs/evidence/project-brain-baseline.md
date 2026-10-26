# Project Brain goal — baseline reproduction (F1–F10)

Baseline: `origin/main` = `7bcca0e611c2e8aec9b2b9300bcc37a52e193de7` (package 1.1.0; `git fetch origin` on 2026-10-26 confirmed main had not moved). Host: Linux (WSL2), Node 26.7.0. Bun is not installed on this host; the package scripts are plain `node` commands, so `npm run check` / `npm run test` ran the identical script bodies. Baseline gates: `npm run check` exit 0, `npm run test` exit 0 (753/753) — no pre-existing failures.

Script: [`project-brain-repro.sh`](project-brain-repro.sh), run as `CLI=<build>/dist/cli.js bash docs/evidence/project-brain-repro.sh` against a copy of the baseline `dist/`. Fixtures are disposable workspaces under `$TMPDIR/pb repro/` (space in every path), created with `agentos init --existing --yes --agents minimal`; vaults are plain temp folders, never a real vault. Paths below are shown as `$BASE`. Context output is trimmed to its `## Missing` section and the `INCOMPLETE` line.

| ID | Result | Evidence (command → observed) |
|---|---|---|
| F1 | NOT REPRODUCED as a defect — works at baseline (as the finding states) | no `knowledge.obsidian`: `brain init`, `brain list`, `context claude --task demo --require-complete`, `checkpoint --task demo … --dry-run`, `checkpoint …`, `resume --task demo` → all exit 0 |
| F2 | REPRODUCED | `knowledge.obsidian: {mode: workspace-folder, vault: knowledge, destination: ., canonical: bogus}` in otherwise valid YAML → `brain list`, `context`, `checkpoint --dry-run`, `checkpoint`, `resume` each exit 1: `agentos <cmd> failed: .agentos/project.yaml knowledge.obsidian.canonical must be workspace or vault (got bogus)`. Control: a *corrupted* project.yaml (`name: [unclosed`) was **not** an honest failure — `brain list` and `context` exit 0 and read it as an empty project (`kind: unknown`; Missing: `no agent role …`). |
| F3 | REPRODUCED | `obsidian init` (canonical: workspace) + `brain init`, then `rm -rf knowledge` → `context claude --task demo --require-complete` exit 1, `## Missing - vault unavailable: $BASE/F3 ws/knowledge`, `INCOMPLETE … 1 missing item(s)`, while `brain check` says `4 record(s), 4 ok` (every record is local). |
| F4 | REPRODUCED (correct behaviour to keep) | `obsidian link --vault "$BASE/F4 vault" --dest Projects/Demo --canonical vault --create`, register `design.md` there, move the vault away → `context … --require-complete` exit 1, Missing: `vault unavailable: …/Projects/Demo` and `brain:design (Projects/Demo/design.md): vault unavailable: …`; `brain check`: `1 unavailable`. Real missing data, correctly reported. |
| F5 | REPRODUCED | after `agentos init`: `brain list` → `No Brain records. Start with agentos brain init …`; `ls .agentos/brain` → `No such file or directory`. |
| F6 | REPRODUCED | `memory.md` containing `Purpose: PB-PURPOSE-SENTINEL demo tracker.` → `context claude --task demo | grep -c PB-PURPOSE-SENTINEL` = `0`; `memory.md` appears only in the `Read:` line. |
| F7 | REPRODUCED | `obsidian init`, then `brain init` (4 records) → `knowledge/index.md` still ends `- None registered yet (…)`, `grep -c "](" knowledge/index.md` = `0`; `brain list` shows 4 records. |
| F8 | REPRODUCED | `obsidian init` (relative `vault: knowledge`) → `obsidian status` at root: `OK`, exit 0; from `sub/deeper`: `NEEDS ATTENTION`, `Vault missing: knowledge`, `Workspace folder missing: knowledge`, exit 1. |
| F9 | REPRODUCED | registered `docs/adr/0001.md`; `chmod 000 docs/adr` → `brain list`: `No Brain records…` exit 0; `brain check`: `0 record(s)` exit 0; `context … --require-complete` exit 0 with nothing Missing (`loadBrain` uses `readdir(...).catch(() => [])`). |
| F10 | REPRODUCED | `obsidian link --vault "$BASE/F10 vault" …` writes `vault: $BASE/F10 vault` (absolute, machine-specific) into the shared `.agentos/project.yaml`. Missing index note in an `obsidian init` folder: `obsidian status` → `has no index note (index.md); … remove knowledge.obsidian and re-run agentos obsidian init`; re-running `obsidian init` → `FAIL knowledge.obsidian is already configured` (no repeatable recovery). Deleted `.agentos/brain/index.json` is not recreated by reads (`brain list`); only the next brain write regenerates it. |

## After Slice 1 (`9e9ffa4`)

Same script, built `dist/` of `9e9ffa4`; F5–F10 output unchanged (later slices).

- F1: unchanged, all exit 0.
- F2: `brain list`, `context`, `checkpoint --dry-run`, `checkpoint`, `resume --task demo` → all exit 0 (`resume`: `AgentOS resume: demo … Objective: Ship the demo.`); `context --json` warning `Obsidian integration invalid, ignored: …`. Corrupted YAML control: `brain list` and `context` → exit 1, `.agentos/project.yaml is not valid YAML (…); fix it by hand. Nothing was read or written.`
- F3: `context … --require-complete` → exit 0, no Missing; `brain check` 4 ok.
- F4: unchanged (still exit 1 with `brain:design … vault unavailable` under Missing) — required data stays incomplete.

Slice mapping: F1–F4 → Slice 1 (this card); F7–F10 → Slice 2; F5, F6, F10 (bindings) → Slice 3. See [`.agentos/plans/project-brain.md`](../../.agentos/plans/project-brain.md).
