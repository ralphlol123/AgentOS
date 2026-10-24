# Handoff

## Current objective

Deliver AgentOS v1 in seven slices (context builder, checkpoints, managed Project Brain, agent management, optional Obsidian, plus correctness/cleanup). Slices 1-3 are done; slices 1-2 are reviewed and pushed, slice 3 awaits review. Progress, decisions, evidence and the Improve Later backlog: `.agentos/plans/2026-10-25-v1-priorities.md`.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). Integration branch `main` = `3c03372` (0.9.0, npm latest 0.9.0).
- Slice 1: `feat/v1-cleanup` (`78638c0`), pushed, PR #46 open, not merged.
- Slice 2: `feat/v1-context` (`ca527fb`), stacked on `feat/v1-cleanup`, pushed, PR #47 open, not merged.
- Slice 3: `feat/v1-checkpoint`, stacked on `feat/v1-context`, committed locally, not pushed.
- Client workspaces (KargaX, Labahub) are rolled out manually by the owner and are out of scope for engine changes.

## Current state

- Slice 1 (see plan file, "Slice 1 — findings"): `prompt` uses `resolveObjective()` and refuses broken objective state like `status`/`doctor`; optional `task_scope: {read, edit}` (`src/task-scope.ts`); `doctor --fix` keeps `engines.allowed`; dead code removed; docs facts tested against source.
- Slice 2: new read-only `agentos context <engine> [--task] [--role] [--scope] [--budget] [--json] [--include-superseded]` in `src/context-builder.ts` (wiring `contextAgentOS` in `src/core.ts`). Mandatory objective/constraints/scope/role first and never truncated; optional records filtered by read scope and status, ranked by task-term overlap and freshness, cut at the budget with a reason per omission; conflicts and missing sources listed; `--json` bundle checked by `assertContextBundle`. `prompt` output is byte-identical to slice 1 (golden test). Docs: README "Task-specific context", `docs/context-builder.md`, CHANGELOG Unreleased.
- Slice 3: `agentos checkpoint` / `agentos resume` / `checkpoint --recover|list|show` in `src/checkpoint.ts` (wiring in `src/core.ts`). Immutable `agentos.checkpoint/1` records under `.agentos/checkpoints/<task>/`, `current.json` pointer, one bounded `## Checkpoint (managed)` block in this file; receipts `observed-pass | observed-fail | claimed | not-run | unavailable` with the state they tested; resume reports clean/drifted/unavailable, `incomplete` with evidence, or a read-only recovered view. `context` includes the current checkpoint; `doctor` fails on a broken pointer. Docs: README "Checkpoints and resume", `docs/checkpoints.md`, CHANGELOG Unreleased.
- Gates on `feat/v1-checkpoint`: check 0, test 664/664, smoke 0, `doctor --json` OK. The developer sandbox has no `bun` on PATH; gates ran as `npm run ...` (same scripts).
- Deprecated migration writers (0.10.0 removal) remain GATED: not scheduled, owner decision pending.
- Older history (0.8-0.9 release record, KargaX/Labahub rollout evidence): `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Known warnings / failures

- `doctor` still warns `engines.allowed does not list opencode` when an owner limits engines; informational only (backlog).
- Codex engine never tested on this host; nested OpenCode reads under `..` still fail (details in the history note).
- `agentos context` overhead constants are unmeasured assumptions; `.agentos/guide.md` does not list `context`, `checkpoint` or `resume` yet (backlog).
- Checkpoints: one writer per workspace, no crash-safe multi-file transaction, no evidence retention policy; `compact` demotes the checkpoint block until the next checkpoint (backlog in the plan file).

## Next exact action

1. Review slice 3 on `feat/v1-checkpoint`; Phynceon pushes after verification.
2. Slice 4: managed Project Brain.

## Protected files / do not touch

- `/home/app/**`, the Obsidian vault, Hermes config.
- Deprecated migration writers until the owner decides (see Open decisions).

## Open decisions

- 0.10.0 deletion of the legacy upgrade paths: owner decides after re-checking the npm download split; keep the read-only `migration` inventory.
- Whether to deprecate one name of each alias pair (`summary`/`full`, `minimal`/`detected`).
- Slice 2 assumptions to confirm in review: `--scope` semantics, default role, budget/overhead numbers (plan file, "Slice 2 — context builder").
- Slice 3 assumptions to confirm in review: default task id, content-addressed record ids, `.agentos/` excluded from the fingerprint, `not-run` from declared commands, no shell for `--check` (plan file, "Slice 3 — checkpoints and resume").
- Import and quarantine (`templates import`): frozen.
