# Handoff

## Current objective

AgentOS v1 is complete pending owner review: seven stacked slices (correctness/cleanup, context builder, checkpoints, managed Project Brain, agent manifests + engine matrix, optional Obsidian, trial defects + docs). Plan, decisions, evidence and completion statement: `.agentos/plans/2026-10-25-v1-priorities.md`. Acceptance: `docs/acceptance-matrix.md`.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). Integration branch `main` = `3c03372` (0.9.0, npm latest 0.9.0).
- Stack: `feat/v1-cleanup` (#46) → `feat/v1-context` (#47) → `feat/v1-checkpoint` (#48) → `feat/v1-brain` (#49) → `feat/v1-agents` (#50) → `feat/v1-obsidian` (`d3010d9`, #51) → `feat/v1-final` (slice 7, local commits, not pushed). None merged.
- Client workspaces (KargaX, Labahub) are rolled out manually by the owner and are out of scope.

## Current state

- Closure 2 on `fix/v1-claude-deny-siblings` (new local commits on `71cdb19`, not pushed): `Edit/Write(/*)` removed (Claude Code matches `/*` recursively, host re-trial T6b); `tools_requested` rendered as the Claude subagent `tools:` (read-only default `Read, Grep, Glob`); re-trials T6–T8 copied to `docs/evidence/2026-10-25-cross-engine/closure/` and reflected in the matrix and docs. Plan file, "Closure 2" section.
- Closure (`71cdb19`, pushed): `agents sync claude-code` enumerates sibling denies (everything outside the edit scope; `.agentos/` state stays writable, `project.yaml`/`agents/**` denied); `context claude-code --require-enforcement` checks the synced deny set by hash (OK/STALE/UNSUPPORTED). Settings synced by `71cdb19` are STALE (contain `/*`).
- Slice 7 on `feat/v1-final` (pushed, PR #52): trial defects fixed — D1 `agents sync claude-code` writes deny rules (repo/read paths outside the edit scope; `/**` for read-only roles) and prints the trust note; D2 checkpoint/resume use the enclosing work tree for child directories (`state: enclosing-worktree`); D3 `checkpoint` ignores a bare `.`. Matrix rows from Phynceon's trial (`docs/evidence/2026-10-25-cross-engine/`): claude-code `permission_enforcement` + `tool_restrictions` verified, codex `permission_enforcement` verified (launch-time sandbox only), `native_agent_config` now verified for both after T5/T7/T8 (instruction-following).
- Docs: README "v1 workflow" + "Documentation"; `docs/engines.md` (final matrix, what the trial did not prove), `docs/migration.md`, `docs/acceptance-matrix.md` (27 PASS, 0 FAIL, 0 BLOCKED after closure 2), `docs/improve-later.md`; CHANGELOG `[Unreleased]` v1 entry (no version bump).
- Gates on `feat/v1-final`: see the plan file, "Slice 7 — acceptance evidence". The developer sandbox has no `bun` on PATH; gates ran as `npm run ...` (same scripts).
- Deprecated migration writers (0.10.0 removal) remain GATED: not scheduled, owner decision pending.
- History: slice 1–6 handoff `.agentos/runs/2026-10-25-v1-slice6-handoff.md`; older (0.8–0.9, rollouts) `.agentos/runs/2026-10-25-v1-slice1-history.md`.

## Known warnings / failures

- No BLOCKED rows. Untested: whether a Claude subagent honours the rendered `tools:` (optional host re-trial).
- Engine evidence is n=1 per probe (T7 n=2 + controls); enforcement is conditional (Claude Code: deny rules + trusted workspace, listed paths + siblings + Bash redirect to denied paths + read-only deny-all verified; residual advisory: new root files/dirs after sync, `.agentos/` state, other shell writes; Codex: launch-time `--sandbox read-only`, no per-path scope). `context --require-enforcement` exits 1 for every engine except claude-code with a current synced deny set.
- `doctor` diagnostics list this repo's three legacy agent cards (developer, tester, release-manager).
- Refinements (no defects): `docs/improve-later.md`.

## Next exact action

1. Phynceon: review and push the closure-2 commits on `fix/v1-claude-deny-siblings` (stacked on `feat/v1-final` = `856b61f`, PR #52).
2. Optional: host re-trial of T8 with a rendered `tools:` list.
3. Owner: merge PRs #46–#52 and the closure branch in order; decide version and release.

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
