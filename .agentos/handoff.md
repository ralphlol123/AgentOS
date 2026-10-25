# Handoff

## Current objective

AgentOS v1 is complete pending owner review: seven stacked slices (correctness/cleanup, context builder, checkpoints, managed Project Brain, agent manifests + engine matrix, optional Obsidian, trial defects + docs). Plan, decisions, evidence and completion statement: `.agentos/plans/2026-10-25-v1-priorities.md`. Acceptance: `docs/acceptance-matrix.md`.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). Integration branch `main` = `3c03372` (0.9.0, npm latest 0.9.0).
- Stack: `feat/v1-cleanup` (#46) → `feat/v1-context` (#47) → `feat/v1-checkpoint` (#48) → `feat/v1-brain` (#49) → `feat/v1-agents` (#50) → `feat/v1-obsidian` (`d3010d9`, #51) → `feat/v1-final` (slice 7, local commits, not pushed). None merged.
- Client workspaces (KargaX, Labahub) are rolled out manually by the owner and are out of scope.

## Current state

- Slice 7 on `feat/v1-final`: trial defects fixed — D1 `agents sync claude-code` writes deny rules (repo/read paths outside the edit scope; `/**` for read-only roles) and prints the trust note; D2 checkpoint/resume use the enclosing work tree for child directories (`state: enclosing-worktree`); D3 `checkpoint` ignores a bare `.`. Matrix rows from Phynceon's trial (`docs/evidence/2026-10-25-cross-engine/`): claude-code `permission_enforcement` + `tool_restrictions` verified, codex `permission_enforcement` verified (launch-time sandbox only), `native_agent_config` unverified for both.
- Docs: README "v1 workflow" + "Documentation"; `docs/engines.md` (final matrix, what the trial did not prove), `docs/migration.md`, `docs/acceptance-matrix.md` (24 PASS, 0 FAIL, 2 BLOCKED), `docs/improve-later.md`; CHANGELOG `[Unreleased]` v1 entry (no version bump).
- Gates on `feat/v1-final`: see the plan file, "Slice 7 — acceptance evidence". The developer sandbox has no `bun` on PATH; gates ran as `npm run ...` (same scripts).
- Deprecated migration writers (0.10.0 removal) remain GATED: not scheduled, owner decision pending.
- History: slice 1–6 handoff `.agentos/runs/2026-10-25-v1-slice6-handoff.md`; older (0.8–0.9, rollouts) `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Known warnings / failures

- BLOCKED (host engine trial needed): engine-native agent config consumption (`.claude/agents/<id>.md`, Codex role block); Claude Code deny rules exactly as the fixed sync writes them (acceptance matrix S19, S20).
- Engine evidence is n=1 per cell; enforcement is conditional (Claude Code: deny rules + trusted workspace; Codex: launch-time `--sandbox read-only`, no per-path scope). `context --require-enforcement` exits 1 for every engine.
- `doctor` diagnostics list this repo's three legacy agent cards (developer, tester, release-manager).
- Refinements (no defects): `docs/improve-later.md`.

## Next exact action

1. Owner/Phynceon: review `feat/v1-final`, push it and open its PR stacked on #51.
2. Owner: merge PRs #46–#51 and the final PR in order; decide version and release.
3. Optional host trial for the two BLOCKED rows (`docs/engines.md`, "Repeating the trial").

## Protected files / do not touch

- `/home/app/**`, the Obsidian vault, Hermes config.
- Deprecated migration writers until the owner decides (see Open decisions).

## Open decisions

- 0.10.0 deletion of the legacy upgrade paths: owner decides after re-checking the npm download split; keep the read-only `migration` inventory.
- Version number and release timing for v1.
- This repo's three non-matching legacy cards (developer, tester, release-manager): `agents manifest <id> --custom` or `agents add <id> --replace`.
- Alias/overlap consolidation candidates (`docs/migration.md`, keep / simplify / remove inventory).
- Slice 2–6 review assumptions are recorded per slice in the plan file.
- Import and quarantine (`templates import`): frozen.
