# Handoff

## Current objective

AgentOS 1.1 — make 1.0 dependable for everyday development (Ralph, 2026-10-25). Three sequential slices: (1) synced-config freshness detection — accepted; (2) safe agent re-sync — accepted; (3) complete generated workflow guidance — implemented, awaiting review; then a Claude + Codex validation run by Phynceon.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). `main` = `99553dc` (release 1.0.0, npm latest 1.0.0).
- Slices 1–2: `feat/1.1-sync-freshness` = `4faca16`, `feat/1.1-safe-resync` = `973029f`, accepted.
- Slice 3: `feat/1.1-workflow-guidance`, stacked on `973029f`, one local commit, not pushed. No version bump.
- Client workspaces (KargaX, Labahub, laundry-pos) are rolled out by the owner and are out of scope.

## Current state

- Slice 3: `guideMd()` in `src/core.ts` now names the everyday loop, one line per job: `status` → `context <engine> --task "<task>" --role <id>`; owner sets `task_scope` when the edit scope is none (engines do not edit `project.yaml`); `checkpoint --task <id> --progress … --next … --check "<cmd>"` before stopping/switching, `resume --task <id>` to continue, `checkpoint --recover` when none was written, preferred over `run handoff` (prose note only, no receipts); `brain propose` (owner runs `brain preview`/`brain apply`); `agents sync <engine> --role <id> --dry-run` and re-running the command `doctor` prints on `Synced config: STALE`. Existing items and the Rules section kept; the root pointer line and `STATE_RULE_LINE` are unchanged, so root adapters did not change.
- Guide size: 3,333 → 4,601 bytes (budget 4,608, test-enforced).
- Tests: `test/workflow-guidance.test.js` (4 tests; RED on `973029f`: loop coverage and 1.0.0-guide staleness fail, allowlist and budget pass); fixture `test/fixtures/guide-1.0.0.md` (the 1.0.0 = `973029f` guide). `test/engine-discovery.test.js` drift test also accepts flags documented in `agentos brain` usage.
- Docs: README "v1 workflow", `docs/migration.md` (1.1: `doctor --fix` for the new guide; set `task_scope`), CHANGELOG `[Unreleased]`, `docs/improve-later.md` (guide item closed). This repo's `.agentos/guide.md` regenerated with `doctor --fix`.
- History: slice 2 handoff/tasks `.agentos/runs/2026-10-26-1.1-slice2-handoff.md`; slice 1 `.agentos/runs/2026-10-26-1.1-slice1-handoff.md`; v1 release state `.agentos/runs/2026-10-26-v1-release-state.md`.

## Known warnings / failures

- Every existing workspace's guide is stale until its owner runs `agentos doctor --fix` with a 1.1 build.
- `agentos context` reports a missing `task_scope` only as `Edit scope: (none…)` / `Source: (default: no task_scope declared)` in text output; the warning line is in `--json` only.
- One sync record per engine (last synced role wins); `agentos status` does not show synced-config freshness (doctor does).
- `doctor` diagnostics list this repo's three legacy agent cards (developer, tester, release-manager).

## Next exact action

1. Phynceon: review slice 3 on `feat/1.1-workflow-guidance`; push/PR on approval.
2. Then the Claude + Codex validation run using only the guide.

## Protected files / do not touch

- `/home/app/**`, the Obsidian vault, Hermes config.
- Deprecated migration writers until the owner decides.

## Open decisions

- Removal of the deprecated legacy upgrade paths: retargeted to 2.0.0; owner decides.
- This repo's three non-matching legacy cards (developer, tester, release-manager): `agents manifest <id> --custom` or `agents add <id> --replace`.
- Alias/overlap consolidation candidates (`docs/migration.md`, keep / simplify / remove inventory).
- Import and quarantine (`templates import`): frozen.
