# Handoff

## Current objective

Deliver AgentOS v1 in seven slices (context builder, checkpoints, managed Project Brain, agent management, optional Obsidian, plus correctness/cleanup). Slices 1-6 are done; slices 1-5 are reviewed and pushed, slice 6 awaits review. Progress, decisions, evidence and the Improve Later backlog: `.agentos/plans/2026-10-25-v1-priorities.md`.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). Integration branch `main` = `3c03372` (0.9.0, npm latest 0.9.0).
- Slice 1: `feat/v1-cleanup` (`78638c0`), pushed, PR #46 open, not merged.
- Slice 2: `feat/v1-context` (`ca527fb`), stacked on `feat/v1-cleanup`, pushed, PR #47 open, not merged.
- Slice 3: `feat/v1-checkpoint` (`2e3374b`), stacked on `feat/v1-context`, pushed, PR #48 open, not merged.
- Slice 4: `feat/v1-brain` (`bfd97d8`), stacked on `feat/v1-checkpoint`, pushed, PR #49 open, not merged.
- Slice 5: `feat/v1-agents` (`19a7806`), stacked on `feat/v1-brain`, pushed, PR #50 open, not merged.
- Slice 6: `feat/v1-obsidian`, stacked on `feat/v1-agents`, committed locally, not pushed.
- Client workspaces (KargaX, Labahub) are rolled out manually by the owner and are out of scope for engine changes.

## Current state

- Slice 1 (see plan file, "Slice 1 — findings"): `prompt` uses `resolveObjective()` and refuses broken objective state like `status`/`doctor`; optional `task_scope: {read, edit}` (`src/task-scope.ts`); `doctor --fix` keeps `engines.allowed`; dead code removed; docs facts tested against source.
- Slice 2: new read-only `agentos context <engine> [--task] [--role] [--scope] [--budget] [--json] [--include-superseded]` in `src/context-builder.ts` (wiring `contextAgentOS` in `src/core.ts`). Mandatory objective/constraints/scope/role first and never truncated; optional records filtered by read scope and status, ranked by task-term overlap and freshness, cut at the budget with a reason per omission; conflicts and missing sources listed; `--json` bundle checked by `assertContextBundle`. `prompt` output is byte-identical to slice 1 (golden test). Docs: README "Task-specific context", `docs/context-builder.md`, CHANGELOG Unreleased.
- Slice 3: `agentos checkpoint` / `agentos resume` / `checkpoint --recover|list|show` in `src/checkpoint.ts` (wiring in `src/core.ts`). Immutable `agentos.checkpoint/1` records under `.agentos/checkpoints/<task>/`, `current.json` pointer, one bounded `## Checkpoint (managed)` block in this file; receipts `observed-pass | observed-fail | claimed | not-run | unavailable` with the state they tested; resume reports clean/drifted/unavailable, `incomplete` with evidence, or a read-only recovered view. `context` includes the current checkpoint; `doctor` fails on a broken pointer. Docs: README "Checkpoints and resume", `docs/checkpoints.md`, CHANGELOG Unreleased.
- Slice 4: `agentos brain init|register|list|show|search|propose|preview|validate|apply|check|verify` in `src/brain.ts` (wiring `brainAgentOS` in `src/core.ts`). Records = project Markdown files with validated frontmatter (`id: brain:<slug>`, kind, scope, status, sources, `source_hash` of the body); derived `.agentos/brain/index.json`; proposals under `.agentos/brain/proposals/` (applied ones kept in `applied/`); stale/duplicate/identity/scope/schema/reference checks with zero writes on rejection; `context` lists records by reference; `doctor` warns on changed, fails on invalid records. Docs: README "Project Brain", `docs/brain.md`, CHANGELOG Unreleased.
- Slice 5: agent manifests in card frontmatter (`src/agents.ts`: `validateAgentManifest`, `parseAgentCard`, `effectiveEditScope`), lifecycle `agents add|show|enable|disable|remove|manifest`, engine adapter contract + capability matrix (`src/engines.ts`, `agentos engines`), `context` ADVISORY line and `--require-enforcement`, `agents sync claude-code|codex` as the only writer of engine-native files. No matrix row is `verified` (no engine trial in this sandbox). Docs: README "Agents" + "Engines", `docs/agents.md`, `docs/engines.md`, CHANGELOG Unreleased.
- Slice 6: optional Obsidian as a second location for the same Brain. `agentos obsidian init` (plain `knowledge/` folder + `index.md` with relative links, `knowledge.obsidian` added keys-only), `agentos obsidian link --vault --dest [--canonical workspace|vault] [--create]` (creates only `<dest>/` and its index note), `knowledge.obsidian.canonical`, vault records with vault-relative `sources` (absolute vault path only in `project.yaml`), boundary = `<vault>/<dest>` only, `unavailable` records + `context` Missing + `--require-complete` + doctor warning, missing-index warning. F2: `init`/`doctor --fix`/`templates copy agent:<id>` write catalog cards with manifests. This repo: `reviewer` got its manifest (byte-matched catalog); `developer`, `tester`, `release-manager` differ from the catalog and stay legacy (owner decides `--custom` vs `agents add --replace`). Docs: README "Obsidian (optional)", `docs/obsidian.md`, `docs/agents.md`, CHANGELOG Unreleased.
- Gates on `feat/v1-obsidian`: check 0, test 699/699, smoke 0, `doctor --json` OK. The developer sandbox has no `bun` on PATH; gates ran as `npm run ...` (same scripts).
- Deprecated migration writers (0.10.0 removal) remain GATED: not scheduled, owner decision pending.
- Older history (0.8-0.9 release record, KargaX/Labahub rollout evidence): `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Known warnings / failures

- `doctor` still warns `engines.allowed does not list opencode` when an owner limits engines; informational only (backlog).
- Codex engine never tested on this host; nested OpenCode reads under `..` still fail (details in the history note).
- `agentos context` overhead constants are unmeasured assumptions; `.agentos/guide.md` does not list `context`, `checkpoint` or `resume` yet (backlog).
- Checkpoints: one writer per workspace, no crash-safe multi-file transaction, no evidence retention policy; `compact` demotes the checkpoint block until the next checkpoint (backlog in the plan file).
- Brain: single writer, exact-text dedup only, no semantic search, no vault ingestion, every read walks the workspace; `.agentos/guide.md` does not list `brain` (backlog in the plan file).
- Obsidian: no sync and no vault-wide ingestion by design; the index note is written once (no refresh); details in `docs/obsidian.md` and the plan backlog.
- Engines: native enforcement is unverified for Claude Code and Codex until Phynceon's cross-engine trial (`docs/engines.md` lists the commands); existing legacy agent cards are not upgraded automatically.

## Next exact action

1. Review slice 6 on `feat/v1-obsidian`; Phynceon pushes after verification.
2. Slice 7: v1 end-to-end validation.

## Protected files / do not touch

- `/home/app/**`, the Obsidian vault, Hermes config.
- Deprecated migration writers until the owner decides (see Open decisions).

## Open decisions

- 0.10.0 deletion of the legacy upgrade paths: owner decides after re-checking the npm download split; keep the read-only `migration` inventory.
- Whether to deprecate one name of each alias pair (`summary`/`full`, `minimal`/`detected`).
- Slice 2 assumptions to confirm in review: `--scope` semantics, default role, budget/overhead numbers (plan file, "Slice 2 — context builder").
- Slice 3 assumptions to confirm in review: default task id, content-addressed record ids, `.agentos/` excluded from the fingerprint, `not-run` from declared commands, no shell for `--check` (plan file, "Slice 3 — checkpoints and resume").
- Slice 4 assumptions to confirm in review: workspace walk instead of a registry, body-only `source_hash`, the four descriptive frontmatter keys, register default `accepted`, stale also on a human edit, by-reference rendering in context (plan file, "Slice 4 — managed Project Brain").
- Slice 5 assumptions to confirm in review: optional `edit_request` key, catalog `permission_intent` defaults, `--replace` backup under `runs/replaced-agents/`, refusing to disable the last agent, Brain tag references, sync conflict rules (plan file, "Slice 5").
- Slice 6 assumptions to confirm in review: config key `destination` (with `dest` alias), `link-obsidian` left unchanged, `canonical` scoped to the linked folder, unavailable list from `index.json`, `brain check` exit 0 on unavailable, `--require-complete` flag name, index note written once (plan file, "Slice 6").
- This repo's three non-matching legacy cards (developer, tester, release-manager): `agents manifest <id> --custom` or `agents add <id> --replace`.
- Import and quarantine (`templates import`): frozen.
