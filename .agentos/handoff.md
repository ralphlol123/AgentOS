# Handoff

## Current objective

Deliver AgentOS v1 in seven slices (context builder, checkpoints, managed Project Brain, agent management, optional Obsidian, plus correctness/cleanup). Slices 1 and 2 are done; slice 2 awaits review. Progress, decisions, evidence and the Improve Later backlog: `.agentos/plans/2026-10-25-v1-priorities.md`.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). Integration branch `main` = `3c03372` (0.9.0, npm latest 0.9.0).
- Slice 1: `feat/v1-cleanup` (`78638c0`), pushed, PR #46 open, not merged.
- Slice 2: `feat/v1-context`, stacked on `feat/v1-cleanup`, not pushed.
- Client workspaces (KargaX, Labahub) are rolled out manually by the owner and are out of scope for engine changes.

## Current state

- Slice 1 (see plan file, "Slice 1 — findings"): `prompt` uses `resolveObjective()` and refuses broken objective state like `status`/`doctor`; optional `task_scope: {read, edit}` (`src/task-scope.ts`); `doctor --fix` keeps `engines.allowed`; dead code removed; docs facts tested against source.
- Slice 2: new read-only `agentos context <engine> [--task] [--role] [--scope] [--budget] [--json] [--include-superseded]` in `src/context-builder.ts` (wiring `contextAgentOS` in `src/core.ts`). Mandatory objective/constraints/scope/role first and never truncated; optional records filtered by read scope and status, ranked by task-term overlap and freshness, cut at the budget with a reason per omission; conflicts and missing sources listed; `--json` bundle checked by `assertContextBundle`. `prompt` output is byte-identical to slice 1 (golden test). Docs: README "Task-specific context", `docs/context-builder.md`, CHANGELOG Unreleased.
- Gates on `feat/v1-context`: check 0, test 647/647, smoke 0, `doctor --json` OK. The developer sandbox has no `bun` on PATH; gates ran as `npm run ...` (same scripts).
- Deprecated migration writers (0.10.0 removal) remain GATED: not scheduled, owner decision pending.
- Older history (0.8-0.9 release record, KargaX/Labahub rollout evidence): `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Known warnings / failures

- `doctor` still warns `engines.allowed does not list opencode` when an owner limits engines; informational only (backlog).
- Codex engine never tested on this host; nested OpenCode reads under `..` still fail (details in the history note).
- `agentos context` overhead constants are unmeasured assumptions; `.agentos/guide.md` does not list `context` yet (backlog).

## Next exact action

1. Review slice 2 on `feat/v1-context`; Phynceon pushes after verification.
2. Slice 3: checkpoints.

## Protected files / do not touch

- `/home/app/**`, the Obsidian vault, Hermes config.
- Deprecated migration writers until the owner decides (see Open decisions).

## Open decisions

- 0.10.0 deletion of the legacy upgrade paths: owner decides after re-checking the npm download split; keep the read-only `migration` inventory.
- Whether to deprecate one name of each alias pair (`summary`/`full`, `minimal`/`detected`).
- Slice 2 assumptions to confirm in review: `--scope` semantics, default role, budget/overhead numbers (plan file, "Slice 2 — context builder").
- Import and quarantine (`templates import`): frozen.
