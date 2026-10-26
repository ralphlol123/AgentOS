# Handoff

## Current objective

Project Brain goal (Ralph, approved 2026-10-26; `briefs/AgentOS-Project-Brain-Goal-2026-10-26.md`). The Brain works without Obsidian, and Obsidian is an optional second location. The implementation is ready. The validation rows that only the owner or Phynceon can run are still pending.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). `main` = `7bcca0e` (1.1.0, npm latest 1.1.0). No version bump on this branch.
- Branch `feat/project-brain`, draft PR https://github.com/ralphlol123/AgentOS/pull/57. `385c53a` is pushed. The rest is local: the CI workflow commit and the card-6 commits (D5, guide refresh, migration guide, SHA fixes, CHANGELOG, this state, final checks). Keep the CI workflow commit last when pushing; Phynceon reorders.
- Client workspaces are rolled out by the owner and are out of scope.

## Current state

- Slices 1–5 and trial defects D1–D5 are implemented and tested. Plan and design: `.agentos/plans/project-brain.md`. Matrix: `docs/project-brain-acceptance.md` (16 PASS, 3 BLOCKED, 1 partial, 0 FAIL), with "Owner actions remaining" and "Final checks". Trials: `docs/evidence/project-brain-trials.md`.
- D5: with no `task_scope`, `context` prints `Edit scope: not set (no task_scope in .agentos/project.yaml). Edit only the files the owner's task names; ask the owner to set task_scope.` The guide also names `<command> --help` and the `checkpoint --cwd` semantics. This repo's guide was refreshed with `doctor --fix`.
- Migration guide: `docs/migration-project-brain.md`. It is packaged and linked from README, `docs/brain.md` and `docs/obsidian.md`. The vault-canonical relocation (move, fix `sources`, `brain verify`) was exercised on a scratch workspace.
- CI run 40297753207 on 385c53a: Linux Node 20/22/24/26, macOS, and npm/pnpm/Bun packaged workflows all green. The Windows job has not run.
- History: 1.1 slice 3 handoff and tasks are in `.agentos/runs/2026-10-26-1.1-slice3-handoff.md`. Earlier history is in the other files under `.agentos/runs/`.

## Known warnings / failures

- `bun`, `pnpm` and a `workflow`-scoped token are absent on the dev host. The gates run as `npm run …`, and `test:package-managers` fails locally on the missing pnpm/bun (CI covers them).
- `npm publish --dry-run` fails on the dev host; the exact message is under "Final checks" in `docs/project-brain-acceptance.md`. No version bump on this branch.
- `doctor` diagnostics list this repo's three legacy agent cards (developer, tester, release-manager).

## Next exact action

1. Owner: push the CI workflow commit with a `workflow`-scoped token, so the Windows job runs (A14).
2. Owner: run the Obsidian GUI steps in `C:\_\agentos-trial\OWNER-STEPS.md` (A15, A17).
3. Phynceon: run the Codex and Hermes legs of the continuity trial (A16), and re-run the Claude Code / A18 trial on the final SHA.
4. Phynceon: final re-run of the gates on the pushed head; review; mark the PR ready.

## Protected files / do not touch

- `/home/app/**`, Obsidian vaults, Hermes config, `C:\_\agentos-trial\` (owner fixture).
- `.github/workflows/` (owner push only).
- Deprecated migration writers until the owner decides.

## Open decisions

- Removal of the deprecated legacy upgrade paths: retargeted to 2.0.0; the owner decides.
- This repo's three non-matching legacy cards: `agents manifest <id> --custom` or `agents add <id> --replace`.
- Alias/overlap consolidation candidates (`docs/migration.md`, keep / simplify / remove inventory).
- Import and quarantine (`templates import`): frozen.
- Release version for the Project Brain: the owner decides after merge.
