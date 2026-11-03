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

- Task: reliable-engine-handoffs
- Record: `.agentos/checkpoints/reliable-engine-handoffs/2026-11-02T21-32-50-521Z-e13c1a39.json`
- Repos: agentos-for-projects fix/reliable-engine-handoffs@ed3accd (16 changed)
- Progress: Implemented startup reconciliation, empty-Brain warnings and milestone guidance; refreshed and registered project knowledge.
- Blockers: none
- Next: Review the draft change and run a real cross-engine continuation trial before merge or release.
- Receipts: observed-pass 1, observed-fail 0, claimed 1, not-run 3, unavailable 0
- Resume: `agentos resume --task reliable-engine-handoffs`
<!-- agentos:checkpoint:end -->
