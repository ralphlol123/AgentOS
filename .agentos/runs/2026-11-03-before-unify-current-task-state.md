# State before the unify-current-task-state task

Archived verbatim before rewriting `.agentos/handoff.md` and `.agentos/tasks.md` for task `unify-current-task-state` (branch `feat/unify-current-task-state`). Taken at `a1286e9` (main after PR #69 merged). The reliable-engine-handoffs claims below describe that revision; the managed checkpoint block points at the Codex record `2026-11-02T21-32-50-521Z-e13c1a39`, which stays in `.agentos/checkpoints/reliable-engine-handoffs/`.

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
- Generated instructions tell engines to checkpoint meaningful milestones before limits interrupt them, and reuse the same task id across engines. Child repo pointers now carry the same advice in their CLI-first lines.
- PR #69 review fixes: `context` validates `handoff.exclude_paths` only when a checkpoint loads; the task-id test requires the new "same task id" wording.
- **Codex → Hermes continuation trial: passed (2026-11-03).** Hermes continued from Codex checkpoint `2026-11-02T21-32-50-521Z-e13c1a39` in a fresh clone using repo artifacts only, recovered the goal, state and next step, found the checkpoint drifted because it was taken before the commits, re-ran the checks and saved a clean checkpoint `2026-11-03T07-27-42-525Z-18dc50c7`. Record and verbatim reconstruction: `.agentos/runs/2026-11-03-codex-to-hermes-continuation-trial.md`.
- **Claude Code interruption trial: pending; gates release (not merge).** Claude Code is interrupted mid-task, then another engine continues with the same task id.
- Test results, by revision and environment:
  - `b62f37f`, GitHub CI run #164: Linux on Node 20/22/24/26 and macOS on Node 24 ran 815/815; Windows on Node 24 passed 803 with 12 skipped; the npm/pnpm/Bun packaged job passed.
  - `b62f37f`, local WSL on Node 26 (npm): 815/815, plus `check`, `smoke` and `test:metadata`.
  - `e119e9f` (last code commit; later commits change only docs and AgentOS state), local WSL on Node 26 (npm): 818/818, plus `check`, `smoke` and `test:metadata`.
  - CI for the new head: pending until the branch is pushed.
  - Not run locally: Bun and pnpm (not installed).
- Drift is expected: any later commit, including a commit of the checkpoint itself, makes a saved checkpoint show as drifted. That is not a failure, and a committed checkpoint does not stay current. The next engine runs `agentos resume --task reliable-engine-handoffs`, inspects current files, re-runs the stale checks and saves a new checkpoint.
- Previous state is preserved in `.agentos/runs/2026-11-03-before-continuity-refresh.md` and `.agentos/runs/2026-11-03-before-pr69-review-fixes.md`.
- Three Brain records are registered; architecture remains proposed for review. A proposal adding the drift guidance to `brain:engine-handoff` awaits owner review.

## Next exact action

Merge decision: Ralph. Release only after the Claude Code interruption trial. Do not merge or publish as part of this task.

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

- [ ] Confirm CI on the new head of `fix/reliable-engine-handoffs` (PR #69) after the review fixes are pushed. The Codex → Hermes continuation trial passed (2026-11-03).

## Acceptance criteria

- Context and resume distinguish current passing checks from stale receipts after code or Git changes.
- Missing Git evidence never counts as current verification.
- A damaged checkpoint is visible to `context --require-complete`; read-only inspection changes no files.
- The active checkpoint is retained or context reports budget overflow.
- Empty Brains are visible and inspection does not initialize them.
- All engine bootloaders advise milestone checkpoints and consistent task ids.

## Next

- [ ] Merge decision: Ralph. Release only after the Claude Code interruption trial (Claude Code interrupted mid-task, another engine continues with task id `reliable-engine-handoffs`).

## Later

- [ ] Improve body-text retrieval and separate task identity from task description.
- [ ] Consolidate current task views around checkpoints.
- [ ] Make the default Obsidian layout expose the actual Brain records.
````
