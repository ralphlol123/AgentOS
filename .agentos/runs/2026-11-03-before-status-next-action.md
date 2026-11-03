# State before the status next-action step (unify-current-task-state)

Archived verbatim on 2026-11-03 before rewriting handoff.md and tasks.md after commit 91588a0. Source: working tree at a16062d plus the managed block written by checkpoint 2026-11-03T09-05-27-224Z-af1f3cdc.

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

- Phase 1 (context) is done and committed locally; not pushed. A checkpoint that saves `--next` records `supersedes`: sha256 digests of handoff.md § Current state and § Next exact action at save time, excluding the managed block. `agentos context` marks each section whose text still matches as `[superseded by checkpoint <id>]` and keeps its text as history. The checkpoint's Next is the one current next action. Code: `src/checkpoint.ts` (`proseDigests`, `supersededProse`), `src/context-sections.ts` (`HANDOFF_PROSE`, `handoffProse`), `src/context-builder.ts`.
- Tests: 3 new in `test/handoff-continuity.test.js`: the 2026-11-03 contradiction; prose edited after the checkpoint and recovered checkpoints are not marked; prose directly above the managed block. Local WSL, Node 26, npm: `npm run check` clean, `npm test` 821/821.
- `resume` already shows only the checkpoint's Next.
- Not covered yet:
  - `agentos status` shows no next action.
  - tasks.md § Now is not reconciled: context never renders it, and child-repo `status` lists its open items as current.
  - When prose is edited after the checkpoint, context shows both next actions unlabelled.
  - Records written before `supersedes` existed mark nothing.
- Carried over from `reliable-engine-handoffs`: the Claude Code interruption trial is still pending and gates release (not merge).
- Previous state: `.agentos/runs/2026-11-03-before-unify-current-task-state.md`.

## Next exact action

Add the current next action to `agentos status` (`statusAgentOS` in `src/core.ts`), taken from the newest checkpoint record, with a test in `test/handoff-continuity.test.js`.

## Protected files / do not touch

- Secrets, .env files, migrations and production config.
- `.github/workflows/`, client workspaces, external Obsidian vaults and Hermes configuration.

## Open decisions

- Release version and merge remain separate from this implementation.
- `status` has no `--task`: proposed to use the newest `.agentos/checkpoints/*/current.json` by `updated_at` and name its task; owner may prefer `--task`.
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

- [ ] Add the current next action to `agentos status` (`statusAgentOS` in `src/core.ts`), taken from the newest checkpoint record (task id `unify-current-task-state`).

## Acceptance criteria

- After `agentos checkpoint --task <id> --next "<action>"`, `agentos status`, `agentos context <engine> --task <id>` and `agentos resume --task <id>` present exactly one current next action: the most recently saved one.
- Older or contradicting next-action text in handoff.md or tasks.md is not presented as current; the next agent can tell it is superseded.
- Nothing is silently deleted.

## Next

- [ ] tasks.md § Now: mark items written before the checkpoint as superseded in `context` and in child-repo `status` ("Open tasks (Now)").
- [ ] Prose edited after the checkpoint: mark the checkpoint's Next as older in `context` instead of showing two unlabelled next actions.
- [ ] Release only after the Claude Code interruption trial (carried over from `reliable-engine-handoffs`).

## Later

- [ ] Improve body-text retrieval and separate task identity from task description.
- [ ] Make the default Obsidian layout expose the actual Brain records.
````
