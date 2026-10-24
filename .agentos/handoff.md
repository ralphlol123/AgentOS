# Handoff

## Current objective

Deliver AgentOS v1 in seven slices (context builder, checkpoints, managed Project Brain, agent management, optional Obsidian, plus correctness/cleanup). Slice 1 (cleanup + foundation) is done on branch `feat/v1-cleanup` and awaits review. Progress, findings, evidence and the Improve Later backlog: `.agentos/plans/2026-10-25-v1-priorities.md`.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). Integration branch `main` = `3c03372` (0.9.0, npm latest 0.9.0). Work branch `feat/v1-cleanup`, not pushed.
- Client workspaces (KargaX, Labahub) are rolled out manually by the owner and are out of scope for engine changes.

## Current state

- Slice 1 changed: `prompt` uses `resolveObjective()` and refuses (exit 1, diagnostic, no prompt) on missing/empty/duplicate objectives, matching `status`/`doctor`; optional `task_scope: {read, edit}` (`src/task-scope.ts`) separates read from edit scope and `repos:` is inventory only; `doctor --fix` no longer adds `opencode` to `engines.allowed`; dead helpers removed and `noUnusedLocals`/`noUnusedParameters` enabled; docs facts (version, command surface) tested against source.
- Gates on the slice branch: check 0, test 631/631, smoke 0, `doctor --json` OK. The Hermes host has no `bun`; gates ran as `npm run ...` (same scripts).
- Deprecated migration writers (0.10.0 removal) remain GATED: not scheduled, owner decision pending.
- History before this rewrite (0.8-0.9 release record, KargaX/Labahub rollout evidence, known warnings): `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Known warnings / failures

- `doctor` still warns `engines.allowed does not list opencode` when an owner limits engines; informational only (backlog).
- Codex engine never tested on this host; nested OpenCode reads under `..` still fail (details in the history note).

## Next exact action

1. Review slice 1 on `feat/v1-cleanup`; Phynceon pushes after verification.
2. Slice 2: context builder, built on `resolveObjective()` and `validateTaskScope()`.

## Open decisions

- 0.10.0 deletion of the legacy upgrade paths: owner decides after re-checking the npm download split; keep the read-only `migration` inventory.
- Whether to deprecate one name of each alias pair (`summary`/`full`, `minimal`/`detected`).
- Import and quarantine (`templates import`): frozen.
