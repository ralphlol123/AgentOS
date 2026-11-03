# Handoff

## Current objective

`agentos resume` without `--task` must resume the real checkpoint task instead of a slug of the objective text (false "no checkpoint"): the objective's task when it has checkpoints, else the only task with checkpoints; several → list the ids with `--task` hints (exit 2); none → today's view with the derived id labelled. A checkpoint that failed to save must not hide the last usable one, and a failing check in a saved one must stay visible. `doctor` must not fail a clone with no vault bound when `canonical: workspace` (`canonical: vault` still fails). A `core.autocrlf=true` checkout must not report Brain records or agent cards as changed.

## Scope

- Repo: `agentos-for-projects`, single-repo workspace.
- Baseline: `main` at `65b06c6` (PR #81 merged), package 3.2.0. Unreleased; no version bump or release.
- Branch: `fix/resume-active-task`; task id: `resume-active-task`.
- Allowed changes: `src/checkpoint.ts`, `src/core.ts` (resume/context/status/doctor wiring), `src/cli.ts` (resume exit code), `src/brain.ts` and `src/agents.ts` (CRLF-neutral hashes), tests, `docs/checkpoints.md`, `docs/obsidian.md`, `docs/brain.md`, `docs/agents.md`, CHANGELOG Unreleased and this repository's AgentOS state.

## Current state

- RED commits (each fails before its fix): `f416995` bare resume with one task gives a false "no checkpoint"; `290058b` zero/several tasks, bare context, risk A views; `df3eab7` doctor with an unbound vault; `d31c6ed` Brain records in a CRLF checkout; `f9baf88` records without `current.json`; `e90f2e5` agent cards in a CRLF checkout.
- Fixes: `b9d2b2a` doctor (`canonical: workspace` + unbound vault = warning with bind hint, exit 0); `5249ee9` Brain `source_hash` reads CRLF as LF; `8ece7e9` `resolveReadTask` for bare resume/context, `ambiguousResume` (exit 2), last usable checkpoint and `Showing OLDER state` lines, `status` failing checks and checkpoint problems; `4445723` records without `current.json` are reported; `e853e31` agent-card hash CRLF-neutral.
- Docs and CHANGELOG Unreleased `### Fixed` entries; the read rule is in docs/checkpoints.md.
- Real CLI runs on copies of the Phase 5 tasktracker project and on fixture projects, old build vs new. Evidence and report are outside the repo, in the task folder (`agentos-resume-fix/report.md`).
- All commits are local; nothing pushed.
- Previous state: `.agentos/runs/2026-11-04-before-resume-active-task.md`.

## Next exact action

Phynceon reviews the local commits on `fix/resume-active-task`, then pushes and opens a PR against `main`.

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.
- `package.json` version and CHANGELOG release headings (release PR).

## Open decisions

- Release version and merge remain separate from this implementation.
- Bare `agentos checkpoint` (a write) still keys a new record by the objective slug; only reads use the checkpoint task (tasks.md § Next).
- `status` keeps "newest valid checkpoint across tasks" while bare `resume` refuses to guess between several tasks. This is deliberate: status summarises, resume continues.
- `brain propose --from <copy>` refuses the copy (frontmatter); the `obsidian link` failure label says `--no-index`; WSL rejects `C:\` paths. Out of scope here.

<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: obsidian-readonly-mirrors
- Record: `.agentos/checkpoints/obsidian-readonly-mirrors/2026-11-03T16-44-59-570Z-20556dd3.json`
- Repos: agentos-for-projects fix/obsidian-readonly-mirrors@f325ce2 (0 changed)
- Progress: Read-only copies for out-of-vault Brain records (canonical: workspace): RED cfc9496, fix baba3d8, docs 873062e, state commit. New test/obsidian-mirrors.test.js 13/13; full suite green; real CLI both flows on rebuilt originals: no index link leaves the vault, edited copy kept and warned, propose/app…
- Blockers: none
- Next: Phynceon reviews the local commits on fix/obsidian-readonly-mirrors, pushes and opens a PR against main; Ralph runs the desktop check per flow.
- Receipts: observed-pass 2, observed-fail 0, claimed 0, not-run 3, unavailable 0
- Resume: `agentos resume --task obsidian-readonly-mirrors`
<!-- agentos:checkpoint:end -->
