# Handoff

## Current objective

Project Brain goal (Ralph, approved 2026-10-26; `briefs/AgentOS-Project-Brain-Goal-2026-10-26.md`). The Brain works without Obsidian, and Obsidian is an optional second location. **Goal complete, pending owner review:** all 20 acceptance rows pass with their limits stated.

## Scope

- Repo: `agentos-for-projects` (single-repo workspace). `main` = `7bcca0e` (1.1.0, npm latest 1.1.0). No version bump on this branch.
- Branch `feat/project-brain`, draft PR https://github.com/ralphlol123/AgentOS/pull/57. Final code SHA `6ce3d25` (pushed, per Phynceon). The card-9 commits after it change docs and `.agentos/` state only and are local.
- Client workspaces are rolled out by the owner and are out of scope.

## Current state

- Slices 1–5 and trial defects D1–D7 are implemented and tested. Plan and design: `.agentos/plans/project-brain.md`.
- Matrix `docs/project-brain-acceptance.md`: **20 PASS, 0 FAIL, 0 BLOCKED**. Limits: A13 automated CLI regression + WSL2 manual; A14 automated CLI regression on native Windows (no Windows GUI/engine trial); A15/A17 n=1 owner GUI round trip (vault opened at the trial root, not `knowledge/`; Obsidian version not recorded); A16 OpenCode accepted by the owner in place of Codex.
- CI run 40310090906 on `6ce3d25`: all 7 jobs green (ubuntu Node 20/22/24/26, macOS Node 24, Windows Node 24, npm/pnpm/Bun packaged workflows).
- Evidence: `docs/evidence/project-brain-trials.md` (engine legs, GUI round trip, D1–D7), `docs/evidence/windows-validation.md` (A14).
- History: the pre-card-9 handoff and tasks are in `.agentos/runs/2026-10-26-project-brain-card8-state.md`; earlier history in the other files under `.agentos/runs/`.

## Known warnings / failures

- `bun`, `pnpm` are absent on the dev host. The gates run as `npm run …`; `test:package-managers` fails locally on the missing pnpm/bun (CI covers them).
- `npm publish --dry-run` fails on the dev host (version 1.1.0 already published); no version bump on this branch.
- `doctor` diagnostics list this repo's three legacy agent cards (developer, tester, release-manager).

## Next exact action

1. Phynceon: review the final head (re-run gates if the card-9 commits are pushed).
2. Owner: decide the release version. D6 is breaking for scripts: `brain apply` without `--by` is now refused.
3. Owner: decide whether D6's instruction + audit trail is enough or an enforced gate is wanted later.
4. Owner: merge decision for PR #57.

## Protected files / do not touch

- `/home/app/**`, Obsidian vaults, Hermes config, `C:\_\agentos-trial\` (owner fixture).
- `.github/workflows/` (owner push only).
- Deprecated migration writers until the owner decides.

## Open decisions

- Release version for the Project Brain (D6 breaking change for scripts).
- D6 policy: instruction + audit, or an enforced apply gate later.
- Removal of the deprecated legacy upgrade paths: retargeted to 2.0.0; the owner decides.
- This repo's three non-matching legacy cards: `agents manifest <id> --custom` or `agents add <id> --replace`.
- Alias/overlap consolidation candidates (`docs/migration.md`, keep / simplify / remove inventory).
- Import and quarantine (`templates import`): frozen.
