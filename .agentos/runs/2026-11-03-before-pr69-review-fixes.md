# State before the PR #69 review fixes

Archived verbatim before rewriting `.agentos/handoff.md` (§ Current state, § Next exact action) and `.agentos/tasks.md` (§ Now, § Next). Taken at `b62f37f`. These claims describe that revision, not later checkouts; the "815 tests, 809 passed and 6 skipped" line was not reproduced (see the trial note `2026-11-03-codex-to-hermes-continuation-trial.md`).

## .agentos/handoff.md

````markdown
# Handoff

## Current objective

Make engine handoffs trustworthy: an engine saves project knowledge and task progress, and another engine can inspect current files and continue after a usage limit or interruption. Engine launching, automatic switching and chat-session transfer are outside this change.

## Scope

- Repo: `agentos-for-projects`, single-repo workspace.
- Baseline: `ed3accd` on main, package 3.1.1. This branch contains unreleased changes; no version bump or release is requested.
- Branch: `fix/reliable-engine-handoffs`; task id: `reliable-engine-handoffs`.
- Allowed changes: continuity implementation, tests, docs, generated adapters and this repository's AgentOS state.

## Current state

- Startup context now uses the same Git reconciliation and receipt freshness calculation as resume.
- Active checkpoint context is mandatory; incomplete checkpoints appear under Missing and fail `--require-complete`.
- Empty registered Brains produce explicit warnings in status, doctor and context.
- Generated instructions tell engines to checkpoint meaningful milestones before limits interrupt them, and reuse the same task id across engines.
- Previous handoff/tasks/status/memory/repo notes are preserved in `.agentos/runs/2026-11-03-before-continuity-refresh.md`.
- Local validation passed: 815 tests, 809 passed and 6 skipped; TypeScript check, smoke and package metadata checks passed.
- Three Brain records are registered; architecture remains proposed for review.
- A real cross-engine continuation trial and release approval remain outstanding. Bun package-manager compatibility was not run locally because Bun is unavailable; see PR CI.

## Next exact action

Review the draft change on `fix/reliable-engine-handoffs`, then run a real Claude Code → second-engine continuation trial using task id `reliable-engine-handoffs`. Inspect current files and re-run stale checks. Do not merge or publish as part of this task.

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.

## Open decisions

- Release version and merge remain separate from this implementation.
- Retrieval improvements, task-state consolidation and Obsidian layout changes remain follow-up work.

<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: reliable-engine-handoffs
- Record: `.agentos/checkpoints/reliable-engine-handoffs/2026-11-02T21-32-50-521Z-e13c1a39.json`
- Repos: agentos-for-projects fix/reliable-engine-handoffs@ed3accd (16 changed)
- Progress: Implemented startup reconciliation, empty-Brain warnings and milestone guidance; refreshed and registered project knowledge.
- Blockers: none
- Next: Review the draft change and run a real cross-engine continuation trial before merge or release.
- Receipts: observed-pass 1, observed-fail 0, claimed 1, not-run 3, unavailable 0
- Resume: `agentos resume --task reliable-engine-handoffs`
<!-- agentos:checkpoint:end -->
````

## .agentos/tasks.md

````markdown
# Tasks

## Now

- [ ] Review `fix/reliable-engine-handoffs` and run a real cross-engine continuation trial using task id `reliable-engine-handoffs`.

## Acceptance criteria

- Context and resume distinguish current passing checks from stale receipts after code or Git changes.
- Missing Git evidence never counts as current verification.
- A damaged checkpoint is visible to `context --require-complete`; read-only inspection changes no files.
- The active checkpoint is retained or context reports budget overflow.
- Empty Brains are visible and inspection does not initialize them.
- All engine bootloaders advise milestone checkpoints and consistent task ids.

## Next

- [ ] Decide merge and release only after review and the live continuation trial.

## Later

- [ ] Improve body-text retrieval and separate task identity from task description.
- [ ] Consolidate current task views around checkpoints.
- [ ] Make the default Obsidian layout expose the actual Brain records.
````
