# State before the context-next-action-precedence task

Archived verbatim before rewriting `.agentos/handoff.md` and `.agentos/tasks.md` for task `context-next-action-precedence` (branch `fix/context-next-action-precedence`). Taken at `46b7090` (main after PR #70 merged). The managed checkpoint block points at the `unify-current-task-state` record `2026-11-03T09-05-27-224Z-af1f3cdc`, which stays in `.agentos/checkpoints/unify-current-task-state/`.

## .agentos/handoff.md

````markdown
# Handoff

## Current objective

After `agentos checkpoint --task <id> --next "<action>"`, the next agent's startup path (`agentos status`, `agentos context <engine> --task <id>`, `agentos resume --task <id>`) presents exactly one current next action: the most recently saved one. Older or contradicting next-action text in handoff.md or tasks.md is shown as superseded, never as current. Nothing is silently deleted.

## Scope

- Repo: `agentos-for-projects`, single-repo workspace.
- Baseline: `a1286e9` on main (PR #69 merged), package 3.1.1. Unreleased changes; no version bump or release is requested.
- Branch: `feat/unify-current-task-state`; task id: `unify-current-task-state`.
- Allowed changes: checkpoint/context/status implementation, tests, docs and this repository's AgentOS state.

## Current state

- Phase 1 (context) committed in `a16062d`: a checkpoint that saves `--next` records `supersedes` digests of handoff.md § Current state and § Next exact action; `agentos context` labels prose still matching them `[superseded by checkpoint <id>]` and keeps it as history.
- Phase 2 (status) committed in `ecd8cfa` (RED test) and `91588a0` (implementation): `agentos status` prints one `Current next action (task <id>, checkpoint <id>): <next>` line from the newest valid checkpoint across tasks by `created_at` (`newestCheckpoint` in `src/checkpoint.ts`, used by `statusAgentOS` in `src/core.ts`). Read-only; incomplete checkpoints are skipped. CHANGELOG and docs/checkpoints.md updated.
- `resume` already shows only the checkpoint's Next.
- Verification at `91588a0` (local WSL, npm): `npm run check` clean; `npm test` 822/822. Bun commands not run (Bun not installed here).
- All commits are local on `feat/unify-current-task-state`; nothing pushed.
- Not covered yet:
  - tasks.md § Now is not reconciled: context never renders it, and child-repo `status` lists its open items as current.
  - When prose is edited after the checkpoint, context shows both next actions unlabelled.
  - Records written before `supersedes` existed mark nothing.
- Carried over from `reliable-engine-handoffs`: the Claude Code interruption trial is still pending and gates release (not merge).
- Previous state: `.agentos/runs/2026-11-03-before-status-next-action.md` (and, before that, `.agentos/runs/2026-11-03-before-unify-current-task-state.md`).

## Next exact action

Reconcile tasks.md § Now with the active checkpoint: in child-repo `status` ("Open tasks (Now)") and in `context`, mark § Now items written before the checkpoint as superseded, with a failing-then-passing test in `test/handoff-continuity.test.js`.

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.

## Open decisions

- Release version and merge remain separate from this implementation.
- `status` has no `--task`: implemented as the newest valid checkpoint by `created_at` (equal to the pointer's `updated_at`), naming its task; owner may still prefer a `--task` flag.
- Retrieval improvements and Obsidian layout changes remain follow-up work.

<!-- agentos:checkpoint:start -->
## Checkpoint (managed)

- Task: unify-current-task-state
- Record: `.agentos/checkpoints/unify-current-task-state/2026-11-03T09-05-27-224Z-af1f3cdc.json`
- Repos: agentos-for-projects feat/unify-current-task-state@a16062d (0 changed)
- Progress: Phase 1 (context): a checkpoint that saves --next records supersedes digests of handoff.md § Current state and § Next exact action; agentos context marks prose still matching as [superseded by checkpoint <id>] and keeps it as history. RED then GREEN in test/handoff-continuity.test.js (3 new tests).…
- Blockers: none
- Next: In src/core.ts statusAgentOS, print one 'Current next action' line from the newest .agentos/checkpoints/*/current.json record (by updated_at: task id, checkpoint id, its Next), and add a test in test/handoff-continuity.test.js that status shows that Next exactly once after a checkpoint while handof…
- Receipts: observed-pass 2, observed-fail 0, claimed 0, not-run 3, unavailable 0
- Resume: `agentos resume --task unify-current-task-state`
<!-- agentos:checkpoint:end -->
````

## .agentos/tasks.md

````markdown
# Tasks

## Now

- [ ] tasks.md § Now: mark items written before the checkpoint as superseded in `context` and in child-repo `status` ("Open tasks (Now)") (task id `unify-current-task-state`).

## Acceptance criteria

- After `agentos checkpoint --task <id> --next "<action>"`, `agentos status`, `agentos context <engine> --task <id>` and `agentos resume --task <id>` present exactly one current next action: the most recently saved one.
- Older or contradicting next-action text in handoff.md or tasks.md is not presented as current; the next agent can tell it is superseded.
- Nothing is silently deleted.

## Next

- [ ] Prose edited after the checkpoint: mark the checkpoint's Next as older in `context` instead of showing two unlabelled next actions.
- [ ] Release only after the Claude Code interruption trial (carried over from `reliable-engine-handoffs`).

## Later

- [ ] Improve body-text retrieval and separate task identity from task description.
- [ ] Make the default Obsidian layout expose the actual Brain records.
````
